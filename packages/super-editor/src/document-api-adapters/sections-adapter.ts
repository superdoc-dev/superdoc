import type {
  CreateSectionBreakInput,
  CreateSectionBreakResult,
  DocumentMutationResult,
  MutationOptions,
  SectionAddress,
  SectionMutationResult,
  SectionsClearHeaderFooterRefInput,
  SectionsClearPageBordersInput,
  SectionsGetInput,
  SectionsListQuery,
  SectionsListResult,
  SectionsSetBreakTypeInput,
  SectionsSetColumnsInput,
  SectionsSetHeaderFooterMarginsInput,
  SectionsSetHeaderFooterRefInput,
  SectionsSetLineNumberingInput,
  SectionsSetLinkToPreviousInput,
  SectionsSetOddEvenHeadersFootersInput,
  SectionsSetPageBordersInput,
  SectionsSetPageMarginsInput,
  SectionsSetPageNumberingInput,
  SectionsSetPageSetupInput,
  SectionsSetSectionDirectionInput,
  SectionsSetTitlePageInput,
  SectionsSetVerticalAlignInput,
  SectionInfo,
} from '@superdoc/document-api';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../core/Editor.js';
import { DocumentApiAdapterError } from './errors.js';
import { applyDirectMutationMeta } from './helpers/transaction-meta.js';
import { checkRevision } from './plan-engine/revision-tracker.js';
import { resolveBlockInsertionPos } from './plan-engine/create-insertion.js';
import { clearIndexCache } from './helpers/index-cache.js';
import { rejectTrackedMode } from './helpers/mutation-helpers.js';
import { mutatePart } from '../core/parts/mutation/mutate-part.js';
import type { PartId } from '../core/parts/types.js';
import {
  ensureSettingsRoot,
  readSettingsRoot,
  hasOddEvenHeadersFooters,
  setOddEvenHeadersFooters as setOddEvenHeadersInSettings,
  type ConverterWithDocumentSettings,
} from './document-settings.js';
import {
  getBodySectPrFromEditor,
  getDefaultSectionAddress,
  resolveSectionProjections,
  sectionsGetAdapter,
  sectionsListAdapter as listSectionsFromProjection,
  type SectionProjection,
} from './helpers/sections-resolver.js';
import { type ConverterWithHeaderFooterParts } from './helpers/header-footer-parts.js';
import {
  setHeaderFooterRefMutation,
  clearHeaderFooterRefMutation,
  setLinkedToPreviousMutation,
} from './helpers/header-footer-refs-mutation.js';
import {
  clearSectPrPageBorders,
  cloneXmlElement,
  createSectPrElement,
  ensureSectPrElement,
  readSectPrMargins,
  readSectPrPageSetup,
  writeSectPrBreakType,
  writeSectPrColumns,
  writeSectPrDirection,
  writeSectPrHeaderFooterMargins,
  writeSectPrLineNumbering,
  writeSectPrPageBorders,
  writeSectPrPageMargins,
  writeSectPrPageNumbering,
  writeSectPrPageSetup,
  writeSectPrTitlePage,
  writeSectPrVerticalAlign,
  type XmlElement,
} from './helpers/sections-xml.js';

interface ConverterWithSections extends ConverterWithDocumentSettings, ConverterWithHeaderFooterParts {
  bodySectPr?: unknown;
  savedTagsToRestore?: Array<{
    name?: string;
    elements?: Array<{
      name?: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  }>;
  pageStyles?: {
    pageSize?: {
      width?: number;
      height?: number;
    };
    pageMargins?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
      header?: number;
      footer?: number;
      gutter?: number;
    };
    alternateHeaders?: boolean;
  };
}

function getConverter(editor: Editor): ConverterWithSections | undefined {
  return (editor as unknown as { converter?: ConverterWithSections }).converter;
}

function toSectionFailure(
  code: 'NO_OP' | 'INVALID_TARGET' | 'CAPABILITY_UNAVAILABLE',
  message: string,
): SectionMutationResult {
  return {
    success: false,
    failure: {
      code,
      message,
    },
  };
}

function toSectionSuccess(section: SectionAddress): SectionMutationResult {
  return {
    success: true,
    section,
  };
}

function toDocumentSuccess(): DocumentMutationResult {
  return { success: true };
}

function toCreateFailure(code: 'INVALID_TARGET' | 'CAPABILITY_UNAVAILABLE', message: string): CreateSectionBreakResult {
  return {
    success: false,
    failure: {
      code,
      message,
    },
  };
}

function toCreateSuccess(
  section: SectionAddress,
  breakParagraphId: string,
): Extract<CreateSectionBreakResult, { success: true }> {
  return {
    success: true,
    section,
    breakParagraph: {
      kind: 'block',
      nodeType: 'paragraph',
      nodeId: breakParagraphId,
    },
  };
}

function createSectionBreakId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  return `section-break-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readParagraphSectPr(node: ProseMirrorNode): XmlElement | null {
  const attrs = (node.attrs ?? {}) as {
    paragraphProperties?: {
      sectPr?: unknown;
    };
  };
  const sectPr = attrs.paragraphProperties?.sectPr;
  return sectPr && typeof sectPr === 'object' ? (sectPr as XmlElement) : null;
}

function readTargetSectPr(editor: Editor, projection: SectionProjection): XmlElement | null {
  if (projection.target.kind === 'paragraph') {
    return readParagraphSectPr(projection.target.node);
  }
  return getBodySectPrFromEditor(editor);
}

function buildSectionMarginsForAttrs(sectPr: XmlElement): Record<string, number | null> {
  const margins = readSectPrMargins(sectPr);
  return {
    top: margins.top ?? null,
    right: margins.right ?? null,
    bottom: margins.bottom ?? null,
    left: margins.left ?? null,
    header: margins.header ?? null,
    footer: margins.footer ?? null,
  };
}

function syncConverterBodySection(editor: Editor, sectPr: XmlElement): void {
  const converter = getConverter(editor);
  if (!converter) return;
  converter.bodySectPr = cloneXmlElement(sectPr);

  const savedBodyNode = converter.savedTagsToRestore?.find((entry) => entry?.name === 'w:body');
  if (savedBodyNode && Array.isArray(savedBodyNode.elements)) {
    const preservedChildren = savedBodyNode.elements.filter((entry) => entry?.name !== 'w:sectPr');
    preservedChildren.push(cloneXmlElement(sectPr) as unknown as { name?: string; [key: string]: unknown });
    savedBodyNode.elements = preservedChildren;
  }

  const margins = readSectPrMargins(sectPr);
  const pageSetup = readSectPrPageSetup(sectPr);
  if (!converter.pageStyles) converter.pageStyles = {};
  if (!converter.pageStyles.pageSize) converter.pageStyles.pageSize = {};
  if (pageSetup?.width !== undefined) converter.pageStyles.pageSize.width = pageSetup.width;
  if (pageSetup?.height !== undefined) converter.pageStyles.pageSize.height = pageSetup.height;
  if (!converter.pageStyles.pageMargins) converter.pageStyles.pageMargins = {};
  const pageMargins = converter.pageStyles.pageMargins;
  if (margins.top !== undefined) pageMargins.top = margins.top;
  if (margins.right !== undefined) pageMargins.right = margins.right;
  if (margins.bottom !== undefined) pageMargins.bottom = margins.bottom;
  if (margins.left !== undefined) pageMargins.left = margins.left;
  if (margins.header !== undefined) pageMargins.header = margins.header;
  if (margins.footer !== undefined) pageMargins.footer = margins.footer;
  if (margins.gutter !== undefined) pageMargins.gutter = margins.gutter;
}

function applySectPrToProjection(editor: Editor, projection: SectionProjection, sectPr: XmlElement): void {
  if (projection.target.kind === 'paragraph') {
    const paragraph = projection.target.node;
    const attrs = (paragraph.attrs ?? {}) as Record<string, unknown>;
    const paragraphProperties = {
      ...((attrs.paragraphProperties ?? {}) as Record<string, unknown>),
      sectPr,
    };
    const nextAttrs: Record<string, unknown> = {
      ...attrs,
      paragraphProperties,
      pageBreakSource: 'sectPr',
      sectionMargins: buildSectionMarginsForAttrs(sectPr),
    };

    const tr = applyDirectMutationMeta(editor.state.tr);
    tr.setNodeMarkup(projection.target.pos, undefined, nextAttrs, paragraph.marks);
    tr.setMeta('forceUpdatePagination', true);
    editor.dispatch(tr);
    return;
  }

  const tr = applyDirectMutationMeta(editor.state.tr);
  tr.setDocAttribute('bodySectPr', sectPr);
  tr.setMeta('forceUpdatePagination', true);
  editor.dispatch(tr);
  syncConverterBodySection(editor, sectPr);
}

function sectionMutationBySectPr<TInput extends { target: SectionAddress }>(
  editor: Editor,
  input: TInput,
  options: MutationOptions | undefined,
  operationName: string,
  mutate: (
    sectPr: XmlElement,
    projection: SectionProjection,
    sections: SectionProjection[],
    dryRun: boolean,
  ) => SectionMutationResult | void,
): SectionMutationResult {
  rejectTrackedMode(operationName, options);
  checkRevision(editor, options?.expectedRevision);

  const sections = resolveSectionProjections(editor);
  const projection = sections.find((entry) => entry.sectionId === input.target.sectionId);
  if (!projection) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Section target was not found.', { target: input.target });
  }

  const dryRun = options?.dryRun === true;

  const currentSectPr = readTargetSectPr(editor, projection);
  const nextSectPr = ensureSectPrElement(currentSectPr);
  const before = JSON.stringify(nextSectPr);
  const earlyResult = mutate(nextSectPr, projection, sections, dryRun);
  if (earlyResult) return earlyResult;

  const changed = before !== JSON.stringify(nextSectPr);
  if (!changed) {
    return toSectionFailure('NO_OP', `${operationName} did not produce a section change.`);
  }

  if (options?.dryRun) {
    return toSectionSuccess(projection.address);
  }

  applySectPrToProjection(editor, projection, nextSectPr);
  clearIndexCache(editor);
  return toSectionSuccess(projection.address);
}

function resolveInsertPosition(editor: Editor, location: CreateSectionBreakInput['at']): number {
  const target = location ?? { kind: 'documentEnd' };
  if (target.kind === 'documentStart') return 0;
  if (target.kind === 'documentEnd') return editor.state.doc.content.size;
  return resolveBlockInsertionPos(editor, target.target.nodeId, target.kind);
}

function buildSectPrFromCreateInput(input: CreateSectionBreakInput): XmlElement {
  const sectPr = createSectPrElement();
  if (input.breakType) writeSectPrBreakType(sectPr, input.breakType);
  if (input.pageMargins) writeSectPrPageMargins(sectPr, input.pageMargins);
  if (input.headerFooterMargins) writeSectPrHeaderFooterMargins(sectPr, input.headerFooterMargins);
  return sectPr;
}

function createSectionBreakNode(
  editor: Editor,
  breakParagraphId: string,
  input: CreateSectionBreakInput,
): ProseMirrorNode {
  const paragraphType = editor.state.schema.nodes.paragraph;
  if (!paragraphType) {
    throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', 'create.sectionBreak requires a paragraph node type.');
  }

  const sectPr = buildSectPrFromCreateInput(input);
  const attrs = {
    sdBlockId: breakParagraphId,
    paragraphProperties: {
      sectPr,
    },
    pageBreakSource: 'sectPr',
    sectionMargins: buildSectionMarginsForAttrs(sectPr),
  };

  const paragraphNode = paragraphType.createAndFill(attrs, undefined) ?? paragraphType.create(attrs, undefined);
  if (!paragraphNode) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'Unable to construct a section-break paragraph node.');
  }
  return paragraphNode;
}

function updateGlobalTitlePageFlag(editor: Editor): void {
  const converter = getConverter(editor);
  if (!converter) return;

  const anyTitlePage = resolveSectionProjections(editor).some((entry) => entry.domain.titlePage === true);
  if (!converter.headerIds) converter.headerIds = {};
  if (!converter.footerIds) converter.footerIds = {};
  converter.headerIds.titlePg = anyTitlePage;
  converter.footerIds.titlePg = anyTitlePage;
}
export function createSectionBreakAdapter(
  editor: Editor,
  input: CreateSectionBreakInput,
  options?: MutationOptions,
): CreateSectionBreakResult {
  rejectTrackedMode('create.sectionBreak', options);
  checkRevision(editor, options?.expectedRevision);

  const breakParagraphId = options?.dryRun ? '(dry-run)' : createSectionBreakId();
  const insertPos = resolveInsertPosition(editor, input.at);
  const paragraphNode = createSectionBreakNode(editor, breakParagraphId, input);

  try {
    const testTr = editor.state.tr.insert(insertPos, paragraphNode);
    if (options?.dryRun) {
      void testTr;
      return toCreateSuccess({ kind: 'section', sectionId: 'section-(dry-run)' }, breakParagraphId);
    }
  } catch {
    return toCreateFailure('INVALID_TARGET', 'create.sectionBreak could not insert at the requested location.');
  }

  const tr = applyDirectMutationMeta(editor.state.tr.insert(insertPos, paragraphNode));
  tr.setMeta('forceUpdatePagination', true);
  editor.dispatch(tr);
  clearIndexCache(editor);

  const createdSection = resolveSectionProjections(editor).find(
    (projection) => projection.target.kind === 'paragraph' && projection.target.nodeId === breakParagraphId,
  );
  return toCreateSuccess(createdSection?.address ?? getDefaultSectionAddress(editor), breakParagraphId);
}

export function sectionsListAdapter(editor: Editor, query?: SectionsListQuery): SectionsListResult {
  return listSectionsFromProjection(editor, query);
}

export function sectionsGetAdapterByInput(editor: Editor, input: SectionsGetInput): SectionInfo {
  return sectionsGetAdapter(editor, input.address);
}

export function sectionsSetBreakTypeAdapter(
  editor: Editor,
  input: SectionsSetBreakTypeInput,
  options?: MutationOptions,
): SectionMutationResult {
  return sectionMutationBySectPr(editor, input, options, 'sections.setBreakType', (sectPr) => {
    writeSectPrBreakType(sectPr, input.breakType);
  });
}

export function sectionsSetPageMarginsAdapter(
  editor: Editor,
  input: SectionsSetPageMarginsInput,
  options?: MutationOptions,
): SectionMutationResult {
  return sectionMutationBySectPr(editor, input, options, 'sections.setPageMargins', (sectPr) => {
    writeSectPrPageMargins(sectPr, input);
  });
}

export function sectionsSetHeaderFooterMarginsAdapter(
  editor: Editor,
  input: SectionsSetHeaderFooterMarginsInput,
  options?: MutationOptions,
): SectionMutationResult {
  return sectionMutationBySectPr(editor, input, options, 'sections.setHeaderFooterMargins', (sectPr) => {
    writeSectPrHeaderFooterMargins(sectPr, input);
  });
}

export function sectionsSetPageSetupAdapter(
  editor: Editor,
  input: SectionsSetPageSetupInput,
  options?: MutationOptions,
): SectionMutationResult {
  return sectionMutationBySectPr(editor, input, options, 'sections.setPageSetup', (sectPr) => {
    writeSectPrPageSetup(sectPr, input);
  });
}

export function sectionsSetColumnsAdapter(
  editor: Editor,
  input: SectionsSetColumnsInput,
  options?: MutationOptions,
): SectionMutationResult {
  return sectionMutationBySectPr(editor, input, options, 'sections.setColumns', (sectPr) => {
    writeSectPrColumns(sectPr, input);
  });
}

export function sectionsSetLineNumberingAdapter(
  editor: Editor,
  input: SectionsSetLineNumberingInput,
  options?: MutationOptions,
): SectionMutationResult {
  return sectionMutationBySectPr(editor, input, options, 'sections.setLineNumbering', (sectPr) => {
    writeSectPrLineNumbering(sectPr, input);
  });
}

export function sectionsSetPageNumberingAdapter(
  editor: Editor,
  input: SectionsSetPageNumberingInput,
  options?: MutationOptions,
): SectionMutationResult {
  return sectionMutationBySectPr(editor, input, options, 'sections.setPageNumbering', (sectPr) => {
    writeSectPrPageNumbering(sectPr, input);
  });
}

export function sectionsSetTitlePageAdapter(
  editor: Editor,
  input: SectionsSetTitlePageInput,
  options?: MutationOptions,
): SectionMutationResult {
  const result = sectionMutationBySectPr(editor, input, options, 'sections.setTitlePage', (sectPr) => {
    writeSectPrTitlePage(sectPr, input.enabled);
  });
  if (result.success && !options?.dryRun) {
    updateGlobalTitlePageFlag(editor);
  }
  return result;
}

export function sectionsSetOddEvenHeadersFootersAdapter(
  editor: Editor,
  input: SectionsSetOddEvenHeadersFootersInput,
  options?: MutationOptions,
): DocumentMutationResult {
  rejectTrackedMode('sections.setOddEvenHeadersFooters', options);

  const converter = getConverter(editor);
  if (!converter) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'sections.setOddEvenHeadersFooters requires an active document converter.',
    );
  }

  const SETTINGS_PART: PartId = 'word/settings.xml';

  const result = mutatePart({
    editor,
    partId: SETTINGS_PART,
    operation: 'mutate',
    source: 'sections.setOddEvenHeadersFooters',
    dryRun: options?.dryRun === true,
    expectedRevision: options?.expectedRevision,
    mutate({ part, dryRun: isDryRun }) {
      // Read-only check first — avoids modifying settings on dry-run or NO_OP paths.
      const existingRoot = readSettingsRoot(converter);
      const before = existingRoot ? hasOddEvenHeadersFooters(existingRoot) : false;
      const changed = before !== input.enabled;

      if (!changed) {
        return toSectionFailure(
          'NO_OP',
          'sections.setOddEvenHeadersFooters did not produce a document settings change.',
        );
      }

      if (!isDryRun) {
        const settingsRoot = ensureSettingsRoot(part as Parameters<typeof ensureSettingsRoot>[0]);
        setOddEvenHeadersInSettings(settingsRoot, input.enabled);
        if (!converter.pageStyles) converter.pageStyles = {};
        converter.pageStyles.alternateHeaders = input.enabled;
      }

      return toDocumentSuccess();
    },
  });

  return result.result as DocumentMutationResult;
}

export function sectionsSetVerticalAlignAdapter(
  editor: Editor,
  input: SectionsSetVerticalAlignInput,
  options?: MutationOptions,
): SectionMutationResult {
  return sectionMutationBySectPr(editor, input, options, 'sections.setVerticalAlign', (sectPr) => {
    writeSectPrVerticalAlign(sectPr, input.value);
  });
}

export function sectionsSetSectionDirectionAdapter(
  editor: Editor,
  input: SectionsSetSectionDirectionInput,
  options?: MutationOptions,
): SectionMutationResult {
  return sectionMutationBySectPr(editor, input, options, 'sections.setSectionDirection', (sectPr) => {
    writeSectPrDirection(sectPr, input.direction);
  });
}

export function sectionsSetHeaderFooterRefAdapter(
  editor: Editor,
  input: SectionsSetHeaderFooterRefInput,
  options?: MutationOptions,
): SectionMutationResult {
  return sectionMutationBySectPr(
    editor,
    input,
    options,
    'sections.setHeaderFooterRef',
    (sectPr, _projection, _sections, dryRun) => {
      const converter = getConverter(editor) ?? null;
      return setHeaderFooterRefMutation(
        sectPr,
        input.kind,
        input.variant,
        input.refId,
        converter,
        'sections.setHeaderFooterRef',
        dryRun,
      );
    },
  );
}

export function sectionsClearHeaderFooterRefAdapter(
  editor: Editor,
  input: SectionsClearHeaderFooterRefInput,
  options?: MutationOptions,
): SectionMutationResult {
  return sectionMutationBySectPr(
    editor,
    input,
    options,
    'sections.clearHeaderFooterRef',
    (sectPr, _projection, _sections, dryRun) => {
      const converter = getConverter(editor) ?? null;
      clearHeaderFooterRefMutation(sectPr, input.kind, input.variant, converter, dryRun);
    },
  );
}

export function sectionsSetLinkToPreviousAdapter(
  editor: Editor,
  input: SectionsSetLinkToPreviousInput,
  options?: MutationOptions,
): SectionMutationResult {
  return sectionMutationBySectPr(
    editor,
    input,
    options,
    'sections.setLinkToPrevious',
    (sectPr, projection, sections, dryRun) => {
      return setLinkedToPreviousMutation(
        sectPr,
        projection,
        sections,
        input.kind,
        input.variant,
        input.linked,
        editor,
        dryRun,
        'sections.setLinkToPrevious',
      );
    },
  );
}

export function sectionsSetPageBordersAdapter(
  editor: Editor,
  input: SectionsSetPageBordersInput,
  options?: MutationOptions,
): SectionMutationResult {
  return sectionMutationBySectPr(editor, input, options, 'sections.setPageBorders', (sectPr) => {
    writeSectPrPageBorders(sectPr, input.borders);
  });
}

export function sectionsClearPageBordersAdapter(
  editor: Editor,
  input: SectionsClearPageBordersInput,
  options?: MutationOptions,
): SectionMutationResult {
  return sectionMutationBySectPr(editor, input, options, 'sections.clearPageBorders', (sectPr) => {
    clearSectPrPageBorders(sectPr);
  });
}
