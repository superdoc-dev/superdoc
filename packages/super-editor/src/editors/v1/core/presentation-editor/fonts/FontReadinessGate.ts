import {
  getFontRegistryFor,
  bumpFontConfigVersion,
  buildFontReport,
  buildFaceReport,
  DEFAULT_FONT_LOAD_TIMEOUT_MS,
  type FontRegistry,
  type FontLoadResult,
  type FontFaceRequest,
  type FontFaceLoadResult,
  type FontLoadSummary,
  type UsedFace,
  type FontLoadStatus,
  type FontResolutionRecord,
  type FontResolver,
} from '@superdoc/font-system';

export type { FontLoadSummary } from '@superdoc/font-system';
import { clearTextMeasurementCaches } from '@superdoc/measuring-dom';
import { measureCache } from '@superdoc/layout-bridge';
import { FontLateLoadReflowScheduler } from './FontLateLoadReflowScheduler';

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
  /** Logical font families the current document DECLARES (fontTable). Used for diagnostics. */
  getDocumentFonts: () => string[];
  /**
   * The exact physical FACES (family + weight + style) the current document RENDERS, from
   * the planner walking layout input. When provided, the gate awaits these faces instead of
   * declared families - so bold/italic load before measure and declared-but-unused fonts are
   * not fetched. Falls back to the {@link getDocumentFonts} + {@link resolveFamilies} family
   * path when omitted (tests / non-layout callers).
   */
  getRequiredFaces?: () => FontFaceRequest[];
  /**
   * The logical faces (family + weight + style) the document RENDERS, for the face-level report.
   * From the same stored render plan as {@link getRequiredFaces}, so report and load agree.
   */
  getUsedFaces?: () => UsedFace[];
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
  /**
   * The document's font resolver. When provided, `resolveFamilies` defaults to it and the
   * report resolves through it, so the gate honors a per-document `fonts.map`. Measure and paint
   * (text runs and field-annotation pills) resolve through the same instance, so load, measure,
   * paint, and diagnostics all agree.
   */
  fontResolver?: FontResolver;
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
  /** Late-load reflow batching: quiet window before the leading flush. Defaults to the scheduler default. */
  reflowQuietMs?: number;
  /** Late-load reflow batching: cooldown (min interval between flushes). Defaults to the scheduler default. */
  reflowCooldownMs?: number;
  /** Timer hooks for the late-load scheduler (injectable for tests); default to the globals. */
  scheduleTimeout?: (cb: () => void, ms: number) => unknown;
  cancelTimeout?: (handle: unknown) => void;
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
  readonly #getRequiredFaces: (() => FontFaceRequest[]) | null;
  readonly #getUsedFaces: (() => UsedFace[]) | null;
  readonly #resolveFamilies: (families: string[]) => string[];
  readonly #fontResolver: FontResolver | null;
  readonly #requestReflow: () => void;
  readonly #getFontEnvironment: () => FontEnvironment | null;
  readonly #registryOverride: FontRegistry | null;
  readonly #onRegistryResolved: ((registry: FontRegistry) => void) | null;
  readonly #timeoutMs: number;
  readonly #invalidateCaches: () => void;

  /** Resolved once a real font set is available: the watched set + its registry, paired. */
  #context: { fontSet: FontFaceSet | null; registry: FontRegistry } | null = null;
  /** The registry instance the bundled pack was installed into, so it installs once per registry. */
  #packInstalledFor: FontRegistry | null = null;

  #fontConfigVersion = 0;
  #requiredSignature = '';
  #requiredFamilies = new Set<string>();
  /** Required face keys (family|weight|style) for the face path's late-load matching. */
  #requiredFaceKeys = new Set<string>();
  /** Families observed available, so the family-path late-load handler fires once per face. */
  readonly #seenAvailable = new Set<string>();
  /** Face keys observed available, so the face-path late-load handler fires once per face. */
  readonly #seenAvailableFaces = new Set<string>();
  /** Face keys observed terminally FAILED, so the failure-demotion replan fires at most once per face
   *  (and cannot loop when the bundled clone it steps down to also fails). */
  readonly #seenFailedFaces = new Set<string>();
  #lastSummary: FontLoadSummary | null = null;
  #loadingDoneHandler: ((event: FontFaceSetLoadEvent) => void) | null = null;
  /** Batches late-load reflows so many font arrivals coalesce into bounded re-measures. */
  readonly #lateLoadScheduler: FontLateLoadReflowScheduler;

  constructor(options: FontReadinessGateOptions) {
    this.#getDocumentFonts = options.getDocumentFonts;
    this.#getRequiredFaces = options.getRequiredFaces ?? null;
    this.#getUsedFaces = options.getUsedFaces ?? null;
    this.#fontResolver = options.fontResolver ?? null;
    const resolver = this.#fontResolver;
    this.#resolveFamilies =
      options.resolveFamilies ??
      (resolver ? (families) => resolver.resolvePhysicalFamilies(families) : (families) => families);
    this.#requestReflow = options.requestReflow;
    this.#getFontEnvironment = options.getFontEnvironment ?? defaultFontEnvironment;
    this.#registryOverride = options.registry ?? null;
    this.#onRegistryResolved = options.onRegistryResolved ?? null;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_FONT_LOAD_TIMEOUT_MS;
    this.#invalidateCaches = options.invalidateCaches ?? defaultInvalidate;
    this.#lateLoadScheduler = new FontLateLoadReflowScheduler({
      quietMs: options.reflowQuietMs,
      cooldownMs: options.reflowCooldownMs,
      flush: () => this.#flushLateFontLoads(),
      scheduleTimeout: options.scheduleTimeout,
      cancelTimeout: options.cancelTimeout,
    });
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
    let declared: string[] = [];
    try {
      declared = this.#getDocumentFonts();
    } catch {
      return [];
    }
    const registry = this.#resolveContext().registry;
    const resolver = this.#fontResolver ?? undefined;
    // Face-level rows for the faces the document actually RENDERS, so a substitute that lacks a face
    // is reported `fallback_face_absent` per face (e.g. Baskerville Bold), from the stored plan's
    // usedFaces - the same plan the load gate awaited.
    const usedFaces = this.#getUsedFaces?.() ?? [];
    const faceRows = buildFaceReport(usedFaces, registry, resolver);
    // Preserve the DECLARED-font contract: a family declared but never rendered must still appear.
    // Add a family-level row (face undefined) for each declared family absent from the used faces -
    // NOT a synthetic Regular row (that would imply a Regular run rendered).
    const usedFamilies = new Set(usedFaces.map((u) => u.logicalFamily.toLowerCase()));
    const declaredOnly = declared.filter((family) => family && !usedFamilies.has(family.toLowerCase()));
    const declaredRows = buildFontReport(declaredOnly, registry, resolver);
    return [...faceRows, ...declaredRows];
  }

  /**
   * Await the faces the current document needs, then return their outcomes. Safe and
   * cheap to call on every render: when the required set is unchanged and already fully
   * loaded it returns the cached summary without awaiting. Never rejects - font readiness
   * must not break layout.
   */
  async ensureReadyForMeasure(): Promise<FontLoadSummary> {
    if (this.#getRequiredFaces) return this.#ensureFacesReady(this.#getRequiredFaces);
    return this.#ensureFamiliesReady();
  }

  /** Face-aware path: await the exact physical faces the rendered document uses. */
  async #ensureFacesReady(getRequiredFaces: () => FontFaceRequest[]): Promise<FontLoadSummary> {
    const registry = this.#resolveContext().registry;

    let required: FontFaceRequest[];
    try {
      required = getRequiredFaces();
    } catch {
      // Face planning is pure traversal, so a throw here is a bug - but if it ever does,
      // degrade to the family path (which still awaits the resolved physical families,
      // e.g. Calibri -> Carlito) rather than skipping load and letting fallback metrics
      // reach measurement.
      return this.#ensureFamiliesReady();
    }

    const keyed = required.map((r) => ({ request: r, key: faceKeyOf(r.family, r.weight, r.style) }));
    const signature = keyed
      .map((k) => k.key)
      .sort()
      .join('|');
    const unchangedAndLoaded =
      signature === this.#requiredSignature && keyed.every((k) => registry.getFaceStatus(k.request) === 'loaded');
    if (unchangedAndLoaded && this.#lastSummary) {
      return this.#lastSummary;
    }

    this.#requiredSignature = signature;
    this.#requiredFaceKeys = new Set(keyed.map((k) => k.key));
    this.#requiredFamilies = new Set();
    this.#ensureSubscribed();

    let results: FontFaceLoadResult[] = [];
    try {
      results = required.length ? await registry.awaitFaceRequests(required, { timeoutMs: this.#timeoutMs }) : [];
    } catch {
      results = [];
    }

    const failedKeys: string[] = [];
    for (const result of results) {
      const key = faceKeyOf(result.request.family, result.request.weight, result.request.style);
      if (result.status === 'loaded') {
        this.#seenAvailableFaces.add(key);
      } else if (result.status === 'failed' && !this.#seenFailedFaces.has(key)) {
        // A registered provider face whose asset terminally FAILED to load. `registry.hasFace` now
        // demotes it, so a replan re-resolves these runs to the bundled metric clone instead of leaving
        // the document on a broken registered face for the session. Fire once per face (seenFailed) so
        // it cannot loop if the clone it steps down to also fails. NOT done for `timed_out` - a slow
        // face is recovered by the late-load reflow, and demoting it would strand the real font.
        this.#seenFailedFaces.add(key);
        failedKeys.push(key);
      }
    }
    if (failedKeys.length > 0) this.#scheduleAvailabilityReflow(failedKeys);
    this.#lastSummary = summarizeFaces(results);
    return this.#lastSummary;
  }

  /** Legacy family path: await declared families (tests / non-layout callers). */
  async #ensureFamiliesReady(): Promise<FontLoadSummary> {
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
    this.#requiredFaceKeys = new Set();
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
   * Signal that this document's font CONFIG changed at runtime (`fonts.map`/`unmap`/`add`). Always
   * bumps the gate's LOCAL version (so `fonts-changed` re-emits), re-plans the required set, cancels
   * any pending late-load reflow, and reflows THIS document.
   *
   * A MAPPING change (`map`/`unmap`) is document-local: it moves the per-document resolver signature,
   * which already busts this document's measure/paint cache keys, so no global work is needed and
   * other editors are untouched. A REGISTRATION (`fonts.add`, signalled by `availabilityChanged`)
   * changes which faces are AVAILABLE without moving the signature, and the measurement caches are
   * availability-blind (the block cache keys on the unchanged signature; the metric cache keys on
   * `family|size|bold|italic`). It is therefore handled like a late load - bump the GLOBAL epoch and
   * clear the shared caches (see the body) - otherwise the reflow re-measures a now-loadable family
   * against its stale fallback widths. The controller coalesces a same-tick `add` + `map` into one
   * call with `availabilityChanged: true`.
   */
  notifyDocumentFontConfigChanged(options?: { availabilityChanged?: boolean }): void {
    this.#fontConfigVersion += 1;
    // Reset the required + seen sets so an in-flight `loadingdone` can't re-arm a reflow for a
    // face this immediate reflow already corrects; the next pass re-plans from scratch.
    this.#resetRequiredAndSeen();
    // Drop any pending batched late-load reflow: this immediate reflow supersedes it.
    this.#lateLoadScheduler.cancel();
    if (options?.availabilityChanged) {
      // A registration changed font availability without moving the resolver signature, so the
      // signature cannot bust the caches. Mirror the late-load correction: bump the global epoch
      // (so paint reuse busts here and in any other editor already showing that family) and clear
      // the shared measurement caches before the reflow re-measures against the now-loadable font.
      bumpFontConfigVersion();
      this.#invalidateCaches();
    }
    this.#requestReflow();
  }

  /**
   * Clear the shared measurement caches for a CONFIG-TIME font registration (applied before the
   * first layout). Like a runtime `fonts.add`, a registration changes which faces are available
   * without moving the resolver signature, so the signature cannot bust the caches; but unlike the
   * runtime path this runs before first paint, so it must NOT reflow, emit, or bump any epoch. It
   * only clears stale entries so this document's first measure can't reuse a fallback width that
   * another editor instance with identical block content left in the global cache. Other editors are
   * corrected when the face actually loads (`#onLoadingDone`); this document measures fresh next.
   */
  invalidateCachesForConfigRegistration(): void {
    this.#invalidateCaches();
  }

  /**
   * This document's FontRegistry, resolving the font environment on first call (and installing
   * the bundled pack via `onRegistryResolved`). The document font controller uses it to register
   * customer faces (`fonts.add`) and to load families (`fonts.preload`). The registry is scoped to
   * this document's FontFaceSet, so registrations are shared per browser document, not per editor.
   */
  resolveRegistry(): FontRegistry {
    return this.#resolveContext().registry;
  }

  /**
   * Reset late-load state for a document swap: cancel the pending batched reflow and drop the
   * prior document's required/seen sets, so a flush armed under the old document cannot fire a
   * spurious reflow against the new one. The new document's own render re-plans and invalidates.
   */
  resetForDocumentChange(): void {
    this.#lateLoadScheduler.cancel();
    this.#resetRequiredAndSeen();
  }

  /** Clear the per-document required + seen face/family sets, the signature, and the cached
   *  summary, so the next readiness pass cannot reuse the prior document's diagnostics (an
   *  empty/no-text new document would otherwise short-circuit to the stale summary). */
  #resetRequiredAndSeen(): void {
    this.#requiredSignature = '';
    this.#requiredFaceKeys = new Set();
    this.#requiredFamilies = new Set();
    this.#seenAvailable.clear();
    this.#seenAvailableFaces.clear();
    this.#seenFailedFaces.clear();
    this.#lastSummary = null;
  }

  /** Remove the late-load listener and cancel any pending batched reflow. Call on teardown. */
  dispose(): void {
    const fontSet = this.#context?.fontSet ?? null;
    if (fontSet && this.#loadingDoneHandler && typeof fontSet.removeEventListener === 'function') {
      fontSet.removeEventListener('loadingdone', this.#loadingDoneHandler);
    }
    this.#loadingDoneHandler = null;
    // Cancel pending batched reflow so a destroyed editor never reflows after teardown.
    this.#lateLoadScheduler.cancel();
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
    // Install the bundled substitute pack into the registry whenever one is resolved - even WITHOUT a
    // real font set. The pack registers face METADATA (family + weight + style), which is what
    // `hasFace` reads to decide whether a substitute provides a face; LOADING still needs a font set,
    // but face AVAILABILITY must not. Without this, an editor whose document has no `document.fonts`
    // (SSR/jsdom, some iframe/embedded timings) sees `hasFace` false for every bundled face, so even
    // Calibri Regular stops resolving to Carlito. Guarded per registry instance so it installs once
    // (the domless registry is a singleton; a real font set's registry is cached). Kept out of the
    // gate's imports - the editor injects the installer so the gate never imports the font assets.
    if (this.#onRegistryResolved && registry !== this.#packInstalledFor) {
      this.#packInstalledFor = registry;
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
    // A required face/family that the last measure could not use just finished loading ->
    // that paint used a fallback, so it must invalidate and reflow. We key off the faces the
    // event actually reports as loaded (reliable), NOT FontFaceSet.check() (which lies for
    // unregistered bare families). The seen-set records each at most once. The actual reflow
    // is BATCHED through the late-load scheduler so many arrival waves coalesce into bounded
    // re-measures instead of one full reflow per wave.
    const faces = event?.fontfaces ?? [];
    if (faces.length === 0) return;
    const changedKeys: string[] = [];

    if (this.#requiredFaceKeys.size > 0) {
      // Face path: reflow only when a loaded face matches a REQUIRED face key (family +
      // weight + style). "Liberation Sans bold loaded and it was required" - not merely
      // "Liberation Sans (regular) loaded".
      const loadedFaceKeys = new Set(
        faces.map((face) => faceKeyOf(face.family, normalizeWeightToken(face.weight), normalizeStyleToken(face.style))),
      );
      for (const key of this.#requiredFaceKeys) {
        if (this.#seenAvailableFaces.has(key)) continue;
        if (loadedFaceKeys.has(key)) {
          this.#seenAvailableFaces.add(key);
          changedKeys.push(key);
        }
      }
    } else {
      // Legacy family path.
      const loadedFamilies = new Set(faces.map((face) => normalizeFamilyKey(face.family)));
      for (const family of this.#requiredFamilies) {
        if (this.#seenAvailable.has(family)) continue;
        if (loadedFamilies.has(normalizeFamilyKey(family))) {
          this.#seenAvailable.add(family);
          changedKeys.push(normalizeFamilyKey(family));
        }
      }
    }

    if (changedKeys.length === 0) return;
    this.#scheduleAvailabilityReflow(changedKeys);
  }

  /**
   * The available-font picture changed (a required face loaded LATE, or a registered face terminally
   * FAILED so it must demote to the bundled clone). Bump the epoch and clear the measurement caches
   * immediately - measure caches are keyed without the epoch (`family|size|bold|italic`), so this
   * explicit clear is the only thing that busts them, and any re-measure/paint before the batched
   * reflow must already see the corrected resolution. Only the expensive full reflow is deferred to the
   * scheduler so arrival/failure waves coalesce.
   */
  #scheduleAvailabilityReflow(changedKeys: string[]): void {
    this.#fontConfigVersion += 1;
    bumpFontConfigVersion(); // bump the global epoch so paint reuse signatures bust
    this.#invalidateCaches();
    this.#lateLoadScheduler.schedule(changedKeys);
  }

  /**
   * The batched late-load correction: only the expensive re-measure/reflow. The epoch bump and
   * cache invalidation already fired synchronously in `#onLoadingDone`, so the document is never
   * left measuring against stale caches while the reflow waits out the scheduler's window.
   */
  #flushLateFontLoads(): void {
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

/** Canonical weight token for face matching: bold/>=600 -> '700', else '400'. */
function normalizeWeightToken(weight: string | undefined): '400' | '700' {
  if (!weight) return '400';
  const w = weight.trim().toLowerCase();
  if (w === 'bold' || w === 'bolder') return '700';
  const n = Number(w);
  return Number.isFinite(n) && n >= 600 ? '700' : '400';
}

/** Canonical style token for face matching: italic/oblique -> 'italic', else 'normal'. */
function normalizeStyleToken(style: string | undefined): 'normal' | 'italic' {
  if (!style) return 'normal';
  const s = style.trim().toLowerCase();
  return s.startsWith('italic') || s.startsWith('oblique') ? 'italic' : 'normal';
}

/** Face key matching the registry's: normalized family + weight + style. */
function faceKeyOf(family: string, weight: '400' | '700', style: 'normal' | 'italic'): string {
  return `${normalizeFamilyKey(family)}|${weight}|${style}`;
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

// Status precedence for rolling per-face outcomes up to a family: a settled failure must
// never be masked by a loaded sibling. Mirrors FontRegistry.getStatus's rollup order.
const FACE_STATUS_PRIORITY: FontLoadStatus[] = [
  'failed',
  'timed_out',
  'fallback_used',
  'loaded',
  'loading',
  'unloaded',
];

function summarizeFaces(results: FontFaceLoadResult[]): FontLoadSummary {
  // FontLoadSummary's counts are documented as distinct physical FAMILIES and ride the
  // public `fonts-changed` payload, but the face path awaits per face. Collapse faces to
  // their family, taking the family's worst status, so a Calibri doc using regular+bold+
  // italic reports one Carlito family (not three faces).
  const worstByFamily = new Map<string, FontLoadStatus>();
  for (const { request, status } of results) {
    const prev = worstByFamily.get(request.family);
    if (prev === undefined || FACE_STATUS_PRIORITY.indexOf(status) < FACE_STATUS_PRIORITY.indexOf(prev)) {
      worstByFamily.set(request.family, status);
    }
  }
  const summary = emptySummary();
  for (const [family, status] of worstByFamily) {
    summary.results.push({ family, status });
    if (status === 'loaded') summary.loaded += 1;
    else if (status === 'failed') summary.failed += 1;
    else if (status === 'timed_out') summary.timedOut += 1;
    else if (status === 'fallback_used') summary.fallbackUsed += 1;
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
