---
type: source
title: "setEditorComponent is exclusive — inject status into the vim editor, not a sibling"
slug: pi-setEditorComponent-exclusivity-inject-into-vim
status: insight
created: 2026-06-29
updated: 2026-06-29
category: architecture
---
# setEditorComponent is exclusive — inject status into the vim editor, not a sibling
Only **one** component can own the editor at a time: `ctx.ui.setEditorComponent(Editor)` is mutually exclusive. If an extension wants to render status into the editor border AND a vim-mode extension is already installed, the two cannot both call `setEditorComponent` — the second replaces the first.

## The constraint

`ExtensionContext.ui.setEditorComponent(factory)` installs a custom editor component to replace pi's built-in input editor. Passing `undefined` restores the default.

`interactive-mode.js` default: `new CustomEditor(ui, theme, keybindings, { paddingX, autocompleteMaxVisible })` placed directly in `editorContainer` with no min-height.

Loaded-with-exclusivity: only one editor component is active at a time. A `CustomEditor` subclass that wants border content and a separate vim-mode component that also subclasses `CustomEditor` for keybindings cannot coexist as two separate `setEditorComponent` registrations.

## Workable approach: inject into the vim editor itself

Rather than registering a second editor component for border-status, modify the vim-mode `CustomEditor` subclass to accept what it needs and render the status inline in its own `render()`:

1. **Pass `pi` + `ctx` into the editor via `options`.** The `VimEditor` constructor signature is `(tui, theme, keybindings, options)`. The base `Editor` only consumes `paddingX` / `autocompleteMaxVisible` from `options`; you can extend the options type:

    ```ts
    type EditorOptions = { paddingX?: number; autocompleteMaxVisible?: number };
    // in the extension's session_start hook (which closes over both pi and ctx):
    ctx.ui.setEditorComponent(
      (tui, theme, keybindings, options) =>
        new VimEditor(tui, theme, keybindings, { ...options, pi, ctx }),
    );
    ```

2. **In the subclass constructor**, store them privately:
    ```ts
    private readonly api: { pi?: ExtensionAPI; ctx?: ExtensionContext };
    constructor(tui, theme, keybindings, options?: EditorOptions & { pi?; ctx? }) {
      super(tui, theme, keybindings, options);
      this.api = { pi: options?.pi, ctx: options?.ctx };
    }
    ```

3. **Render the status in `render()`**, writing into the top (or bottom) border line of `super.render(width)`'s output. Pattern: build a right-aligned block, then `lines[0] = truncateToWidth(lines[0]!, width - blockWidth, "") + block`. See [[pi-custom-editor-bottom-border-vs-autocomplete]] for how to safely locate the bottom border when autocomplete is active (do NOT assume `lines.length - 1`).

## ExtensionContext / ExtensionAPI access

Both `ExtensionAPI` and `ExtensionContext` are re-exported from the main entry of `@earendil-works/pi-coding-agent`, so import them as types directly:

```ts
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
```

For reading live state:
- `ctx.model` — current model (has `provider`, `id`, `contextWindow`)
- `ctx.getContextUsage()` — real context occupancy (see [[pi-token-usage-input-trap]])
- `pi.getThinkingLevel()` — current thinking level

`ctx.ui.theme` is accessible from the footer/header render closures (passed `theme`), but inside a `CustomEditor.render(width)` you do NOT get `ctx`; that's why you must pass it in via options. Likewise `ctx.ui.setFooter()` / `setHeader()` are alternatives when you don't need to render into the editor border itself.

## Coupling caveat

Anything rendered inside the vim editor's `render()` is bound to vim-mode being active. If vim-mode is unloaded/disabled, the border-status content disappears along with it. For decoupled, always-on status, prefer `ctx.ui.setFooter()` / `setHeader()` / `setWidget(..., {placement: "belowEditor"|"aboveEditor"})` instead. The footer/header approach is what `statusline.ts` uses; it does NOT touch `setEditorComponent` and thus coexists freely with vim-mode.

## Loading mechanism note

Pi extensions under `.pi/agent/extensions/*.ts` are loaded via the `-e` / extensions flag (or auto-load), NOT necessarily via `settings.json`'s `extensions: []` array. An empty `extensions: []` in settings does not mean no extensions are active — verify the actual flag/load path before assuming absence.
*Category: architecture*
---
*Captured: 2026-06-29*
## Related
_Add links to related pages._