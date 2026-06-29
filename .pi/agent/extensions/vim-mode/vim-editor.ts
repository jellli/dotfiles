/**
 * VimEditor - Modal vim editor extending CustomEditor.
 * Routes input to mode-specific handlers and renders mode indicator.
 */

import { CustomEditor, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
    matchesKey,
    truncateToWidth,
    visibleWidth,
} from "@earendil-works/pi-tui";
import type {
    TUI,
    EditorOptions,
    EditorTheme,
    AutocompleteProvider,
} from "@earendil-works/pi-tui";
import { createInitialState, modeDisplayName, type VimState } from "./state.js";
import { handleNormalMode, type NormalModeContext } from "./modes/normal.js";
import { handleInsertMode, type InsertModeContext } from "./modes/insert.js";
import { handleReplaceMode, type ReplaceModeContext } from "./modes/replace.js";
import {
    handleVisualMode,
    getVisualRange,
    type VisualModeContext,
} from "./modes/visual.js";
import { ESCAPE_SEQS } from "./keys.js";
import {
    handleSearchInput,
    getSearchPrompt,
    getSearchState,
    executeSearchMotion,
} from "./search.js";

export class VimEditor extends CustomEditor {
    public vimState: VimState;
    private redoStack: Array<{
        lines: string[];
        cursorLine: number;
        cursorCol: number;
    }> = [];

    private readonly api: { pi: ExtensionAPI; ctx: ExtensionContext };

    constructor(
        tui: TUI,
        theme: EditorTheme,
        keybindings: any,
        options?: EditorOptions & { pi?: ExtensionAPI; ctx?: ExtensionContext },
    ) {
        super(tui, theme, keybindings, options);
        this.vimState = createInitialState();
        this.api = {
            pi: options?.pi!,
            ctx: options?.ctx!,
        };
    }

    /** Preserve Pi's built-in autocomplete provider behavior. */
    override setAutocompleteProvider(provider: AutocompleteProvider): void {
        super.setAutocompleteProvider(provider);
    }

    /**
     * Undo: snapshot current state to redo stack, then perform base editor undo.
     * Works at the same level as the base editor's internal state.
     */
    vimUndo(): void {
        const editor = this as any;
        if (!editor.undoStack || editor.undoStack.length === 0) return;

        // Save current internal state to redo stack before undoing
        const state = editor.state;
        this.redoStack.push(structuredClone(state));

        // Perform base editor undo
        editor.undo();
    }

    /**
     * Redo: restore state from redo stack, push current state to undo stack.
     * Mirrors the base editor's undo mechanism in reverse.
     */
    vimRedo(): void {
        if (this.redoStack.length === 0) return;
        const editor = this as any;
        const snapshot = this.redoStack.pop()!;

        // Push current state to undo stack
        editor.undoStack.push(structuredClone(editor.state));

        // Restore the redo snapshot directly into internal state
        Object.assign(editor.state, snapshot);
        editor.lastAction = null;
        editor.preferredVisualCol = null;
        if (editor.onChange) {
            editor.onChange(this.getText());
        }
    }

    handleInput(data: string): void {
        const { vimState } = this;
        const textBefore = this.getText();
        const redoStackBefore = this.redoStack.length;

        switch (vimState.mode) {
            case "insert":
                this.handleInsert(data);
                break;

            case "replace":
                this.handleReplace(data);
                break;

            case "normal":
                this.handleNormal(data);
                break;

            case "visual":
            case "visual-line":
                this.handleVisual(data);
                break;

            case "command-line":
                this.handleCommandLine(data);
                break;

            default:
                // For unimplemented modes, pass through to super
                super.handleInput(data);
                break;
        }

        // Clear redo stack when text changes from a non-undo/redo action.
        // If the redo stack changed size, it was an undo/redo operation — don't clear.
        if (
            this.redoStack.length === redoStackBefore &&
            this.getText() !== textBefore
        ) {
            this.redoStack.length = 0;
        }
    }

    private handleInsert(data: string): void {
        const ctx: InsertModeContext = {
            state: this.vimState,
            getCursor: () => this.getCursor(),
            superHandleInput: (d) => super.handleInput(d),
        };
        handleInsertMode(data, ctx);
    }

    private handleReplace(data: string): void {
        const ctx: ReplaceModeContext = {
            state: this.vimState,
            getCursor: () => this.getCursor(),
            getText: () => this.getText(),
            setText: (text) => this.setText(text),
            moveCursorTo: (line, col) => this.moveCursorTo(line, col),
            superHandleInput: (d) => super.handleInput(d),
        };
        handleReplaceMode(data, ctx);
    }

    private handleNormal(data: string): void {
        // Escape in normal mode → pass to super (abort agent, etc.)
        if (matchesKey(data, "escape")) {
            super.handleInput(data);
            return;
        }

        const ctx: NormalModeContext = {
            state: this.vimState,
            superHandleInput: (d) => super.handleInput(d),
            getText: () => this.getText(),
            getCursor: () => this.getCursor(),
            setText: (text) => this.setText(text),
            moveCursorTo: (line, col) => this.moveCursorTo(line, col),
            undo: () => this.vimUndo(),
            redo: () => this.vimRedo(),
        };
        handleNormalMode(data, ctx);
    }

    private handleCommandLine(data: string): void {
        const state = getSearchState();
        const returnMode = state.returnMode;
        const result = handleSearchInput(data);

        if (result === "confirm") {
            // Execute the search and move cursor to the match
            const lines = this.getText().split("\n");
            const cursor = this.getCursor();
            const motionResult = executeSearchMotion(lines, cursor);
            this.moveCursorTo(
                motionResult.position.line,
                motionResult.position.col,
            );
            this.vimState.mode = returnMode;
        } else if (result === "cancel") {
            this.vimState.mode = "normal";
            this.vimState.visualAnchor = null;
        }
        // "continue" → stay in command-line mode, render will show the prompt
    }

    private handleVisual(data: string): void {
        const ctx: VisualModeContext = {
            state: this.vimState,
            superHandleInput: (d) => super.handleInput(d),
            getText: () => this.getText(),
            getCursor: () => this.getCursor(),
            setText: (text) => this.setText(text),
            moveCursorTo: (line, col) => this.moveCursorTo(line, col),
        };
        handleVisualMode(data, ctx);
    }

    /**
     * Move cursor to an absolute position by using escape sequences.
     * Re-reads getCursor() for accurate positioning (important after setText which moves to end).
     */
    moveCursorTo(targetLine: number, targetCol: number): void {
        const current = this.getCursor();

        // Move vertically
        if (targetLine < current.line) {
            for (let i = current.line; i > targetLine; i--) {
                super.handleInput(ESCAPE_SEQS.up);
            }
        } else if (targetLine > current.line) {
            for (let i = current.line; i < targetLine; i++) {
                super.handleInput(ESCAPE_SEQS.down);
            }
        }

        // Move to line start, then right to target column
        super.handleInput(ESCAPE_SEQS.home);
        for (let i = 0; i < targetCol; i++) {
            super.handleInput(ESCAPE_SEQS.right);
        }
    }

    render(width: number): string[] {
        const lines = super.render(width);
        if (lines.length === 0) return lines;

        // Custom border glyphs + shared dim color.
        // The editor renders borders as a `─` run styled by the theme's
        // borderColor (borderMuted). We swap the rune (top ▄, bottom ▀) AND
        // re-stroke it in the shared dim color so the border fg matches the
        // input-area bg below (one source of truth: EDITOR_DIM_RGB).
        lines[0] = recolorBorder(lines[0]!, EDITOR_BORDER_FG).replace(/─/g, "▄");
        lines[0] = this.injectTopRight(lines[0]!, width);
        // base editor may append autocomplete menu rows AFTER the bottom border;
        // `lines.length - 1` would then point at an autocomplete row, not the
        // border. Locate the real bottom border by its glyph shape instead.
        let bottomBorderIdx = findBottomBorderIdx(lines, width);
        if (bottomBorderIdx > 0) {
            lines[bottomBorderIdx] =
                recolorBorder(lines[bottomBorderIdx]!, EDITOR_BORDER_FG).replace(/─/g, "▀");
        }

        // Pad the content area to a minimum height of 3 visible content lines
        // (empty / short input). base Editor only emits as many content lines
        // as there is text, so an empty editor is just 1 content line tall.
        // Insert blank content lines (same visible width as base's empty lines)
        // before the bottom border so the editor body is at least 3 rows.
        const MIN_CONTENT_LINES = 3;
        const contentCount = Math.max(0, bottomBorderIdx - 1);
        if (bottomBorderIdx > 0 && contentCount < MIN_CONTENT_LINES) {
            // Blank content row: match base editor's content-width (width minus
            // horizontal padding) so it never overflows the content area.
            const paddingX = this.getPaddingX();
            const contentWidth = Math.max(1, width - paddingX * 2);
            const blank = " ".repeat(contentWidth);
            const need = MIN_CONTENT_LINES - contentCount;
            lines.splice(bottomBorderIdx, 0, ...Array.from({ length: need }, () => blank));
            // bottom border shifted down by `need` rows; keep the local var
            // in sync so the dim-bg loop below covers the new blank rows and
            // stops at the (now-lower) bottom border.
            bottomBorderIdx += need;
        }

        // Dim background on the input/content area (everything between the borders).
        // Uses the SAME shared color as the border glyphs. Re-inject the bg after
        // any SGR reset so it survives the editor's cursor reset (\x1b[0m) and
        // any per-line styling resets.
        for (let i = 1; i < bottomBorderIdx; i++) {
            lines[i] = applyDimBackground(lines[i]!);
        }

        // Insert mode: render the cursor as an underline instead of the base
        // editor's reverse-video block (which is the block cursor used by
        // normal/visual/replace/etc.). base emits the cursor inline as
        // `\x1b[7m{grapheme}\x1b[0m`; swap the reverse-video SGR (7) for the
        // underline SGR (4) so the character keeps its colour but gains an
        // underline. Only in insert mode — other modes keep the block cursor.
        if (this.vimState.mode === "insert") {
            for (let i = 1; i < bottomBorderIdx; i++) {
                lines[i] = lines[i]!.replace(
                    /\x1b\[7m([^\x1b]*)\x1b\[0m/g,
                    "\x1b[4m$1\x1b[0m",
                );
            }
        }

        // Apply visual selection highlighting if in visual mode
        // Also keep highlighting when in command-line mode initiated from visual
        const isVisual =
            this.vimState.mode === "visual" ||
            this.vimState.mode === "visual-line";
        const isSearchFromVisual =
            this.vimState.mode === "command-line" &&
            (getSearchState().returnMode === "visual" ||
                getSearchState().returnMode === "visual-line");
        if ((isVisual || isSearchFromVisual) && this.vimState.visualAnchor) {
            this.applyVisualHighlight(lines, width, bottomBorderIdx);
        }

        // Add mode indicator to the bottom border (right side).
        // Use the already-resolved bottom-border index (handles autocomplete
        // rows appended after the border — see findBottomBorderIdx).
        const last = bottomBorderIdx;

        if (this.vimState.mode === "command-line" && getSearchState().active) {
            // Show search prompt on the bottom border
            const prompt = getSearchPrompt();
            const cursorChar = "█";
            const promptWithCursor = ` ${prompt}${cursorChar} `;
            if (visibleWidth(lines[last]!) >= promptWithCursor.length) {
                lines[last] =
                    truncateToWidth(
                        lines[last]!,
                        width - promptWithCursor.length,
                        "",
                    ) + promptWithCursor;
            }
        } else {
            const modeName = modeDisplayName(this.vimState.mode);
            const label = ` ${modeName} `;
            if (visibleWidth(lines[last]!) >= label.length) {
                // Mode-specific background colors (gruvbox-material palette)
                // Foreground: dark bg for contrast, Background: mode color
                const modeColors: Record<string, { fg: string; bg: string }> = {
                    normal:        { fg: "29;32;33",  bg: "125;174;163" },  // bg0 + blue
                    insert:        { fg: "29;32;33",  bg: "169;182;101" },  // bg0 + green
                    replace:       { fg: "29;32;33",  bg: "234;106;98"  },  // bg0 + red
                    visual:        { fg: "29;32;33",  bg: "211;134;155" },  // bg0 + purple
                    "visual-line": { fg: "29;32;33",  bg: "211;134;155" },  // bg0 + purple
                    "command-line":{ fg: "29;32;33",  bg: "216;166;87"  },  // bg0 + yellow
                    "operator-pending": { fg: "29;32;33", bg: "137;180;130" }, // bg0 + aqua
                };
                const colors = modeColors[this.vimState.mode] ?? modeColors["normal"]!;
                // SGR: 38;2;R;G;B = fg, 48;2;R;G;B = bg, 1 = bold
                const styled = `\x1b[1;38;2;${colors.fg};48;2;${colors.bg}m${label}\x1b[0m`;
                lines[last] =
                    truncateToWidth(lines[last]!, width - label.length, "") +
                    styled;
            }
        }

        return lines;
    }

    /**
     * Inject provider / model / thinking-level into the TOP border (right side).
     * Mirrors the bottom-border mode-label injection: truncate the border `▄` run
     * to leave room, then append a styled block carrying its own fg/bg SGR so it
     * sits on the editor border without depending on the border's dim fg.
     *
     * Returns the new top border string (caller reassigns lines[0]).
     */
    private injectTopRight(topBorder: string, width: number): string {
        const { pi, ctx } = this.api;

        const provider = ctx.model?.provider ?? "unknown";
        const model = ctx.model?.id ?? "no-model";
        const thinkingLevel = pi.getThinkingLevel();

        // Thinking level colors — cool tones (same palette as statusline footer).
        const thinkingColors: Record<string, string> = {
            off: "146;131;116", // grey
            minimal: "169;182;101", // green
            low: "137;180;130", // aqua
            medium: "125;174;163", // blue
            high: "231;138;78", // orange
            xhigh: "231;138;78", // orange
        };
        const thinkingBg = thinkingColors[thinkingLevel] ?? thinkingColors["high"]!;

        const provBg = "80;73;69"; // grey (gruvbox bg2)
        const providerBlock = `\x1b[1;38;2;29;32;33;48;2;${provBg}m ${provider} \x1b[0m`;
        // model: subtle bg (gruvbox fg0 on bg1), thinking: vibrant bg per level.
        const modelBlock = `\x1b[38;2;212;190;152;48;2;60;56;54m ${model} \x1b[0m`;
        const levelBlock = `\x1b[1;38;2;29;32;33;48;2;${thinkingBg}m ${thinkingLevel} \x1b[0m`;
        const block = `${providerBlock}${modelBlock}${levelBlock}`;

        const blockW = visibleWidth(block);
        if (visibleWidth(topBorder) < blockW + 1) return topBorder; // not enough room
        // Truncate the border `▄` run from the right, then append the block.
        // truncateToWidth preserves the leading EDITOR_BORDER_FG SGR.
        return truncateToWidth(topBorder, width - blockW, "") + block;
    }

    /**
     * Apply reverse-video highlighting to the visual selection range in rendered output.
     *
     * The rendered output from super.render() is structured as:
     *   [top border, ...content lines (with padding), bottom border, ...autocomplete]
     *
     * Content lines have format: `${leftPadding}${displayText}${rightPadding}`
     * where padding is `paddingX` spaces on each side (default 0).
     * The editor also inserts CURSOR_MARKER (APC sequence) and cursor highlighting.
     *
     * We use pi-tui's extractAnsiCode to properly skip ALL escape sequences
     * (CSI, OSC, APC) when counting visible positions.
     */
    private applyVisualHighlight(renderedLines: string[], width: number, bottomBorderIdx: number): void {
        const text = this.getText();
        const textLines = text.split("\n");
        const cursor = this.getCursor();
        const range = getVisualRange(this.vimState, cursor, textLines);

        // The editor uses paddingX (default 0) for left/right content padding.
        // With paddingX=0: contentWidth = width, layoutWidth = width - 1
        // Content lines start at renderedLines[1] through renderedLines[length-2].
        // The padding property is accessed via getPadding().
        const paddingX = this.getPaddingX();
        const contentWidth = Math.max(1, width - paddingX * 2);
        const layoutWidth = Math.max(1, contentWidth - (paddingX ? 0 : 1));

        // Map text line index → first rendered line index (1-based, after top border)
        const textLineToRenderedStart: number[] = [];
        let renderedIdx = 1; // skip top border
        for (let i = 0; i < textLines.length; i++) {
            textLineToRenderedStart.push(renderedIdx);
            const lineLen = Math.max(1, visibleWidth(textLines[i] || ""));
            const wrappedCount = Math.ceil(lineLen / layoutWidth);
            renderedIdx += wrappedCount;
        }

        // Highlight the selected ranges
        for (
            let textLine = range.start.line;
            textLine <= range.end.line;
            textLine++
        ) {
            const lineText = textLines[textLine] || "";
            const renderedStart = textLineToRenderedStart[textLine];
            if (renderedStart === undefined) continue;

            let selStartCol: number;
            let selEndCol: number;

            if (range.linewise) {
                selStartCol = 0;
                selEndCol = lineText.length;
            } else {
                selStartCol =
                    textLine === range.start.line ? range.start.col : 0;
                selEndCol =
                    textLine === range.end.line
                        ? range.end.col + 1
                        : lineText.length;
            }

            // Apply highlighting across wrapped lines
            const lineLen = Math.max(1, lineText.length);
            const wrappedCount = Math.ceil(lineLen / layoutWidth);

            for (let wrap = 0; wrap < wrappedCount; wrap++) {
                const rIdx = renderedStart + wrap;
                if (rIdx >= bottomBorderIdx) break; // don't touch bottom border (or anything past it, e.g. autocomplete)

                const wrapStartCol = wrap * layoutWidth;
                const wrapEndCol = wrapStartCol + layoutWidth;

                // Intersection of selection with this wrapped segment
                const hlStart =
                    Math.max(selStartCol, wrapStartCol) - wrapStartCol;
                const hlEnd = Math.min(selEndCol, wrapEndCol) - wrapStartCol;

                if (hlStart < hlEnd) {
                    // Offset by paddingX for left padding
                    renderedLines[rIdx] = highlightRenderedLine(
                        renderedLines[rIdx]!,
                        hlStart + paddingX,
                        hlEnd + paddingX,
                    );
                }
            }
        }
    }
}

/**
 * Detect an escape sequence at position `pos` in `str`.
 * Returns the length of the escape sequence, or 0 if none found.
 *
 * Handles:
 * - CSI sequences: \x1b[ ... m/G/K/H/J
 * - OSC sequences: \x1b] ... BEL or \x1b] ... ST(\x1b\\)
 * - APC sequences: \x1b_ ... BEL or \x1b_ ... ST(\x1b\\)
 */
function escapeSeqLength(str: string, pos: number): number {
    if (pos >= str.length || str[pos] !== "\x1b") return 0;
    const next = str[pos + 1];

    // CSI: \x1b[ ... terminator
    if (next === "[") {
        let j = pos + 2;
        while (j < str.length && !/[mGKHJ]/.test(str[j]!)) j++;
        if (j < str.length) return j + 1 - pos;
        return 0;
    }

    // OSC: \x1b] ... BEL or ST
    if (next === "]") {
        let j = pos + 2;
        while (j < str.length) {
            if (str[j] === "\x07") return j + 1 - pos;
            if (str[j] === "\x1b" && str[j + 1] === "\\") return j + 2 - pos;
            j++;
        }
        return 0;
    }

    // APC: \x1b_ ... BEL or ST
    if (next === "_") {
        let j = pos + 2;
        while (j < str.length) {
            if (str[j] === "\x07") return j + 1 - pos;
            if (str[j] === "\x1b" && str[j + 1] === "\\") return j + 2 - pos;
            j++;
        }
        return 0;
    }

    return 0;
}

/**
 * Insert reverse-video ANSI codes into a rendered line at specific visible column positions.
 * Properly handles CSI, OSC, and APC escape sequences (including CURSOR_MARKER).
 *
 * When the cursor falls inside the highlighted range, the editor's cursor rendering
 * inserts `\x1b[0m` (full reset) after the cursor character, which would kill the
 * reverse video for the rest of the selection. We detect this and re-inject `\x1b[7m`
 * after any SGR reset that falls within the highlighted range.
 *
 * `startVisCol` and `endVisCol` are 0-indexed visible column positions to highlight.
 */
function highlightRenderedLine(
    line: string,
    startVisCol: number,
    endVisCol: number,
): string {
    let result = "";
    let visCol = 0;
    let i = 0;
    let started = false;
    let ended = false;

    while (i < line.length) {
        // Check for any escape sequence (CSI, OSC, APC)
        const seqLen = escapeSeqLength(line, i);
        if (seqLen > 0) {
            // Insert highlight markers before this escape sequence if needed
            if (!started && visCol >= startVisCol) {
                result += "\x1b[7m";
                started = true;
            }
            if (started && !ended && visCol >= endVisCol) {
                result += "\x1b[27m";
                ended = true;
            }

            const seq = line.substring(i, i + seqLen);
            result += seq;

            // If we're inside the highlight range and this is a SGR reset (\x1b[0m),
            // re-inject reverse video to keep the selection highlighted.
            // The editor's cursor rendering uses \x1b[0m after the cursor character,
            // which would otherwise kill our reverse video.
            if (started && !ended && isResetSequence(seq)) {
                result += "\x1b[7m";
            }

            i += seqLen;
            continue;
        }

        // Insert highlight markers at the right visible positions
        if (!started && visCol === startVisCol) {
            result += "\x1b[7m";
            started = true;
        }
        if (started && !ended && visCol === endVisCol) {
            result += "\x1b[27m";
            ended = true;
        }

        result += line[i];
        // Only count printable characters as visible
        const code = line.charCodeAt(i);
        if (code >= 0x20) {
            visCol++;
        }
        i++;
    }

    // Close highlight if we reached end of line before endVisCol
    if (started && !ended) {
        result += "\x1b[27m";
    }

    return result;
}

/**
 * Check if an ANSI sequence is an SGR reset that would clear reverse video.
 * Matches \x1b[0m and \x1b[m (both are full SGR resets).
 */
function isResetSequence(seq: string): boolean {
    return seq === "\x1b[0m" || seq === "\x1b[m";
}

/**
 * Shared dim color for the vim editor chrome.
 *
 * Used for BOTH the border glyph fg (▄/▀) and the input/content area bg so
 * they always match. Uses bg1 (#282828 / rgb 40;40;40) — darker than
 * gruvbox-material `dim` (#504945) but keeps glyphs visible against a bg0
 * (#1D2021) terminal background.
 */
const EDITOR_DIM_RGB = "40;40;40";
const EDITOR_BORDER_FG = `\x1b[38;2;${EDITOR_DIM_RGB}m`;
const EDITOR_INPUT_BG = `\x1b[48;2;${EDITOR_DIM_RGB}m`;

/**
 * Locate the BOTTOM border row in a rendered editor line array.
 *
 * base Editor.render() emits:
 *   [top border, ...content lines, bottom border, ...autocomplete lines]
 * When autocomplete is active, the bottom border is NOT the last row —
 * autocomplete menu rows are appended after it. Code that assumes
 * `lines.length - 1` is the bottom border therefore corrupts an autocomplete
 * row (recolor/dim-bg/mode-label land on the wrong line) and skips the real
 * bottom border.
 *
 * This scans from the top (skipping the top border at [0]) for the FIRST row
 * whose visible text is a full-width run of `─` glyphs optionally prefixed by
 * a scroll indicator (`─── ↑ N more ` / `─── ↓ N more `). Autocomplete rows are
 * menu text and never match, so they are skipped correctly.
 *
 * Falls back to `lines.length - 1` when no border-like row is found (preserves
 * legacy behaviour if the editor's render format ever changes unexpectedly).
 */
function findBottomBorderIdx(lines: string[], width: number): number {
    const borderRe = /^(?:─── [↑↓] \d+ more )?─+$/;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i]!;
        // Strip CSI/OSC/APC to get visible text.
        let visible = "";
        let j = 0;
        while (j < line.length) {
            const seqLen = escapeSeqLength(line, j);
            if (seqLen > 0) {
                j += seqLen;
                continue;
            }
            visible += line[j];
            j++;
        }
        if (borderRe.test(visible) && visibleWidth(visible) === width) {
            return i;
        }
    }
    return lines.length - 1;
}

/**
 * Strip every escape sequence (CSI/OSC/APC) from a border line and re-wrap
 * the visible text in `fgSGR` (translucent bg). Borders are a single fg color
 * (theme borderMuted), so this lets us override that with the shared dim color
 * regardless of theme value. Scroll indicators (↑/↓ N more) ride the same fg.
 */
function recolorBorder(line: string, fgSGR: string): string {
    let visible = "";
    let i = 0;
    while (i < line.length) {
        const seqLen = escapeSeqLength(line, i);
        if (seqLen > 0) {
            i += seqLen;
            continue;
        }
        visible += line[i];
        i++;
    }
    return fgSGR + visible + "\x1b[0m";
}

/**
 * Wrap a rendered line in a dim background (EDITOR_INPUT_BG — same color as the
 * border glyphs).
 *
 * The editor inserts full SGR resets (\x1b[0m) after the cursor block and other
 * inline styling; a single leading bg code would be cleared by those. So we
 * re-inject the dim background after every full SGR reset encountered in the
 * line. Non-reset escape sequences (colour set, OSC, APC) are passed through
 * untouched so they can layer on top of the dim bg.
 */
function applyDimBackground(line: string): string {
    let result = EDITOR_INPUT_BG;
    let i = 0;
    while (i < line.length) {
        const seqLen = escapeSeqLength(line, i);
        if (seqLen > 0) {
            const seq = line.substring(i, i + seqLen);
            result += seq;
            if (isResetSequence(seq)) {
                result += EDITOR_INPUT_BG; // restore dim bg cleared by the reset
            }
            i += seqLen;
            continue;
        }
        result += line[i];
        i++;
    }
    return result;
}
