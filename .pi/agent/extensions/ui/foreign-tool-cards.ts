/**
 * Foreign tool cards - the local card language for tools this repo does not own.
 *
 * pi resolves a tool row's look from the tool definition itself, and a
 * third-party extension owns its definitions. The one seam that reaches every
 * definition is the host's `ExtensionRunner.getAllRegisteredTools()`: the
 * session reads it to build the tool registry, so a listener here hands back the
 * same definitions with the card language attached. `execute`, the parameter
 * schema, and the prompt metadata stay untouched - this is display only.
 *
 * One call does it: `toolCard(pi, definition)`. The Frame derives the whole card
 * from the definition - badge header, summary result line, consecutive-call
 * groups, raw text when expanded - and a tool that ships its own renderer keeps
 * drawing it: the Frame hands that component's rows through the result column
 * with backgrounds stripped (see `card/tool-card.ts`).
 *
 * Tools registered by this repo's extensions are skipped: they already draw
 * cards. Names in the exception list (`~/.pi/agent/tool-cards.json`) are
 * skipped too.
 */

import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { cardLifecycle, type Lifecycle } from "../card/lifecycle.js";
import { installCardHooks, toolCard } from "../card/tool-card.js";

type AnyTheme = Parameters<
  NonNullable<ToolDefinition<any, any, any>["renderCall"]>
>[1];
type AnyContext = Parameters<
  NonNullable<ToolDefinition<any, any, any>["renderCall"]>
>[2];
type AnyResult = {
  content?: Array<{ type: string; text?: string }>;
};

/** The registered-tool shape the host hands out; only two fields are needed. */
type RegisteredToolLike = {
  definition: ToolDefinition<any, any, any>;
  sourceInfo?: { path?: string };
};

type RunnerPrototype = {
  getAllRegisteredTools(): RegisteredToolLike[];
  [key: symbol]: unknown;
};

export type RunnerConstructor = { prototype: RunnerPrototype };

type Listener = (tools: RegisteredToolLike[]) => RegisteredToolLike[];

/**
 * One listener per hub, plus the owner each listener was installed under.
 *
 * The hub lives on the host prototype and survives `/reload`, while the module
 * that installed a listener does not. Keying listeners by owner lets a fresh
 * install take its predecessor off the hub instead of adding a second one that
 * would wrap every definition a second time.
 */
type Hub = {
  listeners: Set<Listener>;
  /** Absent on a hub an older module instance created. */
  owners?: Map<string, Listener>;
};

/** Cards one definition; the card module's `toolCard`. */
type CardFactory = (
  definition: ToolDefinition<any, any, any>,
) => ToolDefinition<any, any, any>;

const HUB_KEY = Symbol.for("dotfiles.foreign-tool-cards.v1");
export const CONFIG_PATH = join(homedir(), ".pi", "agent", "tool-cards.json");

// ---------------------------------------------------------------------------
// Host seam: one hub per ExtensionRunner class copy
// ---------------------------------------------------------------------------

/**
 * Patch one host `ExtensionRunner` prototype with a listener hub.
 *
 * The hub lives on the prototype under a `Symbol.for` key so repeated installs
 * (and pi-fabric's own interception) chain instead of stacking patches.
 */
function hubFor(ctor: RunnerConstructor): Hub | undefined {
  const prototype = ctor.prototype;
  const existing = prototype[HUB_KEY];
  if (existing) return existing as Hub;

  const original = prototype.getAllRegisteredTools;
  if (typeof original !== "function") return undefined;

  const hub: Hub = { listeners: new Set(), owners: new Map() };
  Object.defineProperty(prototype, HUB_KEY, {
    value: hub,
    configurable: false,
    enumerable: false,
    writable: false,
  });
  prototype.getAllRegisteredTools = function (this: unknown) {
    let tools = original.call(this) as RegisteredToolLike[];
    for (const listener of [...hub.listeners]) tools = listener(tools);
    return tools;
  };
  return hub;
}

/**
 * Host package root.
 *
 * Extension code cannot resolve the host package itself: the loader rewrites
 * modules to `data:` URLs, so `import.meta.resolve` throws, and the extensions
 * directory has no `node_modules` link for the package. The running entry path
 * can: walk up from it until a manifest names pi.
 */
function hostPackageRoot(): string | undefined {
  const override = process.env.PI_PACKAGE_DIR;
  if (typeof override === "string" && override !== "") return override;

  const cliPath = process.argv[1];
  if (!cliPath) return undefined;

  let directory: string;
  try {
    directory = dirname(realpathSync(cliPath));
  } catch {
    return undefined;
  }
  while (directory !== dirname(directory)) {
    try {
      const manifest = JSON.parse(
        readFileSync(join(directory, "package.json"), "utf8"),
      ) as { name?: unknown };
      if (manifest.name === "@earendil-works/pi-coding-agent") return directory;
    } catch {
      // Keep walking up.
    }
    directory = dirname(directory);
  }
  return undefined;
}

/**
 * Package entry beside the running CLI.
 *
 * `bin/pi` starts `dist/bundle/cli.js`, so the live `ExtensionRunner` class is
 * that directory's `index.js`; a host started from `dist/cli.js` is served by
 * `dist/index.js`. Either way the running process already loaded that module, so
 * importing it again is a cache hit.
 */
function runningHostEntry(): string | undefined {
  const cliPath = process.argv[1];
  if (!cliPath) return undefined;

  let resolved: string;
  try {
    resolved = realpathSync(cliPath);
  } catch {
    return undefined;
  }
  const directory = dirname(resolved);
  const name = basename(directory);
  if (name !== "dist" && name !== "bundle") return undefined;
  return pathToFileURL(join(directory, "index.js")).href;
}

/** Bundled entry of the installed package, for hosts started from elsewhere. */
function packageBundleEntry(root: string | undefined): string | undefined {
  return root === undefined
    ? undefined
    : pathToFileURL(join(root, "dist", "bundle", "index.js")).href;
}

/**
 * Unbundled package entry - the fallback for a host we cannot reach cheaply.
 *
 * `import.meta.resolve` and require work in plain Node even though they fail
 * inside a running pi.
 */
function resolveHostEntry(): string | undefined {
  const root = hostPackageRoot();
  if (root) return pathToFileURL(join(root, "dist", "index.js")).href;
  try {
    return import.meta.resolve("@earendil-works/pi-coding-agent");
  } catch {
    // Fall through to require resolution.
  }
  try {
    return pathToFileURL(
      createRequire(import.meta.url).resolve("@earendil-works/pi-coding-agent"),
    ).href;
  } catch {
    return undefined;
  }
}

/**
 * Collect every `ExtensionRunner` class the host can use.
 *
 * Cheap sources first. The running process necessarily loaded the class it uses
 * at startup, so importing that copy again is a cache hit, while a copy that
 * takes real time to import is a copy nothing is using - measured at ~880ms for
 * the unbundled `dist/index.js` against ~2ms for the running
 * `dist/bundle/index.js`. The unbundled entry and the chunk scan stay as
 * fallbacks for a host whose entry cannot be seen from here.
 */
export async function discoverRunnerConstructors(): Promise<
  RunnerConstructor[]
> {
  const found = new Set<RunnerConstructor>();
  const collect = (module: unknown): void => {
    if (typeof module !== "object" || module === null) return;
    for (const value of Object.values(module as Record<string, unknown>)) {
      if (typeof value !== "function") continue;
      const candidate = value as unknown as RunnerConstructor;
      if (typeof candidate.prototype?.getAllRegisteredTools === "function") {
        found.add(candidate);
      }
    }
  };

  const importInto = async (specifier: string): Promise<void> => {
    try {
      collect(await import(specifier));
    } catch {
      // Not a host copy; keep whatever the other candidates yield.
    }
  };

  // Bare specifier: the resolution the extension loader performs.
  await importInto("@earendil-works/pi-coding-agent");

  const root = hostPackageRoot();
  for (const entry of [runningHostEntry(), packageBundleEntry(root)]) {
    if (entry) await importInto(entry);
  }
  // Anything reachable this cheaply is the live copy, so there is nothing left
  // to patch; paying for the unbundled entry now would patch a dead class.
  if (found.size > 0) return [...found];

  // Nothing reachable cheaply: pay for the unbundled package entry, then import
  // every bundle chunk whose text mentions the intercepted method.
  const entry = resolveHostEntry();
  if (entry) {
    await importInto(entry);

    try {
      const bundleEntry = new URL("./bundle/index.js", entry);
      await importInto(bundleEntry.href);

      const chunks = join(dirname(fileURLToPath(bundleEntry)), "chunks");
      for (const file of readdirSync(chunks)) {
        if (!file.endsWith(".js")) continue;
        const path = join(chunks, file);
        try {
          if (!readFileSync(path, "utf8").includes("getAllRegisteredTools"))
            continue;
        } catch {
          continue;
        }
        await importInto(pathToFileURL(path).href);
      }
    } catch {
      // No bundled sibling or chunks directory: the package entry is enough.
    }
  }

  return [...found];
}

// ---------------------------------------------------------------------------
// Exception list
// ---------------------------------------------------------------------------

/** Read the exception list; a missing or broken file means "no exceptions". */
export function readExceptionList(path: string = CONFIG_PATH): string[] {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      exceptions?: unknown;
    };
    if (!Array.isArray(parsed.exceptions)) return [];
    return parsed.exceptions.filter(
      (value): value is string =>
        typeof value === "string" && value.trim() !== "",
    );
  } catch {
    return [];
  }
}

/** Build a name matcher from patterns; a trailing `*` means prefix match. */
export function exceptionMatcher(
  patterns: readonly string[],
): (name: string) => boolean {
  const exact = new Set<string>();
  const prefixes: string[] = [];
  for (const pattern of patterns) {
    const trimmed = pattern.trim();
    if (trimmed === "") continue;
    if (trimmed.endsWith("*")) prefixes.push(trimmed.slice(0, -1));
    else exact.add(trimmed);
  }
  return (name) =>
    exact.has(name) || prefixes.some((prefix) => name.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

/**
 * Skip rule: a tool of this repo that already draws its own card.
 *
 * In-repo tools without a renderer (a local extension that never adopted the
 * card language) are carded like any foreign tool.
 */
function alreadyCarded(
  tool: RegisteredToolLike,
  ownRoots: readonly string[],
): boolean {
  if (!isOwnTool(tool, ownRoots)) return false;
  const definition = tool.definition;
  return Boolean(definition.renderCall || definition.renderResult);
}

/**
 * Path comparison needs real paths: the config directory (`~/.pi`) is a symlink,
 * so the loader may report either the symlink path or its target.
 */
function isOwnTool(
  tool: RegisteredToolLike,
  ownRoots: readonly string[],
): boolean {
  const path = tool.sourceInfo?.path;
  if (typeof path !== "string" || path === "") return false;
  return [path, safeRealPath(path)].some((candidate) =>
    ownRoots.some((root) => isInside(candidate, root)),
  );
}

/** Path containment on segment boundaries: `/x/ui-extra` is not inside `/x/ui`. */
function isInside(path: string, root: string): boolean {
  if (path === root) return true;
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return path.startsWith(prefix);
}

function safeRealPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

const OWNER = "dotfiles.foreign-tool-cards";

export function installForeignToolCards(options: {
  constructors: RunnerConstructor[];
  card: CardFactory;
  isExcepted: (name: string) => boolean;
  ownRoot: string;
  onWrapped?: (names: string[]) => void;
  /** Registry the teardown lands in; defaults to the extension's own. */
  lifecycle?: Lifecycle;
  /** Identity this install replaces on the hub; one per extension. */
  owner?: string;
}): { dispose(): void } {
  const lifecycle = options.lifecycle ?? cardLifecycle;
  const owner = options.owner ?? OWNER;
  const hubs = options.constructors
    .map((ctor) => hubFor(ctor))
    .filter((hub): hub is Hub => hub !== undefined);
  const ownRoots = [
    ...new Set([options.ownRoot, safeRealPath(options.ownRoot)]),
  ].filter((root) => root !== "");
  const cards = new WeakMap<
    ToolDefinition<any, any, any>,
    ToolDefinition<any, any, any>
  >();

  const listener: Listener = (tools) => {
    const names: string[] = [];
    const next = tools.map((tool) => {
      const definition = tool.definition;
      const name = definition?.name;
      if (!name) return tool;
      if (options.isExcepted(name)) return tool;
      if (alreadyCarded(tool, ownRoots)) return tool;

      let card = cards.get(definition);
      if (!card) {
        card = options.card(definition);
        cards.set(definition, card);
      }
      names.push(name);
      return card === definition ? tool : { ...tool, definition: card };
    });
    options.onWrapped?.(names);
    return next;
  };

  for (const hub of hubs) {
    const owners = (hub.owners ??= new Map<string, Listener>());
    const previous = owners.get(owner);
    if (previous) hub.listeners.delete(previous);
    owners.set(owner, listener);
    hub.listeners.add(listener);
  }

  const remove = () => {
    for (const hub of hubs) {
      hub.listeners.delete(listener);
      if (hub.owners?.get(owner) === listener) hub.owners.delete(owner);
    }
  };

  // Registered so `session_shutdown` releases the hub listener before /reload
  // binds the new module instance; the returned handle also unregisters, so an
  // explicit dispose leaves nothing behind.
  const release = lifecycle.add(remove);

  return {
    dispose() {
      remove();
      release();
    },
  };
}

/** Extensions root of this repo; tools registered below it already draw cards. */
function ownExtensionsRoot(): string {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/**
 * Wire the foreign cards into a running pi.
 *
 * Discovery is async (it imports the host bundle) and optional: when no host
 * class is found, pi keeps its default rendering.
 */
export async function registerForeignToolCards(
  pi: ExtensionAPI,
): Promise<void> {
  // The aggregation boundaries are wire-once per pi; installing them here keeps
  // group closes working even when no definition ends up wrapped.
  installCardHooks(pi);

  const constructors = await discoverRunnerConstructors();
  if (constructors.length === 0) return;

  installForeignToolCards({
    constructors,
    card: (definition) => toolCard(pi, definition),
    isExcepted: exceptionMatcher(readExceptionList()),
    ownRoot: ownExtensionsRoot(),
  });
}
