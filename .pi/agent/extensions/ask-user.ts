/**
 * Ask User Tool — upgraded with notes, collapse, overflow scroll, word wrap, validation.
 *
 * Let the LLM ask the user one or more structured questions. Features:
 * - Single / multi-select questions with Tab-bar navigation (multi)
 * - Submit-tab review before confirmation
 * - Per-option notes (press `n` while focused)
 * - Collapse mode (Ctrl+]) to peek at transcript
 * - Overflow scroll indicators (↑/↓/↕) when content exceeds terminal height
 * - Smart word wrapping for option descriptions
 * - Full input validation (length limits, reserved labels, duplicates)
 *
 * Toggle via /ask-user-disable | /ask-user-enable.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  Text,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

// ─── Constants ───────────────────────────────────────────────────────────

const MAX_QUESTIONS = 4;
const MAX_OPTIONS = 4;
const MIN_OPTIONS = 1;
const MAX_LABEL_LENGTH = 60;
const MAX_HEADER_LENGTH = 16;
const RESERVED_LABELS = new Set([
  "Other",
  "Type something.",
  "Chat about this",
  "Next",
  "✓ Done",
]);
const OVERFLOW_UP = "↑";
const OVERFLOW_DOWN = "↓";
const OVERFLOW_BOTH = "↕";

// ─── Types ────────────────────────────────────────────────────────────────

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

interface NoteEntry {
  questionId: string;
  optionLabel: string;
  text: string;
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
  note?: string;
}

interface ListOptionResult {
  questions: Question[];
  answers: Answer[];
  cancelled: boolean;
}

// ─── Validation ──────────────────────────────────────────────────────────

type ValidationError =
  | "no_questions"
  | "too_many_questions"
  | "duplicate_question"
  | "duplicate_option_label"
  | "reserved_label"
  | "empty_options"
  | "label_too_long";

interface ValidationResult {
  ok: boolean;
  error?: ValidationError;
  message?: string;
}

function validateParams(questions: Question[]): ValidationResult {
  if (questions.length === 0) {
    return {
      ok: false,
      error: "no_questions",
      message: "At least one question is required",
    };
  }
  if (questions.length > MAX_QUESTIONS) {
    return {
      ok: false,
      error: "too_many_questions",
      message: `At most ${MAX_QUESTIONS} questions allowed per invocation`,
    };
  }

  const seenQuestions = new Set<string>();
  for (const q of questions) {
    if (seenQuestions.has(q.prompt)) {
      return {
        ok: false,
        error: "duplicate_question",
        message: "Question text must be unique",
      };
    }
    seenQuestions.add(q.prompt);

    if (!q.options || q.options.length < MIN_OPTIONS) {
      return {
        ok: false,
        error: "empty_options",
        message: `Each question needs at least ${MIN_OPTIONS} option`,
      };
    }

    const seenLabels = new Set<string>();
    for (const o of q.options) {
      if (o.label.length > MAX_LABEL_LENGTH) {
        return {
          ok: false,
          error: "label_too_long",
          message: `Option label exceeds ${MAX_LABEL_LENGTH} characters: "${o.label.slice(0, 30)}…"`,
        };
      }
      if (RESERVED_LABELS.has(o.label)) {
        return {
          ok: false,
          error: "reserved_label",
          message: `"${o.label}" is a reserved label`,
        };
      }
      if (seenLabels.has(o.label)) {
        return {
          ok: false,
          error: "duplicate_option_label",
          message: `Duplicate option label "${o.label}" within question`,
        };
      }
      seenLabels.add(o.label);
    }
  }

  return { ok: true };
}

// ─── Schema ──────────────────────────────────────────────────────────────

const OptionSchema = Type.Object({
  label: Type.String({ description: "Display text for the option" }),
  value: Type.Optional(
    Type.String({
      description: "Value returned when selected (defaults to label)",
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
    minItems: MIN_OPTIONS,
    maxItems: MAX_OPTIONS,
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
    maxItems: MAX_QUESTIONS,
  }),
});

// ─── Helpers ─────────────────────────────────────────────────────────────

function errorResult(
  message: string,
  questions: Question[] = [],
): {
  content: { type: "text"; text: string }[];
  details: ListOptionResult;
} {
  return {
    content: [{ type: "text", text: message }],
    details: { questions, answers: [], cancelled: true },
  };
}

// ─── Extension ────────────────────────────────────────────────────────────

export default function askUser(pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user",
    label: "Ask User",
    description: `Ask the user one or more structured questions (1–${MAX_QUESTIONS}) during execution. Use when you need to gather preferences, clarify ambiguous instructions, or get decisions on implementation choices.

Each question supports 1–${MAX_OPTIONS} options with optional descriptions explaining trade-offs. The "Type something." row is appended automatically for single-select questions so users can type a custom answer. Use multiSelect: true to allow picking multiple options (the custom-text row is suppressed in multi-select mode).

Per-option notes: users can press 'n' on a focused option to attach a free-text note — the note travels back with the answer. Results include any notes typed.

Recommend a specific option by placing it first and appending "(Recommended)" to its label.`,
    promptSnippet:
      "Present structured questions with selectable options; user picks one, types custom input, or adds notes",
    promptGuidelines: [
      `Use ask_user when the user's request is underspecified and you cannot proceed without concrete decisions — ask 1–${MAX_QUESTIONS} questions per invocation.`,
      "Each question needs 1–4 options with concise labels and descriptions explaining trade-offs. Users can type a custom answer via the auto-appended 'Type something.' row.",
      "Set multiSelect: true when multiple answers are valid (this suppresses the custom-text row). The user can press 'n' on any option to attach a free-text note that returns with the answer.",
      "If you recommend a specific option, make it the first option and append '(Recommended)' to its label.",
      "Do not stack multiple ask_user calls back-to-back — group all questions into one invocation using the questions array.",
    ],
    parameters: ListOptionParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return errorResult(
          "Error: UI not available (running in non-interactive mode)",
        );
      }

      // Normalize
      const rawQuestions: Question[] = params.questions.map(
        (
          q: {
            id: string;
            label?: string;
            prompt: string;
            options: Option[];
            allowCustom?: boolean;
            multiSelect?: boolean;
          },
          i: number,
        ) => ({
          ...q,
          label: q.label || `Q${i + 1}`,
          allowCustom: q.allowCustom !== false,
        }),
      );

      // Validate
      const validation = validateParams(rawQuestions);
      if (!validation.ok) {
        return errorResult(validation.message!, rawQuestions);
      }

      const questions = rawQuestions;
      const isMulti = questions.length > 1;

      // ─── TUI ───────────────────────────────────────────────────────

      const result = await ctx.ui.custom<ListOptionResult>(
        (tui, theme, _kb, done) => {
          // State
          let currentTab = 0;
          let optionIndex = 0;
          let editMode = false;
          let collapsed = false;
          let notesActive = false; // true when user is typing a note
          let notesDraft = "";
          let noteForOption: string | undefined; // "questionId:optionIndex"
          let cachedLines: string[] | undefined;
          const answers = new Map<string, Answer>();
          const multiSelectState = new Map<string, Set<number>>();
          const customMultiSelectValues = new Map<string, string[]>();
          const notesByOption = new Map<string, NoteEntry>(); // key: "questionId:optionIndex"

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

          // ─── Editor submit (custom text input) ─────────────────────

          editor.onSubmit = (value) => {
            const q = questions[currentTab];
            if (!q) return;
            const trimmed = value.trim();
            if (trimmed) {
              if (q.multiSelect) {
                const customIdx = q.options.length;
                let selected = multiSelectState.get(q.id);
                if (!selected) {
                  selected = new Set();
                  multiSelectState.set(q.id, selected);
                }
                selected.add(customIdx);
                if (!customMultiSelectValues.has(q.id)) {
                  customMultiSelectValues.set(q.id, []);
                }
                customMultiSelectValues.get(q.id)!.push(trimmed);
              } else {
                saveAnswer(q.id, trimmed, trimmed, true);
                advanceAfterAnswer();
              }
            }
            editMode = false;
            editor.setText("");
            refresh();
          };

          // ─── Core helpers ──────────────────────────────────────────

          function refresh() {
            cachedLines = undefined;
            tui.requestRender();
          }

          function submit(cancelled: boolean) {
            // Attach notes to answers
            for (const [key, note] of notesByOption) {
              const [qId, optIdx] = key.split(":");
              const a = answers.get(qId);
              if (a && Number(optIdx) === (a.index ?? -1) - 1) {
                // For multi-select, attach note to the answer that matches
                a.note = note.text;
              } else if (a && !a.note) {
                a.note = note.text;
              }
            }
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
            return currentQuestion()?.multiSelect === true;
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
              opts.push({ label: "Type something.", isCustom: true });
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
            const q = questions.find((qq) => qq.id === id);
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
              const note = noteForOptionId(id);
              answers.set(id, {
                id,
                value: values[0],
                values,
                label: labels[0],
                labels,
                wasCustom: false,
                index: indices[0],
                indices,
                note,
              });
            }
          }

          function noteForOptionId(qId: string): string | undefined {
            for (const [key, entry] of notesByOption) {
              if (entry.questionId === qId) return entry.text;
            }
            return undefined;
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
            for (let i = 0; i < opts.length; i++) {
              if (!opts[i].isCustom) selected.add(i);
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

          // ─── Notes ──────────────────────────────────────────────

          function startNoteForOption(
            questionId: string,
            optionIdx: number,
            optLabel: string,
          ) {
            const key = `${questionId}:${optionIdx}`;
            const existing = notesByOption.get(key);
            notesDraft = existing?.text ?? "";
            noteForOption = key;
            notesActive = true;
            editor.setText(notesDraft);
            refresh();
          }

          function commitNote() {
            if (!noteForOption) return;
            const trimmed = notesDraft.trim();
            if (trimmed) {
              const [qId, idxStr] = noteForOption.split(":");
              const q = questions.find((qq) => qq.id === qId);
              const optLabel = q?.options?.[Number(idxStr)]?.label ?? "";
              notesByOption.set(noteForOption, {
                questionId: qId,
                optionLabel: optLabel,
                text: trimmed,
              });
            } else {
              notesByOption.delete(noteForOption);
            }
            notesActive = false;
            notesDraft = "";
            noteForOption = undefined;
            editor.setText("");
            refresh();
          }

          function cancelNote() {
            notesActive = false;
            notesDraft = "";
            noteForOption = undefined;
            editor.setText("");
            refresh();
          }

          // ─── Input handling ─────────────────────────────────────────

          const totalTabs = questions.length + 1; // + Submit tab

          function handleInput(data: string) {
            // ── Notes edit mode ──
            if (notesActive) {
              if (matchesKey(data, Key.escape)) {
                cancelNote();
                return;
              }
              if (matchesKey(data, Key.enter)) {
                commitNote();
                return;
              }
              // Update draft from editor
              editor.handleInput(data);
              notesDraft = editor.getText();
              refresh();
              return;
            }

            // ── Edit mode (Type something.) ──
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

            // ── Collapse toggle (global) ──
            if (matchesKey(data, Key.ctrl("]"))) {
              collapsed = !collapsed;
              refresh();
              return;
            }

            const q = currentQuestion();
            const opts = currentOptions();
            const isMultiSel = q?.multiSelect === true;

            // ── Tab navigation (multi only) ──
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

            // ── Submit tab ──
            if (currentTab === questions.length) {
              if (matchesKey(data, Key.enter) && allAnswered()) {
                submit(false);
              } else if (matchesKey(data, Key.escape)) {
                submit(true);
              }
              return;
            }

            // ── Notes toggle (single-select only) ──
            if (
              data === "n" &&
              q &&
              !q.multiSelect &&
              !isCurrentMultiSelect()
            ) {
              const focused = opts[optionIndex];
              if (focused && !focused.isCustom) {
                startNoteForOption(q.id, optionIndex, focused.label);
                return;
              }
            }

            // ── Multi-select mode ──
            if (isMultiSel && q) {
              const doneIndex = opts.length;
              const totalOptions = opts.length + 1; // +1 for Done

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

              // Notes on multi-select options
              if (data === "n" && optionIndex < doneIndex) {
                const opt = opts[optionIndex];
                if (!opt.isCustom) {
                  startNoteForOption(q.id, optionIndex, opt.label);
                  return;
                }
              }

              if (matchesKey(data, Key.enter) && optionIndex === doneIndex) {
                confirmMultiSelect();
                return;
              }

              if (data === "a" || matchesKey(data, Key.ctrl("a"))) {
                selectAll();
                return;
              }
              if (data === "d" || matchesKey(data, Key.ctrl("d"))) {
                deselectAll();
                return;
              }
              if (matchesKey(data, Key.escape)) {
                submit(true);
              }
              return;
            }

            // ── Single-select mode ──
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

            const selNum = parseInt(data, 10);
            if (selNum >= 1 && selNum <= opts.length && q) {
              const selected = opts[selNum - 1];
              if (selected.isCustom) {
                optionIndex = selNum - 1;
                editMode = true;
                editor.setText("");
                refresh();
              } else {
                saveAnswer(
                  q.id,
                  selected.value ?? selected.label,
                  selected.label,
                  false,
                  selNum,
                );
                advanceAfterAnswer();
              }
              return;
            }

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

            if (matchesKey(data, Key.escape)) {
              submit(true);
            }
          }

          // ─── Rendering ────────────────────────────────────────────

          function render(width: number): string[] {
            if (cachedLines) return cachedLines;

            // ── Collapsed mode ──
            if (collapsed) {
              const collapseMsg = ` ${theme.fg("dim", "Ctrl+] to expand · questions ")}${theme.fg("accent", isMulti ? `${questions.filter((qq) => answers.has(qq.id)).length}/${questions.length} answered` : (currentQuestion()?.prompt ?? ""))} `;
              return [truncateToWidth(collapseMsg, width)];
            }

            const lines: string[] = [];
            const add = (s: string) => lines.push(truncateToWidth(s, width));

            add(theme.fg("accent", "─".repeat(width)));

            // ── Tab bar (multi only) ──
            if (isMulti) {
              const tabs: string[] = [];
              for (let i = 0; i < questions.length; i++) {
                const isActive = i === currentTab;
                const isAnswered = answers.has(questions[i].id);
                const lbl = questions[i].label;
                const icon = isAnswered
                  ? theme.fg("success", "●")
                  : theme.fg("muted", "○");
                const text = ` ${icon} ${lbl} `;
                const styled = isActive
                  ? theme.bg("selectedBg", theme.fg("text", text))
                  : theme.fg(isAnswered ? "success" : "muted", text);
                tabs.push(styled);
                tabs.push(theme.fg("dim", "│"));
              }
              const canSubmit = allAnswered();
              const isSubmitTab = currentTab === questions.length;
              const submitText = canSubmit ? ` ✓ Submit ` : ` Submit `;
              const submitStyled = isSubmitTab
                ? theme.bg("selectedBg", theme.fg("text", submitText))
                : theme.fg(canSubmit ? "success" : "dim", submitText);
              tabs.push(submitStyled);
              add(` ${tabs.join("")}`);
              lines.push("");
            }

            // ── Submit tab ──
            if (currentTab === questions.length) {
              add(theme.fg("accent", theme.bold(" ── Review & Submit ──")));
              lines.push("");
              for (const question of questions) {
                const answer = answers.get(question.id);
                if (answer) {
                  const prefix = answer.wasCustom
                    ? theme.fg("muted", "(custom) ")
                    : "";
                  const noteSuffix = answer.note
                    ? `  ${theme.fg("dim", `📝 ${answer.note}`)}`
                    : "";
                  if (answer.values && answer.values.length > 1) {
                    const selections = answer
                      .labels!.map((l, i) => `${answer.indices![i]}. ${l}`)
                      .join(", ");
                    add(
                      `  ${theme.fg("accent", theme.bold(`${question.label}: `))}${theme.fg("text", selections)}${noteSuffix}`,
                    );
                  } else {
                    add(
                      `  ${theme.fg("accent", theme.bold(`${question.label}: `))}${prefix}${theme.fg("text", answer.label)}${noteSuffix}`,
                    );
                  }
                } else {
                  add(
                    `  ${theme.fg("accent", theme.bold(`${question.label}: `))}${theme.fg("warning", "(unanswered)")}`,
                  );
                }
              }
              lines.push("");
              if (allAnswered()) {
                add(theme.fg("success", "  Press Enter to submit"));
              } else {
                add(theme.fg("warning", "  Answer all questions first"));
              }
            }
            // ── Question content ──
            else if (currentQuestion()) {
              const cq = currentQuestion()!;
              const isMultiSel = cq.multiSelect === true;
              const prevAnswer = isMulti ? answers.get(cq.id) : undefined;
              add(theme.fg("accent", theme.bold(` ❓ ${cq.prompt}`)));
              if (isMultiSel) {
                const selectedCount = multiSelectState.get(cq.id)?.size ?? 0;
                const customCount =
                  customMultiSelectValues.get(cq.id)?.length ?? 0;
                const total = selectedCount + customCount;
                if (total > 0) {
                  add(theme.fg("success", `  (${total} selected)`));
                }
              } else if (prevAnswer) {
                const label = prevAnswer.wasCustom
                  ? prevAnswer.label
                  : `${prevAnswer.index}. ${prevAnswer.label}`;
                add(theme.fg("success", `  ✓ ${label}`));
              }
              lines.push("");

              const opts = currentOptions();
              const selIndices = multiSelectState.get(cq.id);

              const customValues = customMultiSelectValues.get(cq.id) || [];
              let customDisplayIdx = 0;

              for (let i = 0; i < opts.length; i++) {
                const opt = opts[i];
                const isCursor = i === optionIndex;
                const isCustom = opt.isCustom === true;
                const isSelected = selIndices?.has(i) ?? false;
                const noteKey = `${cq.id}:${i}`;
                const hasNote = notesByOption.has(noteKey);
                const noteEntry = notesByOption.get(noteKey);

                if (isMultiSel) {
                  const checkbox = isSelected ? theme.fg("success", "☑") : "☐";
                  const cursor = isCursor ? theme.fg("accent", "▸") : " ";

                  if (
                    isCustom &&
                    isSelected &&
                    customValues[customDisplayIdx]
                  ) {
                    const customVal = customValues[customDisplayIdx];
                    customDisplayIdx++;
                    if (editMode && isCursor) {
                      add(
                        ` ${cursor} ${checkbox} ${theme.fg("accent", `${customVal} ✎`)}`,
                      );
                    } else {
                      add(
                        ` ${cursor} ${checkbox} ${theme.fg("text", customVal)}`,
                      );
                    }
                  } else if (isCustom && editMode && isCursor) {
                    add(
                      ` ${cursor} ${checkbox} ${theme.fg("accent", `${opt.label} ✎`)}`,
                    );
                  } else if (isCustom) {
                    add(
                      ` ${cursor} ${checkbox} ${theme.fg("muted", opt.label)}`,
                    );
                  } else if (isCursor) {
                    add(
                      ` ${cursor} ${checkbox} ${theme.fg("accent", `${i + 1}. ${opt.label}`)}`,
                    );
                  } else {
                    add(
                      ` ${cursor} ${checkbox} ${theme.fg("text", `${i + 1}. ${opt.label}`)}`,
                    );
                  }
                } else {
                  const cursor = isCursor ? theme.fg("accent", "▸") : " ";
                  const noteMark = hasNote ? theme.fg("dim", " 📝") : "";
                  const isPrevSelected =
                    prevAnswer &&
                    ((prevAnswer.index === i + 1 && !isCustom) ||
                      (isCustom && prevAnswer.wasCustom));

                  if (isCustom && editMode) {
                    add(` ${cursor}  ${theme.fg("accent", `${opt.label} ✎`)}`);
                  } else if (isCustom && isCursor) {
                    add(` ${cursor}  ${theme.fg("accent", opt.label)}`);
                  } else if (isCustom && isPrevSelected) {
                    add(
                      ` ${cursor}  ${theme.fg("success", `✎ ${prevAnswer!.label}`)}`,
                    );
                  } else if (isCustom) {
                    add(` ${cursor}  ${theme.fg("muted", opt.label)}`);
                  } else if (isPrevSelected) {
                    add(
                      ` ${cursor}  ${theme.fg("success", `◉ ${i + 1}. ${opt.label}${noteMark}`)}`,
                    );
                  } else if (isCursor) {
                    add(
                      ` ${cursor}  ${theme.fg("accent", `○ ${i + 1}. ${opt.label}${noteMark}`)}`,
                    );
                  } else {
                    add(
                      ` ${cursor}  ${theme.fg("muted", `○ ${i + 1}. ${opt.label}${noteMark}`)}`,
                    );
                  }
                }

                // Description with word wrapping
                if (opt.description) {
                  const contentWidth = Math.max(1, width - 7);
                  const wrapped = wrapTextWithAnsi(
                    opt.description,
                    contentWidth,
                  );
                  for (const seg of wrapped) {
                    add(`      ${theme.fg("muted", seg)}`);
                  }
                }

                // Show note content inline when notes are active for this option
                if (notesActive && noteForOption === noteKey) {
                  const noteDisplay =
                    notesDraft || theme.fg("dim", "type note here");
                  add(`      ${theme.fg("warning", "📝")} ${noteDisplay}`);
                } else if (hasNote && noteEntry) {
                  add(`      ${theme.fg("dim", `📝 ${noteEntry.text}`)}`);
                }
              }

              // Multi-select: Done row
              if (isMultiSel) {
                const doneIndex = opts.length;
                const isDoneCursor = doneIndex === optionIndex;
                const selectedCount = multiSelectState.get(cq.id)?.size ?? 0;
                const customCount =
                  customMultiSelectValues.get(cq.id)?.length ?? 0;
                const totalCount = selectedCount + customCount;
                const doneCursor = isDoneCursor ? theme.fg("accent", "▸") : " ";
                const doneLabel =
                  totalCount > 0 ? `✓ Done (${totalCount} selected)` : "✓ Done";
                add(
                  ` ${doneCursor}  ${theme.fg(totalCount > 0 ? "success" : "muted", doneLabel)}`,
                );
              }
            }

            // ── Input / notes editors ──
            if (notesActive) {
              lines.push("");
              add(theme.fg("warning", theme.bold(" 📝 Note:")));
              for (const line of editor.render(width - 4)) {
                add(`   ${line}`);
              }
            } else if (editMode) {
              lines.push("");
              add(theme.fg("accent", theme.bold(" ✎ Your answer:")));
              for (const line of editor.render(width - 4)) {
                add(`   ${line}`);
              }
            }

            // ── Help bar ──
            lines.push("");
            const k = (key: string) => theme.fg("accent", key);
            const d = (desc: string) => theme.fg("dim", desc);
            const sep = theme.fg("dim", " • ");
            if (notesActive) {
              add(
                `${k("Enter")} ${d("save note")}${sep}${k("Esc")} ${d("cancel")}`,
              );
            } else if (editMode) {
              add(
                `${k("Enter")} ${d("submit")}${sep}${k("Esc")} ${d("go back")}`,
              );
            } else if (currentTab === questions.length) {
              add(
                `${k("Enter")} ${d("submit")}${sep}${k("Esc")} ${d("cancel")}${sep}${k("Ctrl+]")} ${d("collapse")}`,
              );
            } else if (isCurrentMultiSelect()) {
              add(
                `${k("↑↓")} ${d("navigate")}${sep}${k("Space/Enter")} ${d("toggle")}${sep}${k("1-9")} ${d("toggle")}${sep}${k("n")} ${d("note")}`,
              );
              add(
                `${k("a")} ${d("all")}${sep}${k("d")} ${d("none")}${sep}${k("Ctrl+]")} ${d("collapse")}${sep}${k("Esc")} ${d("cancel")}`,
              );
            } else if (isMulti) {
              add(
                `${k("Tab/←→")} ${d("switch")}${sep}${k("↑↓")} ${d("navigate")}${sep}${k("1-9")} ${d("pick")}${sep}${k("Enter")} ${d("select")}`,
              );
              add(
                `${k("n")} ${d("note")}${sep}${k("Ctrl+]")} ${d("collapse")}${sep}${k("Esc")} ${d("cancel")}`,
              );
            } else {
              add(
                `${k("↑↓")} ${d("navigate")}${sep}${k("1-9")} ${d("pick")}${sep}${k("Enter")} ${d("select")}${sep}${k("n")} ${d("note")}${sep}${k("Ctrl+]")} ${d("collapse")}${sep}${k("Esc")} ${d("cancel")}`,
              );
            }

            add(theme.fg("accent", "─".repeat(width)));

            // ── Overflow scroll ──
            // Compute available rows in terminal and detect overflow
            const termRows = tui.terminal.rows;

            // If we exceed terminal height, apply 3-region overflow
            if (lines.length > termRows) {
              const topFixed = 1 + (isMulti ? 2 : 0); // top border + tabs (+ spacer)
              const bottomFixed = 2; // help bar + bottom border
              const availableMiddle = Math.max(
                0,
                termRows - topFixed - bottomFixed,
              );

              if (availableMiddle <= 0) {
                return lines.slice(0, termRows);
              }

              const naturalMiddleLen = lines.length - topFixed - bottomFixed;
              const scrollStart = Math.max(
                0,
                Math.min(
                  Math.floor(
                    (optionIndex * availableMiddle) /
                      Math.max(1, naturalMiddleLen),
                  ),
                  naturalMiddleLen - availableMiddle,
                ),
              );

              const scrollableMiddle = lines.slice(
                topFixed + scrollStart,
                topFixed + scrollStart + availableMiddle,
              );

              const hasUp = scrollStart > 0;
              const hasDown = scrollStart + availableMiddle < naturalMiddleLen;

              if (hasUp && hasDown && scrollableMiddle.length >= 1) {
                scrollableMiddle[0] = theme.fg("dim", OVERFLOW_BOTH);
              } else {
                if (hasUp && scrollableMiddle.length > 0) {
                  scrollableMiddle[0] = theme.fg("dim", OVERFLOW_UP);
                }
                if (hasDown && scrollableMiddle.length > 0) {
                  scrollableMiddle[scrollableMiddle.length - 1] = theme.fg(
                    "dim",
                    OVERFLOW_DOWN,
                  );
                }
              }

              const result = [
                ...lines.slice(0, topFixed),
                ...scrollableMiddle,
                ...lines.slice(lines.length - bottomFixed),
              ];
              cachedLines = result.slice(0, termRows);
              return cachedLines;
            }

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

      // ─── Build response ──────────────────────────────────────────

      if (result.cancelled) {
        return {
          content: [{ type: "text", text: "User cancelled the questionnaire" }],
          details: result,
        };
      }

      const lines = result.answers.map((a) => {
        const q = questions.find((qq) => qq.id === a.id);
        const label = q?.label || a.id;
        const noteSuffix = a.note ? ` [note: ${a.note}]` : "";
        if (a.wasCustom) {
          return `${label}: user wrote: ${a.label}${noteSuffix}`;
        }
        if (a.values && a.values.length > 1) {
          const selections = a
            .labels!.map((l, i) => `${a.indices![i]}. ${l}`)
            .join(", ");
          return `${label}: user selected: ${selections}${noteSuffix}`;
        }
        return `${label}: user selected: ${a.index}. ${a.label}${noteSuffix}`;
      });

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: result,
      };
    },

    // ─── renderCall ─────────────────────────────────────────────────

    renderCall(args, theme, _context) {
      const qs = (args.questions as Question[]) || [];
      if (qs.length === 1) {
        const q = qs[0];
        const multiLabel = q.multiSelect ? " [multi-select]" : "";
        let text =
          theme.fg("toolTitle", theme.bold("ask_user ")) +
          theme.fg("muted", q.prompt) +
          theme.fg("dim", multiLabel);
        const opts = q.options || [];
        if (opts.length) {
          const labels = opts.map((o: Option) => o.label);
          const numbered = labels.map((l, i) => `${i + 1}. ${l}`);
          text += `\n${theme.fg("dim", `  Options: ${numbered.join(", ")}`)}`;
        }
        return new Text(text, 0, 0);
      }

      let text = theme.fg("toolTitle", theme.bold("ask_user "));
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

    // ─── renderResult ───────────────────────────────────────────────

    renderResult(result, _options, theme, _context) {
      const details = result.details as ListOptionResult | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }
      if (details.cancelled) {
        return new Text(theme.fg("warning", "Cancelled"), 0, 0);
      }

      const answerLines = details.answers.map((a) => {
        const noteSuffix = a.note ? theme.fg("dim", ` [note: ${a.note}]`) : "";
        if (a.wasCustom) {
          return (
            theme.fg("success", "✓ ") +
            theme.fg("accent", a.id) +
            ": " +
            theme.fg("muted", "(custom) ") +
            a.label +
            noteSuffix
          );
        }
        if (a.values && a.values.length > 1) {
          const selections = a
            .labels!.map((l, i) => `${a.indices![i]}. ${l}`)
            .join(", ");
          return (
            theme.fg("success", "✓ ") +
            theme.fg("accent", a.id) +
            ": " +
            theme.fg("text", selections) +
            noteSuffix
          );
        }
        const display = a.index ? `${a.index}. ${a.label}` : a.label;
        return (
          theme.fg("success", "✓ ") +
          theme.fg("accent", a.id) +
          ": " +
          display +
          noteSuffix
        );
      });
      return new Text(answerLines.join("\n"), 0, 0);
    },
  });
}
