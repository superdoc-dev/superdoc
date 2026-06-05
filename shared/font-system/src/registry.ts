import type {
  FontFaceDescriptor,
  FontFaceLoadResult,
  FontFaceRequest,
  FontLoadResult,
  FontLoadStatus,
  RegisteredFace,
  RegisterFaceResult,
  RequiredFace,
} from './types';

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
 * Canonicalize a CSS `url(...)` font source so callers that quote it differently register the
 * SAME face once instead of as conflicting sources. The bundled pack emits `url(/x.woff2)` while
 * the public `fonts.add` path JSON.stringify-quotes to `url("/x.woff2")`; both name the same file,
 * so the registry must treat them as one source (otherwise re-adding a bundled face throws as a
 * "different source"). Only a lone `url(...)` token is normalized; anything else (a bare string,
 * `url(...) format(...)`, a `local(...)`) is returned unchanged so this stays conservative.
 */
function canonicalizeFontSource(source: string): string {
  const match = /^\s*url\(\s*([\s\S]*?)\s*\)\s*$/i.exec(source);
  if (!match) return source;
  let inner = match[1].trim();
  if ((inner.startsWith('"') && inner.endsWith('"')) || (inner.startsWith("'") && inner.endsWith("'"))) {
    inner = inner.slice(1, -1);
  }
  return `url(${JSON.stringify(inner)})`;
}

/** Normalize a family name for keying: trim, strip surrounding quotes, lowercase. */
function normalizeFamilyKey(family: string): string {
  return family
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
}

/** Canonical weight token: `bold`/`700`-ish -> '700', everything else -> '400'. */
function normalizeWeight(weight: string | number | undefined): '400' | '700' {
  if (weight === undefined) return '400';
  const w = String(weight).trim().toLowerCase();
  if (w === 'bold' || w === 'bolder') return '700';
  const n = Number(w);
  return Number.isFinite(n) && n >= 600 ? '700' : '400';
}

/** Canonical style token: italic/oblique -> 'italic', else 'normal'. */
function normalizeStyle(style: string | undefined): 'normal' | 'italic' {
  if (!style) return 'normal';
  const s = style.trim().toLowerCase();
  return s.startsWith('italic') || s.startsWith('oblique') ? 'italic' : 'normal';
}

/** Stable key for a face: normalized family + weight + style. */
function faceKeyOf(family: string, weight: '400' | '700', style: 'normal' | 'italic'): string {
  return `${normalizeFamilyKey(family)}|${weight}|${style}`;
}

/** CSS `font` shorthand probe for a specific face (style weight size family). */
function faceProbe(family: string, weight: '400' | '700', style: 'normal' | 'italic', size: string): string {
  const stylePart = style === 'italic' ? 'italic ' : '';
  return `${stylePart}${weight} ${size} ${quoteFamily(family)}`;
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
  /** In-flight family loads, so concurrent awaits of one family share a single probe. */
  readonly #inflight = new Map<string, Promise<FontLoadResult>>();

  // Face-level state (family + weight + style). The gate awaits FACES, not families,
  // because `load('16px Family')` only loads the regular face. `#status` above stays as
  // a family-level rollup (see getStatus) so declared-font diagnostics keep working.
  /** Last known load status per face key. */
  readonly #faceStatus = new Map<string, FontLoadStatus>();
  /** In-flight face loads, so concurrent awaits of one face share a single probe. */
  readonly #faceInflight = new Map<string, Promise<FontFaceLoadResult>>();
  /** Registered `url(...)` source per face key, to name the failing URL on a face load error. */
  readonly #faceSources = new Map<string, string>();
  /** Face keys seen per normalized family, for the family-level status rollup. Populated by BOTH
   *  registration AND awaiting (so getStatus rolls up the status of an awaited pass-through face). */
  readonly #facesByFamily = new Map<string, Set<string>>();
  /**
   * Face keys this registry actually REGISTERED as a provider (a bundled clone or a `fonts.add`/
   * embedded face) - NOT faces that were merely awaited. This is the oracle {@link hasFace} consults:
   * the resolver's provider-precedence ladder must answer "is there a registered face for this
   * family|weight|style?", which is distinct from `#facesByFamily`'s "have we ever seen/awaited it?".
   * Mixing the two would let a once-awaited `as_requested` family masquerade as a registered face.
   */
  readonly #providerFaceKeys = new Set<string>();
  /** Faces already warned about a load failure, so the warning fires at most once each. */
  readonly #warnedFaceFailures = new Set<string>();

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
  register(descriptor: FontFaceDescriptor): RegisterFaceResult {
    const { family, source, descriptors } = descriptor;
    // Identity source for the duplicate-face guard: canonicalize url(...) quoting so the SAME file
    // registered by the bundled pack (`url(/x)`) and by `fonts.add` (`url("/x")`) compares equal
    // instead of throwing as a "different source". The raw source is still what we hand the
    // FontFace and store in #sources, so served URLs and diagnostics are unchanged.
    const identitySource = typeof source === 'string' ? canonicalizeFontSource(source) : source;
    // A face's identity is family|weight|style; a bare register (no descriptors) is 400/normal.
    const weight = normalizeWeight(descriptors?.weight as string | undefined);
    const style = normalizeStyle(descriptors?.style as string | undefined);
    const key = faceKeyOf(family, weight, style);
    // Duplicate-face guard (the registry is the central registrar for bundled AND customer faces):
    // re-registering the IDENTICAL string source is idempotent - return without adding a second
    // FontFace - but a DIFFERENT source for the same face is rejected. Silently overwriting a
    // user-provided font source would make rendering depend on registration order. Binary sources
    // have no comparable identity here and are not de-duped.
    if (typeof identitySource === 'string') {
      const existingSource = this.#faceSources.get(key);
      if (existingSource === identitySource) return { family, status: this.getStatus(family), changed: false };
      if (existingSource !== undefined) {
        throw new Error(
          `[superdoc] font face "${key}" is already registered from a different source ` +
            `("${existingSource}"); a registered face's source cannot be replaced`,
        );
      }
    }
    if (this.#FontFaceCtor && this.#fontSet) {
      // Build the FontFace with the BUCKETED weight/style the key uses, not the raw descriptor. The
      // face key is family|<400|700>|<normal|italic>, so an off-bucket descriptor (e.g. weight 500)
      // would answer hasFace for the 400 key yet render at 500 - the run model is binary, so clamp the
      // rendered face to the same bucket. Other descriptors (stretch, unicodeRange, display) pass through.
      const face = new this.#FontFaceCtor(family, source, { ...descriptors, weight, style });
      this.#fontSet.add(face);
      this.#managed.set(family, face);
    }
    if (typeof source === 'string') {
      const list = this.#sources.get(family) ?? [];
      if (!list.includes(source)) list.push(source);
      this.#sources.set(family, list);
    }
    if (!this.#status.has(family)) this.#status.set(family, 'unloaded');
    // Record this as a PROVIDER face (the hasFace oracle), distinct from the await-tracking below.
    this.#providerFaceKeys.add(key);
    // Seed face-level status so the gate can await this exact weight/style.
    this.#trackFace(family, key);
    if (!this.#faceStatus.has(key)) this.#faceStatus.set(key, 'unloaded');
    if (typeof identitySource === 'string' && !this.#faceSources.has(key)) this.#faceSources.set(key, identitySource);
    return { family, status: this.getStatus(family), changed: true };
  }

  /** Record a face key under its normalized family for the family-status rollup. */
  #trackFace(family: string, key: string): void {
    const fam = normalizeFamilyKey(family);
    const set = this.#facesByFamily.get(fam) ?? new Set<string>();
    set.add(key);
    this.#facesByFamily.set(fam, set);
  }

  /** True if this registry created a managed face for the family. */
  isManaged(family: string): boolean {
    return this.#managed.has(family);
  }

  /**
   * Last known status for a family, rolled up from its faces (and any legacy family-path
   * load). Used by declared-font diagnostics (`buildFontReport`).
   *
   * A FAILED/TIMED_OUT/FALLBACK_USED face surfaces OVER a loaded sibling: if a document
   * uses Arial regular (Liberation Sans loads) and Arial bold (its face 404s), the family
   * reports the failure (`missing: true`), not a misleadingly-clean `loaded`. This is sound
   * because the gate only awaits USED faces - an unused face stays `unloaded` (lowest
   * priority), so a declared-but-unused family stays `unloaded` (not settled => not missing)
   * and a used-but-failed face is never masked. Per-face detail is in `getFaceStatus` and
   * the load summary's per-face counts.
   */
  getStatus(family: string): FontLoadStatus {
    const statuses: FontLoadStatus[] = [];
    const faceKeys = this.#facesByFamily.get(normalizeFamilyKey(family));
    if (faceKeys) for (const k of faceKeys) statuses.push(this.#faceStatus.get(k) ?? 'unloaded');
    const legacy = this.#status.get(family);
    if (legacy) statuses.push(legacy);
    if (statuses.length === 0) return 'unloaded';
    // Settled failures outrank `loaded` so a broken required face is never hidden.
    const priority: FontLoadStatus[] = ['failed', 'timed_out', 'fallback_used', 'loaded', 'loading', 'unloaded'];
    for (const s of priority) if (statuses.includes(s)) return s;
    return 'unloaded';
  }

  /**
   * Is a face (family + weight + style) provided by a REGISTERED face that has not terminally failed
   * to load? The face-availability oracle the face-aware resolver consults to answer "does the
   * physical family actually provide this face?" - so a single-face substitute is never mapped onto a
   * weight/style it lacks (which the painter would faux-synthesize). Covers bundled faces (registered
   * by `installBundledSubstitutes`) and customer `fonts.add()` faces alike, because both register
   * through {@link register}.
   *
   * Two deliberate exclusions:
   *  - A merely-AWAITED face is not a provider. The oracle reads {@link #providerFaceKeys} (registration
   *    only), NOT `#facesByFamily` (which the await path also populates for the status rollup), so an
   *    `as_requested` family the gate once awaited does not masquerade as a registered face on the next
   *    resolve.
   *  - A face whose asset terminally FAILED to load is dropped, so the ladder steps down to the bundled
   *    clone instead of committing forever to a broken registered face. `timed_out` is NOT excluded -
   *    the late-load reflow still recovers a slow face, and demoting it would strand the real font.
   *
   * Distinct from {@link isAvailable}, which asks whether a face is LOADED right now.
   */
  hasFace(family: string, weight: '400' | '700', style: 'normal' | 'italic'): boolean {
    const key = faceKeyOf(family, weight, style);
    return this.#providerFaceKeys.has(key) && this.#faceStatus.get(key) !== 'failed';
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

  /** Last known status for a specific face (`unloaded` if never seen). */
  getFaceStatus(request: FontFaceRequest): FontLoadStatus {
    return this.#faceStatus.get(faceKeyOf(request.family, request.weight, request.style)) ?? 'unloaded';
  }

  /**
   * Await one specific face (family + weight + style) with a per-font timeout. Uses a
   * weight/style-specific probe (`italic 700 16px "Carlito"`), so unlike {@link awaitFace}
   * it loads the EXACT face the run needs, not just the regular one. Concurrent awaits of
   * the same face share one probe; an already-`loaded` face resolves immediately.
   */
  awaitFaceRequest(
    request: FontFaceRequest,
    timeoutMs: number = DEFAULT_FONT_LOAD_TIMEOUT_MS,
  ): Promise<FontFaceLoadResult> {
    const key = faceKeyOf(request.family, request.weight, request.style);
    if (this.#faceStatus.get(key) === 'loaded') {
      return Promise.resolve({ request, status: 'loaded' });
    }
    const existing = this.#faceInflight.get(key);
    if (existing) return existing;
    const probe = this.#loadOneFace(request, key, timeoutMs).finally(() => {
      this.#faceInflight.delete(key);
    });
    this.#faceInflight.set(key, probe);
    return probe;
  }

  /** Await many faces; result preserves input order after de-duplication by face key. */
  async awaitFaceRequests(
    requests: Iterable<FontFaceRequest>,
    options: { timeoutMs?: number } = {},
  ): Promise<FontFaceLoadResult[]> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_FONT_LOAD_TIMEOUT_MS;
    const seen = new Set<string>();
    const unique: FontFaceRequest[] = [];
    for (const r of requests) {
      const key = faceKeyOf(r.family, r.weight, r.style);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(r);
    }
    return Promise.all(unique.map((r) => this.awaitFaceRequest(r, timeoutMs)));
  }

  async #loadOneFace(request: FontFaceRequest, key: string, timeoutMs: number): Promise<FontFaceLoadResult> {
    this.#trackFace(request.family, key);
    const fontSet = this.#fontSet;
    if (!fontSet) {
      this.#faceStatus.set(key, 'fallback_used');
      return { request, status: 'fallback_used' };
    }
    this.#faceStatus.set(key, 'loading');
    const probe = faceProbe(request.family, request.weight, request.style, this.#probeSize);
    const TIMEOUT = Symbol('timeout');
    let handle: unknown;
    const timeout = new Promise<typeof TIMEOUT>((resolve) => {
      handle = this.#scheduleTimeout(() => resolve(TIMEOUT), timeoutMs);
    });
    try {
      const settled = await Promise.race([fontSet.load(probe), timeout]);
      if (settled === TIMEOUT) {
        this.#faceStatus.set(key, 'timed_out');
        return { request, status: 'timed_out' };
      }
      const faces = settled as FontFaceLike[];
      const status: FontLoadStatus = faces.length > 0 ? 'loaded' : 'fallback_used';
      this.#faceStatus.set(key, status);
      return { request, status };
    } catch {
      this.#faceStatus.set(key, 'failed');
      this.#warnFaceFailureOnce(request, key);
      return { request, status: 'failed' };
    } finally {
      this.#cancelTimeout(handle);
    }
  }

  /** Warn once per face when its asset fails to load, naming the attempted URL. */
  #warnFaceFailureOnce(request: FontFaceRequest, key: string): void {
    if (this.#warnedFaceFailures.has(key)) return;
    this.#warnedFaceFailures.add(key);
    const src = this.#faceSources.get(key);
    const detail = src ? ` from ${src}` : '';
    console.warn(
      `[superdoc] font face failed to load: "${request.family}" ${request.weight} ${request.style}${detail}. ` +
        `Check fonts.assetBaseUrl / fonts.resolveAssetUrl so the bundled .woff2 are served.`,
    );
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
