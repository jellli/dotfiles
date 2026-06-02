/**
 * List Option Tool
 *
 * Lets the LLM ask one or more questions with predefined options.
 * User can pick from the list or type a custom answer per question.
 * Single question: simple picker. Multiple: tab-based UI.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  Text,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

// --- Types ---

interface Option {
  label: string;
  value?: string;
  description?: string;
}

type DisplayOption = Option & { isCustom?: boolean };

interface Question {
  id: string;
  label?: string;
  prompt: string;
  options: Option[];
  allowCustom?: boolean;
  multiSelect?: boolean;
}

interface Answer {
  id: string;
  value: string;
  values?: string[];
  label: string;
  labels?: string[];
  wasCustom: boolean;
  index?: number;
  indices?: number[];
}

interface ListOptionResult {
  questions: Question[];
  answers: Answer[];
  cancelled: boolean;
}

// --- Schema ---

const OptionSchema = Type.Object({
  label: Type.String({ description: "Display text for the option" }),
  value: Type.Optional(
    Type.String({
      description:
        "Value returned when selected (defaults to label if omitted)",
    }),
  ),
  description: Type.Optional(
    Type.String({ description: "Optional description shown below the label" }),
  ),
});

const QuestionSchema = Type.Object({
  id: Type.String({ description: "Unique identifier for this question" }),
  label: Type.Optional(
    Type.String({
      description: "Short label for tab bar (defaults to Q1, Q2, etc.)",
    }),
  ),
  prompt: Type.String({ description: "The question text to display" }),
  options: Type.Array(OptionSchema, {
    description: "Options for the user to choose from",
    minItems: 1,
  }),
  allowCustom: Type.Optional(
    Type.Boolean({
      description: "Allow user to type a custom answer (default: true)",
    }),
  ),
  multiSelect: Type.Optional(
    Type.Boolean({
      description:
        "Allow selecting multiple options (default: false). " +
        "When true, user can toggle options and confirm with Done.",
    }),
  ),
});

const ListOptionParams = Type.Object({
  questions: Type.Array(QuestionSchema, {
    description: "One or more questions to ask the user",
    minItems: 1,
  }),
});

// --- Helpers ---

function errorResult(
  message: string,
  questions: Question[] = [],
): { content: { type: "text"; text: string }[]; details: ListOptionResult } {
  return {
    content: [{ type: "text", text: message }],
    details: { questions, answers: [], cancelled: true },
  };
}

// --- Extension ---

export default function listOption(pi: ExtensionAPI) {
  pi.registerTool({
    name: "list_option",
    label: "List Option",
    description:
      "Ask the user one or more questions with selectable options. " +
      "For a single question, shows a simple list picker. " +
      "For multiple questions, shows a tab-based interface. " +
      "User can select an option or type a custom answer per question.",
    promptSnippet:
      "Present questions with selectable options; user picks one or types custom input",
    promptGuidelines: [
      "Use list_option when you need the user to choose between specific options before continuing.",
      "list_option supports single or multiple questions, predefined choices, and free-form custom answers.",
      "For multiple questions, use the questions array with unique ids for each question.",
    ],
    parameters: ListOptionParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return errorResult(
          "Error: UI not available (running in non-interactive mode)",
        );
      }
      if (params.questions.length === 0) {
        return errorResult("Error: No questions provided");
      }

      // Normalize questions with defaults
      const questions: Question[] = params.questions.map((q, i) => ({
        ...q,
        label: q.label || `Q${i + 1}`,
        allowCustom: q.allowCustom !== false,
      }));

      const isMulti = questions.length > 1;
      const totalTabs = questions.length + 1; // questions + Submit

      // --- TUI ---

      const result = await ctx.ui.custom<ListOptionResult>(
        (tui, theme, _kb, done) => {
          let currentTab = 0;
          let optionIndex = 0;
          let editMode = false;
          let cachedLines: string[] | undefined;
          const answers = new Map<string, Answer>();
          // Track selected indices for multi-select questions
          const multiSelectState = new Map<string, Set<number>>();
          // Track custom values for multi-select questions
          const customMultiSelectValues = new Map<string, string[]>();

          const editorTheme: EditorTheme = {
            borderColor: (s) => theme.fg("accent", s),
            selectList: {
              selectedPrefix: (t) => theme.fg("accent", t),
              selectedText: (t) => theme.fg("accent", t),
              description: (t) => theme.fg("muted", t),
              scrollInfo: (t) => theme.fg("dim", t),
              noMatch: (t) => theme.fg("warning", t),
            },
          };
          const editor = new Editor(tui, editorTheme);

          editor.onSubmit = (value) => {
            const q = questions[currentTab];
            if (!q) return;
            const trimmed = value.trim();
            if (trimmed) {
              if (q.multiSelect) {
                // Multi-select: add custom answer to selection
                // Custom answers are stored at the end of options
                const customIdx = q.options.length;
                let selected = multiSelectState.get(q.id);
                if (!selected) {
                  selected = new Set();
                  multiSelectState.set(q.id, selected);
                }
                selected.add(customIdx);
                // Store the custom value in a separate map
                if (!customMultiSelectValues.has(q.id)) {
                  customMultiSelectValues.set(q.id, []);
                }
                customMultiSelectValues.get(q.id)!.push(trimmed);
              } else {
                saveAnswer(q.id, trimmed, trimmed, true);
                advanceAfterAnswer();
              }
              editMode = false;
              editor.setText("");
              refresh();
            } else {
              editMode = false;
              editor.setText("");
              refresh();
            }
          };

          function refresh() {
            cachedLines = undefined;
            tui.requestRender();
          }

          function submit(cancelled: boolean) {
            done({
              questions,
              answers: Array.from(answers.values()),
              cancelled,
            });
          }

          function currentQuestion(): Question | undefined {
            return questions[currentTab];
          }

          function isCurrentMultiSelect(): boolean {
            const q = currentQuestion();
            return q?.multiSelect === true;
          }

          function currentOptions(): DisplayOption[] {
            const q = currentQuestion();
            if (!q) return [];
            const opts: DisplayOption[] = q.options.map((o) => ({
              label: o.label,
              value: o.value ?? o.label,
              description: o.description,
            }));
            if (q.allowCustom) {
              opts.push({ label: "Type a custom answer", isCustom: true });
            }
            return opts;
          }

          function allAnswered(): boolean {
            return questions.every((q) => answers.has(q.id));
          }

          function advanceAfterAnswer() {
            if (!isMulti) {
              submit(false);
              return;
            }
            if (currentTab < questions.length - 1) {
              currentTab++;
            } else {
              currentTab = questions.length; // Submit tab
            }
            optionIndex = 0;
            refresh();
          }

          function saveAnswer(
            id: string,
            value: string,
            label: string,
            wasCustom: boolean,
            index?: number,
          ) {
            answers.set(id, { id, value, label, wasCustom, index });
          }

          function saveMultiSelectAnswer(id: string) {
            const q = questions.find((q) => q.id === id);
            if (!q) return;
            const selected = multiSelectState.get(id);
            if (!selected || selected.size === 0) return;

            const opts = q.options;
            const values: string[] = [];
            const labels: string[] = [];
            const indices: number[] = [];
            const customValues = customMultiSelectValues.get(id) || [];
            let customIdx = 0;

            for (const idx of selected) {
              if (idx < opts.length) {
                const opt = opts[idx];
                values.push(opt.value ?? opt.label);
                labels.push(opt.label);
                indices.push(idx + 1);
              } else if (q.allowCustom && idx === opts.length) {
                // Custom option at the end
                const customVal = customValues[customIdx];
                if (customVal) {
                  values.push(customVal);
                  labels.push(customVal);
                  indices.push(idx + 1);
                  customIdx++;
                }
              }
            }

            if (values.length > 0) {
              answers.set(id, {
                id,
                value: values[0],
                values,
                label: labels[0],
                labels,
                wasCustom: false,
                index: indices[0],
                indices,
              });
            }
          }

          function toggleSelection(idx: number) {
            const q = currentQuestion();
            if (!q) return;
            let selected = multiSelectState.get(q.id);
            if (!selected) {
              selected = new Set();
              multiSelectState.set(q.id, selected);
            }
            if (selected.has(idx)) {
              selected.delete(idx);
            } else {
              selected.add(idx);
            }
            refresh();
          }

          function selectAll() {
            const q = currentQuestion();
            if (!q) return;
            const opts = currentOptions();
            const selected = new Set<number>();
            // Select all non-custom options
            for (let i = 0; i < opts.length; i++) {
              if (!opts[i].isCustom) {
                selected.add(i);
              }
            }
            multiSelectState.set(q.id, selected);
            refresh();
          }

          function deselectAll() {
            const q = currentQuestion();
            if (!q) return;
            multiSelectState.delete(q.id);
            customMultiSelectValues.delete(q.id);
            refresh();
          }

          function confirmMultiSelect() {
            const q = currentQuestion();
            if (!q) return;
            saveMultiSelectAnswer(q.id);
            advanceAfterAnswer();
          }

          function handleInput(data: string) {
            // --- Edit mode ---
            if (editMode) {
              if (matchesKey(data, Key.escape)) {
                editMode = false;
                editor.setText("");
                refresh();
                return;
              }
              editor.handleInput(data);
              refresh();
              return;
            }

            const q = currentQuestion();
            const opts = currentOptions();

            // --- Tab navigation (multi only) ---
            if (isMulti) {
              if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
                currentTab = (currentTab + 1) % totalTabs;
                optionIndex = 0;
                refresh();
                return;
              }
              if (
                matchesKey(data, Key.shift("tab")) ||
                matchesKey(data, Key.left)
              ) {
                currentTab = (currentTab - 1 + totalTabs) % totalTabs;
                optionIndex = 0;
                refresh();
                return;
              }
            }

            // --- Submit tab ---
            if (currentTab === questions.length) {
              if (matchesKey(data, Key.enter) && allAnswered()) {
                submit(false);
              } else if (matchesKey(data, Key.escape)) {
                submit(true);
              }
              return;
            }

            // --- Multi-select mode ---
            if (q && q.multiSelect) {
              // The "Done" option is appended at the end
              const doneIndex = opts.length;
              const totalOptions = opts.length + 1; // +1 for Done

              // Navigation
              if (matchesKey(data, Key.up)) {
                optionIndex = Math.max(0, optionIndex - 1);
                refresh();
                return;
              }
              if (matchesKey(data, Key.down)) {
                optionIndex = Math.min(totalOptions - 1, optionIndex + 1);
                refresh();
                return;
              }

              // Number keys toggle selection (1-9)
              const num = parseInt(data, 10);
              if (num >= 1 && num <= opts.length) {
                const opt = opts[num - 1];
                if (opt.isCustom) {
                  optionIndex = num - 1;
                  editMode = true;
                  editor.setText("");
                  refresh();
                } else {
                  toggleSelection(num - 1);
                }
                return;
              }

              // Space or Enter on option toggles selection
              if (
                (matchesKey(data, Key.space) || matchesKey(data, Key.enter)) &&
                optionIndex < doneIndex
              ) {
                const opt = opts[optionIndex];
                if (opt.isCustom) {
                  editMode = true;
                  editor.setText("");
                  refresh();
                } else {
                  toggleSelection(optionIndex);
                }
                return;
              }

              // Enter on Done confirms selection
              if (matchesKey(data, Key.enter) && optionIndex === doneIndex) {
                confirmMultiSelect();
                return;
              }

              // 'a' or Ctrl+A selects all
              if (data === "a" || matchesKey(data, Key.ctrl("a"))) {
                selectAll();
                return;
              }

              // 'd' or Ctrl+D deselects all
              if (data === "d" || matchesKey(data, Key.ctrl("d"))) {
                deselectAll();
                return;
              }

              // Escape to cancel
              if (matchesKey(data, Key.escape)) {
                submit(true);
              }
              return;
            }

            // --- Single-select mode ---
            // Option navigation
            if (matchesKey(data, Key.up)) {
              optionIndex = Math.max(0, optionIndex - 1);
              refresh();
              return;
            }
            if (matchesKey(data, Key.down)) {
              optionIndex = Math.min(opts.length - 1, optionIndex + 1);
              refresh();
              return;
            }

            // Number key quick-select (1-9)
            const num = parseInt(data, 10);
            if (num >= 1 && num <= opts.length && q) {
              const selected = opts[num - 1];
              if (selected.isCustom) {
                optionIndex = num - 1;
                editMode = true;
                editor.setText("");
                refresh();
              } else {
                saveAnswer(
                  q.id,
                  selected.value ?? selected.label,
                  selected.label,
                  false,
                  num,
                );
                advanceAfterAnswer();
              }
              return;
            }

            // Enter to select
            if (matchesKey(data, Key.enter) && q) {
              const selected = opts[optionIndex];
              if (selected.isCustom) {
                editMode = true;
                editor.setText("");
                refresh();
              } else {
                saveAnswer(
                  q.id,
                  selected.value ?? selected.label,
                  selected.label,
                  false,
                  optionIndex + 1,
                );
                advanceAfterAnswer();
              }
              return;
            }

            // Escape to cancel
            if (matchesKey(data, Key.escape)) {
              submit(true);
            }
          }

          function render(width: number): string[] {
            if (cachedLines) return cachedLines;

            const lines: string[] = [];
            const add = (s: string) => lines.push(truncateToWidth(s, width));

            add(theme.fg("accent", "─".repeat(width)));

            // --- Tab bar (multi only) ---
            if (isMulti) {
              const tabs: string[] = [];
              for (let i = 0; i < questions.length; i++) {
                const isActive = i === currentTab;
                const isAnswered = answers.has(questions[i].id);
                const lbl = questions[i].label;
                const box = isAnswered ? "■" : "□";
                const color = isAnswered ? "success" : "muted";
                const text = ` ${box} ${lbl} `;
                const styled = isActive
                  ? theme.bg("selectedBg", theme.fg("text", text))
                  : theme.fg(color, text);
                tabs.push(`${styled} `);
              }
              const canSubmit = allAnswered();
              const isSubmitTab = currentTab === questions.length;
              const submitText = " ✓ Submit ";
              const submitStyled = isSubmitTab
                ? theme.bg("selectedBg", theme.fg("text", submitText))
                : theme.fg(canSubmit ? "success" : "dim", submitText);
              tabs.push(submitStyled);
              add(` ${tabs.join("")}`);
              lines.push("");
            }

            // --- Submit tab content ---
            if (currentTab === questions.length) {
              add(theme.fg("accent", theme.bold(" Review & Submit")));
              lines.push("");
              for (const question of questions) {
                const answer = answers.get(question.id);
                if (answer) {
                  const prefix = answer.wasCustom ? "(custom) " : "";
                  // Multi-select answer
                  if (answer.values && answer.values.length > 1) {
                    const selections = answer
                      .labels!.map((l, i) => `${answer.indices![i]}. ${l}`)
                      .join(", ");
                    add(
                      ` ${theme.fg("muted", `${question.label}: `)}${theme.fg("text", selections)}`,
                    );
                  } else {
                    add(
                      ` ${theme.fg("muted", `${question.label}: `)}${theme.fg("text", prefix + answer.label)}`,
                    );
                  }
                } else {
                  add(
                    ` ${theme.fg("muted", `${question.label}: `)}${theme.fg("warning", "unanswered")}`,
                  );
                }
              }
              lines.push("");
              if (allAnswered()) {
                add(theme.fg("success", " Press Enter to submit"));
              } else {
                add(theme.fg("warning", " Answer all questions first"));
              }
            }
            // --- Question content ---
            else if (currentQuestion()) {
              const cq = currentQuestion()!;
              const isMultiSel = cq.multiSelect === true;
              add(theme.fg("text", ` ${cq.prompt}`));
              if (isMultiSel) {
                const selectedCount = multiSelectState.get(cq.id)?.size ?? 0;
                const customCount =
                  customMultiSelectValues.get(cq.id)?.length ?? 0;
                const totalCount = selectedCount + customCount;
                add(
                  theme.fg(
                    "muted",
                    ` (${totalCount} selected - press Space to toggle)`,
                  ),
                );
              }
              lines.push("");

              const opts = currentOptions();
              const selectedIndices = multiSelectState.get(cq.id);

              const customValues = customMultiSelectValues.get(cq.id) || [];
              let customDisplayIdx = 0;

              for (let i = 0; i < opts.length; i++) {
                const opt = opts[i];
                const isCursor = i === optionIndex;
                const isCustom = opt.isCustom === true;
                const isSelected = selectedIndices?.has(i) ?? false;

                if (isMultiSel) {
                  // Multi-select: show checkboxes
                  const checkbox = isSelected ? theme.fg("success", "☑") : "☐";
                  const prefix = isCursor ? theme.fg("accent", "❯ ") : "  ";

                  if (isCustom) {
                    // Show custom values that have been added
                    if (isSelected && customValues[customDisplayIdx]) {
                      const customVal = customValues[customDisplayIdx];
                      customDisplayIdx++;
                      if (editMode && isCursor) {
                        add(
                          prefix +
                            checkbox +
                            " " +
                            theme.fg("accent", `${customVal} ✎`),
                        );
                      } else {
                        add(
                          prefix +
                            checkbox +
                            " " +
                            theme.fg("text", `${i + 1}. ${customVal}`),
                        );
                      }
                    } else if (editMode && isCursor) {
                      add(
                        prefix +
                          checkbox +
                          " " +
                          theme.fg("accent", `${opt.label} ✎`),
                      );
                    } else {
                      add(
                        prefix +
                          checkbox +
                          " " +
                          theme.fg("text", `${i + 1}. ${opt.label}`),
                      );
                    }
                  } else if (isCursor) {
                    add(
                      prefix +
                        checkbox +
                        " " +
                        theme.fg("accent", `${i + 1}. ${opt.label}`),
                    );
                  } else {
                    add(
                      `  ${checkbox} ${theme.fg("text", `${i + 1}. ${opt.label}`)}`,
                    );
                  }
                } else {
                  // Single-select: show radio style
                  const prefix = isCursor ? theme.fg("accent", "❯ ") : "  ";

                  if (isCustom && editMode) {
                    add(prefix + theme.fg("accent", `${opt.label} ✎`));
                  } else if (isCursor) {
                    add(prefix + theme.fg("accent", `${i + 1}. ${opt.label}`));
                  } else {
                    add(`  ${theme.fg("text", `${i + 1}. ${opt.label}`)}`);
                  }
                }

                if (opt.description) {
                  add(`     ${theme.fg("muted", opt.description)}`);
                }
              }

              // Multi-select: add Done option
              if (isMultiSel) {
                const doneIndex = opts.length;
                const isDoneCursor = doneIndex === optionIndex;
                const selectedCount = multiSelectState.get(cq.id)?.size ?? 0;
                const customCount =
                  customMultiSelectValues.get(cq.id)?.length ?? 0;
                const totalCount = selectedCount + customCount;
                const donePrefix = isDoneCursor
                  ? theme.fg("accent", "❯ ")
                  : "  ";
                const doneLabel =
                  totalCount > 0 ? `✓ Done (${totalCount} selected)` : "✓ Done";
                const doneColor = totalCount > 0 ? "success" : "muted";
                add(donePrefix + theme.fg(doneColor, doneLabel));
              }

              if (editMode) {
                lines.push("");
                add(theme.fg("muted", " Your answer:"));
                for (const line of editor.render(width - 2)) {
                  add(` ${line}`);
                }
              }
            }

            // --- Help ---
            lines.push("");
            if (editMode) {
              add(theme.fg("dim", " Enter to submit • Esc to go back"));
            } else if (currentTab === questions.length) {
              add(theme.fg("dim", " Enter to submit • Esc to cancel"));
            } else if (isCurrentMultiSelect()) {
              add(
                theme.fg(
                  "dim",
                  " ↑↓ navigate • Space/Enter toggle • 1-9 toggle • a select all • d deselect all • Esc cancel",
                ),
              );
            } else if (isMulti) {
              add(
                theme.fg(
                  "dim",
                  " Tab/←→ switch • ↑↓ navigate • 1-9 quick pick • Enter select • Esc cancel",
                ),
              );
            } else {
              add(
                theme.fg(
                  "dim",
                  " ↑↓ navigate • 1-9 quick pick • Enter to select • Esc to cancel",
                ),
              );
            }
            add(theme.fg("accent", "─".repeat(width)));

            cachedLines = lines;
            return lines;
          }

          return {
            render,
            invalidate: () => {
              cachedLines = undefined;
            },
            handleInput,
          };
        },
      );

      // --- Result ---

      if (result.cancelled) {
        return {
          content: [{ type: "text", text: "User cancelled" }],
          details: result,
        };
      }

      const lines = result.answers.map((a) => {
        const q = questions.find((q) => q.id === a.id);
        const label = q?.label || a.id;
        if (a.wasCustom) {
          return `${label}: user wrote: ${a.label}`;
        }
        // Multi-select answer
        if (a.values && a.values.length > 1) {
          const selections = a
            .labels!.map((l, i) => `${a.indices![i]}. ${l}`)
            .join(", ");
          return `${label}: user selected: ${selections}`;
        }
        return `${label}: user selected: ${a.index}. ${a.label}`;
      });

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: result,
      };
    },

    // --- Rendering ---

    renderCall(args, theme, _context) {
      const qs = (args.questions as Question[]) || [];
      if (qs.length === 1) {
        const q = qs[0];
        const multiLabel = q.multiSelect ? " [multi-select]" : "";
        let text =
          theme.fg("toolTitle", theme.bold("list_option ")) +
          theme.fg("muted", q.prompt) +
          theme.fg("dim", multiLabel);
        const opts = q.options || [];
        if (opts.length) {
          const labels = opts.map((o: Option) => o.label);
          const numbered = labels.map((o, i) => `${i + 1}. ${o}`);
          text += `\n${theme.fg("dim", `  Options: ${numbered.join(", ")}`)}`;
        }
        return new Text(text, 0, 0);
      }

      let text = theme.fg("toolTitle", theme.bold("list_option "));
      text += theme.fg("muted", `${qs.length} questions`);
      const multiCount = qs.filter((q) => q.multiSelect).length;
      if (multiCount > 0) {
        text += theme.fg("dim", ` (${multiCount} multi-select)`);
      }
      const labels = qs.map((q) => q.label || q.id).join(", ");
      if (labels) {
        text += theme.fg("dim", ` (${truncateToWidth(labels, 40)})`);
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme, _context) {
      const details = result.details as ListOptionResult | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }
      if (details.cancelled) {
        return new Text(theme.fg("warning", "Cancelled"), 0, 0);
      }

      const lines = details.answers.map((a) => {
        if (a.wasCustom) {
          return (
            theme.fg("success", "✓ ") +
            theme.fg("accent", a.id) +
            ": " +
            theme.fg("muted", "(custom) ") +
            a.label
          );
        }
        // Multi-select answer
        if (a.values && a.values.length > 1) {
          const selections = a
            .labels!.map((l, i) => `${a.indices![i]}. ${l}`)
            .join(", ");
          return (
            theme.fg("success", "✓ ") +
            theme.fg("accent", a.id) +
            ": " +
            theme.fg("text", selections)
          );
        }
        const display = a.index ? `${a.index}. ${a.label}` : a.label;
        return (
          theme.fg("success", "✓ ") + theme.fg("accent", a.id) + ": " + display
        );
      });
      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
