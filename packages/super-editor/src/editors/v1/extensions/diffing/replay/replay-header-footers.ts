import { EditorState, type Transaction } from 'prosemirror-state';
import type { Schema } from 'prosemirror-model';
import { toRelsPathForPart } from '../part-paths';
import { replayDocDiffs } from './replay-doc';
import { ReplayResult } from './replay-types';
import {
  normalizePartPath,
  SLOT_VARIANTS,
  type HeaderFootersDiff,
  type HeaderFooterKind,
  type HeaderFooterPartState,
  type HeaderFooterSlotState,
  type HeaderFooterVariant,
} from '../algorithm/header-footer-diffing';
import { resolveSectionProjections } from '../../../document-api-adapters/helpers/sections-resolver.js';
import { readTargetSectPr } from '../../../document-api-adapters/helpers/section-projection-access.js';
import {
  ensureSectPrElement,
  cloneXmlElement,
  clearSectPrHeaderFooterRef,
  setSectPrHeaderFooterRef,
  readSectPrMargins,
  writeSectPrTitlePage,
} from '../../../document-api-adapters/helpers/sections-xml.js';
import { DEFAULT_DOCX_DEFS } from '../../../core/super-converter/exporter-docx-defs.js';

type ReplayHeaderFooterEditor = {
  state: { doc: import('prosemirror-model').Node };
  emit?: (event: string, payload?: unknown) => void;
  converter?: {
    headers?: Record<string, unknown>;
    footers?: Record<string, unknown>;
    headerIds?: Record<string, unknown>;
    footerIds?: Record<string, unknown>;
    convertedXml?: Record<string, unknown>;
    bodySectPr?: unknown;
    savedTagsToRestore?: Array<Record<string, unknown>>;
    exportToXmlJson?: (opts: {
      data: unknown;
      editor: { schema: Schema; getUpdatedJson: () => unknown };
      editorSchema: Schema;
      isHeaderFooter: boolean;
      comments?: unknown[];
      commentDefinitions?: unknown[];
      isFinalDoc?: boolean;
    }) => {
      result?: { elements?: Array<{ elements?: unknown[] }> };
    };
    headerFooterModified?: boolean;
    documentModified?: boolean;
  } | null;
};

type HeaderFooterVariantIds = Record<string, string | string[] | boolean | null | undefined> & {
  ids?: string[];
};

type RelationshipElement = {
  type?: string;
  name?: string;
  attributes?: Record<string, string>;
  elements?: RelationshipElement[];
};

const HEADER_RELATIONSHIP_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header';
const FOOTER_RELATIONSHIP_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';

/**
 * Replays header/footer diffs into the current editor state.
 *
 * @param params Replay inputs.
 * @param params.tr Transaction that should receive section slot mutations.
 * @param params.headerFootersDiff Header/footer diff payload to apply.
 * @param params.schema Schema used to rebuild stored PM JSON documents.
 * @param params.editor Editor whose converter caches should be updated.
 * @param params.trackedChangesRequested Whether the outer replay requested tracked mode.
 * @returns Replay summary with applied/skipped counts and warnings.
 */
export function replayHeaderFooters({
  tr,
  headerFootersDiff,
  schema,
  editor,
  trackedChangesRequested = false,
}: {
  tr: Transaction;
  headerFootersDiff: HeaderFootersDiff | null;
  schema: Schema;
  editor?: ReplayHeaderFooterEditor;
  trackedChangesRequested?: boolean;
}): ReplayResult {
  const result: ReplayResult = {
    applied: 0,
    skipped: 0,
    warnings: [],
  };

  if (!headerFootersDiff) {
    return result;
  }

  if (!editor?.converter) {
    result.skipped += 1;
    result.warnings.push('Header/footer replay skipped: editor converter is unavailable.');
    return result;
  }

  if (trackedChangesRequested) {
    result.warnings.push(
      'Header/footer replay applied directly because tracked header/footer replay is not supported.',
    );
  }

  ensureHeaderFooterCollections(editor.converter);

  for (const part of headerFootersDiff.addedParts) {
    createHeaderFooterPart(editor.converter, schema, part);
    result.applied += 1;
  }

  for (const part of headerFootersDiff.modifiedParts) {
    const updated = applyHeaderFooterPartContent(
      editor.converter,
      schema,
      part.refId,
      part.kind,
      part.oldPartPath,
      part.partPath,
      part.docDiffs,
    );
    if (updated) {
      result.applied += 1;
      continue;
    }
    result.skipped += 1;
    result.warnings.push(`Header/footer replay skipped for "${part.refId}": stored part content was not found.`);
  }

  let slotChangesApplied = 0;
  for (const slot of headerFootersDiff.slotChanges) {
    const applied = applyHeaderFooterSlotChange(tr, editor, slot);
    if (applied) {
      result.applied += 1;
      slotChangesApplied += 1;
      continue;
    }
    result.skipped += 1;
    result.warnings.push(
      `Header/footer replay skipped for section "${slot.sectionId}": section projection was not found.`,
    );
  }

  if (slotChangesApplied > 0) {
    syncTitlePageCache(tr, editor);
  }

  for (const part of headerFootersDiff.removedParts) {
    deleteHeaderFooterPart(editor.converter, part);
    result.applied += 1;
  }

  if (result.applied > 0) {
    tr.setMeta('forceUpdatePagination', true);
    editor.converter.headerFooterModified = true;
    editor.converter.documentModified = true;
    const changedParts: Array<{
      partId: string;
      sectionId?: string;
      operation: 'mutate' | 'create' | 'delete';
      changedPaths: string[];
    }> = [];

    if (
      headerFootersDiff.addedParts.length > 0 ||
      headerFootersDiff.removedParts.length > 0 ||
      headerFootersDiff.slotChanges.length > 0
    ) {
      changedParts.push({ partId: 'word/_rels/document.xml.rels', operation: 'mutate', changedPaths: [] });
    }

    for (const part of headerFootersDiff.addedParts) {
      changedParts.push({ partId: part.partPath, sectionId: part.refId, operation: 'create', changedPaths: [] });
    }
    for (const part of headerFootersDiff.modifiedParts) {
      if (part.oldPartPath !== part.partPath) {
        changedParts.push({ partId: part.oldPartPath, sectionId: part.refId, operation: 'delete', changedPaths: [] });
        changedParts.push({ partId: part.partPath, sectionId: part.refId, operation: 'create', changedPaths: [] });
        continue;
      }
      changedParts.push({ partId: part.partPath, sectionId: part.refId, operation: 'mutate', changedPaths: [] });
    }
    for (const part of headerFootersDiff.removedParts) {
      changedParts.push({ partId: part.partPath, sectionId: part.refId, operation: 'delete', changedPaths: [] });
    }

    editor.emit?.('partChanged', { parts: changedParts, source: 'diff-replay' });
  }

  return result;
}

/**
 * Ensures the converter has the mutable collections used by header/footer replay.
 *
 * @param converter Converter object mutated during replay.
 */
function ensureHeaderFooterCollections(converter: NonNullable<ReplayHeaderFooterEditor['converter']>): void {
  if (!converter.headers) converter.headers = {};
  if (!converter.footers) converter.footers = {};
  if (!converter.headerIds) converter.headerIds = {};
  if (!converter.footerIds) converter.footerIds = {};
  if (!converter.convertedXml) converter.convertedXml = {};
}

/**
 * Creates a missing header/footer part entry directly in converter state.
 *
 * @param converter Converter object mutated during replay.
 * @param part Target part state that should exist after replay.
 */
function createHeaderFooterPart(
  converter: NonNullable<ReplayHeaderFooterEditor['converter']>,
  schema: Schema,
  part: HeaderFooterPartState,
): void {
  const partCollection = part.kind === 'header' ? converter.headers! : converter.footers!;
  partCollection[part.refId] = structuredClone(part.content);

  const variantIds = (part.kind === 'header' ? converter.headerIds! : converter.footerIds!) as HeaderFooterVariantIds;
  if (!Array.isArray(variantIds.ids)) {
    variantIds.ids = [];
  }
  if (!variantIds.ids.includes(part.refId)) {
    variantIds.ids.push(part.refId);
  }

  upsertRelationshipEntry(converter.convertedXml!, part);
  ensureXmlPartExists(converter.convertedXml!, part);
  syncHeaderFooterPartXml(converter, schema, part.kind, part.refId, part.content);
}

/**
 * Replays one modified part diff into the stored PM JSON and OOXML caches.
 *
 * @param converter Converter object mutated during replay.
 * @param schema Schema used to rebuild the stored PM document.
 * @param refId Relationship id of the target part.
 * @param kind Whether the target part is a header or footer.
 * @param docDiffs Body-style document diffs for the part content.
 * @returns `true` when the part was updated.
 */
function applyHeaderFooterPartContent(
  converter: NonNullable<ReplayHeaderFooterEditor['converter']>,
  schema: Schema,
  refId: string,
  kind: HeaderFooterKind,
  oldPartPath: string,
  partPath: string,
  docDiffs: import('../algorithm/generic-diffing').NodeDiff[],
): boolean {
  const collection = kind === 'header' ? converter.headers! : converter.footers!;
  const currentJson = collection[refId];
  if (!currentJson || typeof currentJson !== 'object') {
    return false;
  }

  let nextJson = currentJson;
  if (docDiffs.length > 0) {
    const state = EditorState.create({
      schema,
      doc: schema.nodeFromJSON(currentJson),
    });
    const partTr = state.tr;
    const replay = replayDocDiffs({
      tr: partTr,
      docDiffs,
      schema,
    });
    if (replay.skipped > 0) {
      return false;
    }

    nextJson = partTr.doc.toJSON();
    collection[refId] = nextJson;
  }

  updateHeaderFooterPartPath(converter, { refId, kind, oldPartPath, partPath });
  syncHeaderFooterPartXml(converter, schema, kind, refId, nextJson);
  return true;
}

/**
 * Applies one section slot change to the transaction and converter caches.
 *
 * @param tr Transaction that should receive the section-property mutation.
 * @param editor Editor whose current section projections and converter should be used.
 * @param slot Target slot state for one section.
 * @returns `true` when the section projection existed and was updated.
 */
function applyHeaderFooterSlotChange(
  tr: Transaction,
  editor: ReplayHeaderFooterEditor,
  slot: HeaderFooterSlotState,
): boolean {
  const projectionEditor = {
    ...editor,
    state: {
      ...editor.state,
      doc: tr.doc,
    },
  };
  const projection = resolveSectionProjections(projectionEditor as never).find(
    (entry) => entry.sectionId === slot.sectionId,
  );
  if (!projection) {
    return false;
  }

  const currentSectPr = readTargetSectPr(projectionEditor as never, projection);
  const nextSectPr = ensureSectPrElement(currentSectPr);
  writeSectPrTitlePage(nextSectPr, slot.titlePg);

  applySlotRefs(nextSectPr, 'header', slot.header);
  applySlotRefs(nextSectPr, 'footer', slot.footer);
  syncVariantIdCaches(editor.converter!, slot);

  if (projection.target.kind === 'paragraph') {
    const paragraph = tr.doc.nodeAt(projection.target.pos);
    if (!paragraph) {
      return false;
    }

    const attrs = (paragraph.attrs ?? {}) as Record<string, unknown>;
    const nextAttrs = {
      ...attrs,
      paragraphProperties: {
        ...((attrs.paragraphProperties ?? {}) as Record<string, unknown>),
        sectPr: nextSectPr,
      },
      pageBreakSource: 'sectPr',
      sectionMargins: readSectPrMargins(nextSectPr),
    };
    tr.setNodeMarkup(projection.target.pos, undefined, nextAttrs, paragraph.marks);
    return true;
  }

  tr.setDocAttribute('bodySectPr', nextSectPr);
  syncBodySectPrConverterCache(editor.converter!, nextSectPr);
  return true;
}

/**
 * Writes the target header/footer refs for one kind into a section property node.
 *
 * @param sectPr Mutable section property node.
 * @param kind Header/footer kind being updated.
 * @param refs Target ref mapping for that kind.
 */
function applySlotRefs(
  sectPr: ReturnType<typeof ensureSectPrElement>,
  kind: HeaderFooterKind,
  refs: Record<HeaderFooterVariant, string | null>,
): void {
  for (const variant of SLOT_VARIANTS) {
    clearSectPrHeaderFooterRef(sectPr, kind, variant);
    if (refs[variant]) {
      setSectPrHeaderFooterRef(sectPr, kind, variant, refs[variant]!);
    }
  }
}

/**
 * Keeps converter variant-id caches aligned with the applied section slot refs.
 *
 * @param converter Converter object mutated during replay.
 * @param slot Slot payload that was written into the section properties.
 */
function syncVariantIdCaches(
  converter: NonNullable<ReplayHeaderFooterEditor['converter']>,
  slot: HeaderFooterSlotState,
): void {
  const headerIds = (converter.headerIds ??= {}) as HeaderFooterVariantIds;
  const footerIds = (converter.footerIds ??= {}) as HeaderFooterVariantIds;

  for (const variant of SLOT_VARIANTS) {
    headerIds[variant] = slot.header[variant] ?? null;
    footerIds[variant] = slot.footer[variant] ?? null;
  }
}

/**
 * Keeps converter body section caches aligned with body sectPr transaction changes.
 *
 * @param converter Converter object mutated during replay.
 * @param sectPr New body section property node.
 */
function syncBodySectPrConverterCache(
  converter: NonNullable<ReplayHeaderFooterEditor['converter']>,
  sectPr: ReturnType<typeof ensureSectPrElement>,
): void {
  converter.bodySectPr = cloneXmlElement(sectPr);

  const savedBodyNode = converter.savedTagsToRestore?.find((entry) => entry?.name === 'w:body');
  if (!savedBodyNode || !Array.isArray(savedBodyNode.elements)) {
    return;
  }

  const preservedChildren = savedBodyNode.elements.filter((entry) => entry?.name !== 'w:sectPr');
  preservedChildren.push(cloneXmlElement(sectPr) as unknown as Record<string, unknown>);
  savedBodyNode.elements = preservedChildren;
}

/**
 * Recomputes the converter's global title-page cache from the updated document.
 *
 * @param tr Transaction containing the latest section-property state.
 * @param editor Editor whose converter caches should be refreshed.
 */
function syncTitlePageCache(tr: Transaction, editor: ReplayHeaderFooterEditor): void {
  if (!editor.converter) {
    return;
  }

  if (!editor.converter.headerIds) editor.converter.headerIds = {};
  if (!editor.converter.footerIds) editor.converter.footerIds = {};

  const projectionEditor = {
    ...editor,
    state: {
      ...editor.state,
      doc: tr.doc,
    },
  };
  const hasTitlePage = resolveSectionProjections(projectionEditor as never).some(
    (entry) => entry.range.titlePg === true,
  );
  editor.converter.headerIds.titlePg = hasTitlePage;
  editor.converter.footerIds.titlePg = hasTitlePage;
}

/**
 * Removes a header/footer part and all of its derived cache entries.
 *
 * @param converter Converter object mutated during replay.
 * @param part Target part that should be removed after replay.
 */
function deleteHeaderFooterPart(
  converter: NonNullable<ReplayHeaderFooterEditor['converter']>,
  part: HeaderFooterPartState,
): void {
  const collection = part.kind === 'header' ? converter.headers! : converter.footers!;
  delete collection[part.refId];

  const variantIds = (part.kind === 'header' ? converter.headerIds! : converter.footerIds!) as HeaderFooterVariantIds;
  if (Array.isArray(variantIds.ids)) {
    variantIds.ids = variantIds.ids.filter((value) => value !== part.refId);
  }
  for (const key of ['default', 'first', 'even', 'odd']) {
    if (variantIds[key] === part.refId) {
      variantIds[key] = null;
    }
  }

  removeRelationshipEntry(converter.convertedXml!, part.refId);
  delete converter.convertedXml![part.partPath];
  const relsPath = toRelsPathForPart(part.partPath);
  if (relsPath) {
    delete converter.convertedXml![relsPath];
  }
}

function updateHeaderFooterPartPath(
  converter: NonNullable<ReplayHeaderFooterEditor['converter']>,
  part: { refId: string; kind: HeaderFooterKind; oldPartPath: string; partPath: string },
): void {
  upsertRelationshipEntry(converter.convertedXml!, {
    refId: part.refId,
    kind: part.kind,
    partPath: part.partPath,
    content: { type: 'doc', content: [] },
  });

  if (part.oldPartPath === part.partPath) {
    ensureXmlPartExists(converter.convertedXml!, {
      refId: part.refId,
      kind: part.kind,
      partPath: part.partPath,
      content: { type: 'doc', content: [] },
    });
    return;
  }

  const previousXml = converter.convertedXml![part.oldPartPath];
  if (previousXml) {
    converter.convertedXml![part.partPath] = previousXml;
    delete converter.convertedXml![part.oldPartPath];
  } else {
    ensureXmlPartExists(converter.convertedXml!, {
      refId: part.refId,
      kind: part.kind,
      partPath: part.partPath,
      content: { type: 'doc', content: [] },
    });
  }

  const oldRelsPath = toRelsPathForPart(part.oldPartPath);
  const nextRelsPath = toRelsPathForPart(part.partPath);
  if (oldRelsPath && nextRelsPath && oldRelsPath !== nextRelsPath) {
    const previousRels = converter.convertedXml![oldRelsPath];
    if (previousRels) {
      converter.convertedXml![nextRelsPath] = previousRels;
      delete converter.convertedXml![oldRelsPath];
    }
  }
}

/**
 * Upserts the document relationship entry for one header/footer part.
 *
 * @param convertedXml Converted XML store mutated during replay.
 * @param part Part metadata that should exist after replay.
 */
function upsertRelationshipEntry(convertedXml: Record<string, unknown>, part: HeaderFooterPartState): void {
  const relsRoot = ensureRelationshipsRoot(convertedXml);
  const target = part.partPath.replace(/^word\//, '');
  const type = part.kind === 'header' ? HEADER_RELATIONSHIP_TYPE : FOOTER_RELATIONSHIP_TYPE;
  const existing = relsRoot.elements!.find(
    (entry) => entry.name === 'Relationship' && entry.attributes?.Id === part.refId,
  );

  if (existing) {
    existing.attributes = {
      ...(existing.attributes ?? {}),
      Id: part.refId,
      Type: type,
      Target: target,
    };
    return;
  }

  relsRoot.elements!.push({
    name: 'Relationship',
    attributes: {
      Id: part.refId,
      Type: type,
      Target: target,
    },
    elements: [],
  });
}

/**
 * Removes one header/footer relationship entry from `document.xml.rels`.
 *
 * @param convertedXml Converted XML store mutated during replay.
 * @param refId Relationship id to remove.
 */
function removeRelationshipEntry(convertedXml: Record<string, unknown>, refId: string): void {
  const relsPart = convertedXml['word/_rels/document.xml.rels'] as { elements?: RelationshipElement[] } | undefined;
  const relsRoot = relsPart?.elements?.find((entry) => entry.name === 'Relationships');
  if (!relsRoot?.elements) {
    return;
  }
  relsRoot.elements = relsRoot.elements.filter(
    (entry) => !(entry.name === 'Relationship' && entry.attributes?.Id === refId),
  );
}

/**
 * Ensures the OOXML XML part exists before content is exported into it.
 *
 * @param convertedXml Converted XML store mutated during replay.
 * @param part Target part that should exist.
 */
function ensureXmlPartExists(convertedXml: Record<string, unknown>, part: HeaderFooterPartState): void {
  if (convertedXml[part.partPath]) {
    return;
  }

  convertedXml[part.partPath] = {
    type: 'element',
    name: 'document',
    elements: [
      {
        type: 'element',
        name: part.kind === 'header' ? 'w:hdr' : 'w:ftr',
        attributes: getHeaderFooterRootAttributes(convertedXml, part.kind),
        elements: [],
      },
    ],
  };
}

/**
 * Exports stored PM JSON content back into the OOXML XML part cache.
 *
 * @param converter Converter object mutated during replay.
 * @param kind Header/footer kind being updated.
 * @param refId Relationship id of the target part.
 * @param content PM JSON document that should be exported.
 */
function syncHeaderFooterPartXml(
  converter: NonNullable<ReplayHeaderFooterEditor['converter']>,
  schema: Schema,
  kind: HeaderFooterKind,
  refId: string,
  content: unknown,
): void {
  const partPath = findPartPathByRefId(converter.convertedXml!, refId);
  if (!partPath) {
    return;
  }
  ensureXmlPartExists(converter.convertedXml!, {
    refId,
    kind,
    partPath,
    content: { type: 'doc', content: [] },
  });

  const exported = converter.exportToXmlJson?.({
    data: content,
    editor: {
      schema,
      getUpdatedJson: () => content,
    },
    editorSchema: schema,
    isHeaderFooter: true,
    comments: [],
    commentDefinitions: [],
  });

  const root = converter.convertedXml![partPath] as
    | { elements?: Array<{ attributes?: Record<string, string>; elements?: unknown[] }> }
    | undefined;
  if (!root?.elements?.[0]) {
    return;
  }

  root.elements[0].attributes = {
    ...getHeaderFooterRootAttributes(converter.convertedXml!, kind),
    ...((root.elements[0].attributes ?? {}) as Record<string, string>),
  };

  if (exported?.result?.elements?.[0]?.elements) {
    root.elements[0].elements = exported.result.elements[0].elements;
  }
}

/**
 * Builds the namespace attributes needed for a header/footer OOXML root element.
 *
 * @param convertedXml Converted XML store that may already contain header/footer parts.
 * @param kind Header/footer kind being created or repaired.
 * @returns Attributes for the `w:hdr` or `w:ftr` root element.
 */
function getHeaderFooterRootAttributes(
  convertedXml: Record<string, unknown>,
  kind: HeaderFooterKind,
): Record<string, string> {
  const existingAttributes = findExistingHeaderFooterRootAttributes(convertedXml, kind);
  return {
    ...DEFAULT_DOCX_DEFS,
    ...(existingAttributes ?? {}),
  };
}

/**
 * Reuses namespace attributes from an existing header/footer part when available.
 *
 * @param convertedXml Converted XML store that may already contain header/footer parts.
 * @param kind Header/footer kind being created or repaired.
 * @returns Existing root attributes, or `null` when no matching part exists.
 */
function findExistingHeaderFooterRootAttributes(
  convertedXml: Record<string, unknown>,
  kind: HeaderFooterKind,
): Record<string, string> | null {
  const rootName = kind === 'header' ? 'w:hdr' : 'w:ftr';

  for (const value of Object.values(convertedXml)) {
    const root = (value as { elements?: Array<{ name?: string; attributes?: Record<string, string> }> } | undefined)
      ?.elements?.[0];
    if (root?.name !== rootName || !root.attributes) {
      continue;
    }
    return root.attributes;
  }

  return null;
}

/**
 * Locates the OOXML part path for one relationship id.
 *
 * @param convertedXml Converted XML store that includes `document.xml.rels`.
 * @param refId Relationship id to resolve.
 * @returns Normalized OOXML part path, or `null` when not found.
 */
function findPartPathByRefId(convertedXml: Record<string, unknown>, refId: string): string | null {
  const relsPart = convertedXml['word/_rels/document.xml.rels'] as
    | { elements?: Array<{ name?: string; elements?: Array<{ name?: string; attributes?: Record<string, string> }> }> }
    | undefined;
  const relsRoot = relsPart?.elements?.find((entry) => entry.name === 'Relationships');
  const relationship = relsRoot?.elements?.find(
    (entry) => entry.name === 'Relationship' && entry.attributes?.Id === refId,
  );
  const target = relationship?.attributes?.Target;
  if (!target) {
    return null;
  }
  return normalizePartPath(target);
}

/**
 * Ensures the `Relationships` root exists in `document.xml.rels`.
 *
 * @param convertedXml Converted XML store mutated during replay.
 * @returns Mutable relationships root element.
 */
function ensureRelationshipsRoot(convertedXml: Record<string, unknown>): {
  elements?: Array<{ name?: string; attributes?: Record<string, string>; elements?: Array<Record<string, unknown>> }>;
} {
  if (!convertedXml['word/_rels/document.xml.rels']) {
    convertedXml['word/_rels/document.xml.rels'] = {
      type: 'element',
      name: 'document',
      elements: [],
    };
  }

  const relsPart = convertedXml['word/_rels/document.xml.rels'] as {
    elements?: Array<{ name?: string; attributes?: Record<string, string>; elements?: Array<Record<string, unknown>> }>;
  };
  if (!relsPart.elements) {
    relsPart.elements = [];
  }

  let relsRoot = relsPart.elements.find((entry) => entry.name === 'Relationships');
  if (!relsRoot) {
    relsRoot = {
      name: 'Relationships',
      attributes: {
        xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships',
      },
      elements: [],
    };
    relsPart.elements.push(relsRoot);
  }
  if (!relsRoot.elements) {
    relsRoot.elements = [];
  }
  return relsRoot;
}
