/**
 * Ollama Cloud provider for pi — local extension, decoupled from
 * pi-ollama-cloud. Registers the "ollama-cloud" model provider (baked-in
 * fallback catalog + live refresh via pi's `refreshModels` callback) and the
 * /ollama-cloud-usage command.
 *
 * Deliberately NOT here (moved out during the decoupling):
 *   - ollama_web_search — replaced by the brave-search extension
 *   - ollama_web_fetch  — lives in ../ollama-web-fetch (pi-ui tool cards)
 *   - usage status bar  — dropped; only the on-demand command is kept
 *
 * Setup: auth.json in the agent dir needs
 *   { "ollama-cloud": { "type": "api_key", "key": "..." } }
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { GENERATED_MODELS } from "./models.generated";
import { OLLAMA_BASE, refreshOllamaCatalog } from "./models";
import { fetchUsage, formatUsage } from "./usage";
import { getCloudApiKey } from "./utils";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("ollama-cloud", {
    name: "Ollama Cloud",
    baseUrl: `${OLLAMA_BASE}/v1`,
    apiKey: "$OLLAMA_API_KEY",
    api: "openai-completions",
    models: GENERATED_MODELS,
    refreshModels: refreshOllamaCatalog,
  });

  // --- Usage Command ---

  pi.registerCommand("ollama-cloud-usage", {
    description: "Show Ollama Cloud usage limits.",
    handler: async (_args, ctx) => {
      const apiKey = await getCloudApiKey(ctx);
      if (!apiKey) {
        ctx.ui.notify(
          "No Ollama Cloud API key configured. Set OLLAMA_API_KEY or add to auth.json.",
          "error",
        );
        return;
      }
      try {
        const data = await fetchUsage(apiKey);
        ctx.ui.notify(formatUsage(data), "info");
      } catch (err) {
        ctx.ui.notify(
          err instanceof Error ? err.message : String(err),
          "error",
        );
      }
    },
  });
}
