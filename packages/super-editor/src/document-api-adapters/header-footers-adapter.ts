import type {
  HeaderFooterKind,
  HeaderFooterVariant,
  HeaderFooterSlotEntry,
  HeaderFooterResolveResult,
  HeaderFooterPartEntry,
  HeaderFootersListQuery,
  HeaderFootersListResult,
  HeaderFootersGetInput,
  HeaderFootersResolveInput,
  HeaderFootersRefsSetInput,
  HeaderFootersRefsClearInput,
  HeaderFootersRefsSetLinkedToPreviousInput,
  HeaderFootersPartsListQuery,
  HeaderFootersPartsListResult,
  HeaderFootersPartsCreateInput,
  HeaderFootersPartsDeleteInput,
  HeaderFooterPartsMutationResult,
  SectionAddress,
  SectionMutationResult,
  MutationOptions,
} from '@superdoc/document-api';
import { buildResolvedHandle, buildDiscoveryItem, buildDiscoveryResult } from '@superdoc/document-api';
import type { Editor } from '../core/Editor.js';
import { DocumentApiAdapterError } from './errors.js';
import { getRevision, checkRevision } from './plan-engine/revision-tracker.js';
import { resolveSectionProjections, type SectionProjection } from './helpers/sections-resolver.js';
import { readTargetSectPr } from './helpers/section-projection-access.js';
import { readSectPrHeaderFooterRefs } from './helpers/sections-xml.js';
import { validatePaginationInput, paginate } from './helpers/adapter-utils.js';
import { sectionMutationBySectPr } from './helpers/section-mutation-wrapper.js';
import {
  resolveEffectiveRef,
  setHeaderFooterRefMutation,
  clearHeaderFooterRefMutation,
  setLinkedToPreviousMutation,
} from './helpers/header-footer-refs-mutation.js';
import { createHeaderFooterPart, type ConverterWithHeaderFooterParts } from './helpers/header-footer-parts.js';
import { rejectTrackedMode } from './helpers/mutation-helpers.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VARIANT_ORDER: HeaderFooterVariant[] = ['default', 'first', 'even'];
const KIND_ORDER: HeaderFooterKind[] = ['header', 'footer'];

// ---------------------------------------------------------------------------
// Converter access
// ---------------------------------------------------------------------------

function getConverter(editor: Editor): ConverterWithHeaderFooterParts | undefined {
  return (editor as unknown as { converter?: ConverterWithHeaderFooterParts }).converter;
}

function requireConverter(editor: Editor, operationName: string): ConverterWithHeaderFooterParts {
  const converter = getConverter(editor);
  if (!converter) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      `${operationName} requires an active document converter.`,
    );
  }
  return converter;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function effectiveLimitOf(limit: number | undefined, total: number): number {
  return limit ?? total;
}

function buildSlotEntries(
  editor: Editor,
  sections: SectionProjection[],
  kindFilter?: HeaderFooterKind,
  sectionFilter?: SectionAddress,
): HeaderFooterSlotEntry[] {
  const entries: HeaderFooterSlotEntry[] = [];

  for (const projection of sections) {
    if (sectionFilter && projection.sectionId !== sectionFilter.sectionId) continue;

    const sectPr = readTargetSectPr(editor, projection);
    const kinds = kindFilter ? [kindFilter] : KIND_ORDER;

    for (const kind of kinds) {
      const refs = sectPr ? readSectPrHeaderFooterRefs(sectPr, kind) : undefined;
      for (const variant of VARIANT_ORDER) {
        const refId = refs?.[variant] ?? null;
        entries.push({
          section: projection.address,
          sectionIndex: projection.range.sectionIndex,
          kind,
          variant,
          refId,
          isExplicit: refId !== null,
        });
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Read adapters
// ---------------------------------------------------------------------------

export function headerFootersListAdapter(editor: Editor, query?: HeaderFootersListQuery): HeaderFootersListResult {
  validatePaginationInput(query?.offset, query?.limit);

  const sections = resolveSectionProjections(editor);
  const allEntries = buildSlotEntries(editor, sections, query?.kind, query?.section);

  const offset = query?.offset ?? 0;
  const effectiveLimit = effectiveLimitOf(query?.limit, allEntries.length);
  const { total, items: paged } = paginate(allEntries, offset, effectiveLimit);
  const evaluatedRevision = getRevision(editor);

  const items = paged.map((entry) => {
    const id = `slot:${entry.section.sectionId}:${entry.kind}:${entry.variant}`;
    const handle = buildResolvedHandle(id, 'ephemeral', 'ext:headerFooterSlot');
    return buildDiscoveryItem(id, handle, entry);
  });

  return buildDiscoveryResult({
    evaluatedRevision,
    total,
    items,
    page: { limit: effectiveLimit, offset, returned: items.length },
  });
}

export function headerFootersGetAdapter(editor: Editor, input: HeaderFootersGetInput): HeaderFooterSlotEntry {
  const { section, headerFooterKind, variant } = input.target;

  const sections = resolveSectionProjections(editor);
  const projection = sections.find((s) => s.sectionId === section.sectionId);
  if (!projection) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Section target was not found.', { target: section });
  }

  const sectPr = readTargetSectPr(editor, projection);
  const refs = sectPr ? readSectPrHeaderFooterRefs(sectPr, headerFooterKind) : undefined;
  const refId = refs?.[variant] ?? null;

  return {
    section: projection.address,
    sectionIndex: projection.range.sectionIndex,
    kind: headerFooterKind,
    variant,
    refId,
    isExplicit: refId !== null,
  };
}

export function headerFootersResolveAdapter(
  editor: Editor,
  input: HeaderFootersResolveInput,
): HeaderFooterResolveResult {
  const { section, headerFooterKind, variant } = input.target;

  const sections = resolveSectionProjections(editor);
  const projection = sections.find((s) => s.sectionId === section.sectionId);
  if (!projection) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Section target was not found.', { target: section });
  }

  // Check current section for explicit ref
  const sectPr = readTargetSectPr(editor, projection);
  if (sectPr) {
    const refs = readSectPrHeaderFooterRefs(sectPr, headerFooterKind);
    if (refs?.[variant]) {
      return { status: 'explicit', refId: refs[variant]!, section: projection.address };
    }
  }

  // Walk previous sections via shared resolver
  const resolved = resolveEffectiveRef(editor, sections, projection.range.sectionIndex, headerFooterKind, variant);
  if (resolved) {
    return {
      status: 'inherited',
      refId: resolved.refId,
      resolvedFromSection: resolved.resolvedFromSection,
      resolvedVariant: resolved.resolvedVariant,
    };
  }

  return { status: 'none' };
}

// ---------------------------------------------------------------------------
// Refs mutation adapters
// ---------------------------------------------------------------------------

export function headerFootersRefsSetAdapter(
  editor: Editor,
  input: HeaderFootersRefsSetInput,
  options?: MutationOptions,
): SectionMutationResult {
  const { section, headerFooterKind, variant } = input.target;
  const sectionTarget = { target: section };

  return sectionMutationBySectPr(
    editor,
    sectionTarget,
    options,
    'headerFooters.refs.set',
    (sectPr, _projection, _sections, dryRun) => {
      const converter = getConverter(editor) ?? null;
      return setHeaderFooterRefMutation(
        sectPr,
        headerFooterKind,
        variant,
        input.refId,
        converter,
        'headerFooters.refs.set',
        dryRun,
      );
    },
  );
}

export function headerFootersRefsClearAdapter(
  editor: Editor,
  input: HeaderFootersRefsClearInput,
  options?: MutationOptions,
): SectionMutationResult {
  const { section, headerFooterKind, variant } = input.target;
  const sectionTarget = { target: section };

  return sectionMutationBySectPr(
    editor,
    sectionTarget,
    options,
    'headerFooters.refs.clear',
    (sectPr, _projection, _sections, dryRun) => {
      const converter = getConverter(editor) ?? null;
      clearHeaderFooterRefMutation(sectPr, headerFooterKind, variant, converter, dryRun);
    },
  );
}

export function headerFootersRefsSetLinkedToPreviousAdapter(
  editor: Editor,
  input: HeaderFootersRefsSetLinkedToPreviousInput,
  options?: MutationOptions,
): SectionMutationResult {
  const { section, headerFooterKind, variant } = input.target;
  const sectionTarget = { target: section };

  return sectionMutationBySectPr(
    editor,
    sectionTarget,
    options,
    'headerFooters.refs.setLinkedToPrevious',
    (sectPr, projection, sections, dryRun) => {
      return setLinkedToPreviousMutation(
        sectPr,
        projection,
        sections,
        headerFooterKind,
        variant,
        input.linked,
        editor,
        dryRun,
        'headerFooters.refs.setLinkedToPrevious',
      );
    },
  );
}

// ---------------------------------------------------------------------------
// Parts adapters
// ---------------------------------------------------------------------------

const HEADER_RELATIONSHIP_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header';
const FOOTER_RELATIONSHIP_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';
const DOCUMENT_RELS_PATH = 'word/_rels/document.xml.rels';
const HEADER_FILE_PATTERN = /header(\d+)\.xml$/;
const FOOTER_FILE_PATTERN = /footer(\d+)\.xml$/;

function kindFromRelationshipType(type: string): HeaderFooterKind | null {
  if (type === HEADER_RELATIONSHIP_TYPE) return 'header';
  if (type === FOOTER_RELATIONSHIP_TYPE) return 'footer';
  return null;
}

function normalizeTarget(target: string): string {
  let normalized = target.replace(/^\.\//, '');
  if (normalized.startsWith('../')) normalized = normalized.slice(3);
  if (normalized.startsWith('/')) normalized = normalized.slice(1);
  if (!normalized.startsWith('word/')) normalized = `word/${normalized}`;
  return normalized;
}

interface RelationshipElement {
  name?: string;
  attributes?: Record<string, string | number | boolean>;
  elements?: RelationshipElement[];
  [key: string]: unknown;
}

function readRelationshipElements(converter: ConverterWithHeaderFooterParts): RelationshipElement[] {
  const relsPart = converter.convertedXml?.[DOCUMENT_RELS_PATH] as RelationshipElement | undefined;
  if (!relsPart?.elements) return [];
  const root = relsPart.elements.find((e) => e.name === 'Relationships');
  if (!root?.elements) return [];
  return root.elements.filter((e) => e.name === 'Relationship');
}

function extractPartIndex(kind: HeaderFooterKind, partPath: string): number | null {
  const pattern = kind === 'header' ? HEADER_FILE_PATTERN : FOOTER_FILE_PATTERN;
  const match = partPath.match(pattern);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : null;
}

export function headerFootersPartsListAdapter(
  editor: Editor,
  query?: HeaderFootersPartsListQuery,
): HeaderFootersPartsListResult {
  const converter = requireConverter(editor, 'headerFooters.parts.list');
  validatePaginationInput(query?.offset, query?.limit);

  const relationships = readRelationshipElements(converter);
  const sections = resolveSectionProjections(editor);

  // Build cross-reference map: refId → SectionAddress[]
  const refToSections = new Map<string, SectionAddress[]>();
  for (const projection of sections) {
    const sectPr = readTargetSectPr(editor, projection);
    if (!sectPr) continue;
    for (const kind of KIND_ORDER) {
      const refs = readSectPrHeaderFooterRefs(sectPr, kind);
      if (!refs) continue;
      for (const variant of VARIANT_ORDER) {
        const refId = refs[variant];
        if (!refId) continue;
        if (!refToSections.has(refId)) refToSections.set(refId, []);
        if (!refToSections.get(refId)!.some((a) => a.sectionId === projection.sectionId)) {
          refToSections.get(refId)!.push(projection.address);
        }
      }
    }
  }

  // Build part entries from relationships
  const allEntries: HeaderFooterPartEntry[] = [];
  for (const rel of relationships) {
    const type = String(rel.attributes?.Type ?? '');
    const kind = kindFromRelationshipType(type);
    if (!kind) continue;
    if (query?.kind && kind !== query.kind) continue;

    const refId = String(rel.attributes?.Id ?? '');
    const target = String(rel.attributes?.Target ?? '');
    const partPath = normalizeTarget(target);

    allEntries.push({
      refId,
      kind,
      partPath,
      referencedBySections: refToSections.get(refId) ?? [],
    });
  }

  // Stable sort: kind (header before footer), then numeric index, then lexical fallback
  allEntries.sort((a, b) => {
    const kindDiff = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    if (kindDiff !== 0) return kindDiff;

    const indexA = extractPartIndex(a.kind, a.partPath);
    const indexB = extractPartIndex(b.kind, b.partPath);

    if (indexA !== null && indexB !== null) return indexA - indexB;
    if (indexA !== null) return -1;
    if (indexB !== null) return 1;

    const pathCmp = a.partPath.localeCompare(b.partPath);
    if (pathCmp !== 0) return pathCmp;
    return a.refId.localeCompare(b.refId);
  });

  const offset = query?.offset ?? 0;
  const effectiveLimit = effectiveLimitOf(query?.limit, allEntries.length);
  const { total, items: paged } = paginate(allEntries, offset, effectiveLimit);
  const evaluatedRevision = getRevision(editor);

  const items = paged.map((entry) => {
    const id = `part:${entry.refId}`;
    const handle = buildResolvedHandle(id, 'stable', 'ext:headerFooterPart');
    return buildDiscoveryItem(id, handle, entry);
  });

  return buildDiscoveryResult({
    evaluatedRevision,
    total,
    items,
    page: { limit: effectiveLimit, offset, returned: items.length },
  });
}

function toPartsMutationFailure(code: 'INVALID_TARGET', message: string): HeaderFooterPartsMutationResult {
  return { success: false, failure: { code, message } };
}

export function headerFootersPartsCreateAdapter(
  editor: Editor,
  input: HeaderFootersPartsCreateInput,
  options?: MutationOptions,
): HeaderFooterPartsMutationResult {
  rejectTrackedMode('headerFooters.parts.create', options);
  checkRevision(editor, options?.expectedRevision);

  const converter = requireConverter(editor, 'headerFooters.parts.create');

  // Validate sourceRefId if provided
  if (input.sourceRefId) {
    const relationships = readRelationshipElements(converter);
    const sourceRel = relationships.find((rel) => String(rel.attributes?.Id ?? '') === input.sourceRefId);
    if (!sourceRel) {
      return toPartsMutationFailure(
        'INVALID_TARGET',
        `sourceRefId '${input.sourceRefId}' does not reference an existing header/footer relationship`,
      );
    }
    const sourceType = String(sourceRel.attributes?.Type ?? '');
    const sourceKind = kindFromRelationshipType(sourceType);
    if (sourceKind !== input.kind) {
      return toPartsMutationFailure(
        'INVALID_TARGET',
        `sourceRefId '${input.sourceRefId}' is a ${sourceKind ?? 'unknown'}, not a ${input.kind}`,
      );
    }
  }

  if (options?.dryRun) {
    return { success: true, refId: '(dry-run)', partPath: `word/${input.kind}(dry-run).xml` };
  }

  try {
    const result = createHeaderFooterPart(editor, {
      kind: input.kind,
      variant: 'default', // placeholder — parts are variant-agnostic
      sourceRefId: input.sourceRefId,
    });
    return { success: true, refId: result.refId, partPath: result.relationshipTarget };
  } catch (err) {
    throw new DocumentApiAdapterError(
      'INTERNAL_ERROR',
      `headerFooters.parts.create failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function headerFootersPartsDeleteAdapter(
  editor: Editor,
  input: HeaderFootersPartsDeleteInput,
  options?: MutationOptions,
): HeaderFooterPartsMutationResult {
  rejectTrackedMode('headerFooters.parts.delete', options);
  checkRevision(editor, options?.expectedRevision);

  const converter = requireConverter(editor, 'headerFooters.parts.delete');
  const refId = input.target.refId;

  // 1. Validate the refId exists as a header/footer relationship
  const relationships = readRelationshipElements(converter);
  const targetRel = relationships.find((rel) => String(rel.attributes?.Id ?? '') === refId);
  if (!targetRel) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `refId '${refId}' not found in document relationships.`);
  }

  const relType = String(targetRel.attributes?.Type ?? '');
  const kind = kindFromRelationshipType(relType);
  if (!kind) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `refId '${refId}' is not a header/footer relationship.`);
  }

  // 2. Validate no section slot explicitly references the refId
  const sections = resolveSectionProjections(editor);
  const referencingSections: SectionAddress[] = [];
  for (const projection of sections) {
    const sectPr = readTargetSectPr(editor, projection);
    if (!sectPr) continue;
    const refs = readSectPrHeaderFooterRefs(sectPr, kind);
    if (!refs) continue;
    for (const variant of VARIANT_ORDER) {
      if (refs[variant] === refId) {
        referencingSections.push(projection.address);
        break;
      }
    }
  }
  if (referencingSections.length > 0) {
    const sectionIds = referencingSections.map((s) => s.sectionId).join(', ');
    return toPartsMutationFailure(
      'INVALID_TARGET',
      `Cannot delete part '${refId}': still referenced by sections [${sectionIds}].`,
    );
  }

  const target = String(targetRel.attributes?.Target ?? '');
  const partPath = normalizeTarget(target);

  if (options?.dryRun) {
    return { success: true, refId, partPath };
  }

  // 3-9: Atomic deletion of converter state
  const convertedXml = converter.convertedXml ?? {};

  // 3. Remove relationship entry
  const relsPart = convertedXml[DOCUMENT_RELS_PATH] as RelationshipElement | undefined;
  if (relsPart?.elements) {
    const root = relsPart.elements.find((e) => e.name === 'Relationships');
    if (root?.elements) {
      root.elements = root.elements.filter(
        (e) => !(e.name === 'Relationship' && String(e.attributes?.Id ?? '') === refId),
      );
    }
  }

  // 4. Remove XML part
  delete convertedXml[partPath];

  // 5. Remove rels for the part
  const partFileName = partPath.split('/').pop();
  if (partFileName) {
    delete convertedXml[`word/_rels/${partFileName}.rels`];
  }

  // 6. Remove JSON collection entry
  const collection = kind === 'header' ? converter.headers : converter.footers;
  if (collection && typeof collection === 'object') {
    delete collection[refId];
  }

  // 7. Remove from ids[] tracking array
  const variantIds = kind === 'header' ? converter.headerIds : converter.footerIds;
  if (variantIds && Array.isArray(variantIds.ids)) {
    const idx = variantIds.ids.indexOf(refId);
    if (idx !== -1) variantIds.ids.splice(idx, 1);
  }

  // 8. Clear variant pointers that match deleted refId
  if (variantIds) {
    const namedKeys = ['default', 'first', 'even', 'odd'] as const;
    for (const key of namedKeys) {
      if ((variantIds as Record<string, unknown>)[key] === refId) {
        (variantIds as Record<string, unknown>)[key] = null;
      }
    }
  }

  // 9. Mark converter as modified
  converter.headerFooterModified = true;
  converter.documentModified = true;

  return { success: true, refId, partPath };
}
