---
status: superseded by ADR-0002
---

# Vendor pi-mono-figma rather than install it or port Figma-Context-MCP

> Superseded by [ADR-0002](./0002-remove-vendored-figma-extension.md): the vendored extension was removed.

pi already had Framelink's Figma MCP server (`GLips/Figma-Context-MCP`) connected, exposing two generic tools (`get_figma_data`, `download_figma_images`) that return raw-ish Figma JSON with no output cap. We wanted richer, LLM-shaped Figma tooling — node summaries, implementation context, asset extraction — and we wanted to own the code rather than depend on a remote `npx` package or a different maintainer's roadmap. We decided to vendor `pi-mono-figma@0.2.2` into `agent/extensions/figma/`, inlining its private `pi-common` dependency and localizing `@sinclair/typebox` to `typebox` (the name pi exposes), and to keep the Framelink MCP server configured as a comparison baseline until the native tools prove equivalent or better.

## Considered Options

- **Keep the MCP server as-is.** Zero work, but leaves the two problems that motivated this: 2 generic tools and unbounded raw output.
- **Install `pi-mono-figma` from npm.** Least work and gets the same tools, but we do not own the code and cannot patch or adapt it.
- **Port `Figma-Context-MCP`'s extractors/transformers into a new extension.** Maximum control over the 15.8k★ logic, but real engineering effort (~3,800 lines) for a result already available.
- **Write a new extension from scratch.** Rejected: strictly more work than vendoring for no ownership gain.
- **Vendor `pi-mono-figma` (chosen).** Own the code, keep the tool surface, localize only what does not resolve here.

## Consequences

- We now maintain ~2,500 lines plus inlined `pi-common`. Upstream upgrades are manual; see `VENDOR.md` for the baseline and upgrade procedure.
- No `npx` dependency for Figma tooling, and output is bounded by the extension's own caps.
- The Framelink MCP server stays in `agent/mcp.json` for now, so both tool surfaces coexist until we retire one.
