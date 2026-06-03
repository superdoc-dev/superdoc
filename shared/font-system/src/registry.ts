import type { FontFaceDescriptor, FontLoadResult, FontLoadStatus, RegisteredFace, RequiredFace } from './types';

/**
 * Default per-font budget the gate waits before treating a face as `timed_out`
 * and proceeding with a fallback. Generous enough for a cold cache on a slow
 * connection, short enough that a missing font never blocks first paint forever.
 */
export const DEFAULT_FONT_LOAD_TIMEOUT_MS = 3000;

/** Probe size used when building the CSS `font` shorthand passed to the font set. */
const DEFAULT_PROBE_SIZE = '16px';

/**
 * Structural slice of the CSS Font Loading API (`FontFaceSet`) the registry
 * depends on. Declared as an interface (not the DOM type) so the registry is
 * unit-testable with a fake and degrades cleanly where there is no DOM.
 */
export interface FontSetLike {
  add(face: FontFaceLike): void;
  load(font: string, text?: string): Promise<FontFaceLike[]>;
  check(font: string, text?: string): boolean;
}

/** Structural slice of a `FontFace`. */
export interface FontFaceLike {
  readonly family: string;
  load(): Promise<FontFaceLike>;
  readonly status?: string;
}

/** Structural slice of the global `FontFace` constructor. */
export type FontFaceCtor = new (
  family: string,
  source: string | ArrayBuffer | ArrayBufferView,
  descriptors?: FontFaceDescriptors,
) => FontFaceLike;

export interface FontRegistryOptions {
  /** The font set to drive. Defaults to the ambient `document.fonts`. */
  fontSet?: FontSetLike | null;
  /** Constructor for new managed faces. Defaults to the global `FontFace`. */
  FontFaceCtor?: FontFaceCtor | null;
  /** Font size used in probe strings. Only affects the `font` shorthand syntax. */
  probeSize?: string;
  /** Timer hooks, injectable for deterministic tests. Default to the globals. */
  scheduleTimeout?: (cb: () => void, ms: number) => unknown;
  cancelTimeout?: (handle: unknown) => void;
}

/**
 * Quote a family name for a CSS `font` shorthand so names with spaces or special
 * characters resolve to a single family rather than a fallback chain.
 */
function quoteFamily(family: string): string {
  return `"${family.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Runtime registry of font faces and their load state.
 *
 * Two jobs:
 *  1. **Register** managed faces (bundled substitutes, customer BYO fonts) so the
 *     browser knows how to load them. Registration is lazy - it adds the face to
 *     the set but does not download until something awaits it.
 *  2. **Await** the specific faces a layout pass needs, with a per-font timeout,
 *     reporting `loaded | failed | timed_out | fallback_used`. This is the
 *     contract the load-before-measure gate consumes; it works for *any* family
 *     in the set, whether the registry created the face (managed) or it was
 *     injected elsewhere (embedded `@font-face`, a system font).
 *
 * The registry intentionally does not subscribe to font-loading events or touch
 * measurement caches - those belong to the gate, which owns the editor lifecycle.
 */
export class FontRegistry {
  readonly #fontSet: FontSetLike | null;
  readonly #FontFaceCtor: FontFaceCtor | null;
  readonly #probeSize: string;
  readonly #scheduleTimeout: (cb: () => void, ms: number) => unknown;
  readonly #cancelTimeout: (handle: unknown) => void;

  /** Faces the registry created, keyed by family. */
  readonly #managed = new Map<string, FontFaceLike>();
  /** Last known load status per family. */
  readonly #status = new Map<string, FontLoadStatus>();
  /** Registered `url(...)` source(s) per family, to name the failing URL on a load error. */
  readonly #sources = new Map<string, string[]>();
  /** Families already warned about a load failure, so the warning fires at most once each. */
  readonly #warnedFailures = new Set<string>();
  /** In-flight loads, so concurrent awaits of one family share a single probe. */
  readonly #inflight = new Map<string, Promise<FontLoadResult>>();

  constructor(options: FontRegistryOptions = {}) {
    this.#fontSet = options.fontSet ?? null;
    this.#FontFaceCtor = options.FontFaceCtor ?? null;
    this.#probeSize = options.probeSize ?? DEFAULT_PROBE_SIZE;
    this.#scheduleTimeout = options.scheduleTimeout ?? ((cb, ms) => globalThis.setTimeout(cb, ms));
    this.#cancelTimeout =
      options.cancelTimeout ?? ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  /**
   * Register a managed face. Adds it to the font set so the browser can load it
   * on demand, but does not download yet. Safe to call where there is no DOM /
   * constructor: the family is recorded as `unloaded` and will resolve to
   * `fallback_used` when awaited.
   */
  register(descriptor: FontFaceDescriptor): RegisteredFace {
    const { family, source, descriptors } = descriptor;
    if (this.#FontFaceCtor && this.#fontSet) {
      const face = new this.#FontFaceCtor(family, source, descriptors);
      this.#fontSet.add(face);
      this.#managed.set(family, face);
    }
    if (typeof source === 'string') {
      const list = this.#sources.get(family) ?? [];
      if (!list.includes(source)) list.push(source);
      this.#sources.set(family, list);
    }
    if (!this.#status.has(family)) this.#status.set(family, 'unloaded');
    return { family, status: this.#status.get(family) ?? 'unloaded' };
  }

  /** True if this registry created a managed face for the family. */
  isManaged(family: string): boolean {
    return this.#managed.has(family);
  }

  /** Last known load status for a family (`unloaded` if never seen). */
  getStatus(family: string): FontLoadStatus {
    return this.#status.get(family) ?? 'unloaded';
  }

  /**
   * Synchronous availability check: is a real face for this family loaded and
   * usable in the set *right now*? Used by the gate's late-load handler to detect
   * a face that finished after the first measure. Returns false where there is no
   * font set.
   */
  isAvailable(family: string): boolean {
    if (!this.#fontSet) return false;
    try {
      return this.#fontSet.check(`${this.#probeSize} ${quoteFamily(family)}`);
    } catch {
      return false;
    }
  }

  /**
   * Await one family with a per-font timeout. Concurrent calls for the same
   * family share the in-flight probe. A family already known to be `loaded`
   * resolves immediately.
   */
  awaitFace(family: string, timeoutMs: number = DEFAULT_FONT_LOAD_TIMEOUT_MS): Promise<FontLoadResult> {
    if (this.#status.get(family) === 'loaded') {
      return Promise.resolve({ family, status: 'loaded' });
    }
    const existing = this.#inflight.get(family);
    if (existing) return existing;

    const probe = this.#loadOne(family, timeoutMs).finally(() => {
      this.#inflight.delete(family);
    });
    this.#inflight.set(family, probe);
    return probe;
  }

  /**
   * Await many families. The result preserves input order after de-duplication.
   * This is the gate's primary entry point before a measurement pass.
   */
  async awaitFaces(families: Iterable<string>, options: { timeoutMs?: number } = {}): Promise<FontLoadResult[]> {
    const unique = [...new Set(families)];
    const timeoutMs = options.timeoutMs ?? DEFAULT_FONT_LOAD_TIMEOUT_MS;
    return Promise.all(unique.map((family) => this.awaitFace(family, timeoutMs)));
  }

  /**
   * Required families as `{ family, status, ready }` handles. Reading `status` is
   * synchronous; `ready` settles when the load resolves. Calling this starts the
   * loads (idempotently).
   */
  getRequiredFaces(families: Iterable<string>, timeoutMs: number = DEFAULT_FONT_LOAD_TIMEOUT_MS): RequiredFace[] {
    return [...new Set(families)].map((family) => ({
      family,
      status: this.getStatus(family),
      ready: this.awaitFace(family, timeoutMs),
    }));
  }

  /** Snapshot of every family the registry has seen and its status (diagnostics). */
  getStates(): RegisteredFace[] {
    return [...this.#status.entries()].map(([family, status]) => ({ family, status }));
  }

  async #loadOne(family: string, timeoutMs: number): Promise<FontLoadResult> {
    const fontSet = this.#fontSet;
    if (!fontSet) {
      this.#status.set(family, 'fallback_used');
      return { family, status: 'fallback_used' };
    }

    this.#status.set(family, 'loading');
    const probe = `${this.#probeSize} ${quoteFamily(family)}`;

    const TIMEOUT = Symbol('timeout');
    let handle: unknown;
    const timeout = new Promise<typeof TIMEOUT>((resolve) => {
      handle = this.#scheduleTimeout(() => resolve(TIMEOUT), timeoutMs);
    });

    try {
      const settled = await Promise.race([fontSet.load(probe), timeout]);
      if (settled === TIMEOUT) {
        this.#status.set(family, 'timed_out');
        return { family, status: 'timed_out' };
      }
      // Trust the faces the loader actually resolved. Do NOT fall back to
      // `FontFaceSet.check()`: in some browsers it returns true for an unregistered
      // bare family name, which would falsely report an absent font as loaded and let
      // the gate measure against a fallback. `load()` yields only matched, loaded faces.
      const faces = settled as FontFaceLike[];
      const status: FontLoadStatus = faces.length > 0 ? 'loaded' : 'fallback_used';
      this.#status.set(family, status);
      return { family, status };
    } catch {
      this.#status.set(family, 'failed');
      this.#warnLoadFailureOnce(family);
      return { family, status: 'failed' };
    } finally {
      this.#cancelTimeout(handle);
    }
  }

  /**
   * Warn once per family when a registered face fails to load (e.g. its `.woff2` 404s
   * because the asset base is misconfigured). Names the attempted URL(s) so the failure
   * is never silent - the report also flags it (`missing: true`, `loadStatus: 'failed'`).
   */
  #warnLoadFailureOnce(family: string): void {
    if (this.#warnedFailures.has(family)) return;
    this.#warnedFailures.add(family);
    const sources = this.#sources.get(family);
    const detail = sources && sources.length ? ` from ${sources.join(', ')}` : '';
     
    console.warn(
      `[superdoc] font asset failed to load for "${family}"${detail}. ` +
        `Check fonts.assetBaseUrl / fonts.resolveAssetUrl so the bundled .woff2 are served.`,
    );
  }
}

const registriesByFontSet = new WeakMap<FontSetLike, FontRegistry>();
let domlessRegistry: FontRegistry | null = null;

/**
 * The single registry bound to a given font set. There is exactly one registry
 * per `FontFaceSet`, so a document's load gate, its bundled faces, and the public
 * `superdoc.fonts.*` surface all share load state.
 *
 * Callers MUST pass the same font set they watch for load events. A consumer that
 * awaits one set but listens to another would never observe its fonts arriving -
 * the exact failure mode for an editor inside an iframe whose `document.fonts`
 * differs from the top window's. Pass `null` (no DOM) to get a shared DOM-less
 * registry whose every await resolves to `fallback_used`.
 */
export function getFontRegistryFor(fontSet: FontSetLike | null, FontFaceCtor: FontFaceCtor | null): FontRegistry {
  if (!fontSet) {
    if (!domlessRegistry) domlessRegistry = new FontRegistry({});
    return domlessRegistry;
  }
  let registry = registriesByFontSet.get(fontSet);
  if (!registry) {
    registry = new FontRegistry({ fontSet, FontFaceCtor });
    registriesByFontSet.set(fontSet, registry);
  }
  return registry;
}

/**
 * The registry for the ambient `document.fonts`. Convenience for the common
 * single-document case; iframe/embedded callers should use {@link getFontRegistryFor}
 * with their own document's font set so the registry and the watched set match.
 */
export function getDefaultFontRegistry(): FontRegistry {
  const fontSet = (globalThis as { document?: { fonts?: unknown } }).document?.fonts ?? null;
  const FontFaceCtor = (globalThis as { FontFace?: unknown }).FontFace ?? null;
  return getFontRegistryFor(fontSet as FontSetLike | null, FontFaceCtor as FontFaceCtor | null);
}

/** Reset the cached DOM-less registry. Test-only; not part of the public surface. */
export function __resetDefaultFontRegistry(): void {
  domlessRegistry = null;
}
