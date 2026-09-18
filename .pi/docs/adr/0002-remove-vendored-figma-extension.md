---
status: accepted
supersedes: ADR-0001
---

# Remove the vendored pi-mono-figma extension

ADR-0001 vendored `pi-mono-figma@0.2.2` into `agent/extensions/figma/` to get richer Figma tooling. We have now deleted that directory — the 21 `figma_*` tools, the `/figma-auth` command, the `figma` skill, the inlined private `pi-common` copy and its `__tests__` — together with the load smoke test `agent/extensions/test/figma-load.test.mjs`. The decision is reversed because the vendored fork was ~2,500 lines of code we had to upgrade by hand, and it duplicated a Figma surface we already have configured: the Framelink Figma MCP server in `agent/mcp.json`, which we do not maintain. Figma tooling is now **MCP-only**: that server is the single Figma surface.

Removal is complete at the source. pi discovers extensions by directory, so deleting `agent/extensions/figma/` _is_ the unregistration: `figma/package.json` declared `pi.extensions` / `pi.skills`, and no `agent/settings.json` entry (`packages`, `extensions`) ever referenced it. Nothing else needed to change, and no other extension imports it — `tsgo` on `agent/extensions/tsconfig.json` is clean and the remaining extension tests pass.

## Considered Options

- **Keep the vendored extension and retire the MCP server** (the endpoint ADR-0001 anticipated). Rejected: it keeps the maintenance burden — manual upstream upgrades, the inlined `pi-common`, the local `typebox` patch — for a surface the MCP server already covers.
- **Install `pi-mono-figma` from npm instead of vendoring.** Rejected: the localization ADR-0001 had to make (inlined `pi-common`, `typebox` in place of `@sinclair/typebox`) would need a fork or patches anyway, so the dependency buys nothing over the vendored copy and still owns nothing.
- **Go MCP-only: delete the extension, keep the Framelink MCP server.** Chosen: the MCP server is the intended, sole Figma surface — vendoring was only worth its maintenance cost if we meant to keep the fork and retire the MCP server instead. The richer tools can come back from the vendor baseline (`npm pack pi-mono-figma@0.2.2`) if the two generic MCP tools prove insufficient.

## Consequences

- Figma access now goes through Framelink's two generic tools (`get_figma_data`, `download_figma_images`) again, which return raw-ish Figma JSON with no output cap. The richer LLM-shaped tools (`figma_get_node_summary`, `figma_get_implementation_context`, `figma_extract_assets`, bounded renders, masked local auth) are gone.
- The `figma` skill is no longer discovered, so prompts referencing Figma design→code workflow lose that scaffolding. The MCP server exposes no equivalent skill.
- The MCP server needs `FIGMA_API_KEY` in the environment (it is set via `launchctl`); the removed extension had its own masked token store, reachable through `/figma-auth`.
- ADR-0001's `VENDOR.md` upgrade procedure is void; reviving the extension means re-following the localizations recorded there.
