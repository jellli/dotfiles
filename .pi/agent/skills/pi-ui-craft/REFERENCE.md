# Pi UI Reference

## Source Projects

- [pi-facelift](https://github.com/wierdbytes/pi-wierd-stuff/tree/master/packages/facelift)
- [pi-diff](https://github.com/buddingnewinsights/pi-diff)
- [pi-pretty](https://github.com/buddingnewinsights/pi-pretty)

These are pattern references. Re-check upstream before copying APIs or behavior.

## Capability Matrix

| Area | pi-diff | pi-pretty | pi-facelift |
| --- | --- | --- | --- |
| `write` / `edit` diff | Primary | Delegates to pi-diff | Shared diff package |
| `read` / `bash` / search | No | Primary | Primary |
| Syntax highlighting | Shiki | Shiki | Shiki/shared |
| Split/unified diff | Yes | Via companion | Yes |
| Word-level emphasis | Yes | Via companion | Yes |
| Frames | Diff chrome | Tool backgrounds | Shared open-right frame |
| Images | No | Kitty/iTerm2/etc. | Kitty/iTerm2/etc. |
| Live indicator | No | Shimmer/KITT/static | Working timer |
| Persistent config | `pi-diff.json` | `pi-pretty.json` | `/facelift` config |

## Reusable Patterns

### 1. Tool ownership

Pi extensions replace built-in tools by registering a definition with the same name. This is powerful but non-compositional. Load only one owner for each tool. A compact extension can own read/search while a diff extension owns write/edit. When composing packages, keep ownership explicit and avoid relying on load order.

### 2. Safe wrapper

The robust wrapper shape is:

1. Create the SDK's built-in tool definition.
2. Capture pre-state only when needed for presentation.
3. Delegate to the original `execute`.
4. Capture post-state or adapt returned `details`.
5. Store render metadata by `toolCallId`.
6. Render metadata through `renderResult`.

Do not reimplement Pi edit matching, uniqueness checks, overlap checks, mutation queues, abort handling, BOM, or EOL behavior merely to improve visuals. For same-path concurrent writes, serialize snapshot + execute as one unit so the diff baseline is correct.

### 3. Stateful tool cards

Use `renderShell: "self"` when the tool owns its full chrome. Return a stable component from `renderCall`; reuse `context.lastComponent` in `renderResult`. Store async state on the component or `context.state`. Return a compact fallback during highlighting, then invalidate the row.

A useful card state set is:

- pending/partial: short label or spinner
- success: body + metrics
- error: first useful error line, colored by theme
- collapsed: header + count/stat summary
- expanded: full body
- empty: explicit muted empty state

### 4. Frame primitives

`pi-facelift` separates frame mechanics from tool content in `common/tool-frame`:

- `frameTop`: status-colored rounded top rail, multiline title support
- `frameBodyLines`: left rail plus width-safe body rows
- `frameBottom`: status-colored closing rail
- `frameBottomWithLabel`: puts exit status/duration in chrome

This is a good local abstraction when several tools share the same chrome. Keep modal frames separate from inline tool frames. For a minimal one-off card, direct composition is enough.

### 5. Diff pipeline

The mature diff pipeline is:

`old/new text -> structured diff -> hunk/line model -> syntax highlight -> diff background -> word highlight -> width fit`

Useful row fields: type, old line number, new line number, content, and optional hunk metadata. Pair adjacent deletion/addition blocks for word-level emphasis. Add hunk separators rather than rendering every unchanged line in large files. Use `frameless` rendering when an outer frame already exists.

Recommended defaults:

- unified below the split minimum width
- split only if both code columns fit without excessive wrapping
- line backgrounds subtle; word backgrounds stronger
- gutters dimmer than code
- context rows use terminal/default background
- layout policy `consistent` for one multi-edit call

### 6. ANSI and width safety

ANSI escape sequences are not terminal cells. Always use `visibleWidth` for measurement and `truncateToWidth` for fitting. Apply padding before a background if the background must fill the row. Re-apply the host background after resets when rendering inside a themed tool row. Test with ANSI stripped and with wide characters.

Avoid using raw `\x1b[0m` blindly inside nested themed content if it leaks or erases the outer background. Preserve foreground/background state intentionally, or use Pi theme helpers.

### 7. Themes and palette config

`pi-diff` supports named presets plus per-color overrides and environment overrides. Its useful palette roles are:

- add/delete line background
- add/delete word-highlight background
- add/delete gutter background
- empty filler background
- add/delete/context foreground
- line-number, rule, stripe, and safe-muted foreground
- Shiki theme

Resolution should be deterministic: environment > project config > global config > auto-derived host theme > fallback. Validate hex values, preset names, numeric thresholds, and booleans. Invalid hand-edits must fall back without crashing the extension.

### 8. Read, search, and images

`pi-pretty` demonstrates syntax-highlighted read output with line numbers, tree-oriented `ls`, grouped `find`/`grep`, and inline image ownership. Image support needs terminal detection and tmux passthrough handling; preserve the SDK image content so host rendering does not lose it. Search acceleration such as FFF is a separate execution concern from display rendering; do not add it when only styling is requested.

### 9. Working/thinking indicators

`pi-pretty` replaces the host loader with an above-editor widget because the host loader has fixed padding. Its indicator uses pre-rendered frames, a 30fps ticker, spinner, shimmer/KITT/static modes, theme-resolved tiers, optional per-session accent, and cleanup on agent end. Hidden thinking labels require per-row identity and fallback behavior when host internals change. Treat these as opt-in invasive patches, not default renderer work.

### 10. Statusline and settings

`pi-facelift` statusline uses normalized ordered block IDs, enabled flags, sub-toggles, and a validated separator. A renderer walks the order, drops empty blocks, and joins visible blocks. Settings overlays use dedicated modal primitives and immediately persist sanitized state. This model scales better than adding independent booleans scattered through render code.

### 11. Aggregated rows and replay safety

When one card aggregates multiple calls (consecutive reads, todos), the per-row path matters:

- Use **tail-first truncation** for file paths, never a hard `padLine(path, 20)` cut: a long path with no ellipsis gets chopped to the cwd prefix and the filename disappears. Shared helper `fitPath(path, budget)` keeps the basename plus as many parent segments as fit, joined by `…/`.
- **Partial first-frame args get frozen**: during streaming/replay `renderCall` may fire with incomplete args (missing `path`). If the aggregation store does not update an existing entry's row text, `<missing path>` is permanently cemented. Refresh single/row text on every register/renderCall, not just on first registration.
- Keep the aggregation store on `globalThis[Symbol.for(...)]` so it survives `/reload` module rebuilds; reset it on `session_shutdown`.
- Consecutive-call grouping lives in `extensions/ui/lib/aggregation.ts` (`createToolAggregation`), shared by read and todo cards.

### 12. Persisting UI flags across reload

Module-level globals are rebuilt on `/reload` (session_shutdown → session_start), so any UI state that must outlive a reload (e.g. "HUD already auto-cleared") has to ride along with the session:

- Persist the flag via `ctx.appendEntry` on change; read it back in `session_start`.
- Reset it when the triggering condition disappears (e.g. an open task reappears clears the HUD-cleared flag).
- In timer callbacks never reference a module-level `ctx`; capture the context parameter and guard with a state-identity check, wrap `setWidget` in try/catch (session may have been replaced), and call `.unref()` on the timer handle.

## Session and Token Debugging

When asked "why is every request Nk input tokens", the answer lives in the session archive:

- Session JSONL is at `~/.pi/agent/sessions/<project>/<id>.jsonl`; each assistant message records `message.usage.input` — that is the real per-request input size.
- `type: "compaction"` entries carry `summary`, `tokensBefore`, and `firstKeptEntryId`. **The compaction summary is re-sent in full on every request** and grows without bound — accumulated observation/reflection records get appended wholesale and can inflate it to 150k+ chars (~60k tokens).
- Compaction triggers at roughly `contextWindow − compaction.reserveTokens` (default reserve 16384). E.g. deepseek-v4-flash has a 128k window → fires around ~111k.
- After compaction the baseline is `summary + keepRecentTokens (default 20000) + system prompt`. If it is still huge after compacting, the summary is the culprit, not keepRecentTokens.
- A brand-new session's first request input ≈ pure system prompt size — useful baseline for comparison.
- Levers: lower `compaction.keepRecentTokens` (thinner post-compact), raise `compaction.reserveTokens` (compact earlier), trigger a one-off compaction with `customInstructions` that tells the model to drop historical observations, or start a fresh session (resets everything).

## Local Adaptation

Current dotfiles intentionally use a smaller composition:

- `ui/compact-tool-cards.ts` owns read/grep/find/ls/bash.
- `ui/pi-diff.ts` owns write/edit and preserves SDK execution.
- `oh-my-pi-todo.ts` owns task HUD widgets.
- `statusline.ts` owns statusline/widget presentation.
- `vim-mode/` owns editor behavior.

Keep this split unless a real shared primitive removes duplication. Do not load full `pi-pretty` or `pi-facelift` on top of these owners without disabling overlapping tools.

## Review Checklist

Before accepting a Pi UI change, verify:

- one extension owns each built-in tool
- original execution behavior remains intact
- collapsed and expanded states are useful
- partial and error states do not throw
- every line fits at narrow and wide widths
- async work has cache and invalidation
- theme changes do not break ANSI state
- timers/widgets are disposed on reload/end
- config is sanitized and precedence is documented
- focused tests cover the pure layout and risky wrapper behavior
- cross-reload UI flags persist via session entries, not module globals
- aggregated rows show real tail-first paths, never `<missing path>`

Context bloat diagnosis (input-token questions): see the "Session and Token Debugging" section — compaction summaries are the usual fixed per-request cost.
