/**
 * Foreign tool cards - the local card language for tools this repo does not own.
 *
 * pi resolves a tool row's look from the tool definition itself, and a
 * third-party extension owns its definitions. The one seam that reaches every
 * definition is the host's `ExtensionRunner.getAllRegisteredTools()`: the
 * session reads it to build the tool registry, so a listener here hands back the
 * same definitions with local renderers attached. `execute`, the parameter
 * schema, and the prompt metadata stay untouched - this is display only.
 *
 * Two card shapes:
 * - no own renderer -> the shared aggregation draws the card (badge header,
 *   summary result line, consecutive-call groups, raw text when expanded).
 * - own renderer -> a local card draws the header and result line, and the
 *   tool's own component draws inside the expanded block.
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
import { Text, type Component } from "@earendil-works/pi-tui";
import {
  createToolAggregation,
  type ToolAggregationOptions,
} from "./lib/aggregation.js";
import { uiLifecycle, type Lifecycle } from "./lib/lifecycle.js";
import { createTextMemo } from "./lib/line-memo.js";
import {
  bracketDetail,
  errorPreviewLine,
  fitLine,
  resultLine,
  shorten,
  spinnerChar,
  syncSpinner,
  textOutput,
  toolHeader,
  type SpinnerState,
} from "./lib/pi-ui.js";

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

type AggregationWrapper = {
  wrap(
    tool: ToolDefinition<any, any, any>,
    options?: ToolAggregationOptions,
  ): ToolDefinition<any, any, any>;
};

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
// Card content
// ---------------------------------------------------------------------------

/** Header detail: the first short single-line string argument, if any. */
export function argDetail(args: unknown, theme: AnyTheme): string {
  const record =
    args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  for (const value of Object.values(record)) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text === "" || text.length > 96 || text.includes("\n")) continue;
    return bracketDetail(theme, theme.fg("toolOutput", shorten(text, 56)));
  }
  return "";
}

/** Result line: a single-line output shows itself, a longer one shows a count. */
export function outputSummary(output: string, theme: AnyTheme): string {
  const lines = output.split("\n");
  if (lines.length === 1) {
    return theme.fg("toolOutput", shorten(lines[0], 96));
  }
  return theme.fg("muted", `${lines.length} lines`);
}

/**
 * Background colors off: a third-party card paints its own backgrounds (fabric's
 * tool-call background and diff highlighting). The local card has none, so the
 * SGR background parameters are dropped and the foreground stays.
 *
 * A bare `\x1b[m` is a reset, not a background: it is kept, because dropping it
 * lets the colors it clears leak into every following line.
 */
function stripBackgroundUncached(text: string): string {
  return text.replace(/\x1b\[([0-9;]*)m/g, (_match, params: string) => {
    const parts = params.split(";").filter((part) => part !== "");
    if (parts.length === 0) return "\x1b[m";
    const kept: string[] = [];
    for (let index = 0; index < parts.length; index += 1) {
      const code = Number(parts[index]);
      if (code === 48) {
        // 48;5;n (256 color) or 48;2;r;g;b (truecolor)
        if (parts[index + 1] === "5") index += 2;
        else if (parts[index + 1] === "2") index += 4;
        else index += 1;
        continue;
      }
      if (code === 49) continue;
      if (code >= 40 && code <= 47) continue;
      kept.push(parts[index]);
    }
    return kept.length > 0 ? `\x1b[${kept.join(";")}m` : "";
  });
}

// Stripping runs on every re-render, for every line of every foreign card, and
// the same lines come back frame after frame: 4.3us per line cold against
// 0.054us warm (measured 2026-09-12), which is why the memo is what keeps a long
// transcript cheap. The budget counts retained text (String#length in and out,
// which tracks memory closely enough for sizing): 4M units is roughly ten
// thousand rendered lines, so a card of any realistic length stays cached.
const STRIP_CACHE_BUDGET = 4 * 1024 * 1024;
const stripCache = createTextMemo(STRIP_CACHE_BUDGET, stripBackgroundUncached);

/** Strip backgrounds from one rendered line, memoized across re-renders. */
export function stripBackground(text: string): string {
  return stripCache.get(text);
}

/**
 * `display.name` / `display.description`: the title and objective a tool
 * declares for its own UI (fabric's activity UI is the reference).
 */
export function runDisplay(args: unknown): {
  name?: string;
  description?: string;
} {
  const record =
    args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const display = record.display;
  if (typeof display === "string") {
    const text = display.trim();
    return text === "" ? {} : { name: text };
  }
  if (!display || typeof display !== "object") return {};
  const { name, description } = display as {
    name?: unknown;
    description?: unknown;
  };
  return {
    ...(typeof name === "string" && name.trim() !== ""
      ? { name: name.trim() }
      : {}),
    ...(typeof description === "string" && description.trim() !== ""
      ? { description: description.trim() }
      : {}),
  };
}

/**
 * The local header line plus the tool's own card, drawn as-is.
 *
 * Nothing is removed from the tool's own card: it renders exactly as it does
 * without us. Backgrounds are the only thing dropped.
 */
class OwnContentCard implements Component {
  constructor(
    private readonly header: string,
    private readonly child: Component | undefined,
    private readonly fallback: string,
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    const lines: string[] = [];
    if (this.header !== "") lines.push(fitLine(this.header, width, "", 0));

    let body: string[] = [];
    if (this.child) {
      try {
        body = this.child.render(width);
      } catch {
        body = [];
      }
    }
    for (const line of body) lines.push(stripBackground(line));

    // Nothing drawn by the tool: keep the local card informative.
    if (body.length === 0 && this.fallback !== "") {
      lines.push(fitLine(this.fallback, width, "", 0));
    }
    return lines;
  }
}

type ContentState = {
  spinner?: SpinnerState;
  call?: Component;
  result?: Component;
};

/**
 * Card for a tool that draws its own content.
 *
 * The badge carries the tool's identity (its label), the header detail carries
 * the objective it declares (`display.description`, else the first short
 * argument), and the rest of the tool's own card is shown as it draws it - the
 * card never hides that body, and the tool's own folding (its expand key) keeps
 * working because the real expanded state is passed through.
 * Its `invalidate` is a no-op on purpose: a third-party renderer that
 * invalidates while drawing would re-run this render forever.
 */
function contentCard(
  definition: ToolDefinition<any, any, any>,
  name: string,
): ToolDefinition<any, any, any> {
  const originalCall = definition.renderCall;
  const originalResult = definition.renderResult;
  const label = definition.label || name;

  return {
    ...definition,
    renderShell: "self",
    renderCall(args: unknown, theme: AnyTheme, context: AnyContext) {
      const state = context.state as ContentState;
      state.spinner ??= {};
      syncSpinner(state.spinner, context.isPartial, context.invalidate);

      // The badge is the tool's identity; the tool's own title line stays in its
      // card, so its `display.name` is not repeated here.
      const display = runDisplay(args);
      const header = toolHeader(
        theme,
        label,
        display.description ?? argDetail(args, theme),
      );

      const child = ownComponent(
        state,
        "call",
        args,
        undefined,
        { isPartial: context.isPartial, expanded: context.expanded },
        theme,
        context,
        originalCall,
      );
      const fallback = context.isPartial
        ? resultLine(theme, theme.fg("muted", spinnerChar(state.spinner)))
        : "";
      if (child) return new OwnContentCard(header, child, fallback);

      return new Text(
        fallback === "" ? header : `${header}\n${fallback}`,
        0,
        0,
      );
    },
    renderResult(
      result: AnyResult,
      options: { isPartial: boolean; expanded: boolean },
      theme: AnyTheme,
      context: AnyContext,
    ) {
      const state = context.state as ContentState;
      const output = textOutput(result as { content: ToolTextResultContent });
      const fallback = options.isPartial
        ? ""
        : context.isError
          ? errorPreviewLine(theme, output, options.expanded)
          : output
            ? resultLine(theme, outputSummary(output, theme))
            : "";

      const child = ownComponent(
        state,
        "result",
        context.args,
        result,
        options,
        theme,
        context,
        originalResult,
      );
      if (child) return new OwnContentCard("", child, fallback);
      return new Text(fallback, 0, 0);
    },
  };
}

type ToolTextResultContent = Array<{ type: string; text?: string }>;

function ownComponent(
  state: ContentState,
  slot: "call" | "result",
  args: unknown,
  result: AnyResult | undefined,
  options: { isPartial: boolean; expanded: boolean },
  theme: AnyTheme,
  context: AnyContext,
  renderer: ((...args: any[]) => Component) | undefined,
): Component | undefined {
  if (!renderer) return undefined;
  const previous = slot === "call" ? state.call : state.result;
  const nested = {
    ...context,
    lastComponent: previous,
    // A third-party renderer must not drive our invalidation (see contentCard).
    invalidate: () => {},
  } as AnyContext;
  try {
    const component =
      slot === "result"
        ? renderer(result, options, theme, nested)
        : renderer(args, theme, nested);
    if (slot === "call") state.call = component;
    else state.result = component;
    return component;
  } catch {
    return undefined;
  }
}

/** Attach the local card to one definition, keeping execution untouched. */
export function wrapForeignDefinition(
  definition: ToolDefinition<any, any, any>,
  name: string,
  aggregation: AggregationWrapper,
): ToolDefinition<any, any, any> {
  if (definition.renderCall || definition.renderResult) {
    return contentCard(definition, name);
  }
  return aggregation.wrap(definition, {
    line: (args, theme) => argDetail(args, theme),
    summary: (output, theme) => outputSummary(output, theme),
  });
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
  aggregation: AggregationWrapper;
  isExcepted: (name: string) => boolean;
  ownRoot: string;
  onWrapped?: (names: string[]) => void;
  /** Registry the teardown lands in; defaults to the extension's own. */
  lifecycle?: Lifecycle;
  /** Identity this install replaces on the hub; one per extension. */
  owner?: string;
}): { dispose(): void } {
  const lifecycle = options.lifecycle ?? uiLifecycle;
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
        card = wrapForeignDefinition(definition, name, options.aggregation);
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
  const constructors = await discoverRunnerConstructors();
  if (constructors.length === 0) return;

  installForeignToolCards({
    constructors,
    aggregation: createToolAggregation(pi),
    isExcepted: exceptionMatcher(readExceptionList()),
    ownRoot: ownExtensionsRoot(),
  });
}
