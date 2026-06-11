import type { FontFaceRequest, FontResolver } from '@superdoc/font-system';
import type { FontFamilyConfig, FontsConfig } from '../../types/EditorConfig.js';
import type { FontReadinessGate } from './FontReadinessGate.js';

export interface DocumentFontControllerDeps {
  /**
   * This document's logical->physical resolver. The controller is its ONLY writer (map/unmap/
   * reset); PresentationEditor and `superdoc.fonts.*` route through here rather than mutating it
   * directly, so config-time and runtime changes share one orchestration path.
   */
  resolver: FontResolver;
  /**
   * The current font-readiness gate, or null before init / after teardown. A function (not the
   * gate itself) because the gate is recreated across renders and document swaps; the controller
   * always talks to the live one.
   */
  getGate: () => FontReadinessGate | null;
  /**
   * Invoked once after a runtime document font config change is applied, so the next
   * `fonts-changed` is labelled `source: 'config-change'` instead of `late-load`.
   */
  onDocumentFontConfigApplied: () => void;
  /** Microtask scheduler, injectable for deterministic tests. */
  scheduleMicrotask?: (callback: () => void) => void;
}

/**
 * A document's embedded font face, as extracted by the converter (`SuperConverter.getEmbeddedFontFaces`):
 * the deobfuscated bytes plus the OS/2-derived face axis and raw `fsType` licensing. The controller
 * registers each {@link embeddable} face under a document-unique physical family (binding the logical
 * family to it in the resolver) so the `registered_face` rung renders the document's real font instead
 * of the bundled substitute; it skips faces that are not embeddable (Restricted-License, or an
 * unreadable OS/2 table - no proof the license permits embedding).
 */
export interface EmbeddedFontFace {
  family: string;
  /** Deobfuscated SFNT bytes (an ArrayBuffer from `deobfuscateFont`). */
  source: ArrayBuffer | ArrayBufferView;
  weight: '400' | '700';
  style: 'normal' | 'italic';
  /** Raw OS/2 `fsType`, or null when the table was unreadable. Preserved for diagnostics/policy. */
  fsType: number | null;
  embeddable: boolean;
  relationshipId: string;
}

/**
 * Normalize a public font source (a plain URL like '/fonts/Gelasio.woff2') to the CSS `url(...)`
 * source the FontFace constructor expects. An already-`url(...)` value is left unchanged.
 */
function toCssFontSource(url: string): string {
  return /^\s*url\(/i.test(url) ? url : `url(${JSON.stringify(url)})`;
}

/**
 * Monotonic per-page counter giving each document controller a distinct embedded-font namespace, so
 * the document-unique physical families two controllers mint never collide in the shared FontFaceSet.
 */
let embeddedDocumentCounter = 0;
function nextEmbeddedNamespace(): string {
  embeddedDocumentCounter += 1;
  return `__superdoc_embedded_${embeddedDocumentCounter}__`;
}

/** Reduce a family name to a CSS-identifier-safe token (no spaces/punctuation) for use inside a
 *  physical family name, so the painted `font-family` is a single valid unquoted token. */
function sanitizeFamilyToken(family: string): string {
  return family.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'font';
}

/**
 * The single writer for a document's font state: `map`/`unmap` change the resolver, `add`
 * registers customer faces through the registry, and `preload` loads them. Runtime
 * `superdoc.fonts.*` and config-time `new SuperDoc({ fonts })` route through here, so every
 * mutation shares one orchestration path. Runtime mutations coalesce into one reflow through
 * {@link FontReadinessGate.notifyDocumentFontConfigChanged}; config-time mutations apply before the
 * first measure with no event. A mapping change (`map`/`unmap`) is document-local - the per-document
 * resolver signature busts this document's measure/paint caches and other editors are untouched. A
 * registration (`add`) changes which faces are globally available, so it is flagged to the gate as
 * an availability change (which invalidates the shared caches and bumps the global epoch, like a
 * late load) because the unchanged signature cannot bust them.
 */
export class DocumentFontController {
  readonly #resolver: FontResolver;
  readonly #getGate: () => FontReadinessGate | null;
  readonly #onDocumentFontConfigApplied: () => void;
  readonly #scheduleMicrotask: (callback: () => void) => void;
  #runtimeReflowQueued = false;
  #runtimeReflowToken = 0;
  /**
   * True when the pending coalesced batch included a registration (a font AVAILABILITY change), so
   * the flush tells the gate to invalidate the shared measurement caches. A mapping change alone
   * busts them through the resolver signature; a registration leaves the signature unchanged, so
   * the caches would otherwise keep stale fallback widths for a now-loadable family.
   */
  #runtimeAvailabilityChanged = false;
  /**
   * Release handles for THIS document's embedded faces, in registration order. The registry is shared
   * per FontFaceSet across editors, so cleanup must release exactly the faces this document registered
   * (each disposer removes one specific face); a document swap / teardown calls them all. Emptied on
   * release; replaced wholesale on each {@link applyEmbeddedFaces}.
   */
  readonly #embeddedDisposers: Array<() => void> = [];
  /**
   * This document's embedded-font namespace, unique per controller, so its physical families never
   * collide with another editor's in the shared FontFaceSet.
   */
  readonly #embeddedNamespace = nextEmbeddedNamespace();
  /**
   * Normalized logical family -> this document's unique physical family for it. Dedupes the faces of
   * one embedded family (e.g. Calibri regular + bold) onto a single physical family. Cleared on release.
   */
  readonly #embeddedPhysical = new Map<string, string>();
  /**
   * Per-apply generation, bumped on each {@link applyEmbeddedFaces} that registers a set. Folded into
   * the physical family name: a document swap clears {@link #embeddedPhysical} (resetting the index), so
   * without the generation the next document's first embedded family would re-mint the previous one's
   * physical name and collide on the shared registry's in-flight load/status key.
   */
  #embeddedGeneration = 0;

  constructor(deps: DocumentFontControllerDeps) {
    this.#resolver = deps.resolver;
    this.#getGate = deps.getGate;
    this.#onDocumentFontConfigApplied = deps.onDocumentFontConfigApplied;
    this.#scheduleMicrotask = deps.scheduleMicrotask ?? defaultScheduleMicrotask;
  }

  /**
   * Map logical families to physical render families, e.g. `map({ Georgia: 'Gelasio' })`. Applies
   * every entry, then queues one document reflow - and only if the resolver signature actually
   * changed, so a redundant map (same target already set) neither reflows nor emits. The physical
   * family must be loadable (a bundled substitute, or a face registered via `add`); an
   * unmapped/unloadable target falls back at the gate. Render-only: export keeps the logical name.
   */
  map(mappings: Record<string, string>): void {
    if (this.#applyMappings(mappings)) this.#queueRuntimeReflow();
  }

  /** Remove runtime mappings; each family reverts to its bundled default (or identity). */
  unmap(families: string | string[]): void {
    const before = this.#resolver.signature;
    for (const family of Array.isArray(families) ? families : [families]) {
      this.#resolver.unmap(family);
    }
    this.#reflowIfChanged(before);
  }

  /**
   * Clear all runtime overrides (called on a document swap, so a prior document's mappings do not
   * leak into the next). No reflow here: the swap re-renders the new document from scratch.
   */
  reset(): void {
    this.#cancelPendingRuntimeReflow();
    this.#releaseEmbeddedFaces();
    this.#resolver.reset();
  }

  /** Cancel pending runtime font work and release this document's embedded faces on editor teardown. */
  dispose(): void {
    this.#cancelPendingRuntimeReflow();
    this.#releaseEmbeddedFaces();
  }

  /**
   * Apply initial config before the first layout measure. Mutates the same registry/resolver state
   * as runtime writes, but does not emit `config-change` or request a reflow because the first
   * render has not happened yet. A registration here still clears the shared measure caches (a
   * registration cannot move the resolver signature that would otherwise bust them), so the first
   * measure cannot reuse a stale fallback width another editor instance left in the global cache.
   */
  applyInitialConfig(config: Pick<FontsConfig, 'families' | 'map'> | null | undefined): void {
    this.#cancelPendingRuntimeReflow();
    if (!config) return;
    const registered = this.#registerFamilies(config.families);
    this.#applyMappings(config.map);
    // Mappings need no clear (they move the signature, which busts this document's cache keys); a
    // registration does not, so clear the shared measure caches. No reflow/event: first layout runs
    // against the cleared cache, and other editors are corrected when the face loads.
    if (registered) this.#getGate()?.invalidateCachesForConfigRegistration();
  }

  /**
   * Register the document's embedded fonts (from `SuperConverter.getEmbeddedFontFaces`) as first-class
   * registry faces, BEFORE the first layout measure. Each {@link EmbeddedFontFace.embeddable} face is
   * registered under a DOCUMENT-UNIQUE physical family (e.g. `__superdoc_embedded_3__1_0_Calibri`), and the
   * logical family is bound to it in this document's resolver, so the `registered_face` rung renders the
   * document's real font instead of the bundled substitute (Carlito) - with no resolver special-casing.
   * The FontFaceSet is shared per page, so registering under the logical name would let another document
   * render these bytes; the unique physical name keeps render ownership document-scoped while export and
   * the font report keep the logical name. Non-embeddable faces (Restricted-License, or an unreadable
   * OS/2 table) are skipped: the bundled substitute renders them.
   *
   * Document-scoped: the controller holds a release handle per registered face and frees them on
   * {@link reset} (document swap) / {@link dispose} (teardown), so this document's fonts never leak into
   * the next or into another editor sharing the FontFaceSet. Re-applying replaces the prior embedded
   * set. Like a config-time registration it invalidates the shared measure caches (a registration does
   * not move the resolver signature that would otherwise bust them) but does NOT reflow or emit - the
   * first/next render measures fresh against the now-registered face.
   */
  applyEmbeddedFaces(faces: EmbeddedFontFace[] | null | undefined): void {
    // Replace any prior embedded set (idempotent re-apply): release before re-registering so a repeated
    // call cannot double-register or strand handles.
    this.#releaseEmbeddedFaces();
    if (!faces?.length) return;
    // No registry (no DOM / headless): the document still renders with bundled substitutes. Don't throw
    // here - unlike the user-invoked `fonts.add`, this runs automatically on every document load.
    const registry = this.#getGate()?.resolveRegistry();
    if (!registry) return;
    // New generation per registering apply, so this document's physical families never reuse the prior
    // document's names (which would alias the shared registry's in-flight load/status on a swap).
    this.#embeddedGeneration += 1;
    let registered = false;
    for (const face of faces) {
      if (!face?.embeddable) continue;
      const physicalFamily = this.#physicalFamilyFor(face.family);
      const release = registry.registerOwnedFace({
        family: physicalFamily,
        source: face.source,
        weight: face.weight,
        style: face.style,
      });
      if (release) {
        this.#embeddedDisposers.push(release);
        // Bind logical -> this document's unique physical family so the resolver renders THIS document's
        // bytes (registered_face). Idempotent across the family's faces (regular + bold share it).
        this.#resolver.mapEmbedded(face.family, physicalFamily);
        registered = true;
      }
    }
    if (registered) this.#getGate()?.invalidateCachesForConfigRegistration();
  }

  /** This document's unique physical family for a logical embedded family, assigned once per family
   *  (its faces share it). The per-apply generation + per-family index keep it unique across BOTH a
   *  document swap (generation) and names that sanitize alike within one document (index). */
  #physicalFamilyFor(logicalFamily: string): string {
    const key = logicalFamily.trim().toLowerCase();
    let physical = this.#embeddedPhysical.get(key);
    if (!physical) {
      physical = `${this.#embeddedNamespace}${this.#embeddedGeneration}_${this.#embeddedPhysical.size}_${sanitizeFamilyToken(logicalFamily)}`;
      this.#embeddedPhysical.set(key, physical);
    }
    return physical;
  }

  /**
   * Register custom physical font faces (e.g. a customer's Gelasio woff2s) so they become loadable
   * and mappable. Registers only - it does NOT map (call {@link map} for that). Idempotent per
   * face; a different source for an already-registered family|weight|style throws (the registry is
   * the guard). v1 sources are URLs. Registration changes which faces are available, so it reflows
   * this document once and invalidates the shared measurement caches (the resolver signature is
   * unchanged, so it cannot bust them on its own): the gate re-plans, awaits any newly-registered
   * face the document already uses, and re-measures it against the real font instead of stale
   * fallback widths. Export is unaffected (mapping/render only).
   */
  add(families: FontFamilyConfig[]): void {
    // Register face-by-face. A later face with a conflicting source throws, but faces already
    // committed to the registry must still trigger the availability reflow - otherwise a
    // now-loadable face the document uses keeps its stale fallback widths until an unrelated
    // reflow. Track per-face commits so `finally` reflows for whatever landed, then re-throw.
    let committed = false;
    try {
      this.#registerFamilies(families, () => {
        committed = true;
      });
    } finally {
      if (committed) {
        this.#runtimeAvailabilityChanged = true;
        this.#queueRuntimeReflow();
      }
    }
  }

  #registerFamilies(families: FontFamilyConfig[] | null | undefined, onFaceRegistered?: () => void): boolean {
    if (!families?.length) return false;
    const registry = this.#getGate()?.resolveRegistry();
    if (!registry) throw new Error('[superdoc] fonts.add: the font registry is not ready yet');
    let changed = false;
    for (const entry of families) {
      const family = entry?.family;
      const faces = entry?.faces;
      if (typeof family !== 'string' || !family.trim()) {
        throw new Error('[superdoc] fonts.add: each family needs a non-empty "family" name');
      }
      if (!Array.isArray(faces) || faces.length === 0) {
        throw new Error(`[superdoc] fonts.add: family "${family}" needs at least one face in "faces"`);
      }
      for (const face of faces) {
        if (!face || typeof face.source !== 'string' || !face.source.trim()) {
          throw new Error(`[superdoc] fonts.add: family "${family}" has a face with no "source" URL`);
        }
        const result = registry.register({
          family,
          source: toCssFontSource(face.source),
          descriptors: { weight: face.weight == null ? undefined : String(face.weight), style: face.style },
        });
        if (result.changed) {
          changed = true;
          onFaceRegistered?.();
        }
      }
    }
    return changed;
  }

  /**
   * Proactively load the physical faces for the given LOGICAL families so they are ready before the
   * document needs them (avoiding a late-load reflow). Resolves each logical family through THIS
   * document's resolver, then awaits its regular (400/normal) face via the registry. Async by
   * design - loading is not hidden inside {@link map}. Weighted/italic variants load on demand.
   */
  async preload(families: string[]): Promise<void> {
    if (!Array.isArray(families)) {
      throw new Error('[superdoc] fonts.preload expects an array of logical family names, e.g. preload(["Georgia"])');
    }
    const registry = this.#getGate()?.resolveRegistry();
    if (!registry) throw new Error('[superdoc] fonts.preload: the font registry is not ready yet');
    // Resolve the regular face through the provider-precedence ladder, not the family-level bundled
    // map: if the document registered a real face for this family, preload THAT, not the clone.
    const hasFace = (family: string, weight: '400' | '700', style: 'normal' | 'italic'): boolean =>
      registry.hasFace(family, weight, style);
    const face = { weight: '400', style: 'normal' } as const;
    const requests: FontFaceRequest[] = families.map((logical) => ({
      family: this.#resolver.resolveFace(logical, face, hasFace).physicalFamily,
      weight: '400',
      style: 'normal',
    }));
    await registry.awaitFaceRequests(requests);
  }

  /**
   * Reflow the document once iff the signature changed since `signatureBefore`. A no-op mutation
   * (signature unchanged) must not reflow or emit.
   */
  #reflowIfChanged(signatureBefore: string): void {
    if (this.#resolver.signature !== signatureBefore) this.#queueRuntimeReflow();
  }

  #applyMappings(mappings: Record<string, string> | null | undefined): boolean {
    if (!mappings) return false;
    const before = this.#resolver.signature;
    for (const [logicalFamily, physicalFamily] of Object.entries(mappings)) {
      this.#resolver.map(logicalFamily, physicalFamily);
    }
    return this.#resolver.signature !== before;
  }

  /**
   * Runtime writes can arrive as `add(); map();` in the same tick. Coalesce them so consumers see
   * one `config-change` report and the editor performs one document-local reflow.
   */
  #queueRuntimeReflow(): void {
    if (this.#runtimeReflowQueued) return;
    this.#runtimeReflowQueued = true;
    const token = ++this.#runtimeReflowToken;
    this.#scheduleMicrotask(() => {
      if (!this.#runtimeReflowQueued || token !== this.#runtimeReflowToken) return;
      this.#runtimeReflowQueued = false;
      const availabilityChanged = this.#runtimeAvailabilityChanged;
      this.#runtimeAvailabilityChanged = false;
      this.#onDocumentFontConfigApplied();
      this.#getGate()?.notifyDocumentFontConfigChanged({ availabilityChanged });
    });
  }

  #cancelPendingRuntimeReflow(): void {
    this.#runtimeAvailabilityChanged = false;
    if (!this.#runtimeReflowQueued) return;
    this.#runtimeReflowQueued = false;
    this.#runtimeReflowToken += 1;
  }

  /** Release every embedded face this document registered (each disposer removes one specific face) and
   *  drop the resolver bindings, so neither the FontFaceSet nor the resolver retains this document's
   *  embedded fonts. Safe to call repeatedly; the disposers are idempotent. */
  #releaseEmbeddedFaces(): void {
    for (const release of this.#embeddedDisposers) release();
    this.#embeddedDisposers.length = 0;
    this.#embeddedPhysical.clear();
    this.#resolver.clearEmbedded();
  }
}

function defaultScheduleMicrotask(callback: () => void): void {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(callback);
    return;
  }
  void Promise.resolve().then(callback);
}
