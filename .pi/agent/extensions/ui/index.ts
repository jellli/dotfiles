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
 * - lib/aggregation.ts: shared consecutive-call grouping
 * - lib/pi-ui.ts: shared fitLine/padLine/statusMarker/toolHeader
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCompactToolCards } from "./compact-tool-cards.js";
import { registerPiDiff } from "./pi-diff.js";

export default async function (pi: ExtensionAPI): Promise<void> {
  await registerCompactToolCards(pi);
  registerPiDiff(pi);
}
