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
}

interface Answer {
  id: string;
  value: string;
  label: string;
  wasCustom: boolean;
  index?: number;
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
              saveAnswer(q.id, trimmed, trimmed, true);
              editMode = false;
              editor.setText("");
              advanceAfterAnswer();
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

            // --- Option navigation ---
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
                  add(
                    ` ${theme.fg("muted", `${question.label}: `)}${theme.fg("text", prefix + answer.label)}`,
                  );
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
              add(theme.fg("text", ` ${cq.prompt}`));
              lines.push("");

              const opts = currentOptions();
              for (let i = 0; i < opts.length; i++) {
                const opt = opts[i];
                const selected = i === optionIndex;
                const isCustom = opt.isCustom === true;
                const prefix = selected ? theme.fg("accent", "❯ ") : "  ";

                if (isCustom && editMode) {
                  add(prefix + theme.fg("accent", `${opt.label} ✎`));
                } else if (selected) {
                  add(prefix + theme.fg("accent", `${i + 1}. ${opt.label}`));
                } else {
                  add(`  ${theme.fg("text", `${i + 1}. ${opt.label}`)}`);
                }

                if (opt.description) {
                  add(`     ${theme.fg("muted", opt.description)}`);
                }
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
        let text =
          theme.fg("toolTitle", theme.bold("list_option ")) +
          theme.fg("muted", qs[0].prompt);
        const opts = qs[0].options || [];
        if (opts.length) {
          const labels = opts.map((o: Option) => o.label);
          const numbered = labels.map((o, i) => `${i + 1}. ${o}`);
          text += `\n${theme.fg("dim", `  Options: ${numbered.join(", ")}`)}`;
        }
        return new Text(text, 0, 0);
      }

      let text = theme.fg("toolTitle", theme.bold("list_option "));
      text += theme.fg("muted", `${qs.length} questions`);
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
        const display = a.index ? `${a.index}. ${a.label}` : a.label;
        return (
          theme.fg("success", "✓ ") + theme.fg("accent", a.id) + ": " + display
        );
      });
      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
