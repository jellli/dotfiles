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

// The engine opens its SQLite index via node:sqlite, which Node 22 still marks
// experimental — every require prints an ExperimentalWarning, once per thread
// (main process plus each parse worker), so indexing spams stderr. Filter just
// that warning; everything else still reaches the default handler.
const emitWarning = process.emitWarning;
process.emitWarning = function (warning: string | Error, ...args: unknown[]) {
  const message = typeof warning === "string" ? warning : warning?.message;
  if (String(message).includes("SQLite is an experimental feature")) return;
  return (emitWarning as (...a: unknown[]) => void).call(this, warning, ...args);
};

export default function (pi: ExtensionAPI) {
  // SDK-only usage — never send telemetry.
  process.env.CODEGRAPH_TELEMETRY ??= "0";

  registerTools(pi);
  registerInitCommand(pi);
  pi.on("session_shutdown", shutdown);
}
