import { defineConfig, type UserConfig } from "tsdown";
import type { Plugin } from "rolldown";

/**
 * Startup-cost bundling for the local extensions (see CONTEXT.md).
 *
 * Pi loads extensions as unbundled TS sources, so every relative import costs
 * one more jiti resolution + Babel pass + engine compile per launch. These
 * builds collapse an extension into a single plain-JS entry next to its
 * sources; the runtime then reads and compiles one module instead of N.
 *
 * Layout:
 * - `<ext>/index.js` sits in the extension dir (not a `dist/` subdir) so
 *   `import.meta.url`-relative paths (`../../npm/node_modules/...`) and
 *   `createRequire(import.meta.url)` keep resolving exactly like the sources.
 * - `<ext>/package.json` declares `pi.extensions: ["./index.js"]`. Without it
 *   pi would load both `index.ts` and `index.js` - the whole dir is a list of
 *   entry candidates. A missing file => pi falls back to `index.ts`, so a
 *   checkout without a build still runs.
 * - `card/` compiles to `card/dist/`: its consumers keep it as a *real shared
 *   module* (the card module documents one lifecycle registry shared by ui,
 *   todo, brave-search and ollama-web-fetch). Emitting `card/*.js` next to the
 *   sources instead would give importers two candidates for the same module
 *   (`x.js` vs `x.ts` after TS-style resolution) and silently split the
 *   registry.
 */

/** Everything the pi runtime resolves, not the bundler. */
const external = [
  // NB: no `../card/` pattern here - externals are matched before plugins run,
  // which would skip the rewrite below. The cardDist plugin marks those ids
  // external itself.
  /^\.\.\/\.\.\/npm\//, // the agent's npm package dir (diff, shiki, ...)
  /^[^./]/, // bare specifiers: pi SDK, typebox, undici, @colbymchenry/codegraph, node:*
];

/** Rewrite the shared card imports to their build output. */
const cardDist: Plugin = {
  name: "card-dist",
  resolveId(source) {
    const match = /^\.\.\/card\/([a-z-]+)\.js$/.exec(source);
    if (match) return { id: `../card/dist/${match[1]}.js`, external: true };
    return null;
  },
};

const shared: UserConfig = {
  format: "esm",
  platform: "node",
  target: "es2022",
  dts: false,
  clean: false,
  sourcemap: false,
  minify: false,
  treeshake: true,
  // ESM everywhere here, so emit `.js` (what pi's discovery and the sources
  // expect) instead of tsdown's default `.mjs`.
  outExtensions: () => ({ js: ".js" }),
  deps: { neverBundle: external },
  // never rewrite an extension's own package.json
  exports: false,
  publint: false,
  attw: false,
  unused: false,
  report: true,
  tsconfig: "tsconfig.json",
};

/** Extensions bundled from `index.ts` into a single `index.js`. */
const extensions = [
  "ui",
  "todo",
  "statusline",
  "vim-mode",
  "brave-search",
  "headroom",
  "codegraph",
  "ollama-cloud",
  "ollama-web-fetch",
];

/** The shared card module: one output per source file, no manifest. */
const cardModules = [
  "lifecycle",
  "line-memo",
  "spinner",
  "strip-background",
  "text",
  "tool-card",
];

export default defineConfig([
  {
    ...shared,
    name: "card",
    // Sibling imports stay module boundaries: inlining them would put a second
    // lifecycle registry inside tool-card.js next to the one ui imports.
    deps: { neverBundle: [/^\.[^.]*\.js$/, /^[^./]/] },
    entry: Object.fromEntries(cardModules.map((m) => [m, `card/${m}.ts`])),
    outDir: "card/dist",
  },
  ...extensions.map((name) => ({
    ...shared,
    name,
    plugins: [cardDist],
    entry: { index: `${name}/index.ts` },
    outDir: name,
  })),
]);
