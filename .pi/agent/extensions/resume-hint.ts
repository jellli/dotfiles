/**
 * Resume Hint Extension
 *
 * Shows a message after quitting pi with instructions
 * on how to resume the session.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_shutdown", async (event, ctx) => {
    if (event.reason !== "quit") return;

    const sessionFile = ctx.sessionManager.getSessionFile();
    if (!sessionFile) return;

    const sessionId = ctx.sessionManager.getSessionId();
    const sessionName = ctx.sessionManager.getSessionName();

    // Print after TUI tears down
    process.on("exit", () => {
      // ANSI codes
      const reset = "\x1b[0m";
      const bold = "\x1b[1m";
      const yellow = "\x1b[33m";
      const green = "\x1b[32m";

      const id = sessionId.slice(0, 8);
      const logo = (s: string) => `${bold}${s}${reset}`;

      const lines: string[] = [
        "",
        `    ${logo("██████")}`,
        `    ${logo("██  ██")}`,
        `    ${logo("████  ██")}`,
        `    ${logo("██    ██")}`,
        "",
      ];

      if (sessionName) {
        lines.push(`    ${yellow}Session:${reset}  "${sessionName}"`);
      }

      lines.push(`    ${green}Resume:${reset}   ${bold}pi -c${reset}`);
      lines.push(
        `    ${green}Or:${reset}       ${bold}pi --session ${id}${reset}`,
      );
      lines.push("");

      process.stderr.write(lines.join("\n") + "\n");
    });
  });
}
