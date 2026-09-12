/**
 * UI extension bundle - single entry point for all local Pi tool-card UI.
 *
 * Pi auto-discovers a top-level index.ts inside extension subdirectories,
 * so this file is the only one loaded from extensions/ui/; sibling modules
 * are imported here and must not be registered standalone.
 *
 * Owners:
 * - compact-tool-cards.ts: read/grep/find/ls/bash compact cards,
 *   consecutive-call aggregation, [compaction] summary patch
 * - pi-diff.ts: write/edit Shiki diff viewer
 * - foreign-tool-cards.ts: cards for tools this repo does not own
 * - lib/aggregation.ts: shared consecutive-call grouping
 * - lib/pi-ui.ts: shared fitLine/padLine/toolBadge/toolHeader/resultLine
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCompactToolCards } from "./compact-tool-cards.js";
import { uiLifecycle } from "./lib/lifecycle.js";
import { registerForeignToolCards } from "./foreign-tool-cards.js";
import { registerPiDiff } from "./pi-diff.js";

// Pi awaits this factory, so the foreign-card seam is patched before the
// session builds its tool registry. Keep the install awaited: a late patch
// leaves the session with the unwrapped definitions.
export default async function (pi: ExtensionAPI): Promise<void> {
  // /reload emits session_shutdown for this runtime, then re-evaluates these
  // modules: release every prototype patch and hub listener here, or the new
  // instance stacks a second one on top of the old.
  pi.on("session_shutdown", () => uiLifecycle.disposeAll());

  registerCompactToolCards(pi);
  registerPiDiff(pi);
  await registerForeignToolCards(pi);
}
