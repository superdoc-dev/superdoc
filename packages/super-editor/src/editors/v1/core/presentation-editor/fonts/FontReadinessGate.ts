import {
  getFontRegistryFor,
  bumpFontConfigVersion,
  buildFontReport,
  DEFAULT_FONT_LOAD_TIMEOUT_MS,
  type FontRegistry,
  type FontLoadResult,
  type FontLoadSummary,
  type FontResolutionRecord,
} from '@superdoc/font-system';

export type { FontLoadSummary } from '@superdoc/font-system';
import { clearTextMeasurementCaches } from '@superdoc/measuring-dom';
import { measureCache } from '@superdoc/layout-bridge';

/**
 * The font set the gate operates on plus the constructor for new managed faces.
 * Both come from the SAME window/document so the registry it derives and the set
 * it watches for load events are the same object - the iframe-safe pairing. The
 * ctor is the host window's `FontFace` (the structural cast to the registry's
 * face type is confined to {@link FontReadinessGate} so callers pass it directly).
 */
export interface FontEnvironment {
  fontSet: FontFaceSet;
  FontFaceCtor: typeof FontFace;
}

export interface FontReadinessGateOptions {
  /** Logical font families the current document uses. Cheap to call per render. */
  getDocumentFonts: () => string[];
  /** Trigger a re-measure + re-layout + repaint (PresentationEditor's immediate render). */
  requestReflow: () => void;
  /**
   * The font set + face constructor for this editor's document. Resolved lazily (the host
   * document is not available at construction). The registry is derived from this same
   * `fontSet`, so awaits and load-event watching always target one set. Defaults to the
   * ambient `document.fonts`.
   */
  getFontEnvironment?: () => FontEnvironment | null;
  /**
   * Map logical families to the physical families that must actually load: the
   * logical->physical map so the gate waits on the real substitute (e.g. Calibri -> Carlito).
   * Defaults to identity when not provided; the editor wires `resolvePhysicalFamilies`.
   */
  resolveFamilies?: (families: string[]) => string[];
  /** Per-font load budget before a face is treated as timed out. */
  timeoutMs?: number;
  /** Explicit registry override (tests). Normally derived from the font environment. */
  registry?: FontRegistry;
  /**
   * Called once when the registry is first resolved (a real font set is available).
   * The editor uses this to install the bundled substitute pack into the registry, so
   * the gate stays pack-agnostic and never imports the font assets itself.
   */
  onRegistryResolved?: (registry: FontRegistry) => void;
  /**
   * Cache invalidation hook. Defaults to clearing every font-dependent measurement cache
   * (text/font-metric/table caches + the block-measure cache). Injectable for tests.
   */
  invalidateCaches?: () => void;
}

/**
 * Load-before-measure gate.
 *
 * The layout pipeline measures text with the canvas `measureText` API, which silently
 * substitutes a fallback when the requested font has not loaded yet. That makes first
 * paint paginate against the wrong metrics and then reflow once the font arrives. This
 * gate closes that window: before each measurement pass it awaits the specific faces the
 * current document needs (not a global `document.fonts.ready`), and if a required face
 * finishes after a timed-out first paint it invalidates the measurement caches and
 * reflows exactly once.
 *
 * It owns no font loading itself - that is `@superdoc/font-system`. It owns the editor-side
 * lifecycle: when to wait, when to invalidate, when to reflow.
 */
export class FontReadinessGate {
  readonly #getDocumentFonts: () => string[];
  readonly #resolveFamilies: (families: string[]) => string[];
  readonly #requestReflow: () => void;
  readonly #getFontEnvironment: () => FontEnvironment | null;
  readonly #registryOverride: FontRegistry | null;
  readonly #onRegistryResolved: ((registry: FontRegistry) => void) | null;
  readonly #timeoutMs: number;
  readonly #invalidateCaches: () => void;

  /** Resolved once a real font set is available: the watched set + its registry, paired. */
  #context: { fontSet: FontFaceSet | null; registry: FontRegistry } | null = null;

  #fontConfigVersion = 0;
  #requiredSignature = '';
  #requiredFamilies = new Set<string>();
  /** Families observed available, so the late-load handler fires at most once per face. */
  readonly #seenAvailable = new Set<string>();
  #lastSummary: FontLoadSummary | null = null;
  #loadingDoneHandler: ((event: FontFaceSetLoadEvent) => void) | null = null;

  constructor(options: FontReadinessGateOptions) {
    this.#getDocumentFonts = options.getDocumentFonts;
    this.#resolveFamilies = options.resolveFamilies ?? ((families) => families);
    this.#requestReflow = options.requestReflow;
    this.#getFontEnvironment = options.getFontEnvironment ?? defaultFontEnvironment;
    this.#registryOverride = options.registry ?? null;
    this.#onRegistryResolved = options.onRegistryResolved ?? null;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_FONT_LOAD_TIMEOUT_MS;
    this.#invalidateCaches = options.invalidateCaches ?? defaultInvalidate;
  }

  /**
   * Font-config epoch. Increments whenever the available-font picture changes (a late
   * load, or a runtime add/map). The resolver (T1) will fold this into the per-fragment
   * paint signature so paint reuse busts on a font change, not just measurement.
   */
  get fontConfigVersion(): number {
    return this.#fontConfigVersion;
  }

  /** Most recent readiness summary, for diagnostics and the public DX surface (later). */
  getDiagnostics(): FontLoadSummary | null {
    return this.#lastSummary;
  }

  /**
   * Per-font resolution report for the current document: requested -> rendered -> reason
   * -> load status -> export family. The observable answer to "what did SuperDoc render
   * and is it faithful". Built through the shared resolver + registry, so it reflects
   * exactly what was measured and painted - not an independent computation.
   */
  getReport(): FontResolutionRecord[] {
    let logical: string[] = [];
    try {
      logical = this.#getDocumentFonts();
    } catch {
      return [];
    }
    return buildFontReport(logical, this.#resolveContext().registry);
  }

  /**
   * Await the faces the current document needs, then return their outcomes. Safe and
   * cheap to call on every render: when the required set is unchanged and already fully
   * loaded it returns the cached summary without awaiting. Never rejects - font readiness
   * must not break layout.
   */
  async ensureReadyForMeasure(): Promise<FontLoadSummary> {
    const registry = this.#resolveContext().registry;

    let required: string[];
    try {
      required = [...new Set(this.#resolveFamilies(this.#getDocumentFonts()).filter(Boolean))];
    } catch {
      return this.#lastSummary ?? emptySummary();
    }

    const signature = required.slice().sort().join('|');
    const unchangedAndLoaded =
      signature === this.#requiredSignature && required.every((family) => registry.getStatus(family) === 'loaded');
    if (unchangedAndLoaded && this.#lastSummary) {
      return this.#lastSummary;
    }

    this.#requiredSignature = signature;
    this.#requiredFamilies = new Set(required);
    this.#ensureSubscribed();

    let results: FontLoadResult[] = [];
    try {
      results = required.length ? await registry.awaitFaces(required, { timeoutMs: this.#timeoutMs }) : [];
    } catch {
      results = [];
    }

    for (const result of results) {
      if (result.status === 'loaded') this.#seenAvailable.add(result.family);
    }
    this.#lastSummary = summarize(results);
    return this.#lastSummary;
  }

  /**
   * Signal that the font configuration changed at runtime (customer add/map, T7). Bumps
   * the epoch, invalidates measurement caches, and reflows so the new mapping takes effect.
   */
  notifyFontConfigChanged(): void {
    this.#fontConfigVersion += 1;
    bumpFontConfigVersion(); // bump the global epoch so measure/paint reuse signatures bust
    this.#seenAvailable.clear();
    this.#requiredSignature = '';
    this.#invalidateCaches();
    this.#requestReflow();
  }

  /** Remove the late-load listener. Call on editor teardown. */
  dispose(): void {
    const fontSet = this.#context?.fontSet ?? null;
    if (fontSet && this.#loadingDoneHandler && typeof fontSet.removeEventListener === 'function') {
      fontSet.removeEventListener('loadingdone', this.#loadingDoneHandler);
    }
    this.#loadingDoneHandler = null;
  }

  /** Resolve (and cache) the watched font set + its paired registry. */
  #resolveContext(): { fontSet: FontFaceSet | null; registry: FontRegistry } {
    if (this.#context && this.#context.fontSet) return this.#context;
    const env = this.#getFontEnvironment();
    const fontSet = env?.fontSet ?? null;
    const registry =
      this.#registryOverride ??
      getFontRegistryFor(
        fontSet as unknown as FontSetLikeArg,
        (env?.FontFaceCtor ?? null) as unknown as FontFaceCtorArg,
      );
    this.#context = { fontSet, registry };
    // Let the editor install the bundled substitute pack into the registry once a real
    // font set exists. Kept out of the gate so the gate never imports the font assets.
    if (fontSet && this.#onRegistryResolved) {
      try {
        this.#onRegistryResolved(registry);
      } catch {
        /* font setup must not break layout */
      }
    }
    return this.#context;
  }

  #ensureSubscribed(): void {
    if (this.#loadingDoneHandler) return;
    const fontSet = this.#resolveContext().fontSet;
    if (!fontSet || typeof fontSet.addEventListener !== 'function') return;
    const handler = (event: FontFaceSetLoadEvent) => this.#onLoadingDone(event);
    fontSet.addEventListener('loadingdone', handler);
    this.#loadingDoneHandler = handler;
  }

  #onLoadingDone(event: FontFaceSetLoadEvent): void {
    // A required face that the last measure could not use just finished loading -> that
    // paint used a fallback, so invalidate and reflow. We key off the faces the event
    // actually reports as loaded (reliable), NOT FontFaceSet.check() (which lies for
    // unregistered bare families). The seen-set fires this once per face; never a loop.
    const loadedKeys = new Set((event?.fontfaces ?? []).map((face) => normalizeFamilyKey(face.family)));
    if (loadedKeys.size === 0) return;
    let changed = false;
    for (const family of this.#requiredFamilies) {
      if (this.#seenAvailable.has(family)) continue;
      if (loadedKeys.has(normalizeFamilyKey(family))) {
        this.#seenAvailable.add(family);
        changed = true;
      }
    }
    if (!changed) return;
    this.#fontConfigVersion += 1;
    bumpFontConfigVersion(); // bump the global epoch so measure/paint reuse signatures bust
    this.#invalidateCaches();
    this.#requestReflow();
  }
}

/** Lowercase + strip surrounding quotes so a required family matches a loaded FontFace.family. */
function normalizeFamilyKey(family: string): string {
  return family
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
}

/** The font-system registry accepts a structural font set + face ctor; the DOM types satisfy them. */
type FontSetLikeArg = Parameters<typeof getFontRegistryFor>[0];
type FontFaceCtorArg = Parameters<typeof getFontRegistryFor>[1];

function summarize(results: FontLoadResult[]): FontLoadSummary {
  const summary = emptySummary();
  summary.results = results;
  for (const result of results) {
    if (result.status === 'loaded') summary.loaded += 1;
    else if (result.status === 'failed') summary.failed += 1;
    else if (result.status === 'timed_out') summary.timedOut += 1;
    else if (result.status === 'fallback_used') summary.fallbackUsed += 1;
  }
  return summary;
}

function emptySummary(): FontLoadSummary {
  return { loaded: 0, failed: 0, timedOut: 0, fallbackUsed: 0, results: [] };
}

function defaultFontEnvironment(): FontEnvironment | null {
  const doc = (globalThis as { document?: Document }).document ?? null;
  const view = doc?.defaultView ?? null;
  const fontSet = doc?.fonts ?? null;
  const ctor = view?.FontFace ?? (typeof FontFace !== 'undefined' ? FontFace : null);
  if (!fontSet || !ctor) return null;
  return { fontSet, FontFaceCtor: ctor };
}

function defaultInvalidate(): void {
  clearTextMeasurementCaches();
  measureCache.clear();
}
