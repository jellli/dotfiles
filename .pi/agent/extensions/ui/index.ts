/**
 * UI extension bundle - single entry point for all local Pi tool-card UI.
 *
 * Pi auto-discovers a top-level index.ts inside extension subdirectories,
 * so this file is the only one loaded from extensions/ui/; sibling modules
 * are imported here and must not be registered standalone.
 *
 * Owners:
 * - compact-tool-cards.ts: read/grep/find/ls/bash compact cards and the
 *   [compaction] summary patch
 * - pi-diff.ts: write/edit Shiki diff viewer
 * - foreign-tool-cards.ts: cards for tools this repo does not own
 * - ../card/tool-card.ts: the card language itself (Frame, aggregation,
 *   derived defaults, memos); ../card/text.ts and ../card/spinner.ts hold its
 *   pure helpers
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCompactToolCards } from "./compact-tool-cards.js";
import { cardLifecycle } from "../card/lifecycle.js";
import { registerForeignToolCards } from "./foreign-tool-cards.js";
import { registerPiDiff } from "./pi-diff.js";

// Pi awaits this factory, so the foreign-card seam is patched before the
// session builds its tool registry. Keep the install awaited: a late patch
// leaves the session with the unwrapped definitions.
export default async function (pi: ExtensionAPI): Promise<void> {
  // /reload emits session_shutdown for this runtime, then re-evaluates these
  // modules: release every prototype patch, hub listener, spinner timer, and
  // capture registry through the card module's one registry here, or the new
  // instance stacks a second one on top of the old.
  pi.on("session_shutdown", () => cardLifecycle.disposeAll());

  registerCompactToolCards(pi);
  registerPiDiff(pi);
  await registerForeignToolCards(pi);
}
