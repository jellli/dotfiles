// Shared jiti setup for extension tests. Locates the pi installation at runtime
// (PI_ROOT env var, else the global npm root) and resolves extension deps like
// typebox from the codegraph extension's node_modules — no hardcoded paths.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function getPiRoot() {
  if (process.env.PI_ROOT) return process.env.PI_ROOT;
  const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
  return join(globalRoot, "@earendil-works/pi-coding-agent");
}

export function createTestJiti(extensionsDir) {
  const require = createRequire(import.meta.url);
  const { createJiti } = require(join(getPiRoot(), "node_modules/jiti"));
  // Runtime deps resolve like pi resolves them: typebox from the codegraph
  // extension's node_modules, @earendil-works/* from pi's own node_modules.
  const alias = {};
  const codegraphRequire = createRequire(join(extensionsDir, "codegraph/index.ts"));
  alias.typebox = codegraphRequire.resolve("typebox");
  const piRequire = createRequire(join(getPiRoot(), "package.json"));
  for (const name of ["@earendil-works/pi-tui", "@earendil-works/pi-coding-agent"]) {
    try {
      alias[name] = piRequire.resolve(name);
    } catch {
      // Optional: not every module is resolvable from the pi package.
    }
  }
  return createJiti(import.meta.url, { interopDefault: true, alias });
}

export { here };