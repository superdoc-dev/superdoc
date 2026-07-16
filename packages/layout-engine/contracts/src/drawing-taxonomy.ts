/**
 * Frozen drawing support taxonomy and contract map.
 *
 * This file is the canonical, machine-checkable home for the drawing support
 * taxonomy: the authoritative supported / fail-closed / deferred
 * classification, the layout-contract target for every supported family, and
 * the canonical diagnostic codes for every fail-closed family.
 *
 * Boundary rules (binding), mirroring `placeholder.ts`:
 *
 * - Layout-engine packages only. This file MUST NOT import any v2 runtime
 *   package (or v1 editor/ProseMirror runtime). It is consumed by the
 *   neutral OOXML drawing extractor, the v2 layout adapter projection, the
 *   host media resolver, and the Labs proof oracles. The
 *   architecture-boundaries test enforces the import direction; see
 *   `tests/src/architecture-boundaries.test.ts`.
 * - Data-and-types only. This file describes WHAT is supported and HOW it maps
 *   to existing contracts. It performs no OOXML parsing, no projection, and no
 *   rendering. Behavioral wiring lives in the extractor/projection/painter
 *   layers.
 * - Frozen. Adding a family, changing a classification, or adding a
 *   diagnostic code requires a deliberate, documented decision that cites
 *   the proof it unlocks.
 */

import type { DrawingKind } from './index.js';

// ---------------------------------------------------------------------------
// Support classification
// ---------------------------------------------------------------------------

/**
 * How a visual-object family is treated by drawing rendering.
 *
 * - `supported`: projected into a real layout contract and rendered.
 * - `fail-closed`: preserved for save/reopen, never silently dropped, and
 *   surfaced with a named diagnostic + placeholder instead of guessed output.
 * - `deferred`: explicitly out of current scope; no support claim is made and
 *   no rendering path is added unless a later plan pulls it in.
 */
export type DrawingSupportLevel = 'supported' | 'fail-closed' | 'deferred';

/**
 * Existing layout-contract target a supported family projects into. `none`
 * marks families that are policies (e.g. `mc:AlternateContent` traversal) or
 * have no layout target (fail-closed / deferred families).
 *
 * The string values intentionally match the public layout contract names in
 * `index.ts` so the taxonomy is greppable against the real contracts.
 */
export type DrawingContractTarget =
  | 'ImageRun'
  | 'ImageBlock'
  | 'ImageDrawing'
  | 'DrawingBlock'
  | 'selected-choice'
  | 'none';

/**
 * The `DrawingBlock` discriminant a supported drawing family maps to, when its
 * contract target is `DrawingBlock`. Reuses the layout contract `DrawingKind`
 * union so the taxonomy cannot drift from the painter's accepted kinds.
 */
export type DrawingTaxonomyDrawingKind = Extract<DrawingKind, 'vectorShape' | 'shapeGroup' | 'image' | 'chart'>;

// ---------------------------------------------------------------------------
// Canonical diagnostic codes (plan §4)
// ---------------------------------------------------------------------------

/**
 * Frozen canonical diagnostic codes for drawing rendering.
 *
 * New extractor/adapter diagnostics MUST use these exact strings. Family-
 * specific codes are required — do not collapse everything to
 * `render.unsupported-inline-ooxml` (plan §4).
 */
export const DRAWING_DIAGNOSTIC_CODES = {
  /** External image relationship (`r:link` / `TargetMode="External"`). Not fetched. */
  externalImageDeferred: 'render.media.external-image-deferred',
  /** Drawing references a relationship id that does not exist on the owner part. */
  missingRelationship: 'render.drawing.missing-relationship',
  /** Relationship resolves but the target media part bytes are missing/empty. */
  missingMediaPart: 'render.media.missing-part',
  /** Relationship exists but is not an image relationship type. */
  unsupportedRelationshipType: 'render.drawing.unsupported-relationship-type',
  /** Media MIME is not in the supported allowlist. */
  unsupportedMime: 'render.media.unsupported-mime',
  /** Media part exceeds the host byte-size policy before bytes are materialized. */
  imageTooLarge: 'render.media.image-too-large',
  /** SVG content rejected by the SVG safety policy. */
  unsafeSvg: 'render.media.unsafe-svg',
  /** Metafile / TIFF (EMF, WMF, TIFF) with no approved conversion path. */
  unsupportedFormat: 'render.media.unsupported-format',
  /** OLE / ActiveX / embedded package object. */
  embeddedObjectNotSupported: 'render.embedded-object-not-supported',
  /** SmartArt / diagram / unknown external graphic-data object. */
  unsupportedObject: 'render.drawing.unsupported-object',
  /** VML structure outside any supported image-like subset. */
  vmlUnsupported: 'render.drawing.vml-unsupported',
  /** VML image-like content that could not be promoted to a supported image. */
  vmlImageUnsupported: 'render.drawing.vml-image-unsupported',
  /** Custom geometry command the extractor does not implement (e.g. `arcTo`). */
  unsupportedGeometryCommand: 'render.drawing.unsupported-geometry-command',
  /** Anchor fields required for honest placement are unsupported. */
  anchorUnsupported: 'render.drawing.anchor-unsupported',
  /** Wrap fields required for honest placement are unsupported. */
  wrapUnsupported: 'render.drawing.wrap-unsupported',
  /** `mc:AlternateContent` had no supported choice and no usable fallback. */
  altContentNoSupportedChoice: 'render.drawing.altcontent-no-supported-choice',
  /** A child of an otherwise-supported group is unsupported. */
  groupChildUnsupported: 'render.drawing.group-child-unsupported',
  /** Chart object (fail-closed by decision). */
  chartNotSupported: 'render.chart-not-supported',
} as const;

export type DrawingDiagnosticCode = (typeof DRAWING_DIAGNOSTIC_CODES)[keyof typeof DRAWING_DIAGNOSTIC_CODES];

/**
 * Existing pre-Phase-15 diagnostic codes that remain valid compatibility
 * aliases (plan §4: "Existing resolver codes can remain compatibility aliases
 * when they already exist"). Each maps to the canonical code it aliases so
 * consumers and the Labs oracles can normalize without renaming live emitters.
 *
 * These remain emitted by the host resolver / adapter for now; the taxonomy does
 * not rename live emitters in this plan. Later plans may converge emitters onto
 * the canonical codes, but the aliases must keep resolving here until then.
 */
export const DRAWING_DIAGNOSTIC_CODE_ALIASES: Readonly<Record<string, DrawingDiagnosticCode>> = {
  // Host resolver (create-v2-render-context.ts) — owner-scoped media resolution.
  'render.media.missing-relationship': DRAWING_DIAGNOSTIC_CODES.missingRelationship,
  'render.media.wrong-relationship-type': DRAWING_DIAGNOSTIC_CODES.unsupportedRelationshipType,
  'render.media.unsupported-target': DRAWING_DIAGNOSTIC_CODES.unsupportedRelationshipType,
  'render.media.invalid-image-size': DRAWING_DIAGNOSTIC_CODES.imageTooLarge,
  // Generic adapter fallbacks (project-blocks.ts) for inline drawings without a
  // resolved media source or a recognized object family.
  'render.media-resolver-unavailable': DRAWING_DIAGNOSTIC_CODES.missingMediaPart,
  // Existing textbox VML probe — narrower than the drawing-family VML code.
  'render.textbox.vml-unsupported': DRAWING_DIAGNOSTIC_CODES.vmlUnsupported,
} as const;

// ---------------------------------------------------------------------------
// Family taxonomy
// ---------------------------------------------------------------------------

/**
 * Every visual-object family the taxonomy classifies. Names are stable identifiers
 * used by the extractor, adapter diagnostics, Labs summaries, and the closeout
 * support matrix.
 */
export type DrawingFamily =
  // Supported by close (plan §3).
  | 'inlineBitmap'
  | 'anchoredBitmap'
  | 'imageChildInGroup'
  | 'vectorShape'
  | 'shapeGroup'
  | 'alternateContent'
  // Fail-closed families (plan §4).
  | 'externalImage'
  | 'missingRelationship'
  | 'missingMediaPart'
  | 'wrongRelationshipType'
  | 'unsupportedMime'
  | 'oversizedMediaPart'
  | 'unsafeSvg'
  | 'metafileOrTiff'
  | 'embeddedObject'
  | 'smartArtOrDiagram'
  | 'vml'
  | 'vmlImageLike'
  | 'unsupportedGeometryCommand'
  | 'unsupportedAnchorFields'
  | 'unsupportedWrapFields'
  | 'alternateContentNoSupportedChoice'
  | 'groupChildUnsupported'
  | 'chart'
  // Deferred families (overview §5, plan acceptance §9).
  | 'objectEditing'
  | 'customWrapPolygon'
  | 'chartFidelity'
  | 'vmlFidelity'
  | 'decorativeAccessibilityUi';

/** Frozen classification record for a single visual-object family. */
export interface DrawingFamilySpec {
  readonly family: DrawingFamily;
  readonly support: DrawingSupportLevel;
  /** Human-facing one-line description for matrices and diagnostics. */
  readonly description: string;
  /** Layout-contract target for supported families; `none` otherwise. */
  readonly contract: DrawingContractTarget;
  /** `DrawingBlock` discriminant when `contract === 'DrawingBlock'`. */
  readonly drawingKind?: DrawingTaxonomyDrawingKind;
  /** Canonical diagnostic code for fail-closed families. */
  readonly diagnostic?: DrawingDiagnosticCode;
}

/**
 * The frozen drawing support taxonomy.
 *
 * Invariants (enforced by `drawing-taxonomy.test.ts`):
 * - every `supported` family has a real contract target (`!== 'none'`);
 * - every `DrawingBlock`-targeted family declares a `drawingKind`;
 * - every `fail-closed` family declares a canonical `diagnostic`;
 * - every canonical diagnostic code is referenced by at least one fail-closed
 *   family;
 * - `deferred` families make no support claim (`contract: 'none'`, no
 *   diagnostic).
 */
export const DRAWING_SUPPORT_TAXONOMY: Readonly<Record<DrawingFamily, DrawingFamilySpec>> = {
  // -- Supported (plan §3) --------------------------------------------------
  inlineBitmap: {
    family: 'inlineBitmap',
    support: 'supported',
    description:
      'wp:inline pic:pic with internal media and browser-safe MIME (PNG/JPEG; WebP/SVG once the host media resolver lands).',
    contract: 'ImageRun',
  },
  anchoredBitmap: {
    family: 'anchoredBitmap',
    support: 'supported',
    description: 'wp:anchor bitmap with anchor/wrap expressible by ImageAnchor/ImageWrap. Never silently inlined.',
    contract: 'ImageBlock',
  },
  imageChildInGroup: {
    family: 'imageChildInGroup',
    support: 'supported',
    description: 'Bitmap child of a supported DrawingML group/drawing wrapper. Supported only when the parent is.',
    contract: 'ImageDrawing',
  },
  vectorShape: {
    family: 'vectorShape',
    support: 'supported',
    description: 'Block/floating DrawingML preset/custom shape with the supported geometry/style subset.',
    contract: 'DrawingBlock',
    drawingKind: 'vectorShape',
  },
  shapeGroup: {
    family: 'shapeGroup',
    support: 'supported',
    description: 'DrawingML group whose rendered children are supported vector/image children.',
    contract: 'DrawingBlock',
    drawingKind: 'shapeGroup',
  },
  alternateContent: {
    family: 'alternateContent',
    support: 'supported',
    description:
      'mc:AlternateContent traversal/select policy. Selected Choice/Fallback maps to its family contract; ' +
      'unselected branches preserved for save/reopen.',
    contract: 'selected-choice',
  },

  // -- Fail-closed (plan §4) ------------------------------------------------
  externalImage: {
    family: 'externalImage',
    support: 'fail-closed',
    description: 'External image relationship (r:link / TargetMode="External"). Not fetched.',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.externalImageDeferred,
  },
  missingRelationship: {
    family: 'missingRelationship',
    support: 'fail-closed',
    description: 'Drawing references a relationship id absent from the owner part .rels.',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.missingRelationship,
  },
  missingMediaPart: {
    family: 'missingMediaPart',
    support: 'fail-closed',
    description: 'Relationship resolves but the target media part bytes are missing or empty.',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.missingMediaPart,
  },
  wrongRelationshipType: {
    family: 'wrongRelationshipType',
    support: 'fail-closed',
    description: 'Relationship exists but is not an image relationship type.',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.unsupportedRelationshipType,
  },
  unsupportedMime: {
    family: 'unsupportedMime',
    support: 'fail-closed',
    description: 'Media MIME outside the supported allowlist (incl. GIF/BMP/ICO).',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.unsupportedMime,
  },
  oversizedMediaPart: {
    family: 'oversizedMediaPart',
    support: 'fail-closed',
    description: 'Media part exceeds the host byte-size policy before bytes are materialized.',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.imageTooLarge,
  },
  unsafeSvg: {
    family: 'unsafeSvg',
    support: 'fail-closed',
    description: 'SVG content rejected by the SVG safety policy.',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.unsafeSvg,
  },
  metafileOrTiff: {
    family: 'metafileOrTiff',
    support: 'fail-closed',
    description: 'EMF/WMF/TIFF and other non-browser-native formats with no approved conversion path.',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.unsupportedFormat,
  },
  embeddedObject: {
    family: 'embeddedObject',
    support: 'fail-closed',
    description: 'OLE / ActiveX / embedded package object.',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.embeddedObjectNotSupported,
  },
  smartArtOrDiagram: {
    family: 'smartArtOrDiagram',
    support: 'fail-closed',
    description: 'SmartArt / diagram / unknown external graphic-data object.',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.unsupportedObject,
  },
  vml: {
    family: 'vml',
    support: 'fail-closed',
    description: 'VML structure outside any supported image-like subset (default fail-closed policy).',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.vmlUnsupported,
  },
  vmlImageLike: {
    family: 'vmlImageLike',
    support: 'fail-closed',
    description:
      'Simple VML image references (v:imagedata) / watermark image metadata. Fail-closed unless a later ' +
      'change promotes a named subset with deterministic fixtures and exact oracles.',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.vmlImageUnsupported,
  },
  unsupportedGeometryCommand: {
    family: 'unsupportedGeometryCommand',
    support: 'fail-closed',
    description: 'Custom geometry command the extractor does not implement, e.g. arcTo.',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.unsupportedGeometryCommand,
  },
  unsupportedAnchorFields: {
    family: 'unsupportedAnchorFields',
    support: 'fail-closed',
    description: 'Anchor fields required for honest placement are unsupported (char-relative, alignment modes, etc.).',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.anchorUnsupported,
  },
  unsupportedWrapFields: {
    family: 'unsupportedWrapFields',
    support: 'fail-closed',
    description: 'Wrap fields required for honest placement are unsupported (arbitrary wrap polygons, etc.).',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.wrapUnsupported,
  },
  alternateContentNoSupportedChoice: {
    family: 'alternateContentNoSupportedChoice',
    support: 'fail-closed',
    description: 'mc:AlternateContent with no supported choice and no usable fallback.',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.altContentNoSupportedChoice,
  },
  groupChildUnsupported: {
    family: 'groupChildUnsupported',
    support: 'fail-closed',
    description: 'Unsupported child inside an otherwise-supported group. Supported siblings are not dropped.',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.groupChildUnsupported,
  },
  chart: {
    family: 'chart',
    support: 'fail-closed',
    description: 'Chart object. Fail-closed by decision; source payload preserved for save/reopen.',
    contract: 'none',
    diagnostic: DRAWING_DIAGNOSTIC_CODES.chartNotSupported,
  },

  // -- Deferred (overview §5) ----------------------------------------------
  objectEditing: {
    family: 'objectEditing',
    support: 'deferred',
    description: 'Editing/mutation of anchored/vector objects.',
    contract: 'none',
  },
  customWrapPolygon: {
    family: 'customWrapPolygon',
    support: 'deferred',
    description: 'Full Word-compatible text wrapping for arbitrary custom wrap polygons.',
    contract: 'none',
  },
  chartFidelity: {
    family: 'chartFidelity',
    support: 'deferred',
    description: 'Complete chart fidelity (a dedicated chart effort owns the parsed subset).',
    contract: 'none',
  },
  vmlFidelity: {
    family: 'vmlFidelity',
    support: 'deferred',
    description: 'Complete VML fidelity.',
    contract: 'none',
  },
  decorativeAccessibilityUi: {
    family: 'decorativeAccessibilityUi',
    support: 'deferred',
    description: 'Full accessibility UI for decorative image semantics beyond preserving source data.',
    contract: 'none',
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers (pure lookups)
// ---------------------------------------------------------------------------

/** Every classified family, in declaration order. */
export const DRAWING_FAMILIES = Object.keys(DRAWING_SUPPORT_TAXONOMY) as readonly DrawingFamily[];

/** Resolve a family's frozen classification spec. */
export function getDrawingFamilySpec(family: DrawingFamily): DrawingFamilySpec {
  return DRAWING_SUPPORT_TAXONOMY[family];
}

/** True when the family renders into a real layout contract. */
export function isSupportedDrawingFamily(family: DrawingFamily): boolean {
  return DRAWING_SUPPORT_TAXONOMY[family].support === 'supported';
}

/**
 * Normalize a possibly-aliased diagnostic code to its canonical code.
 * Returns the canonical code when `code` is itself canonical, the aliased
 * canonical code when `code` is a known compatibility alias, or `null` when the
 * code is outside the drawing diagnostic vocabulary.
 */
export function canonicalDrawingDiagnosticCode(code: string): DrawingDiagnosticCode | null {
  const canonical = (Object.values(DRAWING_DIAGNOSTIC_CODES) as string[]).includes(code);
  if (canonical) return code as DrawingDiagnosticCode;
  return DRAWING_DIAGNOSTIC_CODE_ALIASES[code] ?? null;
}
