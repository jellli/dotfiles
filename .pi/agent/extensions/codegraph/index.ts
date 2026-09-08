/**
 * codegraph — pre-indexed code knowledge graph for pi (SDK integration).
 *
 * Minimal viable integration: three tools (explore / query / status) plus the
 * /codegraph:init command. The @colbymchenry/codegraph SDK talks to the local
 * SQLite index in-process — no subprocess, no MCP. The first tool call in a
 * session opens the nearest project index and starts the native file watcher
 * so the graph stays fresh; session_shutdown closes everything.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerInitCommand, registerTools, shutdown } from "./tools";

export default function (pi: ExtensionAPI) {
  // SDK-only usage — never send telemetry.
  process.env.CODEGRAPH_TELEMETRY ??= "0";

  registerTools(pi);
  registerInitCommand(pi);
  pi.on("session_shutdown", shutdown);
}
