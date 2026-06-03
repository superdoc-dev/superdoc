/**
 * Font-system contracts shared across the SuperDoc rendering pipeline.
 *
 * This package owns the *runtime* font concern - which faces exist, whether they
 * have loaded, and (later) how a logical Word family maps to the physical family
 * that is actually measured and painted. It is deliberately separate from
 * `@superdoc/font-utils`, which only composes CSS `font-family` fallback strings
 * and has no notion of loading or readiness.
 *
 * The load-state model below is the contract the load-before-measure gate (T3)
 * awaits: the gate must never measure text in a face that has not settled, or
 * pagination drifts on first paint and then reflows once the font arrives.
 */

/**
 * Outcome of trying to make a single font family available for measurement.
 *
 * `loaded` and `fallback_used` are both *terminal success* for the gate: in both
 * cases measurement may proceed deterministically. The difference is diagnostic -
 * `fallback_used` means no real face was available under that family name, so the
 * browser will substitute a generic fallback (and the renderer should record it).
 */
export type FontLoadStatus =
  /** Registered or otherwise known, but no load has been attempted yet. */
  | 'unloaded'
  /** A load is in flight. */
  | 'loading'
  /** A real face for this family is available in the font set; safe to measure. */
  | 'loaded'
  /** A matching face was found but its load rejected (e.g. network/decoding error). */
  | 'failed'
  /** The load did not settle within the gate's per-font time budget. */
  | 'timed_out'
  /** No face is available for this family; rendering will fall back to a generic. */
  | 'fallback_used';

/** Statuses in which the gate may proceed to measure without waiting further. */
export const SETTLED_STATUSES: readonly FontLoadStatus[] = ['loaded', 'failed', 'timed_out', 'fallback_used'];

/** True when a status is terminal for the gate (no reason to keep awaiting). */
export function isSettled(status: FontLoadStatus): boolean {
  return SETTLED_STATUSES.includes(status);
}

/** Binary sources a browser `FontFace` accepts, plus a plain URL string. */
export type FontFaceSource = string | ArrayBuffer | ArrayBufferView;

/** Everything needed to register one managed face (bundled substitute, customer BYO, ...). */
export interface FontFaceDescriptor {
  /** Logical/registered family name the document refers to, e.g. "Carlito". */
  family: string;
  /** A URL string (`https://...` or `url(...)`) or font bytes the FontFace can load. */
  source: FontFaceSource;
  /** Optional weight/style/etc. descriptors passed straight to the FontFace. */
  descriptors?: FontFaceDescriptors;
}

/** A family the registry manages, with its current load state. */
export interface RegisteredFace {
  family: string;
  status: FontLoadStatus;
}

/** Result of awaiting one required family. */
export interface FontLoadResult {
  family: string;
  status: FontLoadStatus;
}

/**
 * A specific physical font FACE the layout actually uses: family + weight + style.
 *
 * The gate must await faces, not families: `document.fonts.load('16px "Carlito"')` loads
 * ONLY the regular (400/normal) face, so bold/italic text would otherwise measure against
 * the regular face's advances (or a synthesized faux-bold) and reflow once the real face
 * arrives. `weight`/`style` are normalized tokens (the bundled pack ships 400/700 ×
 * normal/italic; the run model is binary bold/italic, so these four cover it - numeric
 * weights are a follow-up). The planner builds these from layout runs; the registry awaits
 * each one with a weight/style-specific probe.
 */
export interface FontFaceRequest {
  /** Physical (resolved) family, e.g. "Carlito". */
  family: string;
  weight: '400' | '700';
  style: 'normal' | 'italic';
}

/** Result of awaiting one required face. */
export interface FontFaceLoadResult {
  request: FontFaceRequest;
  status: FontLoadStatus;
}

/**
 * Aggregate outcome of one readiness pass: the per-family results plus their counts.
 * `loaded + fallbackUsed + failed + timedOut` equals the number of distinct required
 * (physical) families. Carried on the public `fonts-changed` payload.
 */
export interface FontLoadSummary {
  loaded: number;
  failed: number;
  timedOut: number;
  fallbackUsed: number;
  results: FontLoadResult[];
}

/**
 * Context for resolving one bundled font asset's served URL, passed to a consumer's
 * `fonts.resolveAssetUrl`. `source` is the provider kind so the same resolver contract
 * can extend to customer/embedded fonts later.
 */
export interface FontAssetUrlContext {
  /** Asset filename, e.g. `Carlito-Regular.woff2`. */
  file: string;
  /** Physical family, e.g. `Carlito`. */
  family: string;
  /** CSS weight token, `400` or `700`. */
  weight: string;
  style: 'normal' | 'italic';
  source: 'bundled-substitute';
}

/** Resolve a font asset's served URL. Synchronous: font registration stays deterministic. */
export type FontAssetUrlResolver = (context: FontAssetUrlContext) => string;

/**
 * A required family paired with a promise that settles when its load resolves.
 * The gate can either `await` the promises or read `status` synchronously for a
 * face it already knows about.
 */
export interface RequiredFace {
  family: string;
  status: FontLoadStatus;
  ready: Promise<FontLoadResult>;
}
