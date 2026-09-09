/**
 * 吉吉 (jiji.cc) provider for pi.
 *
 * Registers the `jiji` provider (https://www.jiji.cc) — an OpenAI
 * Responses-compatible relay for Codex / ChatGPT models. The model catalog
 * is maintained locally below so startup never depends on a network request.
 *
 * Setup:
 *   export JIJI_API_KEY=...   # required (sk- key from the jiji dashboard)
 *                             # (dotfiles: appended to ~/.jili_env, sourced by .zshrc)
 *
 * Then restart pi and pick a model with /model (provider "jiji").
 */
import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

const PROVIDER_ID = "jiji";
const BASE_URL = "https://api.jiji.cc"; // OpenAI SDK appends /responses

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const JIJI_CONTEXT_LIMIT = 272000;
const JIJI_COMPACTION_THRESHOLD = Math.floor(JIJI_CONTEXT_LIMIT * 0.8);
const COMPACTION_RESERVE_TOKENS = 16384;
// Pi compacts when contextTokens > contextWindow - reserveTokens.
const JIJI_CONTEXT_WINDOW = JIJI_COMPACTION_THRESHOLD + COMPACTION_RESERVE_TOKENS;

/** Locally maintained model catalog. Update this list when Jiji adds models. */
const LOCAL_CATALOG: readonly string[] = [
  "codex-auto-review",
  "gpt-5.3-codex-spark",
  "gpt-5.4",
  "gpt-5.5",
  "gpt-5.6-luna",
  "gpt-5.6-terra",
];

function buildModels(ids: readonly string[]): ProviderModelConfig[] {
  return ids.map((id) => ({
    id,
    name: id,
    reasoning: true,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: JIJI_CONTEXT_WINDOW,
    maxTokens: 65536,
  }));
}

export default function (pi: ExtensionAPI) {
  pi.registerProvider(PROVIDER_ID, {
    name: "Jiji",
    baseUrl: BASE_URL,
    apiKey: "$JIJI_API_KEY",
    api: "openai-responses",
    models: buildModels(LOCAL_CATALOG),
  });
}
