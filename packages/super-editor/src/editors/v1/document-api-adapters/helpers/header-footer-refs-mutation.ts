import type {
  HeaderFooterKind,
  HeaderFooterVariant,
  SectionAddress,
  SectionMutationResult,
} from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type { SectionProjection } from './sections-resolver.js';
import {
  getSectPrHeaderFooterRef,
  setSectPrHeaderFooterRef,
  clearSectPrHeaderFooterRef,
  readSectPrHeaderFooterRefs,
  type XmlElement,
} from './sections-xml.js';
import {
  createHeaderFooterPart,
  hasHeaderFooterRelationship,
  type ConverterWithHeaderFooterParts,
} from './header-footer-parts.js';
import { readTargetSectPr } from './section-projection-access.js';

// ---------------------------------------------------------------------------
// Shared resolver
// ---------------------------------------------------------------------------

/**
 * Walk the section chain to find the effective header/footer ref.
 * Tries the requested variant at each section, falling back to 'default'.
 * Returns null if no ref found in any section.
 */
export function resolveEffectiveRef(
  editor: Editor,
  sections: SectionProjection[],
  startSectionIndex: number,
  kind: HeaderFooterKind,
  variant: HeaderFooterVariant,
): { refId: string; resolvedFromSection: SectionAddress; resolvedVariant: HeaderFooterVariant } | null {
  // Walk previous sections in descending index order (toward section 0)
  for (let i = startSectionIndex - 1; i >= 0; i--) {
    const section = sections.find((s) => s.range.sectionIndex === i);
    if (!section) continue;

    const sectPr = readTargetSectPr(editor, section);
    if (!sectPr) continue;

    const refs = readSectPrHeaderFooterRefs(sectPr, kind);
    if (!refs) continue;

    // Try exact variant first
    if (refs[variant]) {
      return {
        refId: refs[variant]!,
        resolvedFromSection: section.address,
        resolvedVariant: variant,
      };
    }

    // Fall back to 'default' (only for non-default requests)
    if (variant !== 'default' && refs.default) {
      return {
        refId: refs.default,
        resolvedFromSection: section.address,
        resolvedVariant: 'default',
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Inner mutation callbacks
// ---------------------------------------------------------------------------

function getConverter(editor: Editor): ConverterWithHeaderFooterParts | undefined {
  return (editor as unknown as { converter?: ConverterWithHeaderFooterParts }).converter;
}

/**
 * Inner mutation for setting an explicit header/footer ref on a sectPr.
 * Returns a failure result to short-circuit, or void to let the outer wrapper detect changes.
 */
export function setHeaderFooterRefMutation(
  sectPr: XmlElement,
  kind: HeaderFooterKind,
  variant: HeaderFooterVariant,
  refId: string,
  converter: ConverterWithHeaderFooterParts | null,
  operationName: string,
  dryRun = false,
): SectionMutationResult | void {
  if (!converter) {
    return {
      success: false,
      failure: {
        code: 'CAPABILITY_UNAVAILABLE',
        message: `${operationName} requires an active document converter to validate relationship references.`,
      },
    };
  }

  const relationshipExists = hasHeaderFooterRelationship(converter, { kind, refId });
  if (!relationshipExists) {
    return {
      success: false,
      failure: {
        code: 'INVALID_TARGET',
        message: `${operationName} could not find ${kind} relationship "${refId}" in word/_rels/document.xml.rels.`,
      },
    };
  }

  const currentRef = getSectPrHeaderFooterRef(sectPr, kind, variant);
  if (currentRef === refId) {
    return {
      success: false,
      failure: { code: 'NO_OP', message: `${operationName} already matches the requested reference.` },
    };
  }

  setSectPrHeaderFooterRef(sectPr, kind, variant, refId);

  // Variant-pointer reconciliation (skip during dry-run to avoid leaking state)
  if (!dryRun) {
    reconcileVariantPointerOnSet(converter, kind, variant, refId);
  }
}

/**
 * Inner mutation for clearing an explicit header/footer ref from a sectPr.
 * Also reconciles variant pointers on HeaderFooterVariantIds.
 */
export function clearHeaderFooterRefMutation(
  sectPr: XmlElement,
  kind: HeaderFooterKind,
  variant: HeaderFooterVariant,
  converter: ConverterWithHeaderFooterParts | null,
  dryRun = false,
): void {
  const currentRef = getSectPrHeaderFooterRef(sectPr, kind, variant);
  clearSectPrHeaderFooterRef(sectPr, kind, variant);

  // Variant-pointer reconciliation: clear matching named keys (skip during dry-run)
  if (!dryRun && currentRef && converter) {
    reconcileVariantPointerOnClear(converter, kind, currentRef);
  }
}

/**
 * Inner mutation for link/unlink behavior.
 * For linked=true: removes explicit ref.
 * For linked=false: uses resolveEffectiveRef to walk the full chain, then clones.
 */
export function setLinkedToPreviousMutation(
  sectPr: XmlElement,
  projection: SectionProjection,
  sections: SectionProjection[],
  kind: HeaderFooterKind,
  variant: HeaderFooterVariant,
  linked: boolean,
  editor: Editor,
  dryRun: boolean,
  operationName: string,
): SectionMutationResult | void {
  if (projection.range.sectionIndex === 0) {
    return {
      success: false,
      failure: { code: 'INVALID_TARGET', message: `${operationName} cannot target the first section.` },
    };
  }

  if (linked) {
    const clearedRef = getSectPrHeaderFooterRef(sectPr, kind, variant);
    const removed = clearSectPrHeaderFooterRef(sectPr, kind, variant);
    if (!removed) {
      return {
        success: false,
        failure: { code: 'NO_OP', message: `${operationName} found no explicit reference to remove.` },
      };
    }
    // Variant-pointer reconciliation on clear (skip during dry-run)
    if (!dryRun && clearedRef) {
      const converter = getConverter(editor);
      if (converter) {
        reconcileVariantPointerOnClear(converter, kind, clearedRef);
      }
    }
    return;
  }

  // linked === false: ensure explicit ref exists
  const existing = getSectPrHeaderFooterRef(sectPr, kind, variant);
  if (existing) {
    return {
      success: false,
      failure: { code: 'NO_OP', message: `${operationName} already has an explicit reference.` },
    };
  }

  // Walk the full chain to find effective source
  const resolved = resolveEffectiveRef(editor, sections, projection.range.sectionIndex, kind, variant);

  // During dry-run, skip part allocation
  if (dryRun) {
    setSectPrHeaderFooterRef(sectPr, kind, variant, '(dry-run)');
    return;
  }

  const explicitRefId = createExplicitHeaderFooterReference(editor, {
    kind,
    sourceRefId: resolved?.refId,
  });
  if (!explicitRefId) {
    // Fall back to reusing the inherited ref when the converter is unavailable
    // (e.g. non-converter editor sessions). This preserves the prior behavior
    // where unlinking a section reused the resolved reference directly.
    if (resolved?.refId) {
      setSectPrHeaderFooterRef(sectPr, kind, variant, resolved.refId);
      return;
    }
    return {
      success: false,
      failure: {
        code: 'CAPABILITY_UNAVAILABLE',
        message: `${operationName} could not allocate an explicit header/footer reference for this section.`,
      },
    };
  }

  setSectPrHeaderFooterRef(sectPr, kind, variant, explicitRefId);

  // Variant-pointer reconciliation
  const converter = getConverter(editor);
  if (converter) {
    reconcileVariantPointerOnSet(converter, kind, variant, explicitRefId);
  }
}

/**
 * Allocate an explicit header/footer reference, creating a new part.
 */
export function createExplicitHeaderFooterReference(
  editor: Editor,
  input: { kind: HeaderFooterKind; sourceRefId?: string },
): string | null {
  const converter = getConverter(editor);
  if (!converter) {
    return null;
  }

  try {
    // Create part without variant tracking (decoupled per SD-2162 design)
    const { refId } = createHeaderFooterPart(editor, {
      kind: input.kind,
      variant: 'default', // placeholder — variant tracking is done separately via reconcileVariantPointerOnSet
      sourceRefId: input.sourceRefId,
    });
    return refId;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Variant-pointer reconciliation helpers
// ---------------------------------------------------------------------------

interface HeaderFooterVariantIds {
  default?: string | null;
  first?: string | null;
  even?: string | null;
  odd?: string | null;
  ids?: string[];
}

function getVariantIds(converter: ConverterWithHeaderFooterParts, kind: HeaderFooterKind): HeaderFooterVariantIds {
  if (kind === 'header') {
    if (!converter.headerIds || typeof converter.headerIds !== 'object') converter.headerIds = {};
    return converter.headerIds as HeaderFooterVariantIds;
  }
  if (!converter.footerIds || typeof converter.footerIds !== 'object') converter.footerIds = {};
  return converter.footerIds as HeaderFooterVariantIds;
}

function reconcileVariantPointerOnSet(
  converter: ConverterWithHeaderFooterParts,
  kind: HeaderFooterKind,
  variant: HeaderFooterVariant,
  refId: string,
): void {
  const variantIds = getVariantIds(converter, kind);
  (variantIds as Record<string, unknown>)[variant] = refId;
}

function reconcileVariantPointerOnClear(
  converter: ConverterWithHeaderFooterParts,
  kind: HeaderFooterKind,
  clearedRefId: string,
): void {
  const variantIds = getVariantIds(converter, kind);
  const namedKeys: Array<keyof HeaderFooterVariantIds> = ['default', 'first', 'even', 'odd'];
  for (const key of namedKeys) {
    if (variantIds[key] === clearedRefId) {
      (variantIds as Record<string, unknown>)[key] = null;
    }
  }
}
