# `pi` configuration

This folder contains my configuration for `pi`.

## Validation

- **TypeScript compilation**: When validating TypeScript changes in this folder, use `tsgo`, not `tsc`. For the extensions, use the `tsconfig.json` file in that folder (`cd agent/extensions && tsgo -p tsconfig.json`).
- **Prettier formatting**: Use `prettier` to format all files in this folder.

## Documentation

- Extensions should include comments explaining the core logic and design. Don't go overboard: comments shouldn't explain what's obvious from the code.
- Don't add `README` files, comments in the implementation code is more than enough.

## Local extensions

Sources in `extensions/` are the source of truth; pi loads them through jiti as
TS (slow: every relative import is a fresh resolve + Babel pass + engine
compile on each launch). Bundles fix that:

- `extensions/tsdown.config.mts` builds each multi-file extension into a single
  `<ext>/index.js` next to its sources, plus `card/dist/*.js` for the shared card
  module. `<ext>/package.json` points pi at the bundle via
  `pi.extensions: ["./index.js"]` (without it pi would load both `index.ts` and
  `index.js`).
- Workflow after editing an extension: `cd .pi/agent/extensions && npm run build`
  (or `npm run build:watch`), then `/reload` in pi.
- Bundles are gitignored. If one is missing pi falls back to `index.ts`, so a
  fresh checkout still runs - just slower. Verify with `PI_TIMING=1 pi`.
- `npm test` runs `test/*.test.mjs` as plain node scripts (they assert at top
  level; `vitest run` only applies to `ollama-web-fetch/test/*.test.ts`).
- Keep `card/` as a real shared module: all four consumers (ui, todo,
  brave-search, ollama-web-fetch) must import the same compiled copy, otherwise
  the single card lifecycle registry splits and `/reload` leaks hooks.

## Installed package patches

`npm:pi-blackhole` ships its own tsup bundle but points `pi.extensions` at
`./index.ts`, so pi loaded 105 TS modules instead of that bundle (~320ms per
launch). `scripts/patch-pi-packages.sh` rewrites the manifest to
`./dist/index.js`; it is idempotent and must be re-run after `pi update`
(`scripts/setup-pi.sh` calls it). Verify with `PI_TIMING=1 pi`.

