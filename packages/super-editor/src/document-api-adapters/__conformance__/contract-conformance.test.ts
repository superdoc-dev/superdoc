import { describe, it, expect, mock, spyOn, beforeEach, beforeAll, afterAll } from 'bun:test';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import {
  COMMAND_CATALOG,
  INLINE_PROPERTY_REGISTRY,
  MUTATING_OPERATION_IDS,
  OPERATION_IDS,
  buildInternalContractSchemas,
  textReceiptToSDReceipt,
  type InlineRunPatchKey,
  type OperationId,
} from '@superdoc/document-api';
import {
  TrackDeleteMarkName,
  TrackFormatMarkName,
  TrackInsertMarkName,
} from '../../extensions/track-changes/constants.js';
const { ListHelpers } = await import('../../core/helpers/list-numbering-helpers.js');
const { createCommentsWrapper } = await import('../plan-engine/comments-wrappers.js');
const { createParagraphWrapper, createHeadingWrapper } = await import('../plan-engine/create-wrappers.js');
const { blocksDeleteWrapper, blocksDeleteRangeWrapper } = await import('../plan-engine/blocks-wrappers.js');
const { clearContentWrapper } = await import('../plan-engine/clear-content-wrapper.js');
const { styleApplyWrapper } = await import('../plan-engine/plan-wrappers.js');
import {
  paragraphsSetStyleWrapper,
  paragraphsClearStyleWrapper,
  paragraphsResetDirectFormattingWrapper,
  paragraphsSetAlignmentWrapper,
  paragraphsClearAlignmentWrapper,
  paragraphsSetIndentationWrapper,
  paragraphsClearIndentationWrapper,
  paragraphsSetSpacingWrapper,
  paragraphsClearSpacingWrapper,
  paragraphsSetKeepOptionsWrapper,
  paragraphsSetOutlineLevelWrapper,
  paragraphsSetFlowOptionsWrapper,
  paragraphsSetTabStopWrapper,
  paragraphsClearTabStopWrapper,
  paragraphsClearAllTabStopsWrapper,
  paragraphsSetBorderWrapper,
  paragraphsClearBorderWrapper,
  paragraphsSetShadingWrapper,
  paragraphsClearShadingWrapper,
  paragraphsSetDirectionWrapper,
  paragraphsClearDirectionWrapper,
} from '../plan-engine/paragraphs-wrappers.js';
const { stylesApplyAdapter } = await import('../styles-adapter.js');
const { createTableWrapper } = await import('../plan-engine/create-table-wrapper.js');
import {
  tablesDeleteWrapper,
  tablesClearContentsWrapper,
  tablesMoveWrapper,
  tablesSetLayoutWrapper,
  tablesSetAltTextWrapper,
  tablesConvertFromTextWrapper,
  tablesSplitWrapper,
  tablesConvertToTextWrapper,
  tablesInsertRowWrapper,
  tablesDeleteRowWrapper,
  tablesSetRowHeightWrapper,
  tablesDistributeRowsWrapper,
  tablesSetRowOptionsWrapper,
  tablesInsertColumnWrapper,
  tablesDeleteColumnWrapper,
  tablesSetColumnWidthWrapper,
  tablesDistributeColumnsWrapper,
  tablesInsertCellWrapper,
  tablesDeleteCellWrapper,
  tablesMergeCellsWrapper,
  tablesUnmergeCellsWrapper,
  tablesSplitCellWrapper,
  tablesSetCellPropertiesWrapper,
  tablesSortWrapper,
  tablesSetStyleWrapper,
  tablesClearStyleWrapper,
  tablesSetStyleOptionWrapper,
  tablesSetBorderWrapper,
  tablesClearBorderWrapper,
  tablesApplyBorderPresetWrapper,
  tablesSetShadingWrapper,
  tablesClearShadingWrapper,
  tablesSetTablePaddingWrapper,
  tablesSetCellPaddingWrapper,
  tablesSetCellSpacingWrapper,
  tablesClearCellSpacingWrapper,
  tablesApplyStyleWrapper,
  tablesSetBordersWrapper,
  tablesSetTableOptionsWrapper,
} from '../plan-engine/tables-wrappers.js';
const { getDocumentApiCapabilities } = await import('../capabilities-adapter.js');
import {
  tocConfigureWrapper,
  tocUpdateWrapper,
  tocRemoveWrapper,
  createTableOfContentsWrapper,
} from '../plan-engine/toc-wrappers.js';
import {
  tocListEntriesWrapper,
  tocMarkEntryWrapper,
  tocUnmarkEntryWrapper,
  tocEditEntryWrapper,
} from '../plan-engine/toc-entry-wrappers.js';
import {
  createImageWrapper,
  imagesDeleteWrapper,
  imagesMoveWrapper,
  imagesConvertToInlineWrapper,
  imagesConvertToFloatingWrapper,
  imagesSetSizeWrapper,
  imagesSetWrapTypeWrapper,
  imagesSetWrapSideWrapper,
  imagesSetWrapDistancesWrapper,
  imagesSetPositionWrapper,
  imagesSetAnchorOptionsWrapper,
  imagesSetZOrderWrapper,
  imagesScaleWrapper,
  imagesSetLockAspectRatioWrapper,
  imagesRotateWrapper,
  imagesFlipWrapper,
  imagesCropWrapper,
  imagesResetCropWrapper,
  imagesReplaceSourceWrapper,
  imagesSetAltTextWrapper,
  imagesSetDecorativeWrapper,
  imagesSetNameWrapper,
  imagesSetHyperlinkWrapper,
  imagesInsertCaptionWrapper,
  imagesUpdateCaptionWrapper,
  imagesRemoveCaptionWrapper,
} from '../plan-engine/images-wrappers.js';
import {
  hyperlinksWrapWrapper,
  hyperlinksInsertWrapper,
  hyperlinksPatchWrapper,
  hyperlinksRemoveWrapper,
} from '../plan-engine/hyperlinks-wrappers.js';
const { createContentControlsAdapter } = await import('../plan-engine/content-controls-wrappers.js');
import {
  headerFootersRefsSetAdapter,
  headerFootersRefsClearAdapter,
  headerFootersRefsSetLinkedToPreviousAdapter,
  headerFootersPartsCreateAdapter,
  headerFootersPartsDeleteAdapter,
} from '../header-footers-adapter.js';
import {
  listsInsertWrapper,
  listsIndentWrapper,
  listsOutdentWrapper,
  listsCreateWrapper,
  listsAttachWrapper,
  listsDetachWrapper,
  listsJoinWrapper,
  listsSeparateWrapper,
  listsSetLevelWrapper,
  listsSetValueWrapper,
  listsContinuePreviousWrapper,
  listsSetLevelRestartWrapper,
  listsConvertToTextWrapper,
} from '../plan-engine/lists-wrappers.js';
import {
  listsApplyTemplateWrapper,
  listsApplyPresetWrapper,
  listsSetTypeWrapper,
  listsCaptureTemplateWrapper,
  listsSetLevelNumberingWrapper,
  listsSetLevelBulletWrapper,
  listsSetLevelPictureBulletWrapper,
  listsSetLevelAlignmentWrapper,
  listsSetLevelIndentsWrapper,
  listsSetLevelTrailingCharacterWrapper,
  listsSetLevelMarkerFontWrapper,
  listsClearLevelOverridesWrapper,
  listsGetStyleWrapper,
  listsApplyStyleWrapper,
  listsRestartAtWrapper,
  listsSetLevelNumberStyleWrapper,
  listsSetLevelTextWrapper,
  listsSetLevelStartWrapper,
  listsSetLevelLayoutWrapper,
  registerSetValueDelegate,
} from '../plan-engine/lists-formatting-wrappers.js';
const listSequenceHelpers = await import('../helpers/list-sequence-helpers.js');
const { LevelFormattingHelpers } = await import('../../core/helpers/list-level-formatting-helpers.js');
const planWrappers = await import('../plan-engine/plan-wrappers.js');
const { trackChangesAcceptWrapper, trackChangesRejectWrapper } = await import(
  '../plan-engine/track-changes-wrappers.js'
);
const hyperlinkMutationHelper = await import('../helpers/hyperlink-mutation-helper.js');
const adapterUtils = await import('../helpers/adapter-utils.js');
import {
  bookmarksInsertWrapper,
  bookmarksRenameWrapper,
  bookmarksRemoveWrapper,
} from '../plan-engine/bookmark-wrappers.js';

import {
  footnotesInsertWrapper,
  footnotesUpdateWrapper,
  footnotesRemoveWrapper,
  footnotesConfigureWrapper,
} from '../plan-engine/footnote-wrappers.js';
import {
  crossRefsInsertWrapper,
  crossRefsRebuildWrapper,
  crossRefsRemoveWrapper,
} from '../plan-engine/crossref-wrappers.js';
import {
  indexInsertWrapper,
  indexConfigureWrapper,
  indexRebuildWrapper,
  indexRemoveWrapper,
  indexEntriesInsertWrapper,
  indexEntriesUpdateWrapper,
  indexEntriesRemoveWrapper,
} from '../plan-engine/index-wrappers.js';
import {
  captionsInsertWrapper,
  captionsUpdateWrapper,
  captionsRemoveWrapper,
  captionsConfigureWrapper,
} from '../plan-engine/caption-wrappers.js';
const { fieldsInsertWrapper, fieldsRebuildWrapper, fieldsRemoveWrapper } = await import(
  '../plan-engine/field-wrappers.js'
);
import {
  citationsInsertWrapper,
  citationsUpdateWrapper,
  citationsRemoveWrapper,
  citationSourcesInsertWrapper,
  citationSourcesUpdateWrapper,
  citationSourcesRemoveWrapper,
  bibliographyInsertWrapper,
  bibliographyConfigureWrapper,
  bibliographyRebuildWrapper,
  bibliographyRemoveWrapper,
} from '../plan-engine/citation-wrappers.js';
import {
  authoritiesInsertWrapper,
  authoritiesConfigureWrapper,
  authoritiesRebuildWrapper,
  authoritiesRemoveWrapper,
  authorityEntriesInsertWrapper,
  authorityEntriesUpdateWrapper,
  authorityEntriesRemoveWrapper,
} from '../plan-engine/authority-wrappers.js';
const { registerBuiltInExecutors } = await import('../plan-engine/register-executors.js');
const { getRevision, initRevision } = await import('../plan-engine/revision-tracker.js');
const { registerPartDescriptor, clearPartDescriptors } = await import('../../core/parts/registry/part-registry.js');
const { numberingPartDescriptor } = await import('../../core/parts/adapters/numbering-part-descriptor.js');
const { settingsPartDescriptor } = await import('../../core/parts/adapters/settings-part-descriptor.js');
const { stylesPartDescriptor } = await import('../../core/parts/adapters/styles-part-descriptor.js');
const { clearInvalidationHandlers } = await import('../../core/parts/invalidation/part-invalidation-registry.js');
const { executePlan } = await import('../plan-engine/executor.js');
const { toCanonicalTrackedChangeId } = await import('../helpers/tracked-change-resolver.js');
const { writeAdapter } = await import('../write-adapter.js');
import {
  tablesGetCellsAdapter,
  tablesGetPropertiesAdapter,
  tablesGetStylesAdapter,
  tablesSetDefaultStyleAdapter,
  tablesClearDefaultStyleAdapter,
} from '../tables-adapter.js';
import {
  createSectionBreakAdapter,
  sectionsSetBreakTypeAdapter,
  sectionsSetPageMarginsAdapter,
  sectionsSetHeaderFooterMarginsAdapter,
  sectionsSetPageSetupAdapter,
  sectionsSetColumnsAdapter,
  sectionsSetLineNumberingAdapter,
  sectionsSetPageNumberingAdapter,
  sectionsSetTitlePageAdapter,
  sectionsSetOddEvenHeadersFootersAdapter,
  sectionsSetVerticalAlignAdapter,
  sectionsSetSectionDirectionAdapter,
  sectionsSetHeaderFooterRefAdapter,
  sectionsClearHeaderFooterRefAdapter,
  sectionsSetLinkToPreviousAdapter,
  sectionsSetPageBordersAdapter,
  sectionsClearPageBordersAdapter,
} from '../sections-adapter.js';
const { validateJsonSchema } = await import('./schema-validator.js');

const mockedDeps = {
  resolveCommentAnchorsById: mock(() => []),
  listCommentAnchors: mock(() => []),
  getTrackChanges: mock(() => []),
  insertRowAtIndex: mock(() => {}),
};

mock.module('../helpers/comment-target-resolver.js', () => ({
  resolveCommentAnchorsById: mockedDeps.resolveCommentAnchorsById,
  listCommentAnchors: mockedDeps.listCommentAnchors,
}));

mock.module('../../extensions/track-changes/trackChangesHelpers/getTrackChanges.js', () => ({
  getTrackChanges: mockedDeps.getTrackChanges,
}));

mock.module('../../extensions/table/tableHelpers/appendRows.js', () => ({
  insertRowAtIndex: mockedDeps.insertRowAtIndex,
}));

mock.module('prosemirror-tables', () => ({
  TableMap: {
    get: mock(() => ({
      width: 2,
      height: 2,
      // Positions of cells within table content tree (matches nodeAt traversal):
      // Row 0: cell-1 at pos 1, cell-2 at pos 10
      // Row 1: cell-3 at pos 21, cell-4 at pos 29
      map: [1, 10, 21, 29],
      positionAt: mock(() => 1),
      colCount: mock(() => 0),
    })),
  },
}));

mock.module('prosemirror-model', async (importOriginal) => {
  const original = await importOriginal<typeof import('prosemirror-model')>();
  return {
    ...original,
    Fragment: { from: mock((node: unknown) => node) },
  };
});

// ---------------------------------------------------------------------------
// Reference namespace resolver mocks
// ---------------------------------------------------------------------------

const refResolverMocks = {
  // Bookmark
  findAllBookmarks: mock(() => []),
  resolveBookmarkTarget: mock(),
  extractBookmarkInfo: mock(),
  buildBookmarkDiscoveryItem: mock(),
  // Link
  findAllLinks: mock(() => []),
  resolveLinkTarget: mock(),
  extractLinkInfo: mock(),
  buildLinkDiscoveryItem: mock(),
  // Footnote
  findAllFootnotes: mock(() => []),
  resolveFootnoteTarget: mock(),
  extractFootnoteInfo: mock(),
  buildFootnoteDiscoveryItem: mock(),
  // Cross-ref
  findAllCrossRefs: mock(() => []),
  resolveCrossRefTarget: mock(),
  extractCrossRefInfo: mock(),
  buildCrossRefDiscoveryItem: mock(),
  // Index (block + entry)
  findAllIndexNodes: mock(() => []),
  resolveIndexTarget: mock(),
  extractIndexInfo: mock(),
  buildIndexDiscoveryItem: mock(),
  findAllIndexEntries: mock(() => []),
  resolveIndexEntryTarget: mock(),
  extractIndexEntryInfo: mock(),
  buildIndexEntryDiscoveryItem: mock(),
  // Caption
  findAllCaptions: mock(() => []),
  resolveCaptionTarget: mock(),
  extractCaptionInfo: mock(),
  buildCaptionDiscoveryItem: mock(),
  // Field
  findAllFields: mock(() => []),
  resolveFieldTarget: mock(),
  extractFieldInfo: mock(),
  buildFieldDiscoveryItem: mock(),
  // Citation (inline + bibliography + source)
  findAllCitations: mock(() => []),
  resolveCitationTarget: mock(),
  extractCitationInfo: mock(),
  buildCitationDiscoveryItem: mock(),
  findAllBibliographies: mock(() => []),
  resolveBibliographyTarget: mock(),
  extractBibliographyInfo: mock(),
  buildBibliographyDiscoveryItem: mock(),
  getSourcesFromConverter: mock(() => []),
  resolveSourceTarget: mock(),
  // Authority (block + entry)
  findAllAuthorities: mock(() => []),
  resolveAuthorityTarget: mock(),
  extractAuthorityInfo: mock(),
  buildAuthorityDiscoveryItem: mock(),
  findAllAuthorityEntries: mock(() => []),
  resolveAuthorityEntryTarget: mock(),
  extractAuthorityEntryInfo: mock(),
  buildAuthorityEntryDiscoveryItem: mock(),
};

mock.module('../helpers/bookmark-resolver.js', () => ({
  findAllBookmarks: refResolverMocks.findAllBookmarks,
  resolveBookmarkTarget: refResolverMocks.resolveBookmarkTarget,
  extractBookmarkInfo: refResolverMocks.extractBookmarkInfo,
  buildBookmarkDiscoveryItem: refResolverMocks.buildBookmarkDiscoveryItem,
}));

mock.module('../helpers/footnote-resolver.js', () => ({
  findAllFootnotes: refResolverMocks.findAllFootnotes,
  resolveFootnoteTarget: refResolverMocks.resolveFootnoteTarget,
  extractFootnoteInfo: refResolverMocks.extractFootnoteInfo,
  buildFootnoteDiscoveryItem: refResolverMocks.buildFootnoteDiscoveryItem,
}));

mock.module('../helpers/crossref-resolver.js', () => ({
  findAllCrossRefs: refResolverMocks.findAllCrossRefs,
  resolveCrossRefTarget: refResolverMocks.resolveCrossRefTarget,
  extractCrossRefInfo: refResolverMocks.extractCrossRefInfo,
  buildCrossRefDiscoveryItem: refResolverMocks.buildCrossRefDiscoveryItem,
}));

mock.module('../helpers/index-resolver.js', async (importOriginal) => {
  const orig = await importOriginal<Record<string, unknown>>();
  return {
    findAllIndexNodes: refResolverMocks.findAllIndexNodes,
    resolveIndexTarget: refResolverMocks.resolveIndexTarget,
    extractIndexInfo: refResolverMocks.extractIndexInfo,
    buildIndexDiscoveryItem: refResolverMocks.buildIndexDiscoveryItem,
    findAllIndexEntries: refResolverMocks.findAllIndexEntries,
    resolveIndexEntryTarget: refResolverMocks.resolveIndexEntryTarget,
    extractIndexEntryInfo: refResolverMocks.extractIndexEntryInfo,
    buildIndexEntryDiscoveryItem: refResolverMocks.buildIndexEntryDiscoveryItem,
    parseIndexInstruction: orig.parseIndexInstruction,
  };
});

mock.module('../helpers/caption-resolver.js', () => ({
  findAllCaptions: refResolverMocks.findAllCaptions,
  resolveCaptionTarget: refResolverMocks.resolveCaptionTarget,
  extractCaptionInfo: refResolverMocks.extractCaptionInfo,
  buildCaptionDiscoveryItem: refResolverMocks.buildCaptionDiscoveryItem,
}));

mock.module('../helpers/field-resolver.js', () => ({
  findAllFields: refResolverMocks.findAllFields,
  resolveFieldTarget: refResolverMocks.resolveFieldTarget,
  extractFieldInfo: refResolverMocks.extractFieldInfo,
  buildFieldDiscoveryItem: refResolverMocks.buildFieldDiscoveryItem,
}));

mock.module('../helpers/citation-resolver.js', () => ({
  findAllCitations: refResolverMocks.findAllCitations,
  resolveCitationTarget: refResolverMocks.resolveCitationTarget,
  extractCitationInfo: refResolverMocks.extractCitationInfo,
  buildCitationDiscoveryItem: refResolverMocks.buildCitationDiscoveryItem,
  findAllBibliographies: refResolverMocks.findAllBibliographies,
  resolveBibliographyTarget: refResolverMocks.resolveBibliographyTarget,
  extractBibliographyInfo: refResolverMocks.extractBibliographyInfo,
  buildBibliographyDiscoveryItem: refResolverMocks.buildBibliographyDiscoveryItem,
  getSourcesFromConverter: refResolverMocks.getSourcesFromConverter,
  resolveSourceTarget: refResolverMocks.resolveSourceTarget,
}));

mock.module('../helpers/authority-resolver.js', async (importOriginal) => {
  const orig = await importOriginal<Record<string, unknown>>();
  return {
    findAllAuthorities: refResolverMocks.findAllAuthorities,
    resolveAuthorityTarget: refResolverMocks.resolveAuthorityTarget,
    extractAuthorityInfo: refResolverMocks.extractAuthorityInfo,
    buildAuthorityDiscoveryItem: refResolverMocks.buildAuthorityDiscoveryItem,
    findAllAuthorityEntries: refResolverMocks.findAllAuthorityEntries,
    resolveAuthorityEntryTarget: refResolverMocks.resolveAuthorityEntryTarget,
    extractAuthorityEntryInfo: refResolverMocks.extractAuthorityEntryInfo,
    buildAuthorityEntryDiscoveryItem: refResolverMocks.buildAuthorityEntryDiscoveryItem,
    parseToaInstruction: orig.parseToaInstruction,
  };
});

const INTERNAL_SCHEMAS = buildInternalContractSchemas();

type MutationVector = {
  throwCase: () => unknown;
  applyCase: () => unknown;
  failureCase?: () => unknown;
};

type NodeOptions = {
  attrs?: Record<string, unknown>;
  text?: string;
  isInline?: boolean;
  isBlock?: boolean;
  isLeaf?: boolean;
  inlineContent?: boolean;
  nodeSize?: number;
};

type MockParagraphNode = {
  type: { name: 'paragraph' };
  attrs: Record<string, unknown>;
  nodeSize: number;
  isBlock: true;
  textContent: string;
};

function createNode(typeName: string, children: ProseMirrorNode[] = [], options: NodeOptions = {}): ProseMirrorNode {
  const attrs = options.attrs ?? {};
  const text = options.text ?? '';
  const isText = typeName === 'text';
  const isInline = options.isInline ?? isText;
  const isBlock = options.isBlock ?? (!isInline && typeName !== 'doc');
  const inlineContent = options.inlineContent ?? isBlock;
  const isLeaf = options.isLeaf ?? (isInline && !isText && children.length === 0);

  const contentSize = children.reduce((sum, child) => sum + child.nodeSize, 0);
  const nodeSize = isText ? text.length : options.nodeSize != null ? options.nodeSize : isLeaf ? 1 : contentSize + 2;

  const node = {
    type: {
      name: typeName,
      create(newAttrs: Record<string, unknown>, newContent: unknown) {
        return createNode(typeName, [], { attrs: newAttrs, isBlock, inlineContent });
      },
      createAndFill() {
        return createNode(typeName, [], { attrs: {}, isBlock, inlineContent });
      },
    },
    attrs,
    text: isText ? text : undefined,
    content: { size: contentSize },
    nodeSize,
    isText,
    isInline,
    isBlock,
    inlineContent,
    isTextblock: inlineContent,
    isLeaf,
    childCount: children.length,
    child(index: number) {
      return children[index]!;
    },
    forEach(fn: (node: ProseMirrorNode, offset: number, index: number) => void) {
      let offset = 0;
      children.forEach((child, index) => {
        fn(child, offset, index);
        offset += child.nodeSize;
      });
    },
    nodeAt(pos: number): ProseMirrorNode | null {
      let offset = 0;
      for (const child of children) {
        if (pos === offset) return child;
        if (pos < offset + child.nodeSize) {
          return (child as unknown as { nodeAt: (p: number) => ProseMirrorNode | null }).nodeAt(pos - offset - 1);
        }
        offset += child.nodeSize;
      }
      return null;
    },
    copy(_content?: unknown) {
      return node;
    },
    get textContent(): string {
      if (isText) return text;
      return children.map((c) => c.textContent).join('');
    },
    _children: children,
    descendants(callback: (node: ProseMirrorNode, pos: number) => boolean | void) {
      function walk(kids: ProseMirrorNode[], startPos: number) {
        let offset = startPos;
        for (const child of kids) {
          const childStart = offset;
          const result = callback(child, childStart);
          if (result !== false) {
            const innerKids = (child as unknown as { _children?: ProseMirrorNode[] })._children;
            if (innerKids && innerKids.length > 0) {
              walk(innerKids, childStart + 1);
            }
          }
          offset += child.nodeSize;
        }
      }
      walk(children, 0);
    },
  };
  return node as unknown as ProseMirrorNode;
}

function makeTextEditor(
  text = 'Hello',
  overrides: Partial<Editor> & {
    commands?: Record<string, unknown>;
    schema?: Record<string, unknown>;
  } = {},
): {
  editor: Editor;
  dispatch: ReturnType<typeof mock>;
  tr: {
    insertText: ReturnType<typeof mock>;
    delete: ReturnType<typeof mock>;
    addMark: ReturnType<typeof mock>;
    removeMark: ReturnType<typeof mock>;
    replaceWith: ReturnType<typeof mock>;
    insert: ReturnType<typeof mock>;
    setMeta: ReturnType<typeof mock>;
  };
} {
  const textNode = createNode('text', [], { text });
  const paragraph = createNode('paragraph', [textNode], {
    attrs: { sdBlockId: 'p1' },
    isBlock: true,
    inlineContent: true,
  });
  const doc = createNode('doc', [paragraph], { isBlock: false });

  const tr = {
    insertText: mock(),
    delete: mock(),
    addMark: mock(),
    removeMark: mock(),
    replaceWith: mock(),
    insert: mock(),
    setMeta: mock(),
    mapping: { map: (pos: number) => pos },
    docChanged: false,
    doc: {
      resolve: () => ({ marks: () => [] }),
    },
  };
  tr.insertText.mockReturnValue(tr);
  tr.delete.mockReturnValue(tr);
  tr.addMark.mockReturnValue(tr);
  tr.removeMark.mockReturnValue(tr);
  tr.replaceWith.mockReturnValue(tr);
  tr.insert.mockReturnValue(tr);
  tr.setMeta.mockReturnValue(tr);

  const dispatch = mock();

  const baseCommands = {
    insertTrackedChange: mock(() => true),
    setTextSelection: mock(() => true),
    addComment: mock(() => true),
    editComment: mock(() => true),
    addCommentReply: mock(() => true),
    moveComment: mock(() => true),
    resolveComment: mock(() => true),
    removeComment: mock(() => true),
    setCommentInternal: mock(() => true),
    setActiveComment: mock(() => true),
    setCursorById: mock(() => true),
    acceptTrackedChangeById: mock(() => true),
    rejectTrackedChangeById: mock(() => true),
    acceptAllTrackedChanges: mock(() => true),
    rejectAllTrackedChanges: mock(() => true),
    insertParagraphAt: mock(() => true),
    insertHeadingAt: mock(() => true),
    insertListItemAt: mock(() => true),
    setListTypeAt: mock(() => true),
    increaseListIndent: mock(() => true),
    decreaseListIndent: mock(() => true),
    restartNumbering: mock(() => true),
    exitListItemAt: mock(() => true),
    setFontSize: mock(() => true),
    unsetFontSize: mock(() => true),
    setFontFamily: mock(() => true),
    unsetFontFamily: mock(() => true),
    setColor: mock(() => true),
    unsetColor: mock(() => true),
    setTextAlign: mock(() => true),
    unsetTextAlign: mock(() => true),
  };

  const baseMarks = {
    bold: {
      create: mock(() => ({ type: 'bold' })),
    },
    italic: {
      create: mock(() => ({ type: 'italic' })),
    },
    underline: {
      create: mock(() => ({ type: 'underline' })),
    },
    strike: {
      create: mock(() => ({ type: 'strike' })),
    },
    textStyle: {
      create: mock(() => ({ type: 'textStyle' })),
    },
    [TrackFormatMarkName]: {
      create: mock(() => ({ type: TrackFormatMarkName })),
    },
  };

  const stateSchema = {
    marks: baseMarks,
    text: (t: string, m?: unknown[]) => ({ type: { name: 'text' }, text: t, marks: m ?? [] }),
    nodes: {
      paragraph: {
        createAndFill: mock((attrs?: unknown, content?: unknown) => ({
          type: { name: 'paragraph' },
          attrs,
          content,
          nodeSize: 2,
        })),
        create: mock((attrs?: unknown, content?: unknown) => ({
          type: { name: 'paragraph' },
          attrs,
          content,
          nodeSize: 2,
        })),
      },
    },
  };

  const editor = {
    state: {
      doc: {
        ...doc,
        nodeAt: mock((pos: number) => {
          if (pos === 0) return paragraph;
          if (pos === 1) return textNode;
          return null;
        }),
        textBetween: mock((from: number, to: number) => {
          const start = Math.max(0, from - 1);
          const end = Math.max(start, to - 1);
          return text.slice(start, end);
        }),
        nodesBetween: mock((_from: number, _to: number, callback: (node: any, pos: number) => boolean | void) => {
          // Visit paragraph at pos 0, then text child at pos 1
          if (callback({ ...paragraph, marks: [] }, 0) !== false) {
            callback({ ...textNode, marks: [] }, 1);
          }
        }),
      },
      tr,
      schema: stateSchema,
    },
    can: mock(() => ({
      insertParagraphAt: mock(() => true),
      insertHeadingAt: mock(() => true),
      insertListItemAt: mock(() => true),
      setListTypeAt: mock(() => true),
      increaseListIndent: mock(() => true),
      decreaseListIndent: mock(() => true),
      restartNumbering: mock(() => true),
      exitListItemAt: mock(() => true),
    })),
    dispatch,
    ...overrides,
    schema: {
      marks: baseMarks,
      ...(overrides.schema ?? {}),
    },
    commands: {
      ...baseCommands,
      ...(overrides.commands ?? {}),
    },
  } as unknown as Editor;

  return { editor, dispatch, tr };
}

function makeListParagraph(options: {
  id: string;
  text?: string;
  numId?: number;
  ilvl?: number;
  numberingType?: string;
  markerText?: string;
  path?: number[];
}): MockParagraphNode {
  const text = options.text ?? '';
  const numberingProperties =
    options.numId != null
      ? {
          numId: options.numId,
          ilvl: options.ilvl ?? 0,
        }
      : undefined;

  return {
    type: { name: 'paragraph' },
    attrs: {
      paraId: options.id,
      sdBlockId: options.id,
      paragraphProperties: numberingProperties ? { numberingProperties } : {},
      listRendering:
        options.numId != null
          ? {
              markerText: options.markerText ?? '',
              path: options.path ?? [1],
              numberingType: options.numberingType ?? 'decimal',
            }
          : null,
    },
    nodeSize: Math.max(2, text.length + 2),
    isBlock: true,
    textContent: text,
  };
}

function makeListEditor(children: MockParagraphNode[], commandOverrides: Record<string, unknown> = {}): Editor {
  const doc = {
    get content() {
      return {
        size: children.reduce((sum, child) => sum + child.nodeSize, 0),
      };
    },
    descendants(callback: (node: MockParagraphNode, pos: number) => void) {
      let pos = 0;
      for (const child of children) {
        callback(child, pos);
        pos += child.nodeSize;
      }
      return undefined;
    },
    nodesBetween(_from: number, _to: number, callback: (node: unknown) => void) {
      for (const child of children) {
        callback(child);
      }
      return undefined;
    },
  };

  const baseCommands = {
    insertListItemAt: mock(() => true),
    setTextSelection: mock(() => true),
    insertTrackedChange: mock(() => true),
  };

  const tr = {
    setMeta: mock().mockReturnThis(),
    insertText: mock().mockReturnThis(),
    delete: mock().mockReturnThis(),
    setNodeMarkup: mock().mockReturnThis(),
    mapping: {
      maps: [] as unknown[],
      map: (p: number) => p,
      slice: () => ({ map: (p: number) => p }),
    },
    doc,
  };

  return {
    state: { doc, tr },
    dispatch: mock(),
    emit: mock(),
    view: { dispatch: mock() },
    commands: {
      ...baseCommands,
      ...commandOverrides,
    },
    converter: {
      convertedXml: {
        'word/numbering.xml': {
          elements: [{ type: 'element', name: 'w:numbering', elements: [] }],
        },
      },
      numbering: { definitions: {}, abstracts: {} },
      translatedNumbering: { definitions: {} },
      documentModified: false,
      documentGuid: 'test-guid',
    },
  } as unknown as Editor;
}

/**
 * Modify `converter.numbering.abstracts` so that `syncNumberingToXmlTree`
 * produces a detectable diff inside `mutatePart`. Without this, mocks that
 * return `true` / `{ changed: true }` without touching numbering data cause
 * `mutatePart` to see no change and return `{ changed: false }`.
 */
function injectNumberingChange(editor: unknown): void {
  const ed = editor as { converter: { numbering: { abstracts: Record<number, unknown> } } };
  ed.converter.numbering.abstracts[1] = {
    type: 'element',
    name: 'w:abstractNum',
    attributes: { 'w:abstractNumId': '1' },
    elements: [{ type: 'element', name: 'w:lvl', attributes: { 'w:ilvl': '0' }, elements: [] }],
  };
}

function makeBlockDeleteEditor(
  overrides: {
    deleteBlockNodeById?: unknown;
    getBlockNodeById?: unknown;
    hasParagraph?: boolean;
  } = {},
): Editor {
  const hasParagraph = overrides.hasParagraph ?? true;
  const paragraph = hasParagraph
    ? createNode('paragraph', [createNode('text', [], { text: 'Hello' })], {
        attrs: { paraId: 'p1', sdBlockId: 'p1' },
        isBlock: true,
        inlineContent: true,
      })
    : null;
  const doc = createNode('doc', paragraph ? [paragraph] : [], { isBlock: false });

  const dispatch = mock();
  const tr = {
    setMeta: mock().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged: false,
  };

  return {
    state: { doc, tr },
    dispatch,
    commands: {
      deleteBlockNodeById: overrides.deleteBlockNodeById ?? mock(() => true),
    },
    helpers: {
      blockNode: {
        getBlockNodeById:
          overrides.getBlockNodeById ??
          mock((id: string) => (id === 'p1' && hasParagraph ? [{ node: paragraph, pos: 0 }] : [])),
      },
    },
  } as unknown as Editor;
}

function makeBlockRangeDeleteEditor(): Editor {
  const p1 = createNode('paragraph', [createNode('text', [], { text: 'First' })], {
    attrs: { paraId: 'p1', sdBlockId: 'p1' },
    isBlock: true,
    inlineContent: true,
  });
  const p2 = createNode('paragraph', [createNode('text', [], { text: 'Second' })], {
    attrs: { paraId: 'p2', sdBlockId: 'p2' },
    isBlock: true,
    inlineContent: true,
  });
  const children = [p1, p2];
  const doc = createNode('doc', children, { isBlock: false });

  const dispatch = mock();
  const tr = {
    setMeta: mock().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged: false,
    delete: mock().mockImplementation(function (this: { docChanged: boolean }) {
      this.docChanged = true;
    }),
  };

  return {
    state: { doc, tr },
    dispatch,
    commands: {
      deleteBlockNodeById: mock(() => true),
    },
    helpers: {
      blockNode: {
        getBlockNodeById: mock((id: string) => {
          const match = children.find((c) => c.attrs?.sdBlockId === id || c.attrs?.paraId === id);
          return match ? [{ node: match, pos: 0 }] : [];
        }),
      },
    },
  } as unknown as Editor;
}

function makeBlockRangeDeleteEditorWithSectionBreak(): Editor {
  const p1 = createNode('paragraph', [createNode('text', [], { text: 'First' })], {
    attrs: { paraId: 'p1', sdBlockId: 'p1' },
    isBlock: true,
    inlineContent: true,
  });
  const sectBreakPara = createNode('paragraph', [createNode('text', [], { text: 'Section end' })], {
    attrs: {
      paraId: 'sect1',
      sdBlockId: 'sect1',
      paragraphProperties: { sectPr: { name: 'w:sectPr', elements: [] } },
    },
    isBlock: true,
    inlineContent: true,
  });
  const p3 = createNode('paragraph', [createNode('text', [], { text: 'Third' })], {
    attrs: { paraId: 'p3', sdBlockId: 'p3' },
    isBlock: true,
    inlineContent: true,
  });
  const children = [p1, sectBreakPara, p3];
  const doc = createNode('doc', children, { isBlock: false });

  const dispatch = mock();
  const tr = {
    setMeta: mock().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged: false,
  };

  return {
    state: { doc, tr },
    dispatch,
    commands: {
      deleteBlockNodeById: mock(() => true),
    },
    helpers: {
      blockNode: {
        getBlockNodeById: mock((id: string) => {
          const match = children.find((c) => c.attrs?.sdBlockId === id || c.attrs?.paraId === id);
          return match ? [{ node: match, pos: 0 }] : [];
        }),
      },
    },
  } as unknown as Editor;
}

function makeCommentRecord(
  commentId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> & { commentId: string } {
  return {
    commentId,
    commentText: 'Original',
    isDone: false,
    isInternal: false,
    ...overrides,
  };
}

function makeCommentsEditor(
  records: Array<Record<string, unknown>> = [],
  commandOverrides: Record<string, unknown> = {},
): Editor {
  const { editor } = makeTextEditor('Hello', { commands: commandOverrides });
  return {
    ...editor,
    converter: {
      comments: [...records],
    },
    options: {
      documentId: 'doc-1',
      user: {
        name: 'Agent',
        email: 'agent@example.com',
      },
    },
  } as unknown as Editor;
}

/**
 * Creates a mock editor with a valid `word/styles.xml` structure for styles.apply tests.
 * Optionally omit the converter or styles part to test capability gates.
 */
function makeStylesEditor(
  opts: {
    hasConverter?: boolean;
    hasStylesPart?: boolean;
    boldElements?: Array<{ attributes?: Record<string, string> }>;
  } = {},
): Editor {
  const { hasConverter = true, hasStylesPart = true, boldElements = [] } = opts;

  const rPrElements = boldElements.map((el) => ({
    name: 'w:b',
    ...(el.attributes ? { attributes: el.attributes } : {}),
  }));

  const stylesXml = {
    name: 'xml',
    elements: [
      {
        name: 'w:styles',
        elements: [
          {
            name: 'w:docDefaults',
            elements: [
              {
                name: 'w:rPrDefault',
                elements: [
                  {
                    name: 'w:rPr',
                    elements: rPrElements,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const converter = hasConverter
    ? {
        convertedXml: hasStylesPart ? { 'word/styles.xml': stylesXml } : {},
        documentModified: false,
        documentGuid: 'test-guid',
        promoteToGuid: mock(() => 'promoted-guid'),
        translatedLinkedStyles: {},
      }
    : undefined;

  return {
    converter,
    options: {},
    on: mock(),
    emit: mock(),
  } as unknown as Editor;
}

/**
 * Creates a mock editor with a table document structure for table adapter conformance tests.
 *
 * Document structure: doc > table > tableRow > tableCell > paragraph
 * The table, row, and cell all have sdBlockId attrs so they get indexed.
 */
function makeTableEditor(
  commandOverrides: Record<string, unknown> = {},
  options?: { throwOnDispatch?: boolean; rowHeight?: number | null; cellColspan?: number },
): Editor {
  const textNode = createNode('text', [], { text: 'Hello' });
  const paragraph = createNode('paragraph', [textNode], {
    attrs: { sdBlockId: 'p1', paraId: 'p1', paragraphProperties: {} },
    isBlock: true,
    inlineContent: true,
  });
  const cell1Colspan = options?.cellColspan ?? 1;
  const tableCell = createNode('tableCell', [paragraph], {
    attrs: { sdBlockId: 'cell-1', colspan: cell1Colspan, rowspan: 1 },
    isBlock: true,
    inlineContent: false,
  });
  const tableCell2 = createNode(
    'tableCell',
    [
      createNode('paragraph', [createNode('text', [], { text: 'World' })], {
        attrs: { sdBlockId: 'p2', paraId: 'p2', paragraphProperties: {} },
        isBlock: true,
        inlineContent: true,
      }),
    ],
    {
      attrs: { sdBlockId: 'cell-2', colspan: 1, rowspan: 1 },
      isBlock: true,
      inlineContent: false,
    },
  );
  const rh = options?.rowHeight ?? null;
  const tableRow = createNode('tableRow', [tableCell, tableCell2], {
    attrs: { sdBlockId: 'row-1', rowHeight: rh, cantSplit: false, tableRowProperties: {} },
    isBlock: true,
    inlineContent: false,
  });
  const tableRow2 = createNode(
    'tableRow',
    [
      createNode(
        'tableCell',
        [
          createNode('paragraph', [createNode('text', [], { text: 'R2C1' })], {
            attrs: { sdBlockId: 'p3', paraId: 'p3', paragraphProperties: {} },
            isBlock: true,
            inlineContent: true,
          }),
        ],
        {
          attrs: { sdBlockId: 'cell-3', colspan: 1, rowspan: 1 },
          isBlock: true,
          inlineContent: false,
        },
      ),
      createNode(
        'tableCell',
        [
          createNode('paragraph', [createNode('text', [], { text: 'R2C2' })], {
            attrs: { sdBlockId: 'p4', paraId: 'p4', paragraphProperties: {} },
            isBlock: true,
            inlineContent: true,
          }),
        ],
        {
          attrs: { sdBlockId: 'cell-4', colspan: 1, rowspan: 1 },
          isBlock: true,
          inlineContent: false,
        },
      ),
    ],
    {
      attrs: { sdBlockId: 'row-2', rowHeight: rh, cantSplit: false, tableRowProperties: {} },
      isBlock: true,
      inlineContent: false,
    },
  );
  const table = createNode('table', [tableRow, tableRow2], {
    attrs: {
      sdBlockId: 'table-1',
      tableProperties: {},
      tableGrid: [5000, 5000],
    },
    isBlock: true,
    inlineContent: false,
  });
  const doc = createNode('doc', [table], { isBlock: false });

  const dispatch = options?.throwOnDispatch
    ? mock(() => {
        throw new Error('dispatch failed');
      })
    : mock();
  const insertTableAt = mock(() => true);

  const baseCommands = {
    insertTableAt,
    insertTrackedChange: mock(() => true),
    ...commandOverrides,
  };

  const mockParagraph = createNode('paragraph', [], {
    attrs: { paragraphProperties: {} },
    isBlock: true,
    inlineContent: true,
  });
  const mockCell = createNode('tableCell', [mockParagraph], {
    attrs: { colspan: 1, rowspan: 1 },
    isBlock: true,
    inlineContent: false,
  });
  const mockRow = createNode('tableRow', [mockCell], {
    attrs: { sdBlockId: 'mock-row' },
    isBlock: true,
    inlineContent: false,
  });
  const mockTable = createNode('table', [mockRow], {
    attrs: { sdBlockId: 'mock-table' },
    isBlock: true,
    inlineContent: false,
  });
  const schemaNodes = {
    paragraph: {
      createAndFill: mock((_attrs?: unknown, content?: unknown) => {
        const children = content ? [content] : [];
        return createNode('paragraph', children as ProseMirrorNode[], {
          attrs: { paragraphProperties: {} },
          isBlock: true,
          inlineContent: true,
        });
      }),
    },
    table: {
      createAndFill: mock(() => mockTable),
      create: mock((_attrs?: unknown, content?: unknown) => {
        const children =
          content && typeof (content as { forEach?: unknown }).forEach === 'function' ? [] : content ? [content] : [];
        return createNode('table', children as ProseMirrorNode[], {
          attrs: { sdBlockId: 'new-table' },
          isBlock: true,
          inlineContent: false,
        });
      }),
    },
    tableRow: {
      createAndFill: mock((_attrs?: unknown, content?: unknown) => {
        const children = Array.isArray(content) ? content : content ? [content] : [];
        return createNode('tableRow', children as ProseMirrorNode[], {
          attrs: { sdBlockId: 'new-row' },
          isBlock: true,
          inlineContent: false,
        });
      }),
    },
    tableCell: {
      createAndFill: mock((_attrs?: unknown, content?: unknown) => {
        const children = content ? [content] : [mockParagraph];
        return createNode('tableCell', children as ProseMirrorNode[], {
          attrs: { colspan: 1, rowspan: 1 },
          isBlock: true,
          inlineContent: false,
        });
      }),
    },
  };

  const docWithMethods = {
    ...doc,
    textBetween: mock(() => ''),
  };

  const tr = {
    insertText: mock().mockReturnThis(),
    delete: mock().mockReturnThis(),
    setNodeMarkup: mock().mockReturnThis(),
    replaceWith: mock().mockReturnThis(),
    insert: mock().mockReturnThis(),
    setMeta: mock().mockReturnThis(),
    mapping: {
      maps: [] as unknown[],
      map: (p: number) => p,
      slice: () => ({ map: (p: number) => p }),
    },
    doc: docWithMethods,
  };

  return {
    state: {
      doc: docWithMethods,
      tr,
      schema: {
        nodes: schemaNodes,
        text: (t: string) => createNode('text', [], { text: t }),
      },
    },
    dispatch,
    commands: baseCommands,
    can: mock(() => ({
      insertTableAt: mock(() => true),
    })),
    schema: {
      marks: {},
      nodes: schemaNodes,
      text: (t: string) => createNode('text', [], { text: t }),
    },
    options: {},
  } as unknown as Editor;
}

type SectionEditorOptions = {
  bodySectPr?: Record<string, unknown> | null;
  paragraphSectPr?: Record<string, unknown> | null;
  includeConverter?: boolean;
  throwOnInsert?: boolean;
  includeParagraphNodeType?: boolean;
};

const BASE_SECTION_BODY_SECT_PR: Record<string, unknown> = {
  type: 'element',
  name: 'w:sectPr',
  elements: [
    { type: 'element', name: 'w:type', attributes: { 'w:val': 'continuous' } },
    {
      type: 'element',
      name: 'w:pgMar',
      attributes: {
        'w:top': '1440',
        'w:right': '1440',
        'w:bottom': '1440',
        'w:left': '1440',
        'w:gutter': '0',
        'w:header': '720',
        'w:footer': '720',
      },
    },
    {
      type: 'element',
      name: 'w:pgSz',
      attributes: {
        'w:w': '12240',
        'w:h': '15840',
        'w:orient': 'portrait',
        'w:code': '1',
      },
    },
    {
      type: 'element',
      name: 'w:cols',
      attributes: { 'w:num': '1', 'w:space': '720', 'w:equalWidth': '1' },
    },
    {
      type: 'element',
      name: 'w:lnNumType',
      attributes: { 'w:countBy': '1', 'w:start': '1', 'w:distance': '720', 'w:restart': 'continuous' },
    },
    {
      type: 'element',
      name: 'w:pgNumType',
      attributes: { 'w:start': '1', 'w:fmt': 'decimal' },
    },
    { type: 'element', name: 'w:titlePg', elements: [] },
    { type: 'element', name: 'w:vAlign', attributes: { 'w:val': 'top' } },
    {
      type: 'element',
      name: 'w:headerReference',
      attributes: { 'w:type': 'default', 'r:id': 'rIdHeaderDefault' },
    },
    {
      type: 'element',
      name: 'w:footerReference',
      attributes: { 'w:type': 'default', 'r:id': 'rIdFooterDefault' },
    },
    {
      type: 'element',
      name: 'w:pgBorders',
      attributes: { 'w:display': 'allPages', 'w:offsetFrom': 'page', 'w:zOrder': 'front' },
      elements: [
        {
          type: 'element',
          name: 'w:top',
          attributes: { 'w:val': 'single', 'w:sz': '8', 'w:space': '0', 'w:color': '000000' },
        },
      ],
    },
  ],
};

const PREVIOUS_SECTION_SECT_PR: Record<string, unknown> = {
  type: 'element',
  name: 'w:sectPr',
  elements: [
    { type: 'element', name: 'w:type', attributes: { 'w:val': 'nextPage' } },
    {
      type: 'element',
      name: 'w:headerReference',
      attributes: { 'w:type': 'default', 'r:id': 'rIdPrevHeader' },
    },
    {
      type: 'element',
      name: 'w:footerReference',
      attributes: { 'w:type': 'default', 'r:id': 'rIdPrevFooter' },
    },
  ],
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeSectionsEditor(options: SectionEditorOptions = {}): Editor {
  const {
    bodySectPr = BASE_SECTION_BODY_SECT_PR,
    paragraphSectPr = null,
    includeConverter = true,
    throwOnInsert = false,
    includeParagraphNodeType = true,
  } = options;

  const paragraphAttrs: Record<string, unknown> = {
    sdBlockId: 'p1',
    paraId: 'p1',
    paragraphProperties: paragraphSectPr ? { sectPr: clone(paragraphSectPr) } : {},
  };
  const paragraphNode = createNode('paragraph', [createNode('text', [], { text: 'Section text' })], {
    attrs: paragraphAttrs,
    isBlock: true,
    inlineContent: true,
  });

  const docAttrs: Record<string, unknown> = {};
  if (bodySectPr) {
    docAttrs.bodySectPr = clone(bodySectPr);
  }

  const doc = createNode('doc', [paragraphNode], {
    attrs: docAttrs,
    isBlock: false,
  }) as unknown as ProseMirrorNode & { toJSON?: () => unknown };

  const docJson = {
    type: 'doc',
    attrs: docAttrs,
    content: [
      {
        type: 'paragraph',
        attrs: paragraphAttrs,
      },
    ],
  };
  doc.toJSON = () => clone(docJson);

  const tr = {
    insert: mock(function insert() {
      if (throwOnInsert) {
        throw new Error('insert failed');
      }
      return tr;
    }),
    setNodeMarkup: mock(() => tr),
    setDocAttribute: mock(() => tr),
    setMeta: mock(() => tr),
    mapping: {
      maps: [] as unknown[],
      map: (position: number) => position,
      slice: () => ({ map: (position: number) => position }),
    },
    doc,
  };

  const schemaNodes = includeParagraphNodeType
    ? {
        paragraph: {
          createAndFill: mock((attrs?: Record<string, unknown>) =>
            createNode('paragraph', [], { attrs: attrs ?? {}, isBlock: true, inlineContent: true }),
          ),
          create: mock((attrs?: Record<string, unknown>) =>
            createNode('paragraph', [], { attrs: attrs ?? {}, isBlock: true, inlineContent: true }),
          ),
        },
      }
    : {};

  const editor = {
    state: {
      doc,
      tr,
      schema: {
        nodes: schemaNodes,
      },
    },
    dispatch: mock(),
    commands: {},
    schema: { marks: {}, nodes: schemaNodes },
    options: {},
  } as unknown as Editor;

  if (includeConverter) {
    (editor as unknown as { converter?: Record<string, unknown> }).converter = {
      bodySectPr: bodySectPr ? clone(bodySectPr) : undefined,
      convertedXml: {
        'word/settings.xml': {
          type: 'element',
          name: 'document',
          elements: [{ type: 'element', name: 'w:settings', elements: [] }],
        },
        'word/_rels/document.xml.rels': {
          elements: [
            {
              type: 'element',
              name: 'Relationships',
              attributes: { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' },
              elements: [
                {
                  type: 'element',
                  name: 'Relationship',
                  attributes: {
                    Id: 'rIdHeaderDefault',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header',
                    Target: 'header1.xml',
                  },
                },
                {
                  type: 'element',
                  name: 'Relationship',
                  attributes: {
                    Id: 'rIdFooterDefault',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer',
                    Target: 'footer1.xml',
                  },
                },
                {
                  type: 'element',
                  name: 'Relationship',
                  attributes: {
                    Id: 'rIdHeaderAlt',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header',
                    Target: 'header2.xml',
                  },
                },
              ],
            },
          ],
        },
      },
      pageStyles: {},
    };
  }

  return editor;
}

/** Table operation IDs that are actually implemented (not stubs). */
const IMPLEMENTED_TABLE_OPS: ReadonlySet<OperationId> = new Set([
  'create.table',
  'tables.delete',
  'tables.clearContents',
  'tables.move',
  'tables.setLayout',
  'tables.setAltText',
  'tables.insertRow',
  'tables.deleteRow',
  'tables.setRowHeight',
  'tables.distributeRows',
  'tables.setRowOptions',
  'tables.insertColumn',
  'tables.deleteColumn',
  'tables.setColumnWidth',
  'tables.distributeColumns',
  'tables.insertCell',
  'tables.deleteCell',
  'tables.mergeCells',
  'tables.unmergeCells',
  'tables.splitCell',
  'tables.setCellProperties',
  'tables.convertFromText',
  'tables.split',
  'tables.convertToText',
  'tables.sort',
  'tables.setStyle',
  'tables.clearStyle',
  'tables.setStyleOption',
  'tables.setBorder',
  'tables.clearBorder',
  'tables.applyBorderPreset',
  'tables.setShading',
  'tables.clearShading',
  'tables.setTablePadding',
  'tables.setCellPadding',
  'tables.setCellSpacing',
  'tables.clearCellSpacing',
  'tables.applyStyle',
  'tables.setBorders',
  'tables.setTableOptions',
  'tables.getStyles',
  'tables.setDefaultStyle',
  'tables.clearDefaultStyle',
] as OperationId[]);

/** Table stub ops that always throw CAPABILITY_UNAVAILABLE. */
const STUB_TABLE_OPS: ReadonlySet<OperationId> = new Set([] as OperationId[]);

/**
 * Plan-engine meta-operations that don't follow the standard throw/failure/apply
 * pattern. mutations.apply returns PlanReceipt (always success: true) or throws.
 */
const PLAN_ENGINE_META_OPS: ReadonlySet<OperationId> = new Set(['mutations.apply'] as OperationId[]);
const NON_RECEIPT_MUTATION_OPS: ReadonlySet<OperationId> = new Set([
  'history.undo',
  'history.redo',
  'diff.apply',
] as OperationId[]);

/**
 * Content-control operations whose handlers always return `true` because they
 * build and dispatch their own ProseMirror transaction directly (via
 * `editor.view!.dispatch(tr)`) rather than delegating to an editor command whose
 * boolean result propagates to the domain-command executor.
 *
 * Because the handler always returns `true`, the `domain.command` executor marks
 * the step effect as `'changed'` and `executeSdtMutation` returns success.
 * There is no code path that produces the `NO_OP` structured failure for these
 * operations, so they are excluded from the failureCase conformance check.
 */
const CC_DIRECT_DISPATCH_OPS: ReadonlySet<OperationId> = new Set([
  'contentControls.wrap',
  'contentControls.unwrap',
  'contentControls.copy',
  'contentControls.move',
  'contentControls.insertBefore',
  'contentControls.insertAfter',
  'contentControls.group.wrap',
  'contentControls.group.ungroup',
  'contentControls.repeatingSection.insertItemBefore',
  'contentControls.repeatingSection.insertItemAfter',
  'contentControls.repeatingSection.cloneItem',
  'contentControls.repeatingSection.deleteItem',
] as OperationId[]);

const HAS_STRUCTURED_FAILURE_RESULT = (operationId: OperationId): boolean =>
  COMMAND_CATALOG[operationId].possibleFailureCodes.length > 0;

function setTrackChanges(changes: Array<Record<string, unknown>>): void {
  mockedDeps.getTrackChanges.mockReturnValue(changes as never);
}

function makeTrackedChange(id = 'tc-1') {
  return {
    mark: {
      type: { name: TrackInsertMarkName },
      attrs: { id },
    },
    from: 1,
    to: 3,
  };
}

function requireCanonicalTrackChangeId(editor: Editor, rawId: string): string {
  const canonicalId = toCanonicalTrackedChangeId(editor, rawId);
  expect(canonicalId).toBeTruthy();
  return canonicalId!;
}

function assertSchema(operationId: OperationId, schemaType: 'output' | 'success' | 'failure', value: unknown): void {
  const schemaSet = INTERNAL_SCHEMAS.operations[operationId];
  const schema = schemaSet[schemaType];
  expect(schema).toBeDefined();

  const $defs = INTERNAL_SCHEMAS.$defs as Record<string, Parameters<typeof validateJsonSchema>[0]> | undefined;
  const result = validateJsonSchema(schema as Parameters<typeof validateJsonSchema>[0], value, $defs);
  expect(
    result.valid,
    `Schema validation failed for ${operationId} (${schemaType}):\n${result.errors.join('\n')}`,
  ).toBe(true);
}

function expectThrowCode(operationId: OperationId, run: () => unknown): void {
  let capturedCode: string | null = null;
  try {
    run();
  } catch (error) {
    capturedCode = (error as { code?: string }).code ?? null;
  }

  expect(capturedCode, `${operationId} throwCase did not throw a coded pre-apply error`).toBeTruthy();
  expect(COMMAND_CATALOG[operationId].throws.preApply).toContain(capturedCode);
}

function buildFormatInlinePatch(key: InlineRunPatchKey): Record<string, unknown> {
  // Conformance vectors verify operation-level contract semantics (throw/failure/success)
  // across all format aliases; a stable patch keeps mock-editor dependencies minimal.
  if (!INLINE_PROPERTY_REGISTRY.some((entry) => entry.key === key)) {
    throw new Error(`Unknown inline property key "${key}"`);
  }
  return { bold: true };
}

function buildFormatInlineMutationVector(key: InlineRunPatchKey): MutationVector {
  return {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return styleApplyWrapper(
        editor,
        {
          target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } },
          inline: buildFormatInlinePatch(key),
        } as any,
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor();
      return styleApplyWrapper(
        editor,
        {
          target: { kind: 'text', blockId: 'p1', range: { start: 2, end: 2 } },
          inline: buildFormatInlinePatch(key),
        } as any,
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return styleApplyWrapper(
        editor,
        {
          target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
          inline: buildFormatInlinePatch(key),
        } as any,
        { changeMode: 'direct' },
      );
    },
  };
}

const formatInlineMutationVectors = Object.fromEntries(
  INLINE_PROPERTY_REGISTRY.map((entry) => {
    const operationId = `format.${entry.key}` as OperationId;
    return [operationId, buildFormatInlineMutationVector(entry.key)];
  }),
) as Partial<Record<OperationId, MutationVector>>;

const formatInlineDryRunVectors = Object.fromEntries(
  INLINE_PROPERTY_REGISTRY.map((entry) => {
    const operationId = `format.${entry.key}` as OperationId;
    return [
      operationId,
      () => {
        const { editor, dispatch } = makeTextEditor();
        const result = styleApplyWrapper(
          editor,
          {
            target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
            inline: buildFormatInlinePatch(entry.key),
          } as any,
          { changeMode: 'direct', dryRun: true },
        );
        expect(dispatch).not.toHaveBeenCalled();
        return result;
      },
    ];
  }),
) as Partial<Record<OperationId, () => unknown>>;

const PARAGRAPH_TARGET = { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' } as const;
const MISSING_PARAGRAPH_TARGET = { kind: 'block', nodeType: 'paragraph', nodeId: 'missing' } as const;

function makeParagraphEditor(paragraphProperties: Record<string, unknown> = {}) {
  const { editor, dispatch, tr } = makeTextEditor();
  const transaction = tr as unknown as { setNodeMarkup?: ReturnType<typeof mock> };
  transaction.setNodeMarkup = mock().mockReturnValue(tr);

  const paragraphNode = {
    attrs: {
      sdBlockId: 'p1',
      paragraphProperties,
    },
  };

  (
    editor.state.doc as unknown as {
      nodeAt: ReturnType<typeof mock>;
    }
  ).nodeAt = mock((pos: number) => (pos === 0 ? paragraphNode : null));

  return { editor, dispatch };
}

const paragraphMutationVectors: Partial<Record<OperationId, MutationVector>> = {
  'styles.paragraph.setStyle': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetStyleWrapper(editor, { target: MISSING_PARAGRAPH_TARGET, styleId: 'Normal' });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor({ styleId: 'Normal' });
      return paragraphsSetStyleWrapper(editor, { target: PARAGRAPH_TARGET, styleId: 'Normal' });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetStyleWrapper(editor, { target: PARAGRAPH_TARGET, styleId: 'Normal' });
    },
  },
  'styles.paragraph.clearStyle': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearStyleWrapper(editor, { target: MISSING_PARAGRAPH_TARGET });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearStyleWrapper(editor, { target: PARAGRAPH_TARGET });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor({ styleId: 'Normal' });
      return paragraphsClearStyleWrapper(editor, { target: PARAGRAPH_TARGET });
    },
  },
  'format.paragraph.resetDirectFormatting': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsResetDirectFormattingWrapper(editor, { target: MISSING_PARAGRAPH_TARGET });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsResetDirectFormattingWrapper(editor, { target: PARAGRAPH_TARGET });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor({ justification: 'center', styleId: 'Normal' });
      return paragraphsResetDirectFormattingWrapper(editor, { target: PARAGRAPH_TARGET });
    },
  },
  'format.paragraph.setAlignment': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetAlignmentWrapper(editor, { target: MISSING_PARAGRAPH_TARGET, alignment: 'center' });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor({ justification: 'center' });
      return paragraphsSetAlignmentWrapper(editor, { target: PARAGRAPH_TARGET, alignment: 'center' });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetAlignmentWrapper(editor, { target: PARAGRAPH_TARGET, alignment: 'center' });
    },
  },
  'format.paragraph.clearAlignment': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearAlignmentWrapper(editor, { target: MISSING_PARAGRAPH_TARGET });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearAlignmentWrapper(editor, { target: PARAGRAPH_TARGET });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor({ justification: 'right' });
      return paragraphsClearAlignmentWrapper(editor, { target: PARAGRAPH_TARGET });
    },
  },
  'format.paragraph.setIndentation': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetIndentationWrapper(editor, { target: MISSING_PARAGRAPH_TARGET, left: 720 });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor({ indent: { left: 720 } });
      return paragraphsSetIndentationWrapper(editor, { target: PARAGRAPH_TARGET, left: 720 });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetIndentationWrapper(editor, { target: PARAGRAPH_TARGET, left: 720 });
    },
  },
  'format.paragraph.clearIndentation': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearIndentationWrapper(editor, { target: MISSING_PARAGRAPH_TARGET });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearIndentationWrapper(editor, { target: PARAGRAPH_TARGET });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor({ indent: { left: 720 } });
      return paragraphsClearIndentationWrapper(editor, { target: PARAGRAPH_TARGET });
    },
  },
  'format.paragraph.setSpacing': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetSpacingWrapper(editor, { target: MISSING_PARAGRAPH_TARGET, before: 120 });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor({ spacing: { before: 120 } });
      return paragraphsSetSpacingWrapper(editor, { target: PARAGRAPH_TARGET, before: 120 });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetSpacingWrapper(editor, { target: PARAGRAPH_TARGET, before: 120, after: 120 });
    },
  },
  'format.paragraph.clearSpacing': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearSpacingWrapper(editor, { target: MISSING_PARAGRAPH_TARGET });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearSpacingWrapper(editor, { target: PARAGRAPH_TARGET });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor({ spacing: { before: 120 } });
      return paragraphsClearSpacingWrapper(editor, { target: PARAGRAPH_TARGET });
    },
  },
  'format.paragraph.setKeepOptions': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetKeepOptionsWrapper(editor, { target: MISSING_PARAGRAPH_TARGET, keepNext: true });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor({ keepNext: true });
      return paragraphsSetKeepOptionsWrapper(editor, { target: PARAGRAPH_TARGET, keepNext: true });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetKeepOptionsWrapper(editor, { target: PARAGRAPH_TARGET, keepNext: true });
    },
  },
  'format.paragraph.setOutlineLevel': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetOutlineLevelWrapper(editor, { target: MISSING_PARAGRAPH_TARGET, outlineLevel: 2 });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor({ outlineLvl: 2 });
      return paragraphsSetOutlineLevelWrapper(editor, { target: PARAGRAPH_TARGET, outlineLevel: 2 });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetOutlineLevelWrapper(editor, { target: PARAGRAPH_TARGET, outlineLevel: 2 });
    },
  },
  'format.paragraph.setFlowOptions': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetFlowOptionsWrapper(editor, { target: MISSING_PARAGRAPH_TARGET, contextualSpacing: true });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor({ contextualSpacing: true });
      return paragraphsSetFlowOptionsWrapper(editor, { target: PARAGRAPH_TARGET, contextualSpacing: true });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetFlowOptionsWrapper(editor, { target: PARAGRAPH_TARGET, contextualSpacing: true });
    },
  },
  'format.paragraph.setTabStop': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetTabStopWrapper(editor, {
        target: MISSING_PARAGRAPH_TARGET,
        position: 720,
        alignment: 'left',
      });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor({ tabStops: [{ tab: { pos: 720, tabType: 'left' } }] });
      return paragraphsSetTabStopWrapper(editor, { target: PARAGRAPH_TARGET, position: 720, alignment: 'left' });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetTabStopWrapper(editor, { target: PARAGRAPH_TARGET, position: 720, alignment: 'left' });
    },
  },
  'format.paragraph.clearTabStop': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearTabStopWrapper(editor, { target: MISSING_PARAGRAPH_TARGET, position: 720 });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearTabStopWrapper(editor, { target: PARAGRAPH_TARGET, position: 720 });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor({ tabStops: [{ tab: { pos: 720, tabType: 'left' } }] });
      return paragraphsClearTabStopWrapper(editor, { target: PARAGRAPH_TARGET, position: 720 });
    },
  },
  'format.paragraph.clearAllTabStops': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearAllTabStopsWrapper(editor, { target: MISSING_PARAGRAPH_TARGET });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearAllTabStopsWrapper(editor, { target: PARAGRAPH_TARGET });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor({ tabStops: [{ tab: { pos: 720, tabType: 'left' } }] });
      return paragraphsClearAllTabStopsWrapper(editor, { target: PARAGRAPH_TARGET });
    },
  },
  'format.paragraph.setBorder': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetBorderWrapper(editor, {
        target: MISSING_PARAGRAPH_TARGET,
        side: 'top',
        style: 'single',
      });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor({ borders: { top: { val: 'single' } } });
      return paragraphsSetBorderWrapper(editor, { target: PARAGRAPH_TARGET, side: 'top', style: 'single' });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetBorderWrapper(editor, { target: PARAGRAPH_TARGET, side: 'top', style: 'single' });
    },
  },
  'format.paragraph.clearBorder': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearBorderWrapper(editor, { target: MISSING_PARAGRAPH_TARGET, side: 'top' });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearBorderWrapper(editor, { target: PARAGRAPH_TARGET, side: 'top' });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor({ borders: { top: { val: 'single' } } });
      return paragraphsClearBorderWrapper(editor, { target: PARAGRAPH_TARGET, side: 'top' });
    },
  },
  'format.paragraph.setShading': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetShadingWrapper(editor, { target: MISSING_PARAGRAPH_TARGET, fill: 'FFFF00' });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor({ shading: { fill: 'FFFF00' } });
      return paragraphsSetShadingWrapper(editor, { target: PARAGRAPH_TARGET, fill: 'FFFF00' });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetShadingWrapper(editor, { target: PARAGRAPH_TARGET, fill: 'FFFF00' });
    },
  },
  'format.paragraph.clearShading': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearShadingWrapper(editor, { target: MISSING_PARAGRAPH_TARGET });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearShadingWrapper(editor, { target: PARAGRAPH_TARGET });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor({ shading: { fill: 'FFFF00' } });
      return paragraphsClearShadingWrapper(editor, { target: PARAGRAPH_TARGET });
    },
  },
  'format.paragraph.setDirection': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetDirectionWrapper(editor, { target: MISSING_PARAGRAPH_TARGET, direction: 'rtl' });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor({ rightToLeft: true });
      return paragraphsSetDirectionWrapper(editor, { target: PARAGRAPH_TARGET, direction: 'rtl' });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsSetDirectionWrapper(editor, { target: PARAGRAPH_TARGET, direction: 'rtl' });
    },
  },
  'format.paragraph.clearDirection': {
    throwCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearDirectionWrapper(editor, { target: MISSING_PARAGRAPH_TARGET });
    },
    failureCase: () => {
      const { editor } = makeParagraphEditor();
      return paragraphsClearDirectionWrapper(editor, { target: PARAGRAPH_TARGET });
    },
    applyCase: () => {
      const { editor } = makeParagraphEditor({ rightToLeft: true });
      return paragraphsClearDirectionWrapper(editor, { target: PARAGRAPH_TARGET });
    },
  },
};

const paragraphDryRunVectors: Partial<Record<OperationId, () => unknown>> = {
  'styles.paragraph.setStyle': () => {
    const { editor, dispatch } = makeParagraphEditor();
    const result = paragraphsSetStyleWrapper(
      editor,
      { target: PARAGRAPH_TARGET, styleId: 'Normal' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'styles.paragraph.clearStyle': () => {
    const { editor, dispatch } = makeParagraphEditor({ styleId: 'Normal' });
    const result = paragraphsClearStyleWrapper(
      editor,
      { target: PARAGRAPH_TARGET },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.resetDirectFormatting': () => {
    const { editor, dispatch } = makeParagraphEditor({ styleId: 'Normal', justification: 'center' });
    const result = paragraphsResetDirectFormattingWrapper(
      editor,
      { target: PARAGRAPH_TARGET },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.setAlignment': () => {
    const { editor, dispatch } = makeParagraphEditor();
    const result = paragraphsSetAlignmentWrapper(
      editor,
      { target: PARAGRAPH_TARGET, alignment: 'center' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.clearAlignment': () => {
    const { editor, dispatch } = makeParagraphEditor({ justification: 'right' });
    const result = paragraphsClearAlignmentWrapper(
      editor,
      { target: PARAGRAPH_TARGET },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.setIndentation': () => {
    const { editor, dispatch } = makeParagraphEditor();
    const result = paragraphsSetIndentationWrapper(
      editor,
      { target: PARAGRAPH_TARGET, left: 720 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.clearIndentation': () => {
    const { editor, dispatch } = makeParagraphEditor({ indent: { left: 720 } });
    const result = paragraphsClearIndentationWrapper(
      editor,
      { target: PARAGRAPH_TARGET },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.setSpacing': () => {
    const { editor, dispatch } = makeParagraphEditor();
    const result = paragraphsSetSpacingWrapper(
      editor,
      { target: PARAGRAPH_TARGET, before: 120 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.clearSpacing': () => {
    const { editor, dispatch } = makeParagraphEditor({ spacing: { before: 120 } });
    const result = paragraphsClearSpacingWrapper(
      editor,
      { target: PARAGRAPH_TARGET },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.setKeepOptions': () => {
    const { editor, dispatch } = makeParagraphEditor();
    const result = paragraphsSetKeepOptionsWrapper(
      editor,
      { target: PARAGRAPH_TARGET, keepNext: true },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.setOutlineLevel': () => {
    const { editor, dispatch } = makeParagraphEditor();
    const result = paragraphsSetOutlineLevelWrapper(
      editor,
      { target: PARAGRAPH_TARGET, outlineLevel: 2 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.setFlowOptions': () => {
    const { editor, dispatch } = makeParagraphEditor();
    const result = paragraphsSetFlowOptionsWrapper(
      editor,
      { target: PARAGRAPH_TARGET, contextualSpacing: true },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.setTabStop': () => {
    const { editor, dispatch } = makeParagraphEditor();
    const result = paragraphsSetTabStopWrapper(
      editor,
      { target: PARAGRAPH_TARGET, position: 720, alignment: 'left' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.clearTabStop': () => {
    const { editor, dispatch } = makeParagraphEditor({ tabStops: [{ tab: { pos: 720, tabType: 'left' } }] });
    const result = paragraphsClearTabStopWrapper(
      editor,
      { target: PARAGRAPH_TARGET, position: 720 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.clearAllTabStops': () => {
    const { editor, dispatch } = makeParagraphEditor({ tabStops: [{ tab: { pos: 720, tabType: 'left' } }] });
    const result = paragraphsClearAllTabStopsWrapper(
      editor,
      { target: PARAGRAPH_TARGET },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.setBorder': () => {
    const { editor, dispatch } = makeParagraphEditor();
    const result = paragraphsSetBorderWrapper(
      editor,
      { target: PARAGRAPH_TARGET, side: 'top', style: 'single' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.clearBorder': () => {
    const { editor, dispatch } = makeParagraphEditor({ borders: { top: { val: 'single' } } });
    const result = paragraphsClearBorderWrapper(
      editor,
      { target: PARAGRAPH_TARGET, side: 'top' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.setShading': () => {
    const { editor, dispatch } = makeParagraphEditor();
    const result = paragraphsSetShadingWrapper(
      editor,
      { target: PARAGRAPH_TARGET, fill: 'FFFF00' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.clearShading': () => {
    const { editor, dispatch } = makeParagraphEditor({ shading: { fill: 'FFFF00' } });
    const result = paragraphsClearShadingWrapper(
      editor,
      { target: PARAGRAPH_TARGET },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.setDirection': () => {
    const { editor, dispatch } = makeParagraphEditor();
    const result = paragraphsSetDirectionWrapper(
      editor,
      { target: PARAGRAPH_TARGET, direction: 'rtl' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.paragraph.clearDirection': () => {
    const { editor, dispatch } = makeParagraphEditor({ rightToLeft: true });
    const result = paragraphsClearDirectionWrapper(
      editor,
      { target: PARAGRAPH_TARGET },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
};

function makeTocEditor(commandOverrides: Record<string, unknown> = {}): Editor {
  const tocParagraph = createNode('paragraph', [createNode('text', [], { text: 'TOC entry' })], {
    attrs: { sdBlockId: 'toc-entry-p1' },
    isBlock: true,
    inlineContent: true,
  });
  const tocNode = createNode('tableOfContents', [tocParagraph], {
    attrs: { sdBlockId: 'toc-1', instruction: 'TOC \\o "1-3" \\h \\u \\z' },
    isBlock: true,
  });
  const heading = createNode('paragraph', [createNode('text', [], { text: 'Heading 1' })], {
    attrs: {
      sdBlockId: 'h-1',
      paragraphProperties: { styleId: 'Heading1' },
    },
    isBlock: true,
    inlineContent: true,
  });
  const tcEntry = createNode('tableOfContentsEntry', [], {
    attrs: { instruction: 'TC "Chapter One" \\f "A" \\l "2"' },
    isInline: true,
    isLeaf: true,
  });
  const sourceParagraph = createNode('paragraph', [createNode('text', [], { text: 'Body text' }), tcEntry], {
    attrs: { sdBlockId: 'p-1' },
    isBlock: true,
    inlineContent: true,
  });
  const doc = createNode('doc', [tocNode, heading, sourceParagraph], { isBlock: false });

  const dispatch = mock();
  const tr = {
    insertText: mock().mockReturnThis(),
    delete: mock().mockReturnThis(),
    insert: mock().mockReturnThis(),
    setNodeMarkup: mock().mockReturnThis(),
    replaceWith: mock().mockReturnThis(),
    setMeta: mock().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged: true,
    steps: [{}],
    doc,
  };

  return {
    state: { doc, tr, schema: { nodes: { paragraph: { create: mock() }, tableOfContents: {} } } },
    dispatch,
    commands: {
      insertTableOfContentsAt: mock(() => true),
      setTableOfContentsInstructionById: mock(() => true),
      replaceTableOfContentsContentById: mock(() => true),
      deleteTableOfContentsById: mock(() => true),
      insertTableOfContentsEntryAt: mock(() => true),
      deleteTableOfContentsEntryAt: mock(() => true),
      updateTableOfContentsEntryAt: mock(() => true),
      ...commandOverrides,
    },
    schema: { marks: {} },
    options: {},
    on: () => {},
  } as unknown as Editor;
}

function getFirstTocEntryAddress(editor: Editor): { kind: 'inline'; nodeType: 'tableOfContentsEntry'; nodeId: string } {
  const list = tocListEntriesWrapper(editor);
  const first = list.items[0];
  expect(first).toBeDefined();
  return {
    kind: 'inline',
    nodeType: 'tableOfContentsEntry',
    nodeId: first!.address.nodeId,
  };
}

/**
 * Creates a mock editor containing one floating image node inside a paragraph.
 * The image has `sdImageId: 'img-1'`, `isAnchor: true`, and `wrap: { type: 'Square' }`.
 */
function makeImageEditor(): Editor {
  const imageNode = createNode('image', [], {
    attrs: {
      sdImageId: 'img-1',
      src: 'https://example.com/test.png',
      alt: 'Test image',
      isAnchor: true,
      wrap: { type: 'Square', attrs: { wrapText: 'bothSides' } },
      anchorData: { hRelativeFrom: 'column', vRelativeFrom: 'paragraph' },
      marginOffset: null,
      relativeHeight: 251658240,
      originalAttributes: {},
      size: { width: 100, height: 100 },
    },
    isInline: true,
    isLeaf: true,
  });
  const paragraph = createNode('paragraph', [imageNode], {
    attrs: { sdBlockId: 'p-img' },
    isBlock: true,
    inlineContent: true,
  });
  const doc = createNode('doc', [paragraph], { isBlock: false });

  const dispatch = mock();
  const tr = {
    insertText: mock().mockReturnThis(),
    delete: mock().mockReturnThis(),
    insert: mock().mockReturnThis(),
    setNodeMarkup: mock().mockReturnThis(),
    replaceWith: mock().mockReturnThis(),
    setMeta: mock().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged: true,
    steps: [{}],
    doc,
  };

  return {
    state: {
      doc,
      tr,
      schema: {
        nodes: {
          image: {
            create: mock((attrs: Record<string, unknown>) =>
              createNode('image', [], { attrs, isInline: true, isLeaf: true }),
            ),
          },
        },
      },
    },
    dispatch,
    commands: {
      setImage: mock(() => true),
    },
    schema: { marks: {} },
    options: {},
    on: () => {},
  } as unknown as Editor;
}

/**
 * Editor with two paragraphs to make image before/after/inParagraph positioning meaningful.
 * p1 contains one floating image (img-1), p2 contains text ("Hello").
 */
function makeMultiBlockImageEditor(): Editor {
  const imageNode = createNode('image', [], {
    attrs: {
      sdImageId: 'img-1',
      src: 'https://example.com/test.png',
      isAnchor: true,
      wrap: { type: 'Square', attrs: { wrapText: 'bothSides' } },
      anchorData: { hRelativeFrom: 'column', vRelativeFrom: 'paragraph' },
      marginOffset: null,
      relativeHeight: 251658240,
      originalAttributes: {},
      size: { width: 100, height: 100 },
    },
    isInline: true,
    isLeaf: true,
  });
  // p1: pos=0, nodeSize=3 (1 inline image + 2 wrapper)
  const p1 = createNode('paragraph', [imageNode], {
    attrs: { sdBlockId: 'p-img' },
    isBlock: true,
    inlineContent: true,
  });
  const textNode = createNode('text', [], { text: 'Hello' });
  // p2: pos=3, nodeSize=7 (5 text chars + 2 wrapper)
  const p2 = createNode('paragraph', [textNode], {
    attrs: { sdBlockId: 'p-text' },
    isBlock: true,
    inlineContent: true,
  });
  const doc = createNode('doc', [p1, p2], { isBlock: false });
  // doc.content.size = 10

  const dispatch = mock();
  const tr = {
    insertText: mock().mockReturnThis(),
    delete: mock().mockReturnThis(),
    insert: mock().mockReturnThis(),
    setNodeMarkup: mock().mockReturnThis(),
    replaceWith: mock().mockReturnThis(),
    setMeta: mock().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged: true,
    steps: [{}],
    doc,
  };

  return {
    state: {
      doc,
      tr,
      schema: {
        nodes: {
          image: {
            create: mock((attrs: Record<string, unknown>) =>
              createNode('image', [], { attrs, isInline: true, isLeaf: true }),
            ),
          },
        },
      },
    },
    dispatch,
    commands: {
      setImage: mock(() => true),
      insertContentAt: mock(() => true),
    },
    schema: { marks: {} },
    options: {},
    on: () => {},
  } as unknown as Editor;
}

function makeHyperlinkTarget(blockId: string, start: number, end: number) {
  return {
    kind: 'inline' as const,
    nodeType: 'hyperlink' as const,
    anchor: {
      start: { blockId, offset: start },
      end: { blockId, offset: end },
    },
  };
}

function makeHyperlinkEditor(
  options: {
    withLink?: boolean;
    text?: string;
    linkAttrs?: Record<string, unknown>;
  } = {},
): Editor {
  const text = options.text ?? 'Hello';
  const withLink = options.withLink ?? true;
  const linkAttrs = options.linkAttrs ?? { href: 'https://example.com' };

  const linkMark = {
    type: { name: 'link' },
    attrs: linkAttrs,
  };

  const textNode = createNode('text', [], { text });
  (textNode as unknown as { marks: unknown[] }).marks = withLink ? [linkMark] : [];

  const paragraph = createNode('paragraph', [textNode], {
    attrs: { sdBlockId: 'p1' },
    isBlock: true,
    inlineContent: true,
  });

  const doc = createNode('doc', [paragraph], { isBlock: false });
  (
    doc as unknown as { resolve: (pos: number) => { depth: number; node: (depth: number) => ProseMirrorNode } }
  ).resolve = (_pos: number) => ({
    depth: 1,
    node: (_depth: number) => paragraph,
  });

  const dispatch = mock();
  const tr = {
    insertText: mock().mockReturnThis(),
    addMark: mock().mockReturnThis(),
    removeMark: mock().mockReturnThis(),
    delete: mock().mockReturnThis(),
    setMeta: mock().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged: true,
    steps: [{}],
    doc,
  };

  const linkMarkType = {
    create: mock((attrs: Record<string, unknown>) => ({
      type: { name: 'link' },
      attrs,
    })),
  };

  return {
    state: { doc, tr, schema: { marks: { link: linkMarkType } } },
    dispatch,
    schema: { marks: { link: linkMarkType } },
    options: { mode: 'html' },
    on: () => {},
  } as unknown as Editor;
}

// ---------------------------------------------------------------------------
// Content-controls mock helpers
// ---------------------------------------------------------------------------

const SDT_TARGET = { kind: 'block' as const, nodeType: 'sdt' as const, nodeId: 'sdt-1' };
const MISSING_SDT_TARGET = { kind: 'block' as const, nodeType: 'sdt' as const, nodeId: 'nonexistent' };
const RS_TARGET = { kind: 'block' as const, nodeType: 'sdt' as const, nodeId: 'rs-1' };

/** Create an SDT editor whose commands return false — triggers NO_OP failure. */
function makeNoOpSdtEditor(overrideAttrs: Record<string, unknown> = {}, textContent = 'SDT content'): Editor {
  const editor = makeSdtEditor(overrideAttrs, textContent);
  (editor.commands as any).updateStructuredContentById = mock(() => false);
  (editor.commands as any).deleteStructuredContentById = mock(() => false);
  (editor.commands as any).insertStructuredContentBlock = mock(() => false);
  (editor.commands as any).insertStructuredContentInline = mock(() => false);
  return editor;
}

function makeNoOpSdtEditorWithRepeatingSectionItems(): Editor {
  const editor = makeSdtEditorWithRepeatingSectionItems();
  (editor.commands as any).updateStructuredContentById = mock(() => false);
  (editor.commands as any).deleteStructuredContentById = mock(() => false);
  (editor.commands as any).insertStructuredContentBlock = mock(() => false);
  (editor.commands as any).insertStructuredContentInline = mock(() => false);
  return editor;
}

function makeSdtEditor(overrideAttrs: Record<string, unknown> = {}, textContent = 'SDT content'): Editor {
  const sdtAttrs = {
    id: 'sdt-1',
    tag: 'test-tag',
    alias: 'Test Alias',
    lockMode: 'unlocked',
    controlType: 'text',
    type: 'text',
    sdtPr: { elements: [] },
    ...overrideAttrs,
  };

  const textNode = createNode('text', [], { text: textContent });
  const innerParagraph = createNode('paragraph', [textNode], {
    attrs: { sdBlockId: 'inner-p' },
    isBlock: true,
    inlineContent: true,
  });
  const sdtNode = createNode('structuredContentBlock', [innerParagraph], {
    attrs: sdtAttrs,
    isBlock: true,
  });
  const doc = createNode('doc', [sdtNode], { isBlock: false });

  const tr = {
    insertText: mock().mockReturnThis(),
    delete: mock().mockReturnThis(),
    addMark: mock().mockReturnThis(),
    removeMark: mock().mockReturnThis(),
    replaceWith: mock().mockReturnThis(),
    insert: mock().mockReturnThis(),
    setMeta: mock().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged: true,
    doc,
    steps: [{ type: 'replaceStep' }],
  };

  const dispatch = mock();

  const editor = {
    state: {
      doc,
      tr,
      schema: {
        marks: {},
        text: (t: string) => createNode('text', [], { text: t }),
        nodes: {
          paragraph: {
            create: mock(() => innerParagraph),
            createAndFill: mock(() => innerParagraph),
          },
          structuredContentBlock: {
            create: mock((attrs: unknown, content: unknown) =>
              createNode('structuredContentBlock', [], { attrs: attrs as Record<string, unknown>, isBlock: true }),
            ),
          },
        },
      },
      selection: { from: 0, to: doc.nodeSize },
    },
    schema: {
      marks: {},
      text: (t: string) => createNode('text', [], { text: t }),
      nodes: {
        paragraph: {
          create: mock(() => innerParagraph),
          createAndFill: mock(() => innerParagraph),
        },
        structuredContentBlock: {
          create: mock((attrs: unknown, content: unknown) =>
            createNode('structuredContentBlock', [], { attrs: attrs as Record<string, unknown>, isBlock: true }),
          ),
        },
      },
    },
    dispatch,
    view: { dispatch },
    commands: {
      updateStructuredContentById: mock(() => true),
      deleteStructuredContentById: mock(() => true),
      insertStructuredContentBlock: mock(() => true),
      insertStructuredContentInline: mock(() => true),
    },
  } as unknown as Editor;

  return editor;
}

function makeSdtEditorWithRepeatingSectionItems(): Editor {
  const textNode = createNode('text', [], { text: 'Item content' });
  const itemParagraph = createNode('paragraph', [textNode], {
    attrs: { sdBlockId: 'item-p' },
    isBlock: true,
    inlineContent: true,
  });
  const rsiNode = createNode('structuredContentBlock', [itemParagraph], {
    attrs: {
      id: 'rsi-1',
      controlType: 'repeatingSectionItem',
      type: 'repeatingSectionItem',
      lockMode: 'unlocked',
      sdtPr: { elements: [] },
    },
    isBlock: true,
  });
  const rsNode = createNode('structuredContentBlock', [rsiNode], {
    attrs: {
      id: 'rs-1',
      controlType: 'repeatingSection',
      type: 'repeatingSection',
      lockMode: 'unlocked',
      sdtPr: { elements: [] },
    },
    isBlock: true,
  });
  const doc = createNode('doc', [rsNode], { isBlock: false });

  const tr = {
    insertText: mock().mockReturnThis(),
    delete: mock().mockReturnThis(),
    addMark: mock().mockReturnThis(),
    removeMark: mock().mockReturnThis(),
    replaceWith: mock().mockReturnThis(),
    insert: mock().mockReturnThis(),
    setMeta: mock().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged: true,
    doc,
    steps: [{ type: 'replaceStep' }],
  };

  const dispatch = mock();
  const itemParagraphNode = createNode('paragraph', [], { isBlock: true, inlineContent: true });

  return {
    state: {
      doc,
      tr,
      schema: {
        marks: {},
        text: (t: string) => createNode('text', [], { text: t }),
        nodes: {
          paragraph: { create: mock(() => itemParagraphNode), createAndFill: mock(() => itemParagraphNode) },
          structuredContentBlock: {
            create: mock((attrs: unknown, content: unknown) =>
              createNode('structuredContentBlock', [content as ProseMirrorNode].flat().filter(Boolean), {
                attrs: attrs as Record<string, unknown>,
                isBlock: true,
              }),
            ),
          },
        },
      },
      selection: { from: 0, to: doc.nodeSize },
    },
    schema: {
      marks: {},
      text: (t: string) => createNode('text', [], { text: t }),
      nodes: {
        paragraph: { create: mock(() => itemParagraphNode), createAndFill: mock(() => itemParagraphNode) },
        structuredContentBlock: {
          create: mock((attrs: unknown, content: unknown) =>
            createNode('structuredContentBlock', [content as ProseMirrorNode].flat().filter(Boolean), {
              attrs: attrs as Record<string, unknown>,
              isBlock: true,
            }),
          ),
        },
      },
    },
    dispatch,
    view: { dispatch },
    commands: {
      updateStructuredContentById: mock(() => true),
      deleteStructuredContentById: mock(() => true),
      insertStructuredContentBlock: mock(() => true),
      insertStructuredContentInline: mock(() => true),
    },
  } as unknown as Editor;
}

/**
 * Image editor with resolve + schema mocks for caption operations.
 * @param opts.withCaption  Add a `Caption`-styled paragraph after the image paragraph.
 * @param opts.docChanged   Mock tr.docChanged state (default true).
 * @param opts.imageId      Override the default image id.
 * @param opts.extraAttrs   Extra attrs merged onto the image node.
 */
function makeCaptionImageEditor(
  opts: { withCaption?: boolean; docChanged?: boolean; imageId?: string; extraAttrs?: Record<string, unknown> } = {},
): Editor {
  const imgId = opts.imageId ?? (opts.withCaption ? 'img-cap' : 'img-1');
  const imageNode = createNode('image', [], {
    attrs: {
      sdImageId: imgId,
      src: 'https://example.com/test.png',
      isAnchor: true,
      wrap: { type: 'Square', attrs: { wrapText: 'bothSides' } },
      anchorData: { hRelativeFrom: 'column', vRelativeFrom: 'paragraph' },
      marginOffset: null,
      relativeHeight: 251658240,
      originalAttributes: {},
      size: { width: 100, height: 100 },
      ...opts.extraAttrs,
    },
    isInline: true,
    isLeaf: true,
  });

  const imgParagraph = createNode('paragraph', [imageNode], {
    attrs: { sdBlockId: 'p-img' },
    isBlock: true,
    inlineContent: true,
  });

  const children: ProseMirrorNode[] = [imgParagraph];

  if (opts.withCaption) {
    const captionText = createNode('text', [], { text: 'Old caption' });
    const captionParagraph = createNode('paragraph', [captionText], {
      attrs: { sdBlockId: 'p-caption', paragraphProperties: { styleId: 'Caption' } },
      isBlock: true,
      inlineContent: true,
    });
    children.push(captionParagraph);
  }

  const doc = createNode('doc', children, { isBlock: false });

  // Add resolve mock — image is always at position 1 (inside paragraph at 0).
  (doc as unknown as Record<string, unknown>).resolve = () => ({
    depth: 2,
    before: () => 0,
    node: (d: number) => (d === 2 ? imgParagraph : doc),
  });

  const dispatch = mock();
  const docChanged = opts.docChanged ?? true;
  const tr = {
    insert: mock().mockReturnThis(),
    delete: mock().mockReturnThis(),
    replaceWith: mock().mockReturnThis(),
    setNodeMarkup: mock().mockReturnThis(),
    setMeta: mock().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged,
    steps: docChanged ? [{}] : [],
    doc,
  };

  return {
    state: {
      doc,
      tr,
      schema: {
        nodes: {
          paragraph: {
            create: mock((attrs: Record<string, unknown>, content: unknown) =>
              createNode('paragraph', content ? [content as ProseMirrorNode] : [], {
                attrs,
                isBlock: true,
                inlineContent: true,
              }),
            ),
          },
        },
        text: mock((t: string) => createNode('text', [], { text: t })),
      },
    },
    dispatch,
    commands: { setImage: mock(() => true) },
    schema: { marks: {} },
    options: {},
    on: () => {},
  } as unknown as Editor;
}

// ---------------------------------------------------------------------------
// Reference namespace mock helpers
// ---------------------------------------------------------------------------

/** Returns a PlanReceipt-shaped object signaling success. */
const REF_APPLIED_RECEIPT = { steps: [{ effect: 'changed' as const }], revision: 'r1' };

/** Creates a mock editor suitable for reference namespace wrappers. */
function makeRefEditor(
  overrides: {
    commands?: Record<string, unknown>;
    schemaNodes?: Record<string, unknown>;
    converter?: Record<string, unknown>;
  } = {},
): Editor {
  const textNode = createNode('text', [], { text: 'Hello' });
  const paragraph = createNode('paragraph', [textNode], {
    attrs: { sdBlockId: 'p1' },
    isBlock: true,
    inlineContent: true,
  });
  const doc = createNode('doc', [paragraph], { isBlock: false });

  const dispatch = mock();
  const tr = {
    insertText: mock().mockReturnThis(),
    delete: mock().mockReturnThis(),
    addMark: mock().mockReturnThis(),
    removeMark: mock().mockReturnThis(),
    replaceWith: mock().mockReturnThis(),
    insert: mock().mockReturnThis(),
    setMeta: mock().mockReturnThis(),
    setNodeMarkup: mock().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged: true,
    steps: [{}],
    doc: { ...doc, resolve: () => ({ marks: () => [] }), content: { size: 10 } },
  };

  const nodeType = (name: string) => ({
    create: mock((_attrs?: Record<string, unknown>, _content?: unknown) => createNode(name, [])),
    createAndFill: mock(() => createNode(name, [])),
  });

  return {
    state: { doc, tr, schema: { marks: {}, nodes: {} } },
    view: { dispatch },
    dispatch,
    commands: {
      insertContent: mock(() => true),
      insertBookmark: mock(() => true),
      ...overrides.commands,
    },
    schema: {
      marks: {},
      nodes: {
        paragraph: nodeType('paragraph'),
        bookmarkStart: nodeType('bookmarkStart'),
        bookmarkEnd: nodeType('bookmarkEnd'),
        footnoteReference: nodeType('footnoteReference'),
        endnoteReference: nodeType('endnoteReference'),
        crossReference: nodeType('crossReference'),
        documentIndex: nodeType('documentIndex'),
        indexEntry: nodeType('indexEntry'),
        sequenceField: nodeType('sequenceField'),
        citation: nodeType('citation'),
        bibliography: nodeType('bibliography'),
        authorityEntry: nodeType('authorityEntry'),
        tableOfAuthorities: nodeType('tableOfAuthorities'),
        ...overrides.schemaNodes,
      },
    },
    converter: {
      convertedXml: {
        'word/document.xml': {},
        'word/footnotes.xml': {
          declaration: { attributes: { version: '1.0', encoding: 'UTF-8', standalone: 'yes' } },
          elements: [
            {
              type: 'element',
              name: 'w:footnotes',
              attributes: { 'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main' },
              elements: [
                {
                  type: 'element',
                  name: 'w:footnote',
                  attributes: { 'w:id': 'fn-1' },
                  elements: [
                    {
                      type: 'element',
                      name: 'w:p',
                      elements: [
                        {
                          type: 'element',
                          name: 'w:r',
                          elements: [
                            { type: 'element', name: 'w:t', elements: [{ type: 'text', text: 'Footnote text' }] },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        'word/endnotes.xml': {
          declaration: { attributes: { version: '1.0', encoding: 'UTF-8', standalone: 'yes' } },
          elements: [
            {
              type: 'element',
              name: 'w:endnotes',
              attributes: { 'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main' },
              elements: [],
            },
          ],
        },
        'word/settings.xml': {
          elements: [{ type: 'element', name: 'w:settings', elements: [] }],
        },
      },
      footnotes: [{ id: 'fn-1', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Footnote text' }] }] }],
      endnotes: [],
      ...overrides.converter,
    },
    options: {},
    on: () => {},
    safeEmit: mock(() => []),
    emit: mock(),
  } as unknown as Editor;
}

/** Resolved mock for node-based resolvers (bookmarks, footnotes, cross-refs, etc.) */
function mockResolvedNode(pos: number, nodeId: string, typeName: string, attrs: Record<string, unknown> = {}) {
  return {
    pos,
    nodeId,
    name: nodeId,
    noteId: nodeId,
    type: typeName,
    endPos: pos + 2,
    node: createNode(typeName, [], {
      attrs: { sdBlockId: nodeId, instruction: '', ...attrs },
      isLeaf: true,
      nodeSize: 1,
    }),
    blockId: nodeId,
    occurrenceIndex: 0,
    nestingDepth: 0,
  };
}

/** Spies on executeDomainCommand to return an applied receipt, then calls `fn`, then restores. */
function withAppliedReceipt<T>(fn: () => T): T {
  const spy = spyOn(planWrappers, 'executeDomainCommand').mockReturnValue(REF_APPLIED_RECEIPT as any);
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

// ---------------------------------------------------------------------------
// Reference namespace mutation vectors (44 operations)
// ---------------------------------------------------------------------------

const refNamespaceMutationVectors: Partial<Record<OperationId, MutationVector>> = {
  // ---- Bookmarks ----
  'bookmarks.insert': {
    throwCase: () =>
      bookmarksInsertWrapper(
        makeRefEditor(),
        { name: 'bm1', at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      const spy = spyOn(adapterUtils, 'resolveTextTarget').mockReturnValueOnce({ from: 1, to: 1 });
      try {
        return withAppliedReceipt(() =>
          bookmarksInsertWrapper(
            makeRefEditor(),
            { name: 'bm1', at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] } },
            { changeMode: 'direct' },
          ),
        );
      } finally {
        spy.mockRestore();
      }
    },
  },
  'bookmarks.rename': {
    throwCase: () =>
      bookmarksRenameWrapper(
        makeRefEditor(),
        { target: { kind: 'entity', entityType: 'bookmark', name: 'bm1' }, newName: 'bm2' },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveBookmarkTarget.mockReturnValueOnce(
        mockResolvedNode(1, 'bm1', 'bookmarkStart', { name: 'bm1' }),
      );
      return withAppliedReceipt(() =>
        bookmarksRenameWrapper(
          makeRefEditor(),
          { target: { kind: 'entity', entityType: 'bookmark', name: 'bm1' }, newName: 'bm2' },
          { changeMode: 'direct' },
        ),
      );
    },
  },
  'bookmarks.remove': {
    throwCase: () =>
      bookmarksRemoveWrapper(
        makeRefEditor(),
        { target: { kind: 'entity', entityType: 'bookmark', name: 'bm1' } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveBookmarkTarget.mockReturnValueOnce(
        mockResolvedNode(1, 'bm1', 'bookmarkStart', { name: 'bm1' }),
      );
      return withAppliedReceipt(() =>
        bookmarksRemoveWrapper(
          makeRefEditor(),
          { target: { kind: 'entity', entityType: 'bookmark', name: 'bm1' } },
          { changeMode: 'direct' },
        ),
      );
    },
  },

  // ---- Footnotes ----
  'footnotes.insert': {
    throwCase: () =>
      footnotesInsertWrapper(
        makeRefEditor(),
        {
          type: 'footnote',
          content: 'x',
          at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
        },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      const spy = spyOn(adapterUtils, 'resolveTextTarget').mockReturnValueOnce({ from: 1, to: 1 });
      try {
        return withAppliedReceipt(() =>
          footnotesInsertWrapper(
            makeRefEditor(),
            {
              type: 'footnote',
              content: 'x',
              at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
            },
            { changeMode: 'direct' },
          ),
        );
      } finally {
        spy.mockRestore();
      }
    },
  },
  'footnotes.update': {
    throwCase: () =>
      footnotesUpdateWrapper(
        makeRefEditor(),
        { target: { kind: 'entity', entityType: 'footnote', noteId: 'fn-1' }, patch: { content: 'New' } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveFootnoteTarget.mockReturnValueOnce({
        ...mockResolvedNode(1, 'fn-1', 'footnoteReference'),
        noteId: 'fn-1',
        type: 'footnote',
      });
      return footnotesUpdateWrapper(
        makeRefEditor(),
        { target: { kind: 'entity', entityType: 'footnote', noteId: 'fn-1' }, patch: { content: 'New' } },
        { changeMode: 'direct' },
      );
    },
  },
  'footnotes.remove': {
    throwCase: () =>
      footnotesRemoveWrapper(
        makeRefEditor(),
        { target: { kind: 'entity', entityType: 'footnote', noteId: 'fn-1' } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveFootnoteTarget.mockReturnValueOnce({
        ...mockResolvedNode(1, 'fn-1', 'footnoteReference'),
        noteId: 'fn-1',
        type: 'footnote',
      });
      return withAppliedReceipt(() =>
        footnotesRemoveWrapper(
          makeRefEditor(),
          { target: { kind: 'entity', entityType: 'footnote', noteId: 'fn-1' } },
          { changeMode: 'direct' },
        ),
      );
    },
  },
  'footnotes.configure': {
    throwCase: () =>
      footnotesConfigureWrapper(
        makeRefEditor(),
        { type: 'footnote', scope: { kind: 'document' }, numbering: { position: 'pageBottom' } },
        { changeMode: 'tracked' },
      ),
    applyCase: () =>
      footnotesConfigureWrapper(
        makeRefEditor(),
        { type: 'footnote', scope: { kind: 'document' }, numbering: { position: 'pageBottom' } },
        { changeMode: 'direct' },
      ),
  },

  // ---- Cross-References ----
  'crossRefs.insert': {
    throwCase: () =>
      crossRefsInsertWrapper(
        makeRefEditor(),
        {
          target: { kind: 'bookmark', name: 'bm1' },
          at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
          display: 'content',
        },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      const spy = spyOn(adapterUtils, 'resolveTextTarget').mockReturnValueOnce({ from: 1, to: 1 });
      try {
        return withAppliedReceipt(() =>
          crossRefsInsertWrapper(
            makeRefEditor(),
            {
              target: { kind: 'bookmark', name: 'bm1' },
              at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
              display: 'content',
            },
            { changeMode: 'direct' },
          ),
        );
      } finally {
        spy.mockRestore();
      }
    },
  },
  'crossRefs.rebuild': {
    throwCase: () =>
      crossRefsRebuildWrapper(
        makeRefEditor(),
        {
          target: {
            kind: 'inline',
            nodeType: 'crossRef',
            anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
          },
        },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveCrossRefTarget.mockReturnValueOnce(mockResolvedNode(1, 'cr-1', 'crossReference'));
      refResolverMocks.extractCrossRefInfo.mockReturnValueOnce({
        address: {
          kind: 'inline',
          nodeType: 'crossRef',
          anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
        },
      });
      return crossRefsRebuildWrapper(
        makeRefEditor(),
        {
          target: {
            kind: 'inline',
            nodeType: 'crossRef',
            anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
          },
        },
        { changeMode: 'direct' },
      );
    },
  },
  'crossRefs.remove': {
    throwCase: () =>
      crossRefsRemoveWrapper(
        makeRefEditor(),
        {
          target: {
            kind: 'inline',
            nodeType: 'crossRef',
            anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
          },
        },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveCrossRefTarget.mockReturnValueOnce(mockResolvedNode(1, 'cr-1', 'crossReference'));
      refResolverMocks.extractCrossRefInfo.mockReturnValueOnce({
        address: {
          kind: 'inline',
          nodeType: 'crossRef',
          anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
        },
      });
      return withAppliedReceipt(() =>
        crossRefsRemoveWrapper(
          makeRefEditor(),
          {
            target: {
              kind: 'inline',
              nodeType: 'crossRef',
              anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
            },
          },
          { changeMode: 'direct' },
        ),
      );
    },
  },

  // ---- Index (block) ----
  'index.insert': {
    throwCase: () => indexInsertWrapper(makeRefEditor(), { at: { kind: 'documentEnd' } }, { changeMode: 'tracked' }),
    applyCase: () =>
      withAppliedReceipt(() =>
        indexInsertWrapper(makeRefEditor(), { at: { kind: 'documentEnd' } }, { changeMode: 'direct' }),
      ),
  },
  'index.configure': {
    throwCase: () =>
      indexConfigureWrapper(
        makeRefEditor(),
        { target: { kind: 'block', nodeType: 'index', nodeId: 'idx-1' }, patch: {} },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveIndexTarget.mockReturnValueOnce(mockResolvedNode(1, 'idx-1', 'documentIndex'));
      return withAppliedReceipt(() =>
        indexConfigureWrapper(
          makeRefEditor(),
          { target: { kind: 'block', nodeType: 'index', nodeId: 'idx-1' }, patch: {} },
          { changeMode: 'direct' },
        ),
      );
    },
  },
  'index.rebuild': {
    throwCase: () =>
      indexRebuildWrapper(
        makeRefEditor(),
        { target: { kind: 'block', nodeType: 'index', nodeId: 'idx-1' } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveIndexTarget.mockReturnValueOnce(mockResolvedNode(1, 'idx-1', 'documentIndex'));
      return indexRebuildWrapper(
        makeRefEditor(),
        { target: { kind: 'block', nodeType: 'index', nodeId: 'idx-1' } },
        { changeMode: 'direct' },
      );
    },
  },
  'index.remove': {
    throwCase: () =>
      indexRemoveWrapper(
        makeRefEditor(),
        { target: { kind: 'block', nodeType: 'index', nodeId: 'idx-1' } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveIndexTarget.mockReturnValueOnce(mockResolvedNode(1, 'idx-1', 'documentIndex'));
      return withAppliedReceipt(() =>
        indexRemoveWrapper(
          makeRefEditor(),
          { target: { kind: 'block', nodeType: 'index', nodeId: 'idx-1' } },
          { changeMode: 'direct' },
        ),
      );
    },
  },

  // ---- Index entries (inline) ----
  'index.entries.insert': {
    throwCase: () =>
      indexEntriesInsertWrapper(
        makeRefEditor(),
        { entry: { text: 'Term' }, at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      const spy = spyOn(adapterUtils, 'resolveTextTarget').mockReturnValueOnce({ from: 1, to: 1 });
      try {
        return withAppliedReceipt(() =>
          indexEntriesInsertWrapper(
            makeRefEditor(),
            {
              entry: { text: 'Term' },
              at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
            },
            { changeMode: 'direct' },
          ),
        );
      } finally {
        spy.mockRestore();
      }
    },
  },
  'index.entries.update': {
    throwCase: () =>
      indexEntriesUpdateWrapper(
        makeRefEditor(),
        {
          target: {
            kind: 'inline',
            nodeType: 'indexEntry',
            anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
          },
          patch: { text: 'New' },
        },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveIndexEntryTarget.mockReturnValueOnce(mockResolvedNode(1, 'ie-1', 'indexEntry'));
      refResolverMocks.extractIndexEntryInfo.mockReturnValueOnce({
        address: {
          kind: 'inline',
          nodeType: 'indexEntry',
          anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
        },
      });
      return withAppliedReceipt(() =>
        indexEntriesUpdateWrapper(
          makeRefEditor(),
          {
            target: {
              kind: 'inline',
              nodeType: 'indexEntry',
              anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
            },
            patch: { text: 'New' },
          },
          { changeMode: 'direct' },
        ),
      );
    },
  },
  'index.entries.remove': {
    throwCase: () =>
      indexEntriesRemoveWrapper(
        makeRefEditor(),
        {
          target: {
            kind: 'inline',
            nodeType: 'indexEntry',
            anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
          },
        },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveIndexEntryTarget.mockReturnValueOnce(mockResolvedNode(1, 'ie-1', 'indexEntry'));
      refResolverMocks.extractIndexEntryInfo.mockReturnValueOnce({
        address: {
          kind: 'inline',
          nodeType: 'indexEntry',
          anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
        },
      });
      return withAppliedReceipt(() =>
        indexEntriesRemoveWrapper(
          makeRefEditor(),
          {
            target: {
              kind: 'inline',
              nodeType: 'indexEntry',
              anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
            },
          },
          { changeMode: 'direct' },
        ),
      );
    },
  },

  // ---- Captions ----
  'captions.insert': {
    throwCase: () =>
      captionsInsertWrapper(
        makeRefEditor(),
        { label: 'Figure', adjacentTo: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' }, position: 'below' },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      const spy = spyOn(adapterUtils, 'resolveBlockCreatePosition').mockReturnValueOnce(10);
      try {
        return withAppliedReceipt(() =>
          captionsInsertWrapper(
            makeRefEditor(),
            { label: 'Figure', adjacentTo: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' }, position: 'below' },
            { changeMode: 'direct' },
          ),
        );
      } finally {
        spy.mockRestore();
      }
    },
  },
  'captions.update': {
    throwCase: () =>
      captionsUpdateWrapper(
        makeRefEditor(),
        { target: { kind: 'block', nodeType: 'paragraph', nodeId: 'cap-1' }, patch: { text: 'New' } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveCaptionTarget.mockReturnValueOnce(mockResolvedNode(1, 'cap-1', 'paragraph'));
      return withAppliedReceipt(() =>
        captionsUpdateWrapper(
          makeRefEditor(),
          { target: { kind: 'block', nodeType: 'paragraph', nodeId: 'cap-1' }, patch: { text: 'New' } },
          { changeMode: 'direct' },
        ),
      );
    },
  },
  'captions.remove': {
    throwCase: () =>
      captionsRemoveWrapper(
        makeRefEditor(),
        { target: { kind: 'block', nodeType: 'paragraph', nodeId: 'cap-1' } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveCaptionTarget.mockReturnValueOnce(mockResolvedNode(1, 'cap-1', 'paragraph'));
      return withAppliedReceipt(() =>
        captionsRemoveWrapper(
          makeRefEditor(),
          { target: { kind: 'block', nodeType: 'paragraph', nodeId: 'cap-1' } },
          { changeMode: 'direct' },
        ),
      );
    },
  },
  'captions.configure': {
    throwCase: () =>
      captionsConfigureWrapper(makeRefEditor(), { label: 'Figure', format: 'decimal' }, { changeMode: 'tracked' }),
    applyCase: () =>
      withAppliedReceipt(() =>
        captionsConfigureWrapper(makeRefEditor(), { label: 'Figure', format: 'decimal' }, { changeMode: 'direct' }),
      ),
  },

  // ---- Fields ----
  'fields.insert': {
    throwCase: () =>
      fieldsInsertWrapper(
        makeRefEditor(),
        {
          mode: 'raw',
          instruction: 'DATE',
          at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
        },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      const spy = spyOn(adapterUtils, 'resolveTextTarget').mockReturnValueOnce({ from: 1, to: 1 });
      try {
        return withAppliedReceipt(() =>
          fieldsInsertWrapper(
            makeRefEditor(),
            {
              mode: 'raw',
              instruction: 'DATE',
              at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
            },
            { changeMode: 'direct' },
          ),
        );
      } finally {
        spy.mockRestore();
      }
    },
  },
  'fields.rebuild': {
    throwCase: () =>
      fieldsRebuildWrapper(
        makeRefEditor(),
        { target: { kind: 'field', blockId: 'p1', occurrenceIndex: 0, nestingDepth: 0 } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveFieldTarget.mockReturnValueOnce({
        ...mockResolvedNode(1, 'f-1', 'field'),
        blockId: 'p1',
        occurrenceIndex: 0,
        nestingDepth: 0,
      });
      return withAppliedReceipt(() =>
        fieldsRebuildWrapper(
          makeRefEditor(),
          { target: { kind: 'field', blockId: 'p1', occurrenceIndex: 0, nestingDepth: 0 } },
          { changeMode: 'direct' },
        ),
      );
    },
  },
  'fields.remove': {
    throwCase: () =>
      fieldsRemoveWrapper(
        makeRefEditor(),
        { target: { kind: 'field', blockId: 'p1', occurrenceIndex: 0, nestingDepth: 0 }, mode: 'raw' },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveFieldTarget.mockReturnValueOnce({
        ...mockResolvedNode(1, 'f-1', 'field'),
        blockId: 'p1',
        occurrenceIndex: 0,
        nestingDepth: 0,
      });
      return withAppliedReceipt(() =>
        fieldsRemoveWrapper(
          makeRefEditor(),
          { target: { kind: 'field', blockId: 'p1', occurrenceIndex: 0, nestingDepth: 0 }, mode: 'raw' },
          { changeMode: 'direct' },
        ),
      );
    },
  },

  // ---- Citations (inline) ----
  'citations.insert': {
    throwCase: () =>
      citationsInsertWrapper(
        makeRefEditor(),
        { sourceIds: ['src-1'], at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      const spy = spyOn(adapterUtils, 'resolveTextTarget').mockReturnValueOnce({ from: 1, to: 1 });
      try {
        return withAppliedReceipt(() =>
          citationsInsertWrapper(
            makeRefEditor(),
            { sourceIds: ['src-1'], at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] } },
            { changeMode: 'direct' },
          ),
        );
      } finally {
        spy.mockRestore();
      }
    },
  },
  'citations.update': {
    throwCase: () =>
      citationsUpdateWrapper(
        makeRefEditor(),
        {
          target: {
            kind: 'inline',
            nodeType: 'citation',
            anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
          },
          patch: { sourceIds: ['src-2'] },
        },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveCitationTarget.mockReturnValueOnce(mockResolvedNode(1, 'cit-1', 'citation'));
      refResolverMocks.extractCitationInfo.mockReturnValueOnce({
        address: {
          kind: 'inline',
          nodeType: 'citation',
          anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
        },
      });
      return withAppliedReceipt(() =>
        citationsUpdateWrapper(
          makeRefEditor(),
          {
            target: {
              kind: 'inline',
              nodeType: 'citation',
              anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
            },
            patch: { sourceIds: ['src-2'] },
          },
          { changeMode: 'direct' },
        ),
      );
    },
  },
  'citations.remove': {
    throwCase: () =>
      citationsRemoveWrapper(
        makeRefEditor(),
        {
          target: {
            kind: 'inline',
            nodeType: 'citation',
            anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
          },
        },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveCitationTarget.mockReturnValueOnce(mockResolvedNode(1, 'cit-1', 'citation'));
      refResolverMocks.extractCitationInfo.mockReturnValueOnce({
        address: {
          kind: 'inline',
          nodeType: 'citation',
          anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
        },
      });
      return withAppliedReceipt(() =>
        citationsRemoveWrapper(
          makeRefEditor(),
          {
            target: {
              kind: 'inline',
              nodeType: 'citation',
              anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
            },
          },
          { changeMode: 'direct' },
        ),
      );
    },
  },

  // ---- Citation sources (out-of-band) ----
  'citations.sources.insert': {
    throwCase: () =>
      citationSourcesInsertWrapper(makeRefEditor(), { type: 'book', fields: {} }, { changeMode: 'tracked' }),
    applyCase: () =>
      citationSourcesInsertWrapper(makeRefEditor(), { type: 'book', fields: {} }, { changeMode: 'direct' }),
  },
  'citations.sources.update': {
    throwCase: () =>
      citationSourcesUpdateWrapper(
        makeRefEditor(),
        { target: { kind: 'entity', entityType: 'citationSource', sourceId: 'src-1' }, patch: { title: 'New' } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveSourceTarget.mockReturnValueOnce({
        tag: 'src-1',
        type: 'book',
        fields: { title: 'Old' },
      });
      return citationSourcesUpdateWrapper(
        makeRefEditor(),
        { target: { kind: 'entity', entityType: 'citationSource', sourceId: 'src-1' }, patch: { title: 'New' } },
        { changeMode: 'direct' },
      );
    },
  },
  'citations.sources.remove': {
    throwCase: () =>
      citationSourcesRemoveWrapper(
        makeRefEditor(),
        { target: { kind: 'entity', entityType: 'citationSource', sourceId: 'src-1' } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveSourceTarget.mockReturnValueOnce({
        tag: 'src-1',
        type: 'book',
        fields: {},
      });
      return citationSourcesRemoveWrapper(
        makeRefEditor(),
        { target: { kind: 'entity', entityType: 'citationSource', sourceId: 'src-1' } },
        { changeMode: 'direct' },
      );
    },
  },

  // ---- Bibliography (block) ----
  'citations.bibliography.insert': {
    throwCase: () =>
      bibliographyInsertWrapper(makeRefEditor(), { at: { kind: 'documentEnd' } }, { changeMode: 'tracked' }),
    applyCase: () =>
      withAppliedReceipt(() =>
        bibliographyInsertWrapper(makeRefEditor(), { at: { kind: 'documentEnd' } }, { changeMode: 'direct' }),
      ),
  },
  'citations.bibliography.configure': {
    throwCase: () => bibliographyConfigureWrapper(makeRefEditor(), { style: 'APA' }, { changeMode: 'tracked' }),
    applyCase: () => {
      refResolverMocks.findAllBibliographies.mockReturnValueOnce([{ nodeId: 'bib-1' }]);
      return withAppliedReceipt(() =>
        bibliographyConfigureWrapper(makeRefEditor(), { style: 'APA' }, { changeMode: 'direct' }),
      );
    },
  },
  'citations.bibliography.rebuild': {
    throwCase: () =>
      bibliographyRebuildWrapper(
        makeRefEditor(),
        { target: { kind: 'block', nodeType: 'bibliography', nodeId: 'bib-1' } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveBibliographyTarget.mockReturnValueOnce(mockResolvedNode(1, 'bib-1', 'bibliography'));
      return bibliographyRebuildWrapper(
        makeRefEditor(),
        { target: { kind: 'block', nodeType: 'bibliography', nodeId: 'bib-1' } },
        { changeMode: 'direct' },
      );
    },
  },
  'citations.bibliography.remove': {
    throwCase: () =>
      bibliographyRemoveWrapper(
        makeRefEditor(),
        { target: { kind: 'block', nodeType: 'bibliography', nodeId: 'bib-1' } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveBibliographyTarget.mockReturnValueOnce(mockResolvedNode(1, 'bib-1', 'bibliography'));
      return withAppliedReceipt(() =>
        bibliographyRemoveWrapper(
          makeRefEditor(),
          { target: { kind: 'block', nodeType: 'bibliography', nodeId: 'bib-1' } },
          { changeMode: 'direct' },
        ),
      );
    },
  },

  // ---- Authorities (block) ----
  'authorities.insert': {
    throwCase: () =>
      authoritiesInsertWrapper(makeRefEditor(), { at: { kind: 'documentEnd' } }, { changeMode: 'tracked' }),
    applyCase: () =>
      withAppliedReceipt(() =>
        authoritiesInsertWrapper(makeRefEditor(), { at: { kind: 'documentEnd' } }, { changeMode: 'direct' }),
      ),
  },
  'authorities.configure': {
    throwCase: () =>
      authoritiesConfigureWrapper(
        makeRefEditor(),
        { target: { kind: 'block', nodeType: 'tableOfAuthorities', nodeId: 'toa-1' }, patch: { category: 1 } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveAuthorityTarget.mockReturnValueOnce(mockResolvedNode(1, 'toa-1', 'tableOfAuthorities'));
      return withAppliedReceipt(() =>
        authoritiesConfigureWrapper(
          makeRefEditor(),
          { target: { kind: 'block', nodeType: 'tableOfAuthorities', nodeId: 'toa-1' }, patch: { category: 1 } },
          { changeMode: 'direct' },
        ),
      );
    },
  },
  'authorities.rebuild': {
    throwCase: () =>
      authoritiesRebuildWrapper(
        makeRefEditor(),
        { target: { kind: 'block', nodeType: 'tableOfAuthorities', nodeId: 'toa-1' } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveAuthorityTarget.mockReturnValueOnce(mockResolvedNode(1, 'toa-1', 'tableOfAuthorities'));
      return authoritiesRebuildWrapper(
        makeRefEditor(),
        { target: { kind: 'block', nodeType: 'tableOfAuthorities', nodeId: 'toa-1' } },
        { changeMode: 'direct' },
      );
    },
  },
  'authorities.remove': {
    throwCase: () =>
      authoritiesRemoveWrapper(
        makeRefEditor(),
        { target: { kind: 'block', nodeType: 'tableOfAuthorities', nodeId: 'toa-1' } },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveAuthorityTarget.mockReturnValueOnce(mockResolvedNode(1, 'toa-1', 'tableOfAuthorities'));
      return withAppliedReceipt(() =>
        authoritiesRemoveWrapper(
          makeRefEditor(),
          { target: { kind: 'block', nodeType: 'tableOfAuthorities', nodeId: 'toa-1' } },
          { changeMode: 'direct' },
        ),
      );
    },
  },

  // ---- Authority entries (inline) ----
  'authorities.entries.insert': {
    throwCase: () =>
      authorityEntriesInsertWrapper(
        makeRefEditor(),
        {
          entry: { longCitation: 'Smith v. Jones', shortCitation: 'Smith', category: 1 },
          at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
        },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      const spy = spyOn(adapterUtils, 'resolveTextTarget').mockReturnValueOnce({ from: 1, to: 1 });
      try {
        return withAppliedReceipt(() =>
          authorityEntriesInsertWrapper(
            makeRefEditor(),
            {
              entry: { longCitation: 'Smith v. Jones', shortCitation: 'Smith', category: 1 },
              at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
            },
            { changeMode: 'direct' },
          ),
        );
      } finally {
        spy.mockRestore();
      }
    },
  },
  'authorities.entries.update': {
    throwCase: () =>
      authorityEntriesUpdateWrapper(
        makeRefEditor(),
        {
          target: {
            kind: 'inline',
            nodeType: 'authorityEntry',
            anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
          },
          patch: { longCitation: 'New citation' },
        },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveAuthorityEntryTarget.mockReturnValueOnce(mockResolvedNode(1, 'ae-1', 'authorityEntry'));
      refResolverMocks.extractAuthorityEntryInfo.mockReturnValueOnce({
        address: {
          kind: 'inline',
          nodeType: 'authorityEntry',
          anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
        },
      });
      return withAppliedReceipt(() =>
        authorityEntriesUpdateWrapper(
          makeRefEditor(),
          {
            target: {
              kind: 'inline',
              nodeType: 'authorityEntry',
              anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
            },
            patch: { longCitation: 'New citation' },
          },
          { changeMode: 'direct' },
        ),
      );
    },
  },
  'authorities.entries.remove': {
    throwCase: () =>
      authorityEntriesRemoveWrapper(
        makeRefEditor(),
        {
          target: {
            kind: 'inline',
            nodeType: 'authorityEntry',
            anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
          },
        },
        { changeMode: 'tracked' },
      ),
    applyCase: () => {
      refResolverMocks.resolveAuthorityEntryTarget.mockReturnValueOnce(mockResolvedNode(1, 'ae-1', 'authorityEntry'));
      refResolverMocks.extractAuthorityEntryInfo.mockReturnValueOnce({
        address: {
          kind: 'inline',
          nodeType: 'authorityEntry',
          anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
        },
      });
      return withAppliedReceipt(() =>
        authorityEntriesRemoveWrapper(
          makeRefEditor(),
          {
            target: {
              kind: 'inline',
              nodeType: 'authorityEntry',
              anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
            },
          },
          { changeMode: 'direct' },
        ),
      );
    },
  },
};

const mutationVectors: Partial<Record<OperationId, MutationVector>> = {
  'blocks.delete': {
    throwCase: () => {
      const editor = makeBlockDeleteEditor();
      return blocksDeleteWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'paragraph', nodeId: 'missing' } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeBlockDeleteEditor();
      return blocksDeleteWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' } },
        { changeMode: 'direct' },
      );
    },
  },
  'blocks.deleteRange': {
    throwCase: () => {
      const editor = makeBlockRangeDeleteEditor();
      return blocksDeleteRangeWrapper(
        editor,
        {
          start: { kind: 'block', nodeType: 'paragraph', nodeId: 'missing' },
          end: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeBlockRangeDeleteEditor();
      return blocksDeleteRangeWrapper(
        editor,
        {
          start: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
          end: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
        },
        { changeMode: 'direct' },
      );
    },
  },
  clearContent: {
    throwCase: () => {
      const { editor } = makeTextEditor('Hello');
      // Remove paragraph from schema nodes to trigger CAPABILITY_UNAVAILABLE
      (editor.state.schema as { nodes: Record<string, unknown> }).nodes = {};
      return clearContentWrapper(editor, {});
    },
    failureCase: () => {
      // Build an editor whose doc is a single empty paragraph (childCount === 0)
      const emptyParagraph = createNode('paragraph', [], {
        attrs: { sdBlockId: 'p1' },
        isBlock: true,
        inlineContent: true,
      });
      const { editor } = makeTextEditor('');
      const stateDoc = editor.state.doc as Record<string, unknown>;
      stateDoc.childCount = 1;
      stateDoc.firstChild = emptyParagraph;
      return clearContentWrapper(editor, {});
    },
    applyCase: () => {
      const { editor } = makeTextEditor('Hello');
      return clearContentWrapper(editor, {});
    },
  },
  insert: {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return textReceiptToSDReceipt(
        writeAdapter(
          editor,
          { kind: 'insert', target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 0 } }, text: 'X' },
          { changeMode: 'direct' },
        ),
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor();
      return textReceiptToSDReceipt(
        writeAdapter(
          editor,
          { kind: 'insert', target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 0 } }, text: '' },
          { changeMode: 'direct' },
        ),
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return textReceiptToSDReceipt(
        writeAdapter(
          editor,
          { kind: 'insert', target: { kind: 'text', blockId: 'p1', range: { start: 1, end: 1 } }, text: 'X' },
          { changeMode: 'direct' },
        ),
      );
    },
  },
  replace: {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return textReceiptToSDReceipt(
        writeAdapter(
          editor,
          { kind: 'replace', target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } }, text: 'X' },
          { changeMode: 'direct' },
        ),
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor('Hello');
      return textReceiptToSDReceipt(
        writeAdapter(
          editor,
          { kind: 'replace', target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, text: 'Hello' },
          { changeMode: 'direct' },
        ),
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor('Hello');
      return textReceiptToSDReceipt(
        writeAdapter(
          editor,
          { kind: 'replace', target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, text: 'World' },
          { changeMode: 'direct' },
        ),
      );
    },
  },
  delete: {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return writeAdapter(
        editor,
        { kind: 'delete', target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor();
      return writeAdapter(
        editor,
        { kind: 'delete', target: { kind: 'text', blockId: 'p1', range: { start: 2, end: 2 } } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return writeAdapter(
        editor,
        { kind: 'delete', target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 2 } } },
        { changeMode: 'direct' },
      );
    },
  },
  'format.apply': {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return styleApplyWrapper(
        editor,
        { target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } }, inline: { bold: 'on' } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor();
      return styleApplyWrapper(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 2, end: 2 } }, inline: { bold: 'on' } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return styleApplyWrapper(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, inline: { bold: 'on', italic: 'off' } },
        { changeMode: 'direct' },
      );
    },
  },
  ...formatInlineMutationVectors,
  ...paragraphMutationVectors,
  'create.paragraph': {
    throwCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertParagraphAt: undefined } });
      return createParagraphWrapper(editor, { at: { kind: 'documentEnd' }, text: 'X' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertParagraphAt: mock(() => false) } });
      return createParagraphWrapper(editor, { at: { kind: 'documentEnd' }, text: 'X' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertParagraphAt: mock(() => true) } });
      return createParagraphWrapper(editor, { at: { kind: 'documentEnd' }, text: 'X' }, { changeMode: 'direct' });
    },
  },
  'create.heading': {
    throwCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertHeadingAt: undefined } });
      return createHeadingWrapper(
        editor,
        { level: 1, at: { kind: 'documentEnd' }, text: 'X' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertHeadingAt: mock(() => false) } });
      return createHeadingWrapper(
        editor,
        { level: 1, at: { kind: 'documentEnd' }, text: 'X' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertHeadingAt: mock(() => true) } });
      return createHeadingWrapper(
        editor,
        { level: 2, at: { kind: 'documentEnd' }, text: 'X' },
        { changeMode: 'direct' },
      );
    },
  },
  'create.sectionBreak': {
    throwCase: () => {
      const editor = makeSectionsEditor({ includeParagraphNodeType: false });
      return createSectionBreakAdapter(editor, { at: { kind: 'documentEnd' } }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeSectionsEditor({ throwOnInsert: true });
      return createSectionBreakAdapter(
        editor,
        { at: { kind: 'documentEnd' }, breakType: 'nextPage' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return createSectionBreakAdapter(
        editor,
        { at: { kind: 'documentEnd' }, breakType: 'nextPage' },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setBreakType': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetBreakTypeAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, breakType: 'continuous' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetBreakTypeAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, breakType: 'continuous' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetBreakTypeAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, breakType: 'nextPage' },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setPageMargins': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageMarginsAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, top: 1 },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageMarginsAdapter(
        editor,
        {
          target: { kind: 'section', sectionId: 'section-0' },
          top: 1,
          right: 1,
          bottom: 1,
          left: 1,
          gutter: 0,
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageMarginsAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, top: 1.25 },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setHeaderFooterMargins': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetHeaderFooterMarginsAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, header: 0.5 },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetHeaderFooterMarginsAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, header: 0.5, footer: 0.5 },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetHeaderFooterMarginsAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, header: 0.75 },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setPageSetup': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageSetupAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, orientation: 'portrait' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageSetupAdapter(
        editor,
        {
          target: { kind: 'section', sectionId: 'section-0' },
          width: 8.5,
          height: 11,
          orientation: 'portrait',
          paperSize: '1',
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageSetupAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, orientation: 'landscape' },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setColumns': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetColumnsAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, count: 1 },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetColumnsAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, count: 1, gap: 0.5, equalWidth: true },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetColumnsAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, count: 2 },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setLineNumbering': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetLineNumberingAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, enabled: true },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetLineNumberingAdapter(
        editor,
        {
          target: { kind: 'section', sectionId: 'section-0' },
          enabled: true,
          countBy: 1,
          start: 1,
          distance: 0.5,
          restart: 'continuous',
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetLineNumberingAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, enabled: false },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setPageNumbering': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageNumberingAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, start: 1 },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageNumberingAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, start: 1, format: 'decimal' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageNumberingAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, start: 2 },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setTitlePage': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetTitlePageAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, enabled: true },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetTitlePageAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, enabled: true },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetTitlePageAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, enabled: false },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setOddEvenHeadersFooters': {
    throwCase: () => {
      const editor = makeSectionsEditor({ includeConverter: false });
      return sectionsSetOddEvenHeadersFootersAdapter(editor, { enabled: true }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetOddEvenHeadersFootersAdapter(editor, { enabled: false }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetOddEvenHeadersFootersAdapter(editor, { enabled: true }, { changeMode: 'direct' });
    },
  },
  'sections.setVerticalAlign': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetVerticalAlignAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, value: 'top' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetVerticalAlignAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, value: 'top' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetVerticalAlignAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, value: 'center' },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setSectionDirection': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetSectionDirectionAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, direction: 'ltr' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetSectionDirectionAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, direction: 'ltr' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetSectionDirectionAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, direction: 'rtl' },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setHeaderFooterRef': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetHeaderFooterRefAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, kind: 'header', variant: 'default', refId: 'x' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetHeaderFooterRefAdapter(
        editor,
        {
          target: { kind: 'section', sectionId: 'section-0' },
          kind: 'header',
          variant: 'default',
          refId: 'rIdHeaderDefault',
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetHeaderFooterRefAdapter(
        editor,
        {
          target: { kind: 'section', sectionId: 'section-0' },
          kind: 'header',
          variant: 'default',
          refId: 'rIdHeaderAlt',
        },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.clearHeaderFooterRef': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsClearHeaderFooterRefAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, kind: 'header', variant: 'default' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsClearHeaderFooterRefAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, kind: 'header', variant: 'even' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsClearHeaderFooterRefAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, kind: 'header', variant: 'default' },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setLinkToPrevious': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetLinkToPreviousAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, kind: 'header', variant: 'default', linked: true },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetLinkToPreviousAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, kind: 'header', variant: 'default', linked: true },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const bodyWithoutRefs = clone(BASE_SECTION_BODY_SECT_PR);
      const filteredBodyElements = ((bodyWithoutRefs.elements ?? []) as Array<{ name?: string }>).filter(
        (element) => element.name !== 'w:headerReference' && element.name !== 'w:footerReference',
      );
      bodyWithoutRefs.elements = filteredBodyElements as unknown as Record<string, unknown>[];

      const editor = makeSectionsEditor({
        paragraphSectPr: PREVIOUS_SECTION_SECT_PR,
        bodySectPr: bodyWithoutRefs,
      });
      return sectionsSetLinkToPreviousAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-1' }, kind: 'header', variant: 'default', linked: false },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setPageBorders': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageBordersAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, borders: {} },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageBordersAdapter(
        editor,
        {
          target: { kind: 'section', sectionId: 'section-0' },
          borders: {
            display: 'allPages',
            offsetFrom: 'page',
            zOrder: 'front',
            top: { style: 'single', size: 8, space: 0, color: '000000' },
          },
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageBordersAdapter(
        editor,
        {
          target: { kind: 'section', sectionId: 'section-0' },
          borders: {
            display: 'allPages',
            offsetFrom: 'page',
            zOrder: 'front',
            top: { style: 'double', size: 12, space: 0, color: '000000' },
          },
        },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.clearPageBorders': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsClearPageBordersAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const bodyWithoutBorders = clone(BASE_SECTION_BODY_SECT_PR);
      bodyWithoutBorders.elements = ((bodyWithoutBorders.elements ?? []) as Array<{ name?: string }>).filter(
        (element) => element.name !== 'w:pgBorders',
      ) as unknown as Record<string, unknown>[];
      const editor = makeSectionsEditor({ bodySectPr: bodyWithoutBorders });
      return sectionsClearPageBordersAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsClearPageBordersAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' } },
        { changeMode: 'direct' },
      );
    },
  },
  'lists.insert': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'decimal' })]);
      return listsInsertWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'missing' }, position: 'after', text: 'X' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'decimal' })], {
        insertListItemAt: mock(() => false),
      });
      return listsInsertWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, position: 'after', text: 'X' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'decimal' })]);
      return listsInsertWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, position: 'after', text: 'X' },
        { changeMode: 'direct' },
      );
    },
  },
  'lists.indent': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsIndentWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const hasDefinitionSpy = spyOn(ListHelpers, 'hasListDefinition').mockReturnValue(false);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsIndentWrapper(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
      hasDefinitionSpy.mockRestore();
      return result;
    },
    applyCase: () => {
      const hasDefinitionSpy = spyOn(ListHelpers, 'hasListDefinition').mockReturnValue(true);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsIndentWrapper(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
      hasDefinitionSpy.mockRestore();
      return result;
    },
  },
  'lists.outdent': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 1, numberingType: 'decimal' })]);
      return listsOutdentWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsOutdentWrapper(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
    },
    applyCase: () => {
      const hasDefinitionSpy = spyOn(ListHelpers, 'hasListDefinition').mockReturnValue(true);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 1, numberingType: 'decimal' })]);
      const result = listsOutdentWrapper(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
      hasDefinitionSpy.mockRestore();
      return result;
    },
  },
  'lists.create': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'p-1' })]);
      return listsCreateWrapper(
        editor,
        { mode: 'empty', at: { kind: 'block', nodeType: 'paragraph', nodeId: 'p-1' }, kind: 'ordered' },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsCreateWrapper(editor, {
        mode: 'fromParagraphs',
        target: { kind: 'block', nodeType: 'paragraph', nodeId: 'li-1' },
        kind: 'ordered',
      });
    },
    applyCase: () => {
      const getNewListIdSpy = spyOn(ListHelpers, 'getNewListId').mockReturnValue(99);
      const generateSpy = spyOn(ListHelpers, 'generateNewListDefinition').mockImplementation(() => {});
      const editor = makeListEditor([makeListParagraph({ id: 'p-1' })]);
      const result = listsCreateWrapper(editor, {
        mode: 'empty',
        at: { kind: 'block', nodeType: 'paragraph', nodeId: 'p-1' },
        kind: 'ordered',
      });
      getNewListIdSpy.mockRestore();
      generateSpy.mockRestore();
      return result;
    },
  },
  'lists.attach': {
    throwCase: () => {
      const editor = makeListEditor([
        makeListParagraph({ id: 'p-1' }),
        makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' }),
      ]);
      return listsAttachWrapper(
        editor,
        {
          target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p-1' },
          attachTo: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsAttachWrapper(editor, {
        target: { kind: 'block', nodeType: 'paragraph', nodeId: 'li-1' },
        attachTo: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
      });
    },
    applyCase: () => {
      const editor = makeListEditor([
        makeListParagraph({ id: 'p-1' }),
        makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' }),
      ]);
      return listsAttachWrapper(editor, {
        target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p-1' },
        attachTo: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
      });
    },
  },
  'lists.detach': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsDetachWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const noopReceipt = { steps: [{ effect: 'noop' }], revision: 'r0' };
      const execSpy = spyOn(planWrappers, 'executeDomainCommand').mockReturnValue(noopReceipt as any);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsDetachWrapper(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
      execSpy.mockRestore();
      return result;
    },
    applyCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsDetachWrapper(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
    },
  },
  'lists.join': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsJoinWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, direction: 'withNext' },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const canJoinSpy = spyOn(listSequenceHelpers, 'evaluateCanJoin').mockReturnValue({
        canJoin: false,
        reason: 'NO_ADJACENT_SEQUENCE',
      });
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsJoinWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        direction: 'withNext',
      });
      canJoinSpy.mockRestore();
      return result;
    },
    applyCase: () => {
      const canJoinSpy = spyOn(listSequenceHelpers, 'evaluateCanJoin').mockReturnValue({
        canJoin: true,
        adjacentListId: '2',
      });
      const adjacentSpy = spyOn(listSequenceHelpers, 'findAdjacentSequence').mockReturnValue({
        numId: 2,
        sequence: [
          {
            address: { kind: 'block', nodeType: 'listItem', nodeId: 'li-2' },
            candidate: {
              nodeId: 'li-2',
              nodeType: 'listItem',
              pos: 4,
              end: 8,
              node: { attrs: { paragraphProperties: { numberingProperties: { numId: 2, ilvl: 0 } } } } as any,
            },
            numId: 2,
            level: 0,
          } as any,
        ],
      });
      const sequenceSpy = spyOn(listSequenceHelpers, 'getContiguousSequence').mockReturnValue([]);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsJoinWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        direction: 'withNext',
      });
      canJoinSpy.mockRestore();
      adjacentSpy.mockRestore();
      sequenceSpy.mockRestore();
      return result;
    },
  },
  'lists.separate': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSeparateWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const firstInSeqSpy = spyOn(listSequenceHelpers, 'isFirstInSequence').mockReturnValue(true);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsSeparateWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
      });
      firstInSeqSpy.mockRestore();
      return result;
    },
    applyCase: () => {
      const firstInSeqSpy = spyOn(listSequenceHelpers, 'isFirstInSequence').mockReturnValue(false);
      const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
      const seqSpy = spyOn(listSequenceHelpers, 'getSequenceFromTarget').mockReturnValue([]);
      const createNumSpy = vi
        .spyOn(ListHelpers, 'createNumDefinition')
        .mockReturnValue({ numId: 99, numDef: {} } as any);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsSeparateWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
      });
      firstInSeqSpy.mockRestore();
      abstractSpy.mockRestore();
      seqSpy.mockRestore();
      createNumSpy.mockRestore();
      return result;
    },
  },
  'lists.setLevel': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 2 },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
      });
    },
    applyCase: () => {
      const hasDefinitionSpy = spyOn(ListHelpers, 'hasListDefinition').mockReturnValue(true);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsSetLevelWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 2,
      });
      hasDefinitionSpy.mockRestore();
      return result;
    },
  },
  'lists.setValue': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetValueWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, value: 5 },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      // value: null with noop receipt → NO_OP
      const noopReceipt = { steps: [{ effect: 'noop' }], revision: 'r0' };
      const execSpy = spyOn(planWrappers, 'executeDomainCommand').mockReturnValue(noopReceipt as any);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsSetValueWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        value: null,
      });
      execSpy.mockRestore();
      return result;
    },
    applyCase: () => {
      const firstInSeqSpy = spyOn(listSequenceHelpers, 'isFirstInSequence').mockReturnValue(true);
      const overrideSpy = spyOn(ListHelpers, 'setLvlOverride').mockImplementation(() => {});
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsSetValueWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        value: 5,
      });
      firstInSeqSpy.mockRestore();
      overrideSpy.mockRestore();
      return result;
    },
  },
  'lists.continuePrevious': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsContinuePreviousWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const canContSpy = spyOn(listSequenceHelpers, 'evaluateCanContinuePrevious').mockReturnValue({
        canContinue: false,
        reason: 'NO_PREVIOUS_LIST',
      });
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsContinuePreviousWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
      });
      canContSpy.mockRestore();
      return result;
    },
    applyCase: () => {
      const canContSpy = spyOn(listSequenceHelpers, 'evaluateCanContinuePrevious').mockReturnValue({
        canContinue: true,
        previousListId: '2',
      });
      const prevSpy = spyOn(listSequenceHelpers, 'findPreviousCompatibleSequence').mockReturnValue({
        numId: 2,
        sequence: [],
      });
      const seqSpy = spyOn(listSequenceHelpers, 'getContiguousSequence').mockReturnValue([]);
      const removeSpy = spyOn(ListHelpers, 'removeLvlOverride').mockImplementation(() => {});
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsContinuePreviousWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
      });
      canContSpy.mockRestore();
      prevSpy.mockRestore();
      seqSpy.mockRestore();
      removeSpy.mockRestore();
      return result;
    },
  },
  'lists.setLevelRestart': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelRestartWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, restartAfterLevel: null },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelRestartWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 99,
        restartAfterLevel: null,
      });
    },
    applyCase: () => {
      const overrideSpy = spyOn(ListHelpers, 'setLvlOverride').mockImplementation(() => {});
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsSetLevelRestartWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
        restartAfterLevel: 0,
        scope: 'instance',
      });
      overrideSpy.mockRestore();
      return result;
    },
  },
  'lists.convertToText': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsConvertToTextWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const noopReceipt = { steps: [{ effect: 'noop' }], revision: 'r0' };
      const execSpy = spyOn(planWrappers, 'executeDomainCommand').mockReturnValue(noopReceipt as any);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsConvertToTextWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
      });
      execSpy.mockRestore();
      return result;
    },
    applyCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsConvertToTextWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
      });
    },
  },
  // SD-1973 formatting operations
  'lists.applyTemplate': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsApplyTemplateWrapper(
        editor,
        {
          target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
          template: { version: 1, levels: [] },
        },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsApplyTemplateWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        template: { version: 99 as any, levels: [] },
      });
    },
    applyCase: () => {
      const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const applySpy = vi
        .spyOn(LevelFormattingHelpers, 'applyTemplateToAbstract')
        .mockImplementation((_ed: unknown) => {
          injectNumberingChange(_ed);
          return { changed: true, levelsApplied: [0] };
        });
      const result = listsApplyTemplateWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        template: { version: 1, levels: [{ level: 0, numFmt: 'upperRoman', lvlText: '%1.' }] },
      });
      abstractSpy.mockRestore();
      applySpy.mockRestore();
      return result;
    },
  },
  'lists.applyPreset': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsApplyPresetWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, preset: 'decimal' },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsApplyPresetWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        preset: 'nonexistent' as any,
      });
    },
    applyCase: () => {
      const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
      const presetSpy = vi
        .spyOn(LevelFormattingHelpers, 'getPresetTemplate')
        .mockReturnValue({ version: 1, levels: [{ level: 0, numFmt: 'decimal', lvlText: '%1.' }] });
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const applySpy = vi
        .spyOn(LevelFormattingHelpers, 'applyTemplateToAbstract')
        .mockImplementation((_ed: unknown) => {
          injectNumberingChange(_ed);
          return { changed: true, levelsApplied: [0] };
        });
      const result = listsApplyPresetWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        preset: 'decimal',
      });
      abstractSpy.mockRestore();
      applySpy.mockRestore();
      presetSpy.mockRestore();
      return result;
    },
  },
  'lists.setType': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetTypeWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, kind: 'ordered' },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetTypeWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        kind: 'unknown' as any,
      });
    },
    applyCase: () => {
      const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
      const presetSpy = vi
        .spyOn(LevelFormattingHelpers, 'getPresetTemplate')
        .mockReturnValue({ version: 1, levels: [{ level: 0, numFmt: 'decimal', lvlText: '%1.' }] });
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const applySpy = vi
        .spyOn(LevelFormattingHelpers, 'applyTemplateToAbstract')
        .mockImplementation((_ed: unknown) => {
          injectNumberingChange(_ed);
          return { changed: true, levelsApplied: [0] };
        });
      const result = listsSetTypeWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        kind: 'ordered',
      });
      abstractSpy.mockRestore();
      applySpy.mockRestore();
      presetSpy.mockRestore();
      return result;
    },
  },
  'lists.setLevelNumbering': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelNumberingWrapper(
        editor,
        {
          target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
          level: 0,
          numFmt: 'upperRoman',
          lvlText: '%1.',
        },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelNumberingWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 99,
        numFmt: 'upperRoman',
        lvlText: '%1.',
      });
    },
    applyCase: () => {
      const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
      const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const setSpy = spyOn(LevelFormattingHelpers, 'setLevelNumberingFormat').mockImplementation((_ed: unknown) => {
        injectNumberingChange(_ed);
        return true;
      });
      const result = listsSetLevelNumberingWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
        numFmt: 'upperRoman',
        lvlText: '%1.',
      });
      abstractSpy.mockRestore();
      hasLevelSpy.mockRestore();
      setSpy.mockRestore();
      return result;
    },
  },
  'lists.setLevelBullet': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelBulletWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, markerText: '•' },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelBulletWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 99,
        markerText: '•',
      });
    },
    applyCase: () => {
      const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
      const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const setSpy = spyOn(LevelFormattingHelpers, 'setLevelBulletMarker').mockImplementation((_ed: unknown) => {
        injectNumberingChange(_ed);
        return true;
      });
      const result = listsSetLevelBulletWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
        markerText: '•',
      });
      abstractSpy.mockRestore();
      hasLevelSpy.mockRestore();
      setSpy.mockRestore();
      return result;
    },
  },
  'lists.setLevelPictureBullet': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelPictureBulletWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, pictureBulletId: 1 },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelPictureBulletWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 99,
        pictureBulletId: 1,
      });
    },
    applyCase: () => {
      const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
      const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const setSpy = spyOn(LevelFormattingHelpers, 'setLevelPictureBulletId').mockImplementation((_ed: unknown) => {
        injectNumberingChange(_ed);
        return true;
      });
      const result = listsSetLevelPictureBulletWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
        pictureBulletId: 1,
      });
      abstractSpy.mockRestore();
      hasLevelSpy.mockRestore();
      setSpy.mockRestore();
      return result;
    },
  },
  'lists.setLevelAlignment': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelAlignmentWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, alignment: 'center' },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelAlignmentWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 99,
        alignment: 'center',
      });
    },
    applyCase: () => {
      const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
      const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const setSpy = spyOn(LevelFormattingHelpers, 'setLevelAlignment').mockImplementation((_ed: unknown) => {
        injectNumberingChange(_ed);
        return true;
      });
      const result = listsSetLevelAlignmentWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
        alignment: 'center',
      });
      abstractSpy.mockRestore();
      hasLevelSpy.mockRestore();
      setSpy.mockRestore();
      return result;
    },
  },
  'lists.setLevelIndents': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelIndentsWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, left: 720 },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelIndentsWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
        hanging: 360,
        firstLine: 360,
      } as any);
    },
    applyCase: () => {
      const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
      const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const setSpy = spyOn(LevelFormattingHelpers, 'setLevelIndents').mockImplementation((_ed: unknown) => {
        injectNumberingChange(_ed);
        return true;
      });
      const result = listsSetLevelIndentsWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
        left: 720,
        hanging: 360,
      });
      abstractSpy.mockRestore();
      hasLevelSpy.mockRestore();
      setSpy.mockRestore();
      return result;
    },
  },
  'lists.setLevelTrailingCharacter': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelTrailingCharacterWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, trailingCharacter: 'space' },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelTrailingCharacterWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 99,
        trailingCharacter: 'space',
      });
    },
    applyCase: () => {
      const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
      const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const setSpy = vi
        .spyOn(LevelFormattingHelpers, 'setLevelTrailingCharacter')
        .mockImplementation((_ed: unknown) => {
          injectNumberingChange(_ed);
          return true;
        });
      const result = listsSetLevelTrailingCharacterWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
        trailingCharacter: 'space',
      });
      abstractSpy.mockRestore();
      hasLevelSpy.mockRestore();
      setSpy.mockRestore();
      return result;
    },
  },
  'lists.setLevelMarkerFont': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelMarkerFontWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, fontFamily: 'Arial' },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelMarkerFontWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 99,
        fontFamily: 'Arial',
      });
    },
    applyCase: () => {
      const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
      const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const setSpy = spyOn(LevelFormattingHelpers, 'setLevelMarkerFont').mockImplementation((_ed: unknown) => {
        injectNumberingChange(_ed);
        return true;
      });
      const result = listsSetLevelMarkerFontWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
        fontFamily: 'Arial',
      });
      abstractSpy.mockRestore();
      hasLevelSpy.mockRestore();
      setSpy.mockRestore();
      return result;
    },
  },
  'lists.clearLevelOverrides': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsClearLevelOverridesWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0 },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsClearLevelOverridesWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
      });
    },
    applyCase: () => {
      const hasSpy = spyOn(LevelFormattingHelpers, 'hasLevelOverride').mockReturnValue(true);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const clearSpy = spyOn(LevelFormattingHelpers, 'clearLevelOverride').mockImplementation((_ed: unknown) => {
        injectNumberingChange(_ed);
      });
      const result = listsClearLevelOverridesWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
      });
      hasSpy.mockRestore();
      clearSpy.mockRestore();
      return result;
    },
  },
  // SD-2025 user-centric list formatting operations
  'lists.applyStyle': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsApplyStyleWrapper(
        editor,
        {
          target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
          style: { version: 1, levels: [] },
        },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsApplyStyleWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        style: { version: 99 as any, levels: [] },
      });
    },
    applyCase: () => {
      const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const applySpy = vi
        .spyOn(LevelFormattingHelpers, 'applyTemplateToAbstract')
        .mockImplementation((_ed: unknown) => {
          injectNumberingChange(_ed);
          return { changed: true, levelsApplied: [0] };
        });
      const result = listsApplyStyleWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        style: { version: 1, levels: [{ level: 0, numFmt: 'upperRoman', lvlText: '%1.' }] },
      });
      abstractSpy.mockRestore();
      applySpy.mockRestore();
      return result;
    },
  },
  'lists.restartAt': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsRestartAtWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, startAt: 5 },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsRestartAtWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        startAt: 0,
      });
    },
    applyCase: () => {
      const firstInSeqSpy = spyOn(listSequenceHelpers, 'isFirstInSequence').mockReturnValue(true);
      const overrideSpy = spyOn(ListHelpers, 'setLvlOverride').mockImplementation(() => {});
      registerSetValueDelegate((ed, input, options) => listsSetValueWrapper(ed, input, options));
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsRestartAtWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        startAt: 5,
      });
      firstInSeqSpy.mockRestore();
      overrideSpy.mockRestore();
      return result;
    },
  },
  'lists.setLevelNumberStyle': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelNumberStyleWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, numberStyle: 'upperRoman' },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelNumberStyleWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
        numberStyle: 'bullet',
      });
    },
    applyCase: () => {
      const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
      const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const setSpy = spyOn(LevelFormattingHelpers, 'setLevelNumberStyle').mockImplementation((_ed: unknown) => {
        injectNumberingChange(_ed);
        return true;
      });
      const result = listsSetLevelNumberStyleWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
        numberStyle: 'upperRoman',
      });
      abstractSpy.mockRestore();
      hasLevelSpy.mockRestore();
      setSpy.mockRestore();
      return result;
    },
  },
  'lists.setLevelText': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelTextWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, text: '%1.' },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelTextWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 99,
        text: '%1.',
      });
    },
    applyCase: () => {
      const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
      const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const setSpy = spyOn(LevelFormattingHelpers, 'setLevelText').mockImplementation((_ed: unknown) => {
        injectNumberingChange(_ed);
        return true;
      });
      const result = listsSetLevelTextWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
        text: '%1.',
      });
      abstractSpy.mockRestore();
      hasLevelSpy.mockRestore();
      setSpy.mockRestore();
      return result;
    },
  },
  'lists.setLevelStart': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelStartWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, startAt: 5 },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelStartWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
        startAt: 0,
      });
    },
    applyCase: () => {
      const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
      const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
      const readSpy = vi
        .spyOn(LevelFormattingHelpers, 'readLevelProperties')
        .mockReturnValue({ numFmt: 'decimal' } as any);
      const findSpy = spyOn(LevelFormattingHelpers, 'findLevelElement').mockReturnValue({} as any);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const setSpy = spyOn(LevelFormattingHelpers, 'setLevelStart').mockImplementation((_ed: unknown) => {
        injectNumberingChange(_ed);
        return true;
      });
      const result = listsSetLevelStartWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
        startAt: 5,
      });
      abstractSpy.mockRestore();
      hasLevelSpy.mockRestore();
      readSpy.mockRestore();
      findSpy.mockRestore();
      setSpy.mockRestore();
      return result;
    },
  },
  'lists.setLevelLayout': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelLayoutWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, layout: { alignment: 'left' } },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsSetLevelLayoutWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 99,
        layout: { alignment: 'left' },
      });
    },
    applyCase: () => {
      const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
      const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const setSpy = spyOn(LevelFormattingHelpers, 'setLevelLayout').mockImplementation((_ed: unknown) => {
        injectNumberingChange(_ed);
        return { changed: true };
      });
      const result = listsSetLevelLayoutWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
        layout: { alignment: 'left' },
      });
      abstractSpy.mockRestore();
      hasLevelSpy.mockRestore();
      setSpy.mockRestore();
      return result;
    },
  },
  'comments.create': {
    throwCase: () => {
      const editor = makeCommentsEditor([], { addComment: undefined });
      return createCommentsWrapper(editor).add({
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 3 } },
        text: 'X',
      });
    },
    failureCase: () => {
      const editor = makeCommentsEditor();
      return createCommentsWrapper(editor).add({
        target: { kind: 'text', blockId: 'p1', range: { start: 1, end: 1 } },
        text: 'X',
      });
    },
    applyCase: () => {
      const editor = makeCommentsEditor();
      return createCommentsWrapper(editor).add({
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 3 } },
        text: 'X',
      });
    },
  },
  'comments.patch': {
    throwCase: () => {
      const editor = makeCommentsEditor();
      return createCommentsWrapper(editor).edit({ commentId: 'missing', text: 'X' });
    },
    failureCase: () => {
      const editor = makeCommentsEditor([makeCommentRecord('c1', { commentText: 'Same' })]);
      return createCommentsWrapper(editor).edit({ commentId: 'c1', text: 'Same' });
    },
    applyCase: () => {
      const editor = makeCommentsEditor([makeCommentRecord('c1', { commentText: 'Old' })]);
      return createCommentsWrapper(editor).edit({ commentId: 'c1', text: 'New' });
    },
  },
  'comments.delete': {
    throwCase: () => {
      const editor = makeCommentsEditor();
      return createCommentsWrapper(editor).remove({ commentId: 'missing' });
    },
    failureCase: () => {
      mockedDeps.resolveCommentAnchorsById.mockImplementation((_editor, id) =>
        id === 'c1'
          ? [
              {
                commentId: 'c1',
                status: 'open',
                target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 1 } },
                pos: 1,
                end: 2,
                attrs: {},
              },
            ]
          : [],
      );
      const editor = makeCommentsEditor([], { removeComment: mock(() => false) });
      return createCommentsWrapper(editor).remove({ commentId: 'c1' });
    },
    applyCase: () => {
      const editor = makeCommentsEditor([makeCommentRecord('c1')], { removeComment: mock(() => true) });
      return createCommentsWrapper(editor).remove({ commentId: 'c1' });
    },
  },
  'trackChanges.decide': {
    throwCase: () => {
      setTrackChanges([]);
      const { editor } = makeTextEditor();
      return trackChangesAcceptWrapper(editor, { id: 'missing' });
    },
    failureCase: () => {
      setTrackChanges([makeTrackedChange('tc-1')]);
      const { editor } = makeTextEditor('Hello', { commands: { acceptTrackedChangeById: mock(() => false) } });
      return trackChangesAcceptWrapper(editor, { id: requireCanonicalTrackChangeId(editor, 'tc-1') });
    },
    applyCase: () => {
      setTrackChanges([makeTrackedChange('tc-1')]);
      const { editor } = makeTextEditor('Hello', { commands: { acceptTrackedChangeById: mock(() => true) } });
      return trackChangesAcceptWrapper(editor, { id: requireCanonicalTrackChangeId(editor, 'tc-1') });
    },
  },
  // -------------------------------------------------------------------------
  // Table operations — create.table
  // -------------------------------------------------------------------------
  'create.table': {
    throwCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertTableAt: undefined } });
      return createTableWrapper(editor, { rows: 2, columns: 2 }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertTableAt: mock(() => false) } });
      return createTableWrapper(editor, { rows: 2, columns: 2 }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertTableAt: mock(() => true) } });
      return createTableWrapper(editor, { rows: 2, columns: 2 }, { changeMode: 'direct' });
    },
  },

  // -------------------------------------------------------------------------
  // Table operations — lifecycle
  // -------------------------------------------------------------------------
  'tables.delete': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesDeleteWrapper(editor, { nodeId: 'missing' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesDeleteWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesDeleteWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
  },
  'tables.clearContents': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesClearContentsWrapper(editor, { nodeId: 'missing' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesClearContentsWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesClearContentsWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
  },
  'tables.move': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesMoveWrapper(
        editor,
        { nodeId: 'missing', destination: { kind: 'documentEnd' } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesMoveWrapper(
        editor,
        { nodeId: 'table-1', destination: { kind: 'documentEnd' } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesMoveWrapper(
        editor,
        { nodeId: 'table-1', destination: { kind: 'documentEnd' } },
        { changeMode: 'direct' },
      );
    },
  },
  'tables.setLayout': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetLayoutWrapper(editor, { nodeId: 'missing', alignment: 'center' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetLayoutWrapper(editor, { nodeId: 'table-1', alignment: 'center' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetLayoutWrapper(editor, { nodeId: 'table-1', alignment: 'center' }, { changeMode: 'direct' });
    },
  },
  'tables.setAltText': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetAltTextWrapper(editor, { nodeId: 'missing', title: 'T' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetAltTextWrapper(editor, { nodeId: 'table-1', title: 'T' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetAltTextWrapper(editor, { nodeId: 'table-1', title: 'T' }, { changeMode: 'direct' });
    },
  },

  // -------------------------------------------------------------------------
  // Table operations — row structure
  // -------------------------------------------------------------------------
  'tables.insertRow': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesInsertRowWrapper(editor, { nodeId: 'missing', rowIndex: 0, position: 'below' } as any, {
        changeMode: 'direct',
      });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesInsertRowWrapper(editor, { nodeId: 'table-1', rowIndex: 0, position: 'below' } as any, {
        changeMode: 'direct',
      });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesInsertRowWrapper(editor, { nodeId: 'table-1', rowIndex: 0, position: 'below' } as any, {
        changeMode: 'direct',
      });
    },
  },
  'tables.deleteRow': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesDeleteRowWrapper(editor, { nodeId: 'missing', rowIndex: 0 } as any, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesDeleteRowWrapper(editor, { nodeId: 'table-1', rowIndex: 0 } as any, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesDeleteRowWrapper(editor, { nodeId: 'table-1', rowIndex: 0 } as any, { changeMode: 'direct' });
    },
  },
  'tables.setRowHeight': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetRowHeightWrapper(
        editor,
        { nodeId: 'missing', rowIndex: 0, heightPt: 20, rule: 'atLeast' } as any,
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetRowHeightWrapper(
        editor,
        { nodeId: 'table-1', rowIndex: 0, heightPt: 20, rule: 'atLeast' } as any,
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetRowHeightWrapper(
        editor,
        { nodeId: 'table-1', rowIndex: 0, heightPt: 20, rule: 'atLeast' } as any,
        { changeMode: 'direct' },
      );
    },
  },
  'tables.distributeRows': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesDistributeRowsWrapper(editor, { nodeId: 'missing' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      // distributeRows early-returns success when no rows have explicit heights.
      // Provide rows with heights so the adapter reaches dispatch (which throws).
      const editor = makeTableEditor({}, { throwOnDispatch: true, rowHeight: 20 });
      return tablesDistributeRowsWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesDistributeRowsWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
  },
  'tables.setRowOptions': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetRowOptionsWrapper(
        editor,
        { nodeId: 'missing', rowIndex: 0, allowBreakAcrossPages: true } as any,
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetRowOptionsWrapper(
        editor,
        { nodeId: 'table-1', rowIndex: 0, allowBreakAcrossPages: true } as any,
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetRowOptionsWrapper(
        editor,
        { nodeId: 'table-1', rowIndex: 0, allowBreakAcrossPages: true } as any,
        { changeMode: 'direct' },
      );
    },
  },

  // -------------------------------------------------------------------------
  // Table operations — column structure
  // -------------------------------------------------------------------------
  'tables.insertColumn': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesInsertColumnWrapper(
        editor,
        { nodeId: 'missing', columnIndex: 0, position: 'right' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesInsertColumnWrapper(
        editor,
        { nodeId: 'table-1', columnIndex: 0, position: 'right' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesInsertColumnWrapper(
        editor,
        { nodeId: 'table-1', columnIndex: 0, position: 'right' },
        { changeMode: 'direct' },
      );
    },
  },
  'tables.deleteColumn': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesDeleteColumnWrapper(editor, { nodeId: 'missing', columnIndex: 0 }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesDeleteColumnWrapper(editor, { nodeId: 'table-1', columnIndex: 0 }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesDeleteColumnWrapper(editor, { nodeId: 'table-1', columnIndex: 0 }, { changeMode: 'direct' });
    },
  },
  'tables.setColumnWidth': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetColumnWidthWrapper(
        editor,
        { nodeId: 'missing', columnIndex: 0, widthPt: 100 },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetColumnWidthWrapper(
        editor,
        { nodeId: 'table-1', columnIndex: 0, widthPt: 100 },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetColumnWidthWrapper(
        editor,
        { nodeId: 'table-1', columnIndex: 0, widthPt: 100 },
        { changeMode: 'direct' },
      );
    },
  },
  'tables.distributeColumns': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesDistributeColumnsWrapper(editor, { nodeId: 'missing' } as any, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesDistributeColumnsWrapper(editor, { nodeId: 'table-1' } as any, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesDistributeColumnsWrapper(editor, { nodeId: 'table-1' } as any, { changeMode: 'direct' });
    },
  },
  'tables.insertCell': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesInsertCellWrapper(editor, { nodeId: 'missing', mode: 'shiftRight' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesInsertCellWrapper(editor, { nodeId: 'cell-1', mode: 'shiftRight' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesInsertCellWrapper(editor, { nodeId: 'cell-1', mode: 'shiftRight' }, { changeMode: 'direct' });
    },
  },
  'tables.deleteCell': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesDeleteCellWrapper(editor, { nodeId: 'missing', mode: 'shiftLeft' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesDeleteCellWrapper(editor, { nodeId: 'cell-1', mode: 'shiftLeft' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesDeleteCellWrapper(editor, { nodeId: 'cell-1', mode: 'shiftLeft' }, { changeMode: 'direct' });
    },
  },
  'tables.mergeCells': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesMergeCellsWrapper(
        editor,
        { nodeId: 'missing', start: { rowIndex: 0, columnIndex: 0 }, end: { rowIndex: 1, columnIndex: 1 } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesMergeCellsWrapper(
        editor,
        { nodeId: 'table-1', start: { rowIndex: 0, columnIndex: 0 }, end: { rowIndex: 1, columnIndex: 1 } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesMergeCellsWrapper(
        editor,
        { nodeId: 'table-1', start: { rowIndex: 0, columnIndex: 0 }, end: { rowIndex: 1, columnIndex: 1 } },
        { changeMode: 'direct' },
      );
    },
  },
  'tables.unmergeCells': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesUnmergeCellsWrapper(editor, { nodeId: 'missing' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      // Cell must have colspan > 1 to bypass the idempotent-success early return.
      const editor = makeTableEditor({}, { throwOnDispatch: true, cellColspan: 2 });
      return tablesUnmergeCellsWrapper(editor, { nodeId: 'cell-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesUnmergeCellsWrapper(editor, { nodeId: 'cell-1' }, { changeMode: 'direct' });
    },
  },
  'tables.splitCell': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSplitCellWrapper(editor, { nodeId: 'missing', rows: 2, columns: 2 }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSplitCellWrapper(editor, { nodeId: 'cell-1', rows: 2, columns: 2 }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSplitCellWrapper(editor, { nodeId: 'cell-1', rows: 2, columns: 2 }, { changeMode: 'direct' });
    },
  },
  'tables.setCellProperties': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetCellPropertiesWrapper(
        editor,
        { nodeId: 'missing', verticalAlign: 'center' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetCellPropertiesWrapper(
        editor,
        { nodeId: 'cell-1', verticalAlign: 'center' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetCellPropertiesWrapper(
        editor,
        { nodeId: 'cell-1', verticalAlign: 'center' },
        { changeMode: 'direct' },
      );
    },
  },
  'tables.convertFromText': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesConvertFromTextWrapper(editor, { nodeId: 'missing' } as any, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesConvertFromTextWrapper(editor, { nodeId: 'p1' } as any, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesConvertFromTextWrapper(editor, { nodeId: 'p1' } as any, { changeMode: 'direct' });
    },
  },
  'tables.split': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSplitWrapper(editor, { nodeId: 'missing', rowIndex: 1 }, { changeMode: 'direct' });
    },
    failureCase: () => {
      // rowIndex: 0 is invalid (must be >= 1).
      const editor = makeTableEditor();
      return tablesSplitWrapper(editor, { nodeId: 'table-1', rowIndex: 0 }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSplitWrapper(editor, { nodeId: 'table-1', rowIndex: 1 }, { changeMode: 'direct' });
    },
  },
  'tables.convertToText': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesConvertToTextWrapper(editor, { nodeId: 'missing' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesConvertToTextWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesConvertToTextWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
  },
  'tables.sort': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSortWrapper(
        editor,
        { nodeId: 'missing', keys: [{ columnIndex: 0, direction: 'ascending', type: 'text' }] },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      // Out-of-bounds column index → INVALID_TARGET failure.
      const editor = makeTableEditor();
      return tablesSortWrapper(
        editor,
        { nodeId: 'table-1', keys: [{ columnIndex: 99, direction: 'ascending', type: 'text' }] },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSortWrapper(
        editor,
        { nodeId: 'table-1', keys: [{ columnIndex: 0, direction: 'ascending', type: 'text' }] },
        { changeMode: 'direct' },
      );
    },
  },
  // --- Batch 6: Style operations ---
  'tables.setStyle': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetStyleWrapper(editor, { nodeId: 'missing', styleId: 'TableGrid' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetStyleWrapper(editor, { nodeId: 'table-1', styleId: 'TableGrid' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetStyleWrapper(editor, { nodeId: 'table-1', styleId: 'TableGrid' }, { changeMode: 'direct' });
    },
  },
  'tables.clearStyle': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesClearStyleWrapper(editor, { nodeId: 'missing' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesClearStyleWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesClearStyleWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
  },
  'tables.setStyleOption': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetStyleOptionWrapper(
        editor,
        { nodeId: 'missing', flag: 'headerRow', enabled: true },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetStyleOptionWrapper(
        editor,
        { nodeId: 'table-1', flag: 'headerRow', enabled: true },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetStyleOptionWrapper(
        editor,
        { nodeId: 'table-1', flag: 'headerRow', enabled: true },
        { changeMode: 'direct' },
      );
    },
  },
  // --- Batch 7: Border + shading operations ---
  'tables.setBorder': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetBorderWrapper(
        editor,
        { nodeId: 'missing', edge: 'top', lineStyle: 'single', lineWeightPt: 0.5, color: '000000' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetBorderWrapper(
        editor,
        { nodeId: 'table-1', edge: 'top', lineStyle: 'single', lineWeightPt: 0.5, color: '000000' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetBorderWrapper(
        editor,
        { nodeId: 'table-1', edge: 'top', lineStyle: 'single', lineWeightPt: 0.5, color: '000000' },
        { changeMode: 'direct' },
      );
    },
  },
  'tables.clearBorder': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesClearBorderWrapper(editor, { nodeId: 'missing', edge: 'top' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesClearBorderWrapper(editor, { nodeId: 'table-1', edge: 'top' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesClearBorderWrapper(editor, { nodeId: 'table-1', edge: 'top' }, { changeMode: 'direct' });
    },
  },
  'tables.applyBorderPreset': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesApplyBorderPresetWrapper(editor, { nodeId: 'missing', preset: 'box' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesApplyBorderPresetWrapper(editor, { nodeId: 'table-1', preset: 'box' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesApplyBorderPresetWrapper(editor, { nodeId: 'table-1', preset: 'box' }, { changeMode: 'direct' });
    },
  },
  'tables.setShading': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetShadingWrapper(editor, { nodeId: 'missing', color: 'FF0000' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetShadingWrapper(editor, { nodeId: 'table-1', color: 'FF0000' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetShadingWrapper(editor, { nodeId: 'table-1', color: 'FF0000' }, { changeMode: 'direct' });
    },
  },
  'tables.clearShading': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesClearShadingWrapper(editor, { nodeId: 'missing' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesClearShadingWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesClearShadingWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
  },
  // --- Batch 8: Padding + spacing operations ---
  'tables.setTablePadding': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetTablePaddingWrapper(
        editor,
        { nodeId: 'missing', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetTablePaddingWrapper(
        editor,
        { nodeId: 'table-1', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetTablePaddingWrapper(
        editor,
        { nodeId: 'table-1', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 },
        { changeMode: 'direct' },
      );
    },
  },
  'tables.setCellPadding': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetCellPaddingWrapper(
        editor,
        { nodeId: 'missing', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 } as any,
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetCellPaddingWrapper(
        editor,
        { nodeId: 'cell-1', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 } as any,
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetCellPaddingWrapper(
        editor,
        { nodeId: 'cell-1', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 } as any,
        { changeMode: 'direct' },
      );
    },
  },
  'tables.setCellSpacing': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetCellSpacingWrapper(editor, { nodeId: 'missing', spacingPt: 2 }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetCellSpacingWrapper(editor, { nodeId: 'table-1', spacingPt: 2 }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetCellSpacingWrapper(editor, { nodeId: 'table-1', spacingPt: 2 }, { changeMode: 'direct' });
    },
  },
  'tables.clearCellSpacing': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesClearCellSpacingWrapper(editor, { nodeId: 'missing' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesClearCellSpacingWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesClearCellSpacingWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
  },
  'tables.applyStyle': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesApplyStyleWrapper(editor, { nodeId: 'missing', styleId: 'TableGrid' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesApplyStyleWrapper(editor, { nodeId: 'table-1', styleId: 'TableGrid' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesApplyStyleWrapper(editor, { nodeId: 'table-1', styleId: 'TableGrid' }, { changeMode: 'direct' });
    },
  },
  'tables.setBorders': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetBordersWrapper(
        editor,
        {
          nodeId: 'missing',
          mode: 'applyTo',
          applyTo: 'all',
          border: { lineStyle: 'single', lineWeightPt: 1, color: '000000' },
        },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetBordersWrapper(
        editor,
        {
          nodeId: 'table-1',
          mode: 'applyTo',
          applyTo: 'all',
          border: { lineStyle: 'single', lineWeightPt: 1, color: '000000' },
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetBordersWrapper(
        editor,
        {
          nodeId: 'table-1',
          mode: 'applyTo',
          applyTo: 'all',
          border: { lineStyle: 'single', lineWeightPt: 1, color: '000000' },
        },
        { changeMode: 'direct' },
      );
    },
  },
  'tables.setTableOptions': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetTableOptionsWrapper(
        editor,
        { nodeId: 'missing', defaultCellMargins: { topPt: 6, rightPt: 6, bottomPt: 6, leftPt: 6 } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetTableOptionsWrapper(
        editor,
        { nodeId: 'table-1', defaultCellMargins: { topPt: 6, rightPt: 6, bottomPt: 6, leftPt: 6 } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetTableOptionsWrapper(
        editor,
        { nodeId: 'table-1', defaultCellMargins: { topPt: 6, rightPt: 6, bottomPt: 6, leftPt: 6 } },
        { changeMode: 'direct' },
      );
    },
  },
  'tables.setDefaultStyle': {
    throwCase: () => {
      // No converter → CAPABILITY_UNAVAILABLE
      const editor = makeSectionsEditor({ includeConverter: false });
      return tablesSetDefaultStyleAdapter(editor, { styleId: 'TableGrid' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      // Style already set → NO_OP
      const editor = makeSectionsEditor();
      const converter = (editor as unknown as { converter: Record<string, unknown> }).converter;
      converter.translatedLinkedStyles = {
        styles: { TableGrid: { type: 'table', name: 'Table Grid' } },
        docDefaults: {},
        latentStyles: {},
      };
      // Pre-set the default so the adapter sees it's already the same
      const settingsRoot = (converter.convertedXml as Record<string, { elements?: Array<{ elements?: unknown[] }> }>)[
        'word/settings.xml'
      ];
      const wSettings = settingsRoot?.elements?.find(
        (el: { name?: string }) => (el as { name?: string }).name === 'w:settings',
      ) as { elements?: unknown[] } | undefined;
      if (wSettings) {
        if (!wSettings.elements) wSettings.elements = [];
        wSettings.elements.push({
          type: 'element',
          name: 'w:defaultTableStyle',
          attributes: { 'w:val': 'TableGrid' },
          elements: [],
        });
      }
      return tablesSetDefaultStyleAdapter(editor, { styleId: 'TableGrid' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      const converter = (editor as unknown as { converter: Record<string, unknown> }).converter;
      converter.translatedLinkedStyles = {
        styles: { TableGrid: { type: 'table', name: 'Table Grid' } },
        docDefaults: {},
        latentStyles: {},
      };
      return tablesSetDefaultStyleAdapter(editor, { styleId: 'TableGrid' }, { changeMode: 'direct' });
    },
  },
  'tables.clearDefaultStyle': {
    throwCase: () => {
      // No converter → CAPABILITY_UNAVAILABLE
      const editor = makeSectionsEditor({ includeConverter: false });
      return tablesClearDefaultStyleAdapter(editor, {}, { changeMode: 'direct' });
    },
    failureCase: () => {
      // No default set → NO_OP
      const editor = makeSectionsEditor();
      return tablesClearDefaultStyleAdapter(editor, {}, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      const converter = (editor as unknown as { converter: Record<string, unknown> }).converter;
      // Pre-set a default so clear actually has something to remove
      const settingsRoot = (converter.convertedXml as Record<string, { elements?: Array<{ elements?: unknown[] }> }>)[
        'word/settings.xml'
      ];
      const wSettings = settingsRoot?.elements?.find(
        (el: { name?: string }) => (el as { name?: string }).name === 'w:settings',
      ) as { elements?: unknown[] } | undefined;
      if (wSettings) {
        if (!wSettings.elements) wSettings.elements = [];
        wSettings.elements.push({
          type: 'element',
          name: 'w:defaultTableStyle',
          attributes: { 'w:val': 'TableGrid' },
          elements: [],
        });
      }
      return tablesClearDefaultStyleAdapter(editor, {}, { changeMode: 'direct' });
    },
  },
  'styles.apply': {
    throwCase: () => {
      const editor = makeStylesEditor({ hasConverter: false });
      return stylesApplyAdapter(
        editor,
        { target: { scope: 'docDefaults', channel: 'run' }, patch: { bold: true } },
        { dryRun: false, expectedRevision: undefined },
      );
    },
    applyCase: () => {
      const editor = makeStylesEditor();
      return stylesApplyAdapter(
        editor,
        { target: { scope: 'docDefaults', channel: 'run' }, patch: { bold: true } },
        { dryRun: false, expectedRevision: undefined },
      );
    },
  },

  // -------------------------------------------------------------------------
  // TOC operations
  // -------------------------------------------------------------------------
  'create.tableOfContents': {
    throwCase: () => {
      const editor = makeTocEditor();
      return createTableOfContentsWrapper(
        editor,
        {
          at: {
            kind: 'before',
            target: { kind: 'block', nodeType: 'paragraph', nodeId: 'missing-block' },
          },
        } as any,
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTocEditor({ insertTableOfContentsAt: mock(() => false) });
      return createTableOfContentsWrapper(editor, { at: { kind: 'documentEnd' } }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTocEditor();
      return createTableOfContentsWrapper(editor, { at: { kind: 'documentEnd' } }, { changeMode: 'direct' });
    },
  },
  'toc.configure': {
    throwCase: () => {
      const editor = makeTocEditor();
      return tocConfigureWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'tableOfContents', nodeId: 'missing' }, patch: { hyperlinks: false } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      // Patch produces no change → NO_OP
      const editor = makeTocEditor();
      return tocConfigureWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'tableOfContents', nodeId: 'toc-1' }, patch: {} },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTocEditor();
      return tocConfigureWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'tableOfContents', nodeId: 'toc-1' }, patch: { hyperlinks: false } },
        { changeMode: 'direct' },
      );
    },
  },
  'toc.update': {
    throwCase: () => {
      const editor = makeTocEditor();
      return tocUpdateWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'tableOfContents', nodeId: 'missing' } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      // Update with no heading sources and command returns false
      const editor = makeTocEditor({ replaceTableOfContentsContentById: mock(() => false) });
      return tocUpdateWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'tableOfContents', nodeId: 'toc-1' } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTocEditor();
      return tocUpdateWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'tableOfContents', nodeId: 'toc-1' } },
        { changeMode: 'direct' },
      );
    },
  },
  'toc.remove': {
    throwCase: () => {
      const editor = makeTocEditor();
      return tocRemoveWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'tableOfContents', nodeId: 'missing' } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTocEditor({ deleteTableOfContentsById: mock(() => false) });
      return tocRemoveWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'tableOfContents', nodeId: 'toc-1' } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTocEditor();
      return tocRemoveWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'tableOfContents', nodeId: 'toc-1' } },
        { changeMode: 'direct' },
      );
    },
  },
  'toc.markEntry': {
    throwCase: () => {
      const editor = makeTocEditor();
      return tocMarkEntryWrapper(
        editor,
        { target: { kind: 'inline-insert', anchor: { nodeType: 'paragraph', nodeId: 'missing' } }, text: 'Marked' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTocEditor({ insertTableOfContentsEntryAt: mock(() => false) });
      return tocMarkEntryWrapper(
        editor,
        { target: { kind: 'inline-insert', anchor: { nodeType: 'paragraph', nodeId: 'p-1' } }, text: 'Marked' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTocEditor();
      return tocMarkEntryWrapper(
        editor,
        { target: { kind: 'inline-insert', anchor: { nodeType: 'paragraph', nodeId: 'p-1' } }, text: 'Marked' },
        { changeMode: 'direct' },
      );
    },
  },
  'toc.unmarkEntry': {
    throwCase: () => {
      const editor = makeTocEditor();
      return tocUnmarkEntryWrapper(
        editor,
        { target: { kind: 'inline', nodeType: 'tableOfContentsEntry', nodeId: 'missing' } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTocEditor({ deleteTableOfContentsEntryAt: mock(() => false) });
      return tocUnmarkEntryWrapper(editor, { target: getFirstTocEntryAddress(editor) }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTocEditor();
      return tocUnmarkEntryWrapper(editor, { target: getFirstTocEntryAddress(editor) }, { changeMode: 'direct' });
    },
  },
  'toc.editEntry': {
    throwCase: () => {
      const editor = makeTocEditor();
      return tocEditEntryWrapper(
        editor,
        {
          target: { kind: 'inline', nodeType: 'tableOfContentsEntry', nodeId: 'missing' },
          patch: { text: 'Updated' },
        },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTocEditor();
      return tocEditEntryWrapper(
        editor,
        {
          target: getFirstTocEntryAddress(editor),
          patch: { text: 'Chapter One', level: 2, tableIdentifier: 'A', omitPageNumber: false },
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTocEditor();
      return tocEditEntryWrapper(
        editor,
        { target: getFirstTocEntryAddress(editor), patch: { text: 'Updated Chapter' } },
        { changeMode: 'direct' },
      );
    },
  },

  // -------------------------------------------------------------------------
  // Image operations
  // -------------------------------------------------------------------------
  'create.image': {
    throwCase: () => {
      // setImage command missing → CAPABILITY_UNAVAILABLE
      const editor = makeImageEditor();
      (editor.commands as Record<string, unknown>).setImage = undefined;
      return createImageWrapper(
        editor,
        { src: 'https://example.com/img.png', size: { width: 100, height: 100 } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      // URL src without explicit size → INVALID_INPUT (cannot infer dimensions)
      const editor = makeImageEditor();
      return createImageWrapper(editor, { src: 'https://example.com/img.png' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      return createImageWrapper(
        makeImageEditor(),
        { src: 'https://example.com/img.png', size: { width: 100, height: 100 } },
        { changeMode: 'direct' },
      );
    },
  },
  'images.delete': {
    throwCase: () => imagesDeleteWrapper(makeImageEditor(), { imageId: 'missing' }, { changeMode: 'direct' }),
    failureCase: () => {
      // Transaction produces no change → NO_OP
      const editor = makeImageEditor();
      const tr = (editor.state as unknown as { tr: Record<string, unknown> }).tr;
      tr.docChanged = false;
      tr.steps = [];
      return imagesDeleteWrapper(editor, { imageId: 'img-1' }, { changeMode: 'direct' });
    },
    applyCase: () => imagesDeleteWrapper(makeImageEditor(), { imageId: 'img-1' }, { changeMode: 'direct' }),
  },
  'images.move': {
    throwCase: () =>
      imagesMoveWrapper(
        makeImageEditor(),
        { imageId: 'missing', to: { kind: 'documentEnd' } },
        { changeMode: 'direct' },
      ),
    failureCase: () => {
      // Transaction produces no change → NO_OP
      const editor = makeImageEditor();
      const tr = (editor.state as unknown as { tr: Record<string, unknown> }).tr;
      tr.docChanged = false;
      tr.steps = [];
      return imagesMoveWrapper(editor, { imageId: 'img-1', to: { kind: 'documentEnd' } }, { changeMode: 'direct' });
    },
    applyCase: () =>
      imagesMoveWrapper(makeImageEditor(), { imageId: 'img-1', to: { kind: 'documentEnd' } }, { changeMode: 'direct' }),
  },
  'images.convertToInline': {
    throwCase: () => imagesConvertToInlineWrapper(makeImageEditor(), { imageId: 'missing' }, { changeMode: 'direct' }),
    failureCase: () => {
      // Already inline → NO_OP
      const inlineImg = createNode('image', [], {
        attrs: {
          sdImageId: 'img-inline-noop',
          src: 'test.png',
          isAnchor: false,
          wrap: { type: 'Inline' },
          anchorData: null,
          marginOffset: null,
          relativeHeight: null,
          originalAttributes: {},
        },
        isInline: true,
        isLeaf: true,
      });
      const p = createNode('paragraph', [inlineImg], {
        attrs: { sdBlockId: 'p-x' },
        isBlock: true,
        inlineContent: true,
      });
      const doc = createNode('doc', [p], { isBlock: false });
      const editor = {
        state: { doc, tr: {}, schema: { nodes: {} } },
        dispatch: mock(),
        commands: { setImage: mock(() => true) },
        schema: { marks: {} },
        options: {},
        on: () => {},
      } as unknown as Editor;
      return imagesConvertToInlineWrapper(editor, { imageId: 'img-inline-noop' }, { changeMode: 'direct' });
    },
    applyCase: () => imagesConvertToInlineWrapper(makeImageEditor(), { imageId: 'img-1' }, { changeMode: 'direct' }),
  },
  'images.convertToFloating': {
    throwCase: () =>
      imagesConvertToFloatingWrapper(makeImageEditor(), { imageId: 'missing' }, { changeMode: 'direct' }),
    failureCase: () => {
      // Already floating → NO_OP
      return imagesConvertToFloatingWrapper(makeImageEditor(), { imageId: 'img-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const inlineImg = createNode('image', [], {
        attrs: {
          sdImageId: 'img-for-float',
          src: 'test.png',
          isAnchor: false,
          wrap: { type: 'Inline' },
          anchorData: null,
          marginOffset: null,
          relativeHeight: null,
          originalAttributes: {},
        },
        isInline: true,
        isLeaf: true,
      });
      const p = createNode('paragraph', [inlineImg], {
        attrs: { sdBlockId: 'p-f' },
        isBlock: true,
        inlineContent: true,
      });
      const doc = createNode('doc', [p], { isBlock: false });
      const tr = {
        setNodeMarkup: mock().mockReturnThis(),
        setMeta: mock().mockReturnThis(),
        mapping: { map: (pos: number) => pos },
        docChanged: true,
        steps: [{}],
        doc,
      };
      const editor = {
        state: { doc, tr, schema: { nodes: {} } },
        dispatch: mock(),
        commands: { setImage: mock(() => true) },
        schema: { marks: {} },
        options: {},
        on: () => {},
      } as unknown as Editor;
      return imagesConvertToFloatingWrapper(editor, { imageId: 'img-for-float' }, { changeMode: 'direct' });
    },
  },
  'images.setSize': {
    throwCase: () =>
      imagesSetSizeWrapper(
        makeImageEditor(),
        { imageId: 'missing', size: { width: 220, height: 140 } },
        { changeMode: 'direct' },
      ),
    failureCase: () => {
      // Same size → NO_OP
      return imagesSetSizeWrapper(
        makeImageEditor(),
        { imageId: 'img-1', size: { width: 100, height: 100 } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () =>
      imagesSetSizeWrapper(
        makeImageEditor(),
        { imageId: 'img-1', size: { width: 220, height: 140 } },
        { changeMode: 'direct' },
      ),
  },
  'images.setWrapType': {
    throwCase: () =>
      imagesSetWrapTypeWrapper(makeImageEditor(), { imageId: 'missing', type: 'Tight' }, { changeMode: 'direct' }),
    failureCase: () => {
      // Same type → NO_OP
      return imagesSetWrapTypeWrapper(
        makeImageEditor(),
        { imageId: 'img-1', type: 'Square' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () =>
      imagesSetWrapTypeWrapper(makeImageEditor(), { imageId: 'img-1', type: 'Tight' }, { changeMode: 'direct' }),
  },
  'images.setWrapSide': {
    throwCase: () =>
      imagesSetWrapSideWrapper(makeImageEditor(), { imageId: 'missing', side: 'left' }, { changeMode: 'direct' }),
    failureCase: () => {
      // Same side → NO_OP
      return imagesSetWrapSideWrapper(
        makeImageEditor(),
        { imageId: 'img-1', side: 'bothSides' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () =>
      imagesSetWrapSideWrapper(makeImageEditor(), { imageId: 'img-1', side: 'left' }, { changeMode: 'direct' }),
  },
  'images.setWrapDistances': {
    throwCase: () =>
      imagesSetWrapDistancesWrapper(
        makeImageEditor(),
        { imageId: 'missing', distances: { distTop: 100 } },
        { changeMode: 'direct' },
      ),
    failureCase: () => {
      // Transaction produces no change → NO_OP
      const editor = makeImageEditor();
      const tr = (editor.state as unknown as { tr: Record<string, unknown> }).tr;
      tr.docChanged = false;
      tr.steps = [];
      return imagesSetWrapDistancesWrapper(
        editor,
        { imageId: 'img-1', distances: { distTop: 100 } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () =>
      imagesSetWrapDistancesWrapper(
        makeImageEditor(),
        { imageId: 'img-1', distances: { distTop: 100 } },
        { changeMode: 'direct' },
      ),
  },
  'images.setPosition': {
    throwCase: () =>
      imagesSetPositionWrapper(
        makeImageEditor(),
        { imageId: 'missing', position: { hRelativeFrom: 'page' } },
        { changeMode: 'direct' },
      ),
    failureCase: () => {
      // Transaction produces no change → NO_OP
      const editor = makeImageEditor();
      const tr = (editor.state as unknown as { tr: Record<string, unknown> }).tr;
      tr.docChanged = false;
      tr.steps = [];
      return imagesSetPositionWrapper(
        editor,
        { imageId: 'img-1', position: { hRelativeFrom: 'page' } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () =>
      imagesSetPositionWrapper(
        makeImageEditor(),
        { imageId: 'img-1', position: { hRelativeFrom: 'page' } },
        { changeMode: 'direct' },
      ),
  },
  'images.setAnchorOptions': {
    throwCase: () =>
      imagesSetAnchorOptionsWrapper(
        makeImageEditor(),
        { imageId: 'missing', options: { behindDoc: true } },
        { changeMode: 'direct' },
      ),
    failureCase: () => {
      // Transaction produces no change → NO_OP
      const editor = makeImageEditor();
      const tr = (editor.state as unknown as { tr: Record<string, unknown> }).tr;
      tr.docChanged = false;
      tr.steps = [];
      return imagesSetAnchorOptionsWrapper(
        editor,
        { imageId: 'img-1', options: { behindDoc: true } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () =>
      imagesSetAnchorOptionsWrapper(
        makeImageEditor(),
        { imageId: 'img-1', options: { behindDoc: true } },
        { changeMode: 'direct' },
      ),
  },
  'images.setZOrder': {
    throwCase: () =>
      imagesSetZOrderWrapper(
        makeImageEditor(),
        { imageId: 'missing', zOrder: { relativeHeight: 999 } },
        { changeMode: 'direct' },
      ),
    failureCase: () => {
      // Same relativeHeight → NO_OP
      return imagesSetZOrderWrapper(
        makeImageEditor(),
        { imageId: 'img-1', zOrder: { relativeHeight: 251658240 } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () =>
      imagesSetZOrderWrapper(
        makeImageEditor(),
        { imageId: 'img-1', zOrder: { relativeHeight: 999999999 } },
        { changeMode: 'direct' },
      ),
  },

  // -------------------------------------------------------------------------
  // Hyperlink operations
  // -------------------------------------------------------------------------
  'hyperlinks.wrap': {
    throwCase: () =>
      hyperlinksWrapWrapper(
        makeHyperlinkEditor({ withLink: false }),
        {
          target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 5 } },
          link: { destination: { href: 'https://example.com' } },
        },
        { changeMode: 'direct' },
      ),
    failureCase: () => {
      const wrapSpy = spyOn(hyperlinkMutationHelper, 'wrapWithLink').mockReturnValueOnce(false);
      try {
        return hyperlinksWrapWrapper(
          makeHyperlinkEditor({ withLink: false }),
          {
            target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
            link: { destination: { href: 'https://example.com' } },
          },
          { changeMode: 'direct' },
        );
      } finally {
        wrapSpy.mockRestore();
      }
    },
    applyCase: () =>
      hyperlinksWrapWrapper(
        makeHyperlinkEditor({ withLink: false }),
        {
          target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
          link: { destination: { href: 'https://example.com' } },
        },
        { changeMode: 'direct' },
      ),
  },
  'hyperlinks.insert': {
    throwCase: () =>
      hyperlinksInsertWrapper(
        makeHyperlinkEditor({ withLink: false }),
        {
          target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 0 } },
          text: 'X',
          link: { destination: { href: 'https://example.com' } },
        },
        { changeMode: 'direct' },
      ),
    failureCase: () => {
      const insertSpy = spyOn(hyperlinkMutationHelper, 'insertLinkedText').mockReturnValueOnce(false);
      try {
        return hyperlinksInsertWrapper(
          makeHyperlinkEditor({ withLink: false }),
          {
            target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 0 } },
            text: 'X',
            link: { destination: { href: 'https://example.com' } },
          },
          { changeMode: 'direct' },
        );
      } finally {
        insertSpy.mockRestore();
      }
    },
    applyCase: () =>
      hyperlinksInsertWrapper(
        makeHyperlinkEditor({ withLink: false }),
        {
          target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 0 } },
          text: 'X',
          link: { destination: { href: 'https://example.com' } },
        },
        { changeMode: 'direct' },
      ),
  },
  'hyperlinks.patch': {
    throwCase: () =>
      hyperlinksPatchWrapper(
        makeHyperlinkEditor({ withLink: true }),
        {
          target: makeHyperlinkTarget('p1', 1, 3),
          patch: { href: 'https://example.com/updated' },
        },
        { changeMode: 'direct' },
      ),
    failureCase: () =>
      hyperlinksPatchWrapper(
        makeHyperlinkEditor({ withLink: true, linkAttrs: { href: 'https://example.com' } }),
        {
          target: makeHyperlinkTarget('p1', 0, 5),
          patch: { href: 'https://example.com' },
        },
        { changeMode: 'direct' },
      ),
    applyCase: () =>
      hyperlinksPatchWrapper(
        makeHyperlinkEditor({ withLink: true, linkAttrs: { href: 'https://example.com' } }),
        {
          target: makeHyperlinkTarget('p1', 0, 5),
          patch: { href: 'https://example.com/updated' },
        },
        { changeMode: 'direct' },
      ),
  },
  'hyperlinks.remove': {
    throwCase: () =>
      hyperlinksRemoveWrapper(
        makeHyperlinkEditor({ withLink: true }),
        { target: makeHyperlinkTarget('p1', 1, 3) },
        { changeMode: 'direct' },
      ),
    failureCase: () => {
      const unwrapSpy = spyOn(hyperlinkMutationHelper, 'unwrapLink').mockReturnValueOnce(false);
      try {
        return hyperlinksRemoveWrapper(
          makeHyperlinkEditor({ withLink: true }),
          { target: makeHyperlinkTarget('p1', 0, 5) },
          { changeMode: 'direct' },
        );
      } finally {
        unwrapSpy.mockRestore();
      }
    },
    applyCase: () =>
      hyperlinksRemoveWrapper(
        makeHyperlinkEditor({ withLink: true }),
        { target: makeHyperlinkTarget('p1', 0, 5) },
        { changeMode: 'direct' },
      ),
  },
  // SD-2162: Header/footer ref and part lifecycle operations
  // -------------------------------------------------------------------------
  'headerFooters.refs.set': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return headerFootersRefsSetAdapter(
        editor,
        {
          target: {
            kind: 'headerFooterSlot',
            section: { kind: 'section', sectionId: 'section-missing' },
            headerFooterKind: 'header',
            variant: 'default',
          },
          refId: 'rIdHeaderAlt',
        },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return headerFootersRefsSetAdapter(
        editor,
        {
          target: {
            kind: 'headerFooterSlot',
            section: { kind: 'section', sectionId: 'section-0' },
            headerFooterKind: 'header',
            variant: 'default',
          },
          refId: 'rIdHeaderDefault',
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return headerFootersRefsSetAdapter(
        editor,
        {
          target: {
            kind: 'headerFooterSlot',
            section: { kind: 'section', sectionId: 'section-0' },
            headerFooterKind: 'header',
            variant: 'default',
          },
          refId: 'rIdHeaderAlt',
        },
        { changeMode: 'direct' },
      );
    },
  },
  'headerFooters.refs.clear': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return headerFootersRefsClearAdapter(
        editor,
        {
          target: {
            kind: 'headerFooterSlot',
            section: { kind: 'section', sectionId: 'section-missing' },
            headerFooterKind: 'header',
            variant: 'default',
          },
        },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return headerFootersRefsClearAdapter(
        editor,
        {
          target: {
            kind: 'headerFooterSlot',
            section: { kind: 'section', sectionId: 'section-0' },
            headerFooterKind: 'header',
            variant: 'even',
          },
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return headerFootersRefsClearAdapter(
        editor,
        {
          target: {
            kind: 'headerFooterSlot',
            section: { kind: 'section', sectionId: 'section-0' },
            headerFooterKind: 'header',
            variant: 'default',
          },
        },
        { changeMode: 'direct' },
      );
    },
  },
  'headerFooters.refs.setLinkedToPrevious': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return headerFootersRefsSetLinkedToPreviousAdapter(
        editor,
        {
          target: {
            kind: 'headerFooterSlot',
            section: { kind: 'section', sectionId: 'section-missing' },
            headerFooterKind: 'header',
            variant: 'default',
          },
          linked: true,
        },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return headerFootersRefsSetLinkedToPreviousAdapter(
        editor,
        {
          target: {
            kind: 'headerFooterSlot',
            section: { kind: 'section', sectionId: 'section-0' },
            headerFooterKind: 'header',
            variant: 'default',
          },
          linked: true,
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const bodyWithoutRefs = clone(BASE_SECTION_BODY_SECT_PR);
      const filteredBodyElements = ((bodyWithoutRefs.elements ?? []) as Array<{ name?: string }>).filter(
        (element) => element.name !== 'w:headerReference' && element.name !== 'w:footerReference',
      );
      bodyWithoutRefs.elements = filteredBodyElements as unknown as Record<string, unknown>[];

      const editor = makeSectionsEditor({
        paragraphSectPr: PREVIOUS_SECTION_SECT_PR,
        bodySectPr: bodyWithoutRefs,
      });
      return headerFootersRefsSetLinkedToPreviousAdapter(
        editor,
        {
          target: {
            kind: 'headerFooterSlot',
            section: { kind: 'section', sectionId: 'section-1' },
            headerFooterKind: 'header',
            variant: 'default',
          },
          linked: false,
        },
        { changeMode: 'direct' },
      );
    },
  },
  'headerFooters.parts.create': {
    throwCase: () => {
      const editor = makeSectionsEditor({ includeConverter: false });
      return headerFootersPartsCreateAdapter(editor, { kind: 'header' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return headerFootersPartsCreateAdapter(
        editor,
        { kind: 'header', sourceRefId: 'rIdNonExistent' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return headerFootersPartsCreateAdapter(editor, { kind: 'header' }, { changeMode: 'direct' });
    },
  },
  'headerFooters.parts.delete': {
    throwCase: () => {
      const editor = makeSectionsEditor({ includeConverter: false });
      return headerFootersPartsDeleteAdapter(
        editor,
        { target: { kind: 'headerFooterPart', refId: 'rIdHeaderDefault' } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return headerFootersPartsDeleteAdapter(
        editor,
        { target: { kind: 'headerFooterPart', refId: 'rIdHeaderDefault' } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return headerFootersPartsDeleteAdapter(
        editor,
        { target: { kind: 'headerFooterPart', refId: 'rIdHeaderAlt' } },
        { changeMode: 'direct' },
      );
    },
  },
  // -------------------------------------------------------------------------
  // Content control operations
  // -------------------------------------------------------------------------
  'contentControls.appendContent': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.appendContent({ target: MISSING_SDT_TARGET, content: 'appended' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.appendContent({ target: SDT_TARGET, content: '' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.appendContent({ target: SDT_TARGET, content: 'appended' }, { changeMode: 'direct' });
    },
  },
  'contentControls.checkbox.setState': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(
        makeSdtEditor({
          controlType: 'checkbox',
          type: 'checkbox',
          sdtPr: { elements: [], 'w14:checkbox': { 'w14:checked': '0' } },
        }),
      );
      return adapter.checkbox.setState({ target: MISSING_SDT_TARGET, checked: true }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(
        makeNoOpSdtEditor({
          controlType: 'checkbox',
          type: 'checkbox',
          sdtPr: { elements: [], 'w14:checkbox': { 'w14:checked': '0' } },
        }),
      );
      return adapter.checkbox.setState({ target: SDT_TARGET, checked: true }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(
        makeSdtEditor({
          controlType: 'checkbox',
          type: 'checkbox',
          sdtPr: { elements: [], 'w14:checkbox': { 'w14:checked': '0' } },
        }),
      );
      return adapter.checkbox.setState({ target: SDT_TARGET, checked: true }, { changeMode: 'direct' });
    },
  },
  'contentControls.checkbox.toggle': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(
        makeSdtEditor({
          controlType: 'checkbox',
          type: 'checkbox',
          sdtPr: { elements: [], 'w14:checkbox': { 'w14:checked': '0' } },
        }),
      );
      return adapter.checkbox.toggle({ target: MISSING_SDT_TARGET }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(
        makeNoOpSdtEditor({
          controlType: 'checkbox',
          type: 'checkbox',
          sdtPr: { elements: [], 'w14:checkbox': { 'w14:checked': '0' } },
        }),
      );
      return adapter.checkbox.toggle({ target: SDT_TARGET }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(
        makeSdtEditor({
          controlType: 'checkbox',
          type: 'checkbox',
          sdtPr: { elements: [], 'w14:checkbox': { 'w14:checked': '0' } },
        }),
      );
      return adapter.checkbox.toggle({ target: SDT_TARGET }, { changeMode: 'direct' });
    },
  },
  'contentControls.checkbox.setSymbolPair': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(
        makeSdtEditor({
          controlType: 'checkbox',
          type: 'checkbox',
          sdtPr: { elements: [], 'w14:checkbox': { 'w14:checked': '0' } },
        }),
      );
      return adapter.checkbox.setSymbolPair(
        {
          target: MISSING_SDT_TARGET,
          checkedSymbol: { font: 'Wingdings', char: '00FE' },
          uncheckedSymbol: { font: 'Wingdings', char: '00A8' },
        },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(
        makeNoOpSdtEditor({
          controlType: 'checkbox',
          type: 'checkbox',
          sdtPr: { elements: [], 'w14:checkbox': { 'w14:checked': '0' } },
        }),
      );
      return adapter.checkbox.setSymbolPair(
        {
          target: SDT_TARGET,
          checkedSymbol: { font: 'Wingdings', char: '00FE' },
          uncheckedSymbol: { font: 'Wingdings', char: '00A8' },
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(
        makeSdtEditor({
          controlType: 'checkbox',
          type: 'checkbox',
          sdtPr: { elements: [], 'w14:checkbox': { 'w14:checked': '0' } },
        }),
      );
      return adapter.checkbox.setSymbolPair(
        {
          target: SDT_TARGET,
          checkedSymbol: { font: 'Wingdings', char: '00FE' },
          uncheckedSymbol: { font: 'Wingdings', char: '00A8' },
        },
        { changeMode: 'direct' },
      );
    },
  },
  'contentControls.choiceList.setItems': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(
        makeSdtEditor({
          controlType: 'comboBox',
          type: 'comboBox',
          sdtPr: { elements: [], 'w:comboBox': { 'w:listItem': [] } },
        }),
      );
      return adapter.choiceList.setItems(
        { target: MISSING_SDT_TARGET, items: [{ displayText: 'A', value: 'a' }] },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(
        makeNoOpSdtEditor({
          controlType: 'comboBox',
          type: 'comboBox',
          sdtPr: { elements: [], 'w:comboBox': { 'w:listItem': [] } },
        }),
      );
      return adapter.choiceList.setItems(
        { target: SDT_TARGET, items: [{ displayText: 'A', value: 'a' }] },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(
        makeSdtEditor({
          controlType: 'comboBox',
          type: 'comboBox',
          sdtPr: { elements: [], 'w:comboBox': { 'w:listItem': [] } },
        }),
      );
      return adapter.choiceList.setItems(
        { target: SDT_TARGET, items: [{ displayText: 'A', value: 'a' }] },
        { changeMode: 'direct' },
      );
    },
  },
  'contentControls.choiceList.setSelected': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(
        makeSdtEditor({
          controlType: 'comboBox',
          type: 'comboBox',
          sdtPr: { elements: [], 'w:comboBox': { 'w:listItem': [] } },
        }),
      );
      return adapter.choiceList.setSelected({ target: MISSING_SDT_TARGET, value: 'a' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(
        makeNoOpSdtEditor({
          controlType: 'comboBox',
          type: 'comboBox',
          sdtPr: { elements: [], 'w:comboBox': { 'w:listItem': [] } },
        }),
      );
      return adapter.choiceList.setSelected({ target: SDT_TARGET, value: 'a' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(
        makeSdtEditor({
          controlType: 'comboBox',
          type: 'comboBox',
          sdtPr: { elements: [], 'w:comboBox': { 'w:listItem': [] } },
        }),
      );
      return adapter.choiceList.setSelected({ target: SDT_TARGET, value: 'a' }, { changeMode: 'direct' });
    },
  },
  'contentControls.clearBinding': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.clearBinding({ target: MISSING_SDT_TARGET }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeNoOpSdtEditor());
      return adapter.clearBinding({ target: SDT_TARGET }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.clearBinding({ target: SDT_TARGET }, { changeMode: 'direct' });
    },
  },
  'contentControls.clearContent': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.clearContent({ target: MISSING_SDT_TARGET }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({}, ''));
      return adapter.clearContent({ target: SDT_TARGET }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.clearContent({ target: SDT_TARGET }, { changeMode: 'direct' });
    },
  },
  'contentControls.copy': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.copy({ target: MISSING_SDT_TARGET, destination: SDT_TARGET }, { changeMode: 'direct' });
    },
    // failureCase omitted — CC_DIRECT_DISPATCH_OPS: handler always returns true
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.copy({ target: SDT_TARGET, destination: SDT_TARGET }, { changeMode: 'direct' });
    },
  },
  'contentControls.date.clearValue': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.clearValue({ target: MISSING_SDT_TARGET }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeNoOpSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.clearValue({ target: SDT_TARGET }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.clearValue({ target: SDT_TARGET }, { changeMode: 'direct' });
    },
  },
  'contentControls.date.setCalendar': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.setCalendar({ target: MISSING_SDT_TARGET, calendar: 'gregorian' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeNoOpSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.setCalendar({ target: SDT_TARGET, calendar: 'gregorian' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.setCalendar({ target: SDT_TARGET, calendar: 'gregorian' }, { changeMode: 'direct' });
    },
  },
  'contentControls.date.setDisplayFormat': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.setDisplayFormat(
        { target: MISSING_SDT_TARGET, format: 'yyyy-MM-dd' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeNoOpSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.setDisplayFormat({ target: SDT_TARGET, format: 'yyyy-MM-dd' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.setDisplayFormat({ target: SDT_TARGET, format: 'yyyy-MM-dd' }, { changeMode: 'direct' });
    },
  },
  'contentControls.date.setDisplayLocale': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.setDisplayLocale({ target: MISSING_SDT_TARGET, locale: 'en-US' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeNoOpSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.setDisplayLocale({ target: SDT_TARGET, locale: 'en-US' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.setDisplayLocale({ target: SDT_TARGET, locale: 'en-US' }, { changeMode: 'direct' });
    },
  },
  'contentControls.date.setStorageFormat': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.setStorageFormat(
        { target: MISSING_SDT_TARGET, format: 'xsd:dateTime' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeNoOpSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.setStorageFormat({ target: SDT_TARGET, format: 'xsd:dateTime' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.setStorageFormat({ target: SDT_TARGET, format: 'xsd:dateTime' }, { changeMode: 'direct' });
    },
  },
  'contentControls.date.setValue': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.setValue({ target: MISSING_SDT_TARGET, value: '2024-01-01' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeNoOpSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.setValue({ target: SDT_TARGET, value: '2024-01-01' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
      return adapter.date.setValue({ target: SDT_TARGET, value: '2024-01-01' }, { changeMode: 'direct' });
    },
  },
  'contentControls.delete': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.delete({ target: MISSING_SDT_TARGET }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeNoOpSdtEditor());
      return adapter.delete({ target: SDT_TARGET }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.delete({ target: SDT_TARGET }, { changeMode: 'direct' });
    },
  },
  'contentControls.group.ungroup': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'group', type: 'group' }));
      return adapter.group.ungroup({ target: MISSING_SDT_TARGET }, { changeMode: 'direct' });
    },
    // failureCase omitted — CC_DIRECT_DISPATCH_OPS: handler always returns true
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'group', type: 'group' }));
      return adapter.group.ungroup({ target: SDT_TARGET }, { changeMode: 'direct' });
    },
  },
  'contentControls.group.wrap': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.group.wrap({ target: MISSING_SDT_TARGET }, { changeMode: 'direct' });
    },
    // failureCase omitted — CC_DIRECT_DISPATCH_OPS: handler always returns true
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.group.wrap({ target: SDT_TARGET }, { changeMode: 'direct' });
    },
  },
  'contentControls.insertAfter': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.insertAfter({ target: MISSING_SDT_TARGET, content: 'after' }, { changeMode: 'direct' });
    },
    // failureCase omitted — CC_DIRECT_DISPATCH_OPS: handler always returns true
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.insertAfter({ target: SDT_TARGET, content: 'after' }, { changeMode: 'direct' });
    },
  },
  'contentControls.insertBefore': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.insertBefore({ target: MISSING_SDT_TARGET, content: 'before' }, { changeMode: 'direct' });
    },
    // failureCase omitted — CC_DIRECT_DISPATCH_OPS: handler always returns true
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.insertBefore({ target: SDT_TARGET, content: 'before' }, { changeMode: 'direct' });
    },
  },
  'contentControls.move': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.move({ target: MISSING_SDT_TARGET, destination: SDT_TARGET }, { changeMode: 'direct' });
    },
    // failureCase omitted — CC_DIRECT_DISPATCH_OPS: handler always returns true
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.move({ target: SDT_TARGET, destination: SDT_TARGET }, { changeMode: 'direct' });
    },
  },
  'contentControls.normalizeTagPayload': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.normalizeTagPayload({ target: MISSING_SDT_TARGET }, { changeMode: 'direct' });
    },
    failureCase: () => {
      // Tag is already valid JSON — returns NO_OP
      const adapter = createContentControlsAdapter(makeSdtEditor({ tag: '{"key":"value"}' }));
      return adapter.normalizeTagPayload({ target: SDT_TARGET }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.normalizeTagPayload({ target: SDT_TARGET }, { changeMode: 'direct' });
    },
  },
  'contentControls.normalizeWordCompatibility': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.normalizeWordCompatibility({ target: MISSING_SDT_TARGET }, { changeMode: 'direct' });
    },
    failureCase: () => {
      // ID is already numeric — returns NO_OP
      const numericId = '12345';
      const adapter = createContentControlsAdapter(makeSdtEditor({ id: numericId }));
      return adapter.normalizeWordCompatibility(
        { target: { kind: 'block' as const, nodeType: 'sdt' as const, nodeId: numericId } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ id: 'not-a-number-id' }));
      return adapter.normalizeWordCompatibility(
        { target: { kind: 'block', nodeType: 'sdt', nodeId: 'not-a-number-id' } },
        { changeMode: 'direct' },
      );
    },
  },
  'contentControls.patch': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.patch({ target: MISSING_SDT_TARGET, alias: 'New' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeNoOpSdtEditor());
      return adapter.patch({ target: SDT_TARGET, alias: 'New Alias' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.patch({ target: SDT_TARGET, alias: 'New Alias' }, { changeMode: 'direct' });
    },
  },
  'contentControls.patchRawProperties': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.patchRawProperties(
        { target: MISSING_SDT_TARGET, patches: [{ op: 'set', name: 'w:tag', element: { val: 'x' } }] },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeNoOpSdtEditor());
      return adapter.patchRawProperties(
        { target: SDT_TARGET, patches: [{ op: 'set', name: 'w:tag', element: { val: 'x' } }] },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.patchRawProperties(
        { target: SDT_TARGET, patches: [{ op: 'set', name: 'w:tag', element: { val: 'x' } }] },
        { changeMode: 'direct' },
      );
    },
  },
  'contentControls.prependContent': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.prependContent({ target: MISSING_SDT_TARGET, content: 'prepended' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.prependContent({ target: SDT_TARGET, content: '' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.prependContent({ target: SDT_TARGET, content: 'prepended' }, { changeMode: 'direct' });
    },
  },
  'contentControls.repeatingSection.cloneItem': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditorWithRepeatingSectionItems());
      return adapter.repeatingSection.cloneItem({ target: MISSING_SDT_TARGET, index: 0 }, { changeMode: 'direct' });
    },
    // failureCase omitted — CC_DIRECT_DISPATCH_OPS: handler always returns true
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditorWithRepeatingSectionItems());
      return adapter.repeatingSection.cloneItem({ target: RS_TARGET, index: 0 }, { changeMode: 'direct' });
    },
  },
  'contentControls.repeatingSection.deleteItem': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditorWithRepeatingSectionItems());
      return adapter.repeatingSection.deleteItem({ target: MISSING_SDT_TARGET, index: 0 }, { changeMode: 'direct' });
    },
    // failureCase omitted — CC_DIRECT_DISPATCH_OPS: handler always returns true
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditorWithRepeatingSectionItems());
      return adapter.repeatingSection.deleteItem({ target: RS_TARGET, index: 0 }, { changeMode: 'direct' });
    },
  },
  'contentControls.repeatingSection.insertItemAfter': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditorWithRepeatingSectionItems());
      return adapter.repeatingSection.insertItemAfter(
        { target: MISSING_SDT_TARGET, index: 0 },
        { changeMode: 'direct' },
      );
    },
    // failureCase omitted — CC_DIRECT_DISPATCH_OPS: handler always returns true
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditorWithRepeatingSectionItems());
      return adapter.repeatingSection.insertItemAfter({ target: RS_TARGET, index: 0 }, { changeMode: 'direct' });
    },
  },
  'contentControls.repeatingSection.insertItemBefore': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditorWithRepeatingSectionItems());
      return adapter.repeatingSection.insertItemBefore(
        { target: MISSING_SDT_TARGET, index: 0 },
        { changeMode: 'direct' },
      );
    },
    // failureCase omitted — CC_DIRECT_DISPATCH_OPS: handler always returns true
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditorWithRepeatingSectionItems());
      return adapter.repeatingSection.insertItemBefore({ target: RS_TARGET, index: 0 }, { changeMode: 'direct' });
    },
  },
  'contentControls.repeatingSection.setAllowInsertDelete': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(
        makeSdtEditor({ controlType: 'repeatingSection', type: 'repeatingSection' }),
      );
      return adapter.repeatingSection.setAllowInsertDelete(
        { target: MISSING_SDT_TARGET, allow: true },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(
        makeNoOpSdtEditor({ controlType: 'repeatingSection', type: 'repeatingSection' }),
      );
      return adapter.repeatingSection.setAllowInsertDelete(
        { target: SDT_TARGET, allow: true },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(
        makeSdtEditor({ controlType: 'repeatingSection', type: 'repeatingSection' }),
      );
      return adapter.repeatingSection.setAllowInsertDelete(
        { target: SDT_TARGET, allow: true },
        { changeMode: 'direct' },
      );
    },
  },
  'contentControls.replaceContent': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.replaceContent({ target: MISSING_SDT_TARGET, content: 'replaced' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({}, 'replaced'));
      return adapter.replaceContent({ target: SDT_TARGET, content: 'replaced' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.replaceContent({ target: SDT_TARGET, content: 'replaced' }, { changeMode: 'direct' });
    },
  },
  'contentControls.setBinding': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.setBinding(
        { target: MISSING_SDT_TARGET, storeItemId: 'store-1', xpath: '/root' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeNoOpSdtEditor());
      return adapter.setBinding(
        { target: SDT_TARGET, storeItemId: 'store-1', xpath: '/root' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.setBinding(
        { target: SDT_TARGET, storeItemId: 'store-1', xpath: '/root' },
        { changeMode: 'direct' },
      );
    },
  },
  'contentControls.setLockMode': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.setLockMode({ target: MISSING_SDT_TARGET, lockMode: 'locked' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeNoOpSdtEditor());
      return adapter.setLockMode({ target: SDT_TARGET, lockMode: 'locked' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.setLockMode({ target: SDT_TARGET, lockMode: 'locked' }, { changeMode: 'direct' });
    },
  },
  'contentControls.setType': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.setType({ target: MISSING_SDT_TARGET, controlType: 'date' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeNoOpSdtEditor());
      return adapter.setType({ target: SDT_TARGET, controlType: 'date' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.setType({ target: SDT_TARGET, controlType: 'date' }, { changeMode: 'direct' });
    },
  },
  'contentControls.text.clearValue': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'text', type: 'text' }));
      return adapter.text.clearValue({ target: MISSING_SDT_TARGET }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'text', type: 'text' }, ''));
      return adapter.text.clearValue({ target: SDT_TARGET }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'text', type: 'text' }));
      return adapter.text.clearValue({ target: SDT_TARGET }, { changeMode: 'direct' });
    },
  },
  'contentControls.text.setMultiline': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'text', type: 'text' }));
      return adapter.text.setMultiline({ target: MISSING_SDT_TARGET, multiline: true }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeNoOpSdtEditor({ controlType: 'text', type: 'text' }));
      return adapter.text.setMultiline({ target: SDT_TARGET, multiline: true }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'text', type: 'text' }));
      return adapter.text.setMultiline({ target: SDT_TARGET, multiline: true }, { changeMode: 'direct' });
    },
  },
  'contentControls.text.setValue': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'text', type: 'text' }));
      return adapter.text.setValue({ target: MISSING_SDT_TARGET, value: 'hello' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'text', type: 'text' }, 'hello'));
      return adapter.text.setValue({ target: SDT_TARGET, value: 'hello' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'text', type: 'text' }));
      return adapter.text.setValue({ target: SDT_TARGET, value: 'hello' }, { changeMode: 'direct' });
    },
  },
  'contentControls.unwrap': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.unwrap({ target: MISSING_SDT_TARGET }, { changeMode: 'direct' });
    },
    // failureCase omitted — CC_DIRECT_DISPATCH_OPS: handler always returns true
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.unwrap({ target: SDT_TARGET }, { changeMode: 'direct' });
    },
  },
  'contentControls.wrap': {
    throwCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.wrap({ target: MISSING_SDT_TARGET, kind: 'block' }, { changeMode: 'direct' });
    },
    // failureCase omitted — CC_DIRECT_DISPATCH_OPS: handler always returns true
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.wrap({ target: SDT_TARGET, kind: 'block' }, { changeMode: 'direct' });
    },
  },
  'create.contentControl': {
    throwCase: () => {
      const editor = makeSdtEditor();
      (editor.commands as any).insertStructuredContentBlock = undefined;
      const adapter = createContentControlsAdapter(editor);
      return adapter.create({ kind: 'block' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const adapter = createContentControlsAdapter(makeNoOpSdtEditor());
      return adapter.create({ kind: 'block' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const adapter = createContentControlsAdapter(makeSdtEditor());
      return adapter.create({ kind: 'block' }, { changeMode: 'direct' });
    },
  },
  // SD-2100: Image geometry, content, semantic & caption operations
  // -------------------------------------------------------------------------
  'images.scale': {
    throwCase: () =>
      imagesScaleWrapper(makeImageEditor(), { imageId: 'missing', factor: 1.5 }, { changeMode: 'direct' }),
    failureCase: () => {
      // factor=1 produces identical dimensions → explicit NO_OP pre-check
      return imagesScaleWrapper(makeImageEditor(), { imageId: 'img-1', factor: 1 }, { changeMode: 'direct' });
    },
    applyCase: () => imagesScaleWrapper(makeImageEditor(), { imageId: 'img-1', factor: 1.5 }, { changeMode: 'direct' }),
  },
  'images.setLockAspectRatio': {
    throwCase: () =>
      imagesSetLockAspectRatioWrapper(
        makeImageEditor(),
        { imageId: 'missing', locked: false },
        { changeMode: 'direct' },
      ),
    failureCase: () => {
      // Default lockAspectRatio is true → NO_OP
      return imagesSetLockAspectRatioWrapper(
        makeImageEditor(),
        { imageId: 'img-1', locked: true },
        { changeMode: 'direct' },
      );
    },
    applyCase: () =>
      imagesSetLockAspectRatioWrapper(makeImageEditor(), { imageId: 'img-1', locked: false }, { changeMode: 'direct' }),
  },
  'images.rotate': {
    throwCase: () =>
      imagesRotateWrapper(makeImageEditor(), { imageId: 'missing', angle: 90 }, { changeMode: 'direct' }),
    failureCase: () => {
      // No rotation set, angle=0 → NO_OP
      return imagesRotateWrapper(makeImageEditor(), { imageId: 'img-1', angle: 0 }, { changeMode: 'direct' });
    },
    applyCase: () => imagesRotateWrapper(makeImageEditor(), { imageId: 'img-1', angle: 90 }, { changeMode: 'direct' }),
  },
  'images.flip': {
    throwCase: () =>
      imagesFlipWrapper(makeImageEditor(), { imageId: 'missing', horizontal: true }, { changeMode: 'direct' }),
    failureCase: () => {
      // No transformData, passing false for both axes matches defaults → NO_OP
      return imagesFlipWrapper(
        makeImageEditor(),
        { imageId: 'img-1', horizontal: false, vertical: false },
        { changeMode: 'direct' },
      );
    },
    applyCase: () =>
      imagesFlipWrapper(makeImageEditor(), { imageId: 'img-1', horizontal: true }, { changeMode: 'direct' }),
  },
  'images.crop': {
    throwCase: () =>
      imagesCropWrapper(
        makeImageEditor(),
        { imageId: 'missing', crop: { left: 10, top: 10, right: 10, bottom: 10 } },
        { changeMode: 'direct' },
      ),
    failureCase: () => {
      // Transaction produces no change → NO_OP
      const editor = makeImageEditor();
      const tr = (editor.state as unknown as { tr: Record<string, unknown> }).tr;
      tr.docChanged = false;
      tr.steps = [];
      return imagesCropWrapper(
        editor,
        { imageId: 'img-1', crop: { left: 10, top: 5, right: 10, bottom: 5 } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () =>
      imagesCropWrapper(
        makeImageEditor(),
        { imageId: 'img-1', crop: { left: 10, top: 5, right: 10, bottom: 5 } },
        { changeMode: 'direct' },
      ),
  },
  'images.resetCrop': {
    throwCase: () => imagesResetCropWrapper(makeImageEditor(), { imageId: 'missing' }, { changeMode: 'direct' }),
    failureCase: () => {
      // No crop set → NO_OP
      return imagesResetCropWrapper(makeImageEditor(), { imageId: 'img-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      // Image with crop data
      const editor = makeCaptionImageEditor({
        imageId: 'img-cropped',
        extraAttrs: {
          clipPath: 'inset(5% 10% 5% 10%)',
          rawSrcRect: { l: '10000', t: '5000', r: '10000', b: '5000' },
        },
      });
      return imagesResetCropWrapper(editor, { imageId: 'img-cropped' }, { changeMode: 'direct' });
    },
  },
  'images.replaceSource': {
    throwCase: () =>
      imagesReplaceSourceWrapper(
        makeImageEditor(),
        { imageId: 'missing', src: 'data:image/png;base64,abc' },
        { changeMode: 'direct' },
      ),
    failureCase: () => {
      // Transaction produces no change → NO_OP
      const editor = makeImageEditor();
      const tr = (editor.state as unknown as { tr: Record<string, unknown> }).tr;
      tr.docChanged = false;
      tr.steps = [];
      return imagesReplaceSourceWrapper(
        editor,
        { imageId: 'img-1', src: 'data:image/png;base64,abc' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () =>
      imagesReplaceSourceWrapper(
        makeImageEditor(),
        { imageId: 'img-1', src: 'data:image/png;base64,abc' },
        { changeMode: 'direct' },
      ),
  },
  'images.setAltText': {
    throwCase: () =>
      imagesSetAltTextWrapper(
        makeImageEditor(),
        { imageId: 'missing', description: 'Alt text' },
        { changeMode: 'direct' },
      ),
    failureCase: () => {
      // Same description → NO_OP
      const editor = makeCaptionImageEditor({ extraAttrs: { title: 'Already set' } });
      return imagesSetAltTextWrapper(
        editor,
        { imageId: 'img-1', description: 'Already set' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () =>
      imagesSetAltTextWrapper(
        makeImageEditor(),
        { imageId: 'img-1', description: 'New alt text' },
        { changeMode: 'direct' },
      ),
  },
  'images.setDecorative': {
    throwCase: () =>
      imagesSetDecorativeWrapper(makeImageEditor(), { imageId: 'missing', decorative: true }, { changeMode: 'direct' }),
    failureCase: () => {
      // Default decorative is false → NO_OP
      return imagesSetDecorativeWrapper(
        makeImageEditor(),
        { imageId: 'img-1', decorative: false },
        { changeMode: 'direct' },
      );
    },
    applyCase: () =>
      imagesSetDecorativeWrapper(makeImageEditor(), { imageId: 'img-1', decorative: true }, { changeMode: 'direct' }),
  },
  'images.setName': {
    throwCase: () =>
      imagesSetNameWrapper(makeImageEditor(), { imageId: 'missing', name: 'MyImage' }, { changeMode: 'direct' }),
    failureCase: () => {
      // Same name as existing alt attr → NO_OP
      return imagesSetNameWrapper(
        makeImageEditor(),
        { imageId: 'img-1', name: 'Test image' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () =>
      imagesSetNameWrapper(makeImageEditor(), { imageId: 'img-1', name: 'NewName' }, { changeMode: 'direct' }),
  },
  'images.setHyperlink': {
    throwCase: () =>
      imagesSetHyperlinkWrapper(
        makeImageEditor(),
        { imageId: 'missing', url: 'https://example.com' },
        { changeMode: 'direct' },
      ),
    failureCase: () => {
      // No hyperlink set, removing → NO_OP
      return imagesSetHyperlinkWrapper(makeImageEditor(), { imageId: 'img-1', url: null }, { changeMode: 'direct' });
    },
    applyCase: () =>
      imagesSetHyperlinkWrapper(
        makeImageEditor(),
        { imageId: 'img-1', url: 'https://example.com' },
        { changeMode: 'direct' },
      ),
  },
  'images.insertCaption': {
    throwCase: () =>
      imagesInsertCaptionWrapper(makeImageEditor(), { imageId: 'missing', text: 'Caption' }, { changeMode: 'direct' }),
    failureCase: () => {
      // Transaction produces no change → NO_OP
      const editor = makeCaptionImageEditor({ docChanged: false });
      return imagesInsertCaptionWrapper(editor, { imageId: 'img-1', text: 'Caption' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeCaptionImageEditor();
      return imagesInsertCaptionWrapper(editor, { imageId: 'img-1', text: 'Caption text' }, { changeMode: 'direct' });
    },
  },
  'images.updateCaption': {
    throwCase: () =>
      imagesUpdateCaptionWrapper(makeImageEditor(), { imageId: 'missing', text: 'Updated' }, { changeMode: 'direct' }),
    failureCase: () => {
      // Transaction produces no change → NO_OP
      const editor = makeCaptionImageEditor({ withCaption: true, docChanged: false, imageId: 'img-cap' });
      return imagesUpdateCaptionWrapper(editor, { imageId: 'img-cap', text: 'Updated' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeCaptionImageEditor({ withCaption: true, imageId: 'img-cap' });
      return imagesUpdateCaptionWrapper(editor, { imageId: 'img-cap', text: 'New caption' }, { changeMode: 'direct' });
    },
  },
  'images.removeCaption': {
    throwCase: () => imagesRemoveCaptionWrapper(makeImageEditor(), { imageId: 'missing' }, { changeMode: 'direct' }),
    failureCase: () => {
      // No caption → NO_OP
      const editor = makeCaptionImageEditor();
      return imagesRemoveCaptionWrapper(editor, { imageId: 'img-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeCaptionImageEditor({ withCaption: true, imageId: 'img-cap' });
      return imagesRemoveCaptionWrapper(editor, { imageId: 'img-cap' }, { changeMode: 'direct' });
    },
  },

  // -------------------------------------------------------------------------
  // Reference namespace mutation vectors
  // -------------------------------------------------------------------------

  ...refNamespaceMutationVectors,
};

const dryRunVectors: Partial<Record<OperationId, () => unknown>> = {
  'blocks.delete': () => {
    const deleteBlockNodeById = mock(() => true);
    const editor = makeBlockDeleteEditor({ deleteBlockNodeById });
    const result = blocksDeleteWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(deleteBlockNodeById).not.toHaveBeenCalled();
    return result;
  },
  'blocks.deleteRange': () => {
    const editor = makeBlockRangeDeleteEditor();
    const deleteCmd = editor.commands?.deleteBlockNodeById as ReturnType<typeof mock>;
    const result = blocksDeleteRangeWrapper(
      editor,
      {
        start: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
        end: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
      },
      { changeMode: 'direct', dryRun: true },
    );
    expect(deleteCmd).not.toHaveBeenCalled();
    return result;
  },
  insert: () => {
    const { editor, dispatch, tr } = makeTextEditor();
    const result = textReceiptToSDReceipt(
      writeAdapter(
        editor,
        { kind: 'insert', target: { kind: 'text', blockId: 'p1', range: { start: 1, end: 1 } }, text: 'X' },
        { changeMode: 'direct', dryRun: true },
      ),
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(tr.insertText).not.toHaveBeenCalled();
    return result;
  },
  replace: () => {
    const { editor, dispatch, tr } = makeTextEditor();
    const result = textReceiptToSDReceipt(
      writeAdapter(
        editor,
        { kind: 'replace', target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, text: 'World' },
        { changeMode: 'direct', dryRun: true },
      ),
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(tr.insertText).not.toHaveBeenCalled();
    return result;
  },
  delete: () => {
    const { editor, dispatch, tr } = makeTextEditor();
    const result = writeAdapter(
      editor,
      { kind: 'delete', target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 2 } } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(tr.delete).not.toHaveBeenCalled();
    return result;
  },
  'format.apply': () => {
    const { editor, dispatch, tr } = makeTextEditor();
    const result = styleApplyWrapper(
      editor,
      { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, inline: { bold: 'on' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(tr.addMark).not.toHaveBeenCalled();
    return result;
  },
  ...formatInlineDryRunVectors,
  ...paragraphDryRunVectors,
  'create.paragraph': () => {
    const insertParagraphAt = mock(() => true);
    const { editor } = makeTextEditor('Hello', { commands: { insertParagraphAt } });
    const result = createParagraphWrapper(
      editor,
      { at: { kind: 'documentEnd' }, text: 'Dry run paragraph' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(insertParagraphAt).not.toHaveBeenCalled();
    return result;
  },
  'create.heading': () => {
    const insertHeadingAt = mock(() => true);
    const { editor } = makeTextEditor('Hello', { commands: { insertHeadingAt } });
    const result = createHeadingWrapper(
      editor,
      { level: 1, at: { kind: 'documentEnd' }, text: 'Dry run heading' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(insertHeadingAt).not.toHaveBeenCalled();
    return result;
  },
  'create.sectionBreak': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = createSectionBreakAdapter(
      editor,
      { at: { kind: 'documentEnd' }, breakType: 'nextPage' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setBreakType': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = sectionsSetBreakTypeAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, breakType: 'nextPage' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setPageMargins': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = sectionsSetPageMarginsAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, top: 1.25 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setHeaderFooterMargins': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = sectionsSetHeaderFooterMarginsAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, header: 0.75 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setPageSetup': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = sectionsSetPageSetupAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, orientation: 'landscape' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setColumns': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = sectionsSetColumnsAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, count: 2 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setLineNumbering': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = sectionsSetLineNumberingAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, enabled: false },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setPageNumbering': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = sectionsSetPageNumberingAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, start: 2 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setTitlePage': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = sectionsSetTitlePageAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, enabled: false },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setOddEvenHeadersFooters': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = sectionsSetOddEvenHeadersFootersAdapter(
      editor,
      { enabled: true },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setVerticalAlign': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = sectionsSetVerticalAlignAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, value: 'center' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setSectionDirection': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = sectionsSetSectionDirectionAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, direction: 'rtl' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setHeaderFooterRef': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = sectionsSetHeaderFooterRefAdapter(
      editor,
      {
        target: { kind: 'section', sectionId: 'section-0' },
        kind: 'header',
        variant: 'default',
        refId: 'rIdHeaderAlt',
      },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.clearHeaderFooterRef': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = sectionsClearHeaderFooterRefAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, kind: 'header', variant: 'default' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setLinkToPrevious': () => {
    const bodyWithoutRefs = clone(BASE_SECTION_BODY_SECT_PR);
    bodyWithoutRefs.elements = ((bodyWithoutRefs.elements ?? []) as Array<{ name?: string }>).filter(
      (element) => element.name !== 'w:headerReference' && element.name !== 'w:footerReference',
    ) as unknown as Record<string, unknown>[];
    const editor = makeSectionsEditor({
      paragraphSectPr: PREVIOUS_SECTION_SECT_PR,
      bodySectPr: bodyWithoutRefs,
    });
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = sectionsSetLinkToPreviousAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-1' }, kind: 'header', variant: 'default', linked: false },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setPageBorders': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = sectionsSetPageBordersAdapter(
      editor,
      {
        target: { kind: 'section', sectionId: 'section-0' },
        borders: {
          display: 'allPages',
          offsetFrom: 'page',
          zOrder: 'front',
          top: { style: 'double', size: 12, space: 0, color: '000000' },
        },
      },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.clearPageBorders': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = sectionsClearPageBordersAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'headerFooters.refs.set': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = headerFootersRefsSetAdapter(
      editor,
      {
        target: {
          kind: 'headerFooterSlot',
          section: { kind: 'section', sectionId: 'section-0' },
          headerFooterKind: 'header',
          variant: 'default',
        },
        refId: 'rIdHeaderAlt',
      },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'headerFooters.refs.clear': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = headerFootersRefsClearAdapter(
      editor,
      {
        target: {
          kind: 'headerFooterSlot',
          section: { kind: 'section', sectionId: 'section-0' },
          headerFooterKind: 'header',
          variant: 'default',
        },
      },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'headerFooters.refs.setLinkedToPrevious': () => {
    const bodyWithoutRefs = clone(BASE_SECTION_BODY_SECT_PR);
    bodyWithoutRefs.elements = ((bodyWithoutRefs.elements ?? []) as Array<{ name?: string }>).filter(
      (element) => element.name !== 'w:headerReference' && element.name !== 'w:footerReference',
    ) as unknown as Record<string, unknown>[];
    const editor = makeSectionsEditor({
      paragraphSectPr: PREVIOUS_SECTION_SECT_PR,
      bodySectPr: bodyWithoutRefs,
    });
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = headerFootersRefsSetLinkedToPreviousAdapter(
      editor,
      {
        target: {
          kind: 'headerFooterSlot',
          section: { kind: 'section', sectionId: 'section-1' },
          headerFooterKind: 'header',
          variant: 'default',
        },
        linked: false,
      },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'headerFooters.parts.create': () => {
    const editor = makeSectionsEditor();
    const result = headerFootersPartsCreateAdapter(editor, { kind: 'header' }, { changeMode: 'direct', dryRun: true });
    return result;
  },
  'headerFooters.parts.delete': () => {
    const editor = makeSectionsEditor();
    const result = headerFootersPartsDeleteAdapter(
      editor,
      { target: { kind: 'headerFooterPart', refId: 'rIdHeaderAlt' } },
      { changeMode: 'direct', dryRun: true },
    );
    return result;
  },
  'lists.insert': () => {
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'decimal' })]);
    const insertListItemAt = editor.commands!.insertListItemAt as ReturnType<typeof mock>;
    const result = listsInsertWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, position: 'after', text: 'X' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(insertListItemAt).not.toHaveBeenCalled();
    return result;
  },
  'lists.indent': () => {
    const hasDefinitionSpy = spyOn(ListHelpers, 'hasListDefinition').mockReturnValue(true);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsIndentWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
      { changeMode: 'direct', dryRun: true },
    );
    hasDefinitionSpy.mockRestore();
    return result;
  },
  'lists.outdent': () => {
    const hasDefinitionSpy = spyOn(ListHelpers, 'hasListDefinition').mockReturnValue(true);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 1, numberingType: 'decimal' })]);
    const result = listsOutdentWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
      { changeMode: 'direct', dryRun: true },
    );
    hasDefinitionSpy.mockRestore();
    return result;
  },
  'lists.create': () => {
    const editor = makeListEditor([makeListParagraph({ id: 'p-1' })]);
    return listsCreateWrapper(
      editor,
      { mode: 'empty', at: { kind: 'block', nodeType: 'paragraph', nodeId: 'p-1' }, kind: 'ordered' },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'lists.attach': () => {
    const editor = makeListEditor([
      makeListParagraph({ id: 'p-1' }),
      makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' }),
    ]);
    return listsAttachWrapper(
      editor,
      {
        target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p-1' },
        attachTo: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
      },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'lists.detach': () => {
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    return listsDetachWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'lists.join': () => {
    const canJoinSpy = spyOn(listSequenceHelpers, 'evaluateCanJoin').mockReturnValue({
      canJoin: true,
      adjacentListId: '2',
    });
    const adjacentSpy = spyOn(listSequenceHelpers, 'findAdjacentSequence').mockReturnValue({
      numId: 2,
      sequence: [],
    });
    const seqSpy = spyOn(listSequenceHelpers, 'getContiguousSequence').mockReturnValue([]);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsJoinWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, direction: 'withNext' },
      { changeMode: 'direct', dryRun: true },
    );
    canJoinSpy.mockRestore();
    adjacentSpy.mockRestore();
    seqSpy.mockRestore();
    return result;
  },
  'lists.separate': () => {
    const firstInSeqSpy = spyOn(listSequenceHelpers, 'isFirstInSequence').mockReturnValue(false);
    const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
    const seqSpy = spyOn(listSequenceHelpers, 'getSequenceFromTarget').mockReturnValue([]);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsSeparateWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
      { changeMode: 'direct', dryRun: true },
    );
    firstInSeqSpy.mockRestore();
    abstractSpy.mockRestore();
    seqSpy.mockRestore();
    return result;
  },
  'lists.setLevel': () => {
    const hasDefinitionSpy = spyOn(ListHelpers, 'hasListDefinition').mockReturnValue(true);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsSetLevelWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 2 },
      { changeMode: 'direct', dryRun: true },
    );
    hasDefinitionSpy.mockRestore();
    return result;
  },
  'lists.setValue': () => {
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    return listsSetValueWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, value: 5 },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'lists.continuePrevious': () => {
    const canContSpy = spyOn(listSequenceHelpers, 'evaluateCanContinuePrevious').mockReturnValue({
      canContinue: true,
      previousListId: '2',
    });
    const prevSpy = spyOn(listSequenceHelpers, 'findPreviousCompatibleSequence').mockReturnValue({
      numId: 2,
      sequence: [],
    });
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsContinuePreviousWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
      { changeMode: 'direct', dryRun: true },
    );
    canContSpy.mockRestore();
    prevSpy.mockRestore();
    return result;
  },
  'lists.setLevelRestart': () => {
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    return listsSetLevelRestartWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, restartAfterLevel: null },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'lists.convertToText': () => {
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    return listsConvertToTextWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'styles.apply': () => {
    const editor = makeStylesEditor();
    const result = stylesApplyAdapter(
      editor,
      { target: { scope: 'docDefaults', channel: 'run' }, patch: { bold: true } },
      { dryRun: true, expectedRevision: undefined },
    );
    // dryRun should not mark the document as modified
    expect((editor as unknown as { converter: { documentModified: boolean } }).converter.documentModified).toBe(false);
    return result;
  },

  // -------------------------------------------------------------------------
  // SD-1973 list formatting — dryRun vectors
  // -------------------------------------------------------------------------
  'lists.applyTemplate': () => {
    const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsApplyTemplateWrapper(
      editor,
      {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        template: { version: 1, levels: [{ level: 0, numFmt: 'decimal', lvlText: '%1.' }] },
      },
      { changeMode: 'direct', dryRun: true },
    );
    abstractSpy.mockRestore();
    return result;
  },
  'lists.applyPreset': () => {
    const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
    const presetSpy = vi
      .spyOn(LevelFormattingHelpers, 'getPresetTemplate')
      .mockReturnValue({ version: 1, levels: [{ level: 0, numFmt: 'decimal', lvlText: '%1.' }] });
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsApplyPresetWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, preset: 'decimal' },
      { changeMode: 'direct', dryRun: true },
    );
    abstractSpy.mockRestore();
    presetSpy.mockRestore();
    return result;
  },
  'lists.setType': () => {
    const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
    const presetSpy = vi
      .spyOn(LevelFormattingHelpers, 'getPresetTemplate')
      .mockReturnValue({ version: 1, levels: [{ level: 0, numFmt: 'decimal', lvlText: '%1.' }] });
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsSetTypeWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, kind: 'ordered' },
      { changeMode: 'direct', dryRun: true },
    );
    abstractSpy.mockRestore();
    presetSpy.mockRestore();
    return result;
  },
  'lists.setLevelNumbering': () => {
    const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
    const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsSetLevelNumberingWrapper(
      editor,
      {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        level: 0,
        numFmt: 'upperRoman',
        lvlText: '%1.',
      },
      { changeMode: 'direct', dryRun: true },
    );
    abstractSpy.mockRestore();
    hasLevelSpy.mockRestore();
    return result;
  },
  'lists.setLevelBullet': () => {
    const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
    const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsSetLevelBulletWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, markerText: '•' },
      { changeMode: 'direct', dryRun: true },
    );
    abstractSpy.mockRestore();
    hasLevelSpy.mockRestore();
    return result;
  },
  'lists.setLevelPictureBullet': () => {
    const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
    const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsSetLevelPictureBulletWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, pictureBulletId: 1 },
      { changeMode: 'direct', dryRun: true },
    );
    abstractSpy.mockRestore();
    hasLevelSpy.mockRestore();
    return result;
  },
  'lists.setLevelAlignment': () => {
    const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
    const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsSetLevelAlignmentWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, alignment: 'center' },
      { changeMode: 'direct', dryRun: true },
    );
    abstractSpy.mockRestore();
    hasLevelSpy.mockRestore();
    return result;
  },
  'lists.setLevelIndents': () => {
    const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
    const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsSetLevelIndentsWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, left: 720 },
      { changeMode: 'direct', dryRun: true },
    );
    abstractSpy.mockRestore();
    hasLevelSpy.mockRestore();
    return result;
  },
  'lists.setLevelTrailingCharacter': () => {
    const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
    const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsSetLevelTrailingCharacterWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, trailingCharacter: 'space' },
      { changeMode: 'direct', dryRun: true },
    );
    abstractSpy.mockRestore();
    hasLevelSpy.mockRestore();
    return result;
  },
  'lists.setLevelMarkerFont': () => {
    const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
    const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsSetLevelMarkerFontWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, fontFamily: 'Arial' },
      { changeMode: 'direct', dryRun: true },
    );
    abstractSpy.mockRestore();
    hasLevelSpy.mockRestore();
    return result;
  },
  'lists.clearLevelOverrides': () => {
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    return listsClearLevelOverridesWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0 },
      { changeMode: 'direct', dryRun: true },
    );
  },
  // SD-2025 user-centric list formatting — dryRun vectors
  'lists.applyStyle': () => {
    const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsApplyStyleWrapper(
      editor,
      {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        style: { version: 1, levels: [{ level: 0, numFmt: 'decimal', lvlText: '%1.' }] },
      },
      { changeMode: 'direct', dryRun: true },
    );
    abstractSpy.mockRestore();
    return result;
  },
  'lists.restartAt': () => {
    registerSetValueDelegate((ed, input, options) => listsSetValueWrapper(ed, input, options));
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    return listsRestartAtWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, startAt: 5 },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'lists.setLevelNumberStyle': () => {
    const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
    const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsSetLevelNumberStyleWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, numberStyle: 'upperRoman' },
      { changeMode: 'direct', dryRun: true },
    );
    abstractSpy.mockRestore();
    hasLevelSpy.mockRestore();
    return result;
  },
  'lists.setLevelText': () => {
    const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
    const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsSetLevelTextWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, text: '%1.' },
      { changeMode: 'direct', dryRun: true },
    );
    abstractSpy.mockRestore();
    hasLevelSpy.mockRestore();
    return result;
  },
  'lists.setLevelStart': () => {
    const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
    const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
    const readSpy = vi
      .spyOn(LevelFormattingHelpers, 'readLevelProperties')
      .mockReturnValue({ numFmt: 'decimal' } as any);
    const findSpy = spyOn(LevelFormattingHelpers, 'findLevelElement').mockReturnValue({} as any);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsSetLevelStartWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, startAt: 5 },
      { changeMode: 'direct', dryRun: true },
    );
    abstractSpy.mockRestore();
    hasLevelSpy.mockRestore();
    readSpy.mockRestore();
    findSpy.mockRestore();
    return result;
  },
  'lists.setLevelLayout': () => {
    const abstractSpy = spyOn(listSequenceHelpers, 'getAbstractNumId').mockReturnValue(1);
    const hasLevelSpy = spyOn(LevelFormattingHelpers, 'hasLevel').mockReturnValue(true);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const result = listsSetLevelLayoutWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, level: 0, layout: { alignment: 'left' } },
      { changeMode: 'direct', dryRun: true },
    );
    abstractSpy.mockRestore();
    hasLevelSpy.mockRestore();
    return result;
  },

  // -------------------------------------------------------------------------
  // Table operations — dryRun vectors
  // -------------------------------------------------------------------------
  'create.table': () => {
    const insertTableAt = mock(() => true);
    const { editor } = makeTextEditor('Hello', {
      commands: { insertTableAt },
      can: mock(() => ({ insertTableAt: mock(() => true) })),
    } as any);
    const result = createTableWrapper(editor, { rows: 2, columns: 2 }, { changeMode: 'direct', dryRun: true });
    expect(insertTableAt).not.toHaveBeenCalled();
    return result;
  },
  'tables.delete': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesDeleteWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.clearContents': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesClearContentsWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.move': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesMoveWrapper(
      editor,
      { nodeId: 'table-1', destination: { kind: 'documentEnd' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setLayout': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSetLayoutWrapper(
      editor,
      { nodeId: 'table-1', alignment: 'center' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setAltText': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSetAltTextWrapper(
      editor,
      { nodeId: 'table-1', title: 'T' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.insertRow': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesInsertRowWrapper(editor, { nodeId: 'table-1', rowIndex: 0, position: 'below' } as any, {
      changeMode: 'direct',
      dryRun: true,
    });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.deleteRow': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesDeleteRowWrapper(editor, { nodeId: 'table-1', rowIndex: 0 } as any, {
      changeMode: 'direct',
      dryRun: true,
    });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setRowHeight': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSetRowHeightWrapper(
      editor,
      { nodeId: 'table-1', rowIndex: 0, heightPt: 20, rule: 'atLeast' } as any,
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.distributeRows': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesDistributeRowsWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setRowOptions': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSetRowOptionsWrapper(
      editor,
      { nodeId: 'table-1', rowIndex: 0, allowBreakAcrossPages: true } as any,
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.insertColumn': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesInsertColumnWrapper(
      editor,
      { nodeId: 'table-1', columnIndex: 0, position: 'right' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.deleteColumn': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesDeleteColumnWrapper(
      editor,
      { nodeId: 'table-1', columnIndex: 0 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setColumnWidth': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSetColumnWidthWrapper(
      editor,
      { nodeId: 'table-1', columnIndex: 0, widthPt: 100 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.distributeColumns': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesDistributeColumnsWrapper(editor, { nodeId: 'table-1' } as any, {
      changeMode: 'direct',
      dryRun: true,
    });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.insertCell': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesInsertCellWrapper(
      editor,
      { nodeId: 'cell-1', mode: 'shiftRight' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.deleteCell': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesDeleteCellWrapper(
      editor,
      { nodeId: 'cell-1', mode: 'shiftLeft' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.mergeCells': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesMergeCellsWrapper(
      editor,
      { nodeId: 'table-1', start: { rowIndex: 0, columnIndex: 0 }, end: { rowIndex: 1, columnIndex: 1 } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.unmergeCells': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesUnmergeCellsWrapper(editor, { nodeId: 'cell-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.splitCell': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSplitCellWrapper(
      editor,
      { nodeId: 'cell-1', rows: 2, columns: 2 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setCellProperties': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSetCellPropertiesWrapper(
      editor,
      { nodeId: 'cell-1', verticalAlign: 'center' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.convertFromText': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesConvertFromTextWrapper(editor, { nodeId: 'p1' } as any, {
      changeMode: 'direct',
      dryRun: true,
    });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.split': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSplitWrapper(
      editor,
      { nodeId: 'table-1', rowIndex: 1 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.convertToText': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesConvertToTextWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.sort': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSortWrapper(
      editor,
      { nodeId: 'table-1', keys: [{ columnIndex: 0, direction: 'ascending', type: 'text' }] },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  // --- Batch 6: Style operations ---
  'tables.setStyle': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSetStyleWrapper(
      editor,
      { nodeId: 'table-1', styleId: 'TableGrid' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.clearStyle': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesClearStyleWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setStyleOption': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSetStyleOptionWrapper(
      editor,
      { nodeId: 'table-1', flag: 'headerRow', enabled: true },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  // --- Batch 7: Border + shading operations ---
  'tables.setBorder': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSetBorderWrapper(
      editor,
      { nodeId: 'table-1', edge: 'top', lineStyle: 'single', lineWeightPt: 0.5, color: '000000' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.clearBorder': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesClearBorderWrapper(
      editor,
      { nodeId: 'table-1', edge: 'top' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.applyBorderPreset': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesApplyBorderPresetWrapper(
      editor,
      { nodeId: 'table-1', preset: 'box' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setShading': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSetShadingWrapper(
      editor,
      { nodeId: 'table-1', color: 'FF0000' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.clearShading': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesClearShadingWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  // --- Batch 8: Padding + spacing operations ---
  'tables.setTablePadding': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSetTablePaddingWrapper(
      editor,
      { nodeId: 'table-1', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setCellPadding': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSetCellPaddingWrapper(
      editor,
      { nodeId: 'cell-1', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 } as any,
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setCellSpacing': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSetCellSpacingWrapper(
      editor,
      { nodeId: 'table-1', spacingPt: 2 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.clearCellSpacing': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesClearCellSpacingWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.applyStyle': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesApplyStyleWrapper(
      editor,
      { nodeId: 'table-1', styleId: 'TableGrid' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setBorders': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSetBordersWrapper(
      editor,
      {
        nodeId: 'table-1',
        mode: 'applyTo',
        applyTo: 'all',
        border: { lineStyle: 'single', lineWeightPt: 1, color: '000000' },
      },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setTableOptions': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSetTableOptionsWrapper(
      editor,
      { nodeId: 'table-1', defaultCellMargins: { topPt: 6, rightPt: 6, bottomPt: 6, leftPt: 6 } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setDefaultStyle': () => {
    const editor = makeSectionsEditor();
    const converter = (editor as unknown as { converter: Record<string, unknown> }).converter;
    converter.translatedLinkedStyles = {
      styles: { TableGrid: { type: 'table', name: 'Table Grid' } },
      docDefaults: {},
      latentStyles: {},
    };
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesSetDefaultStyleAdapter(
      editor,
      { styleId: 'TableGrid' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.clearDefaultStyle': () => {
    const editor = makeSectionsEditor();
    const converter = (editor as unknown as { converter: Record<string, unknown> }).converter;
    const settingsRoot = (converter.convertedXml as Record<string, { elements?: Array<{ elements?: unknown[] }> }>)[
      'word/settings.xml'
    ];
    const wSettings = settingsRoot?.elements?.find(
      (el: { name?: string }) => (el as { name?: string }).name === 'w:settings',
    ) as { elements?: unknown[] } | undefined;
    if (wSettings) {
      if (!wSettings.elements) wSettings.elements = [];
      wSettings.elements.push({
        type: 'element',
        name: 'w:defaultTableStyle',
        attributes: { 'w:val': 'TableGrid' },
        elements: [],
      });
    }
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = tablesClearDefaultStyleAdapter(editor, {}, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },

  // -------------------------------------------------------------------------
  // TOC operations — dryRun vectors
  // -------------------------------------------------------------------------
  'create.tableOfContents': () => {
    const insertTableOfContentsAt = mock(() => true);
    const editor = makeTocEditor({ insertTableOfContentsAt });
    const result = createTableOfContentsWrapper(
      editor,
      { at: { kind: 'documentEnd' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(insertTableOfContentsAt).not.toHaveBeenCalled();
    return result;
  },
  'toc.configure': () => {
    const setInstr = mock(() => true);
    const editor = makeTocEditor({ setTableOfContentsInstructionById: setInstr });
    const result = tocConfigureWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'tableOfContents', nodeId: 'toc-1' }, patch: { hyperlinks: false } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(setInstr).not.toHaveBeenCalled();
    return result;
  },
  'toc.update': () => {
    const replaceContent = mock(() => true);
    const editor = makeTocEditor({ replaceTableOfContentsContentById: replaceContent });
    const result = tocUpdateWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'tableOfContents', nodeId: 'toc-1' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(replaceContent).not.toHaveBeenCalled();
    return result;
  },
  'toc.remove': () => {
    const deleteById = mock(() => true);
    const editor = makeTocEditor({ deleteTableOfContentsById: deleteById });
    const result = tocRemoveWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'tableOfContents', nodeId: 'toc-1' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(deleteById).not.toHaveBeenCalled();
    return result;
  },
  'toc.markEntry': () => {
    const insertEntry = mock(() => true);
    const editor = makeTocEditor({ insertTableOfContentsEntryAt: insertEntry });
    const result = tocMarkEntryWrapper(
      editor,
      { target: { kind: 'inline-insert', anchor: { nodeType: 'paragraph', nodeId: 'p-1' } }, text: 'Dry mark' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(insertEntry).not.toHaveBeenCalled();
    return result;
  },
  'toc.unmarkEntry': () => {
    const deleteEntry = mock(() => true);
    const editor = makeTocEditor({ deleteTableOfContentsEntryAt: deleteEntry });
    const result = tocUnmarkEntryWrapper(
      editor,
      { target: getFirstTocEntryAddress(editor) },
      { changeMode: 'direct', dryRun: true },
    );
    expect(deleteEntry).not.toHaveBeenCalled();
    return result;
  },
  'toc.editEntry': () => {
    const updateEntry = mock(() => true);
    const editor = makeTocEditor({ updateTableOfContentsEntryAt: updateEntry });
    const result = tocEditEntryWrapper(
      editor,
      { target: getFirstTocEntryAddress(editor), patch: { text: 'Dry edit' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(updateEntry).not.toHaveBeenCalled();
    return result;
  },

  // -------------------------------------------------------------------------
  // Image operations — dryRun vectors
  // -------------------------------------------------------------------------
  'create.image': () => {
    const setImage = mock(() => true);
    const { editor } = makeTextEditor('Hello', { commands: { setImage } });
    const result = createImageWrapper(
      editor,
      { src: 'https://example.com/img.png', size: { width: 100, height: 100 } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(setImage).not.toHaveBeenCalled();
    return result;
  },
  'images.delete': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesDeleteWrapper(editor, { imageId: 'img-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.move': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesMoveWrapper(
      editor,
      { imageId: 'img-1', to: { kind: 'documentEnd' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.convertToInline': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesConvertToInlineWrapper(editor, { imageId: 'img-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.convertToFloating': () => {
    // Need an inline image for convertToFloating to be non-no-op
    const inlineImageNode = createNode('image', [], {
      attrs: {
        sdImageId: 'img-inline',
        src: 'https://example.com/test.png',
        isAnchor: false,
        wrap: { type: 'Inline' },
        anchorData: null,
        marginOffset: null,
        relativeHeight: null,
        originalAttributes: {},
      },
      isInline: true,
      isLeaf: true,
    });
    const paragraph = createNode('paragraph', [inlineImageNode], {
      attrs: { sdBlockId: 'p-img-inline' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const dispatch = mock();
    const tr = {
      setNodeMarkup: mock().mockReturnThis(),
      setMeta: mock().mockReturnThis(),
      mapping: { map: (pos: number) => pos },
      docChanged: true,
      steps: [{}],
      doc,
    };
    const editor = {
      state: { doc, tr, schema: { nodes: {} } },
      dispatch,
      commands: { setImage: mock(() => true) },
      schema: { marks: {} },
      options: {},
      on: () => {},
    } as unknown as Editor;
    const result = imagesConvertToFloatingWrapper(
      editor,
      { imageId: 'img-inline' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.setSize': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesSetSizeWrapper(
      editor,
      { imageId: 'img-1', size: { width: 220, height: 140 } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.setWrapType': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesSetWrapTypeWrapper(
      editor,
      { imageId: 'img-1', type: 'Tight' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.setWrapSide': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesSetWrapSideWrapper(
      editor,
      { imageId: 'img-1', side: 'left' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.setWrapDistances': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesSetWrapDistancesWrapper(
      editor,
      { imageId: 'img-1', distances: { distTop: 100, distBottom: 100 } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.setPosition': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesSetPositionWrapper(
      editor,
      { imageId: 'img-1', position: { hRelativeFrom: 'page' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.setAnchorOptions': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesSetAnchorOptionsWrapper(
      editor,
      { imageId: 'img-1', options: { behindDoc: true } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.setZOrder': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesSetZOrderWrapper(
      editor,
      { imageId: 'img-1', zOrder: { relativeHeight: 999999999 } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },

  // -------------------------------------------------------------------------
  // Hyperlink operations — dryRun vectors
  // -------------------------------------------------------------------------
  'hyperlinks.wrap': () => {
    const editor = makeHyperlinkEditor({ withLink: false });
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = hyperlinksWrapWrapper(
      editor,
      {
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        link: { destination: { href: 'https://example.com' } },
      },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'hyperlinks.insert': () => {
    const editor = makeHyperlinkEditor({ withLink: false });
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = hyperlinksInsertWrapper(
      editor,
      {
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 0 } },
        text: 'X',
        link: { destination: { href: 'https://example.com' } },
      },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'hyperlinks.patch': () => {
    const editor = makeHyperlinkEditor({ withLink: true, linkAttrs: { href: 'https://example.com' } });
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = hyperlinksPatchWrapper(
      editor,
      {
        target: makeHyperlinkTarget('p1', 0, 5),
        patch: { href: 'https://example.com/updated' },
      },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'hyperlinks.remove': () => {
    const editor = makeHyperlinkEditor({ withLink: true });
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = hyperlinksRemoveWrapper(
      editor,
      { target: makeHyperlinkTarget('p1', 0, 5) },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },

  // -------------------------------------------------------------------------
  // Content control operations — dryRun vectors
  // -------------------------------------------------------------------------
  'contentControls.appendContent': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.appendContent({ target: SDT_TARGET, content: 'appended' }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.checkbox.setState': () => {
    const adapter = createContentControlsAdapter(
      makeSdtEditor({
        controlType: 'checkbox',
        type: 'checkbox',
        sdtPr: { elements: [], 'w14:checkbox': { 'w14:checked': '0' } },
      }),
    );
    return adapter.checkbox.setState({ target: SDT_TARGET, checked: true }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.checkbox.toggle': () => {
    const adapter = createContentControlsAdapter(
      makeSdtEditor({
        controlType: 'checkbox',
        type: 'checkbox',
        sdtPr: { elements: [], 'w14:checkbox': { 'w14:checked': '0' } },
      }),
    );
    return adapter.checkbox.toggle({ target: SDT_TARGET }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.checkbox.setSymbolPair': () => {
    const adapter = createContentControlsAdapter(
      makeSdtEditor({
        controlType: 'checkbox',
        type: 'checkbox',
        sdtPr: { elements: [], 'w14:checkbox': { 'w14:checked': '0' } },
      }),
    );
    return adapter.checkbox.setSymbolPair(
      {
        target: SDT_TARGET,
        checkedSymbol: { font: 'Wingdings', char: '00FE' },
        uncheckedSymbol: { font: 'Wingdings', char: '00A8' },
      },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'contentControls.choiceList.setItems': () => {
    const adapter = createContentControlsAdapter(
      makeSdtEditor({
        controlType: 'comboBox',
        type: 'comboBox',
        sdtPr: { elements: [], 'w:comboBox': { 'w:listItem': [] } },
      }),
    );
    return adapter.choiceList.setItems(
      { target: SDT_TARGET, items: [{ displayText: 'A', value: 'a' }] },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'contentControls.choiceList.setSelected': () => {
    const adapter = createContentControlsAdapter(
      makeSdtEditor({
        controlType: 'comboBox',
        type: 'comboBox',
        sdtPr: { elements: [], 'w:comboBox': { 'w:listItem': [] } },
      }),
    );
    return adapter.choiceList.setSelected({ target: SDT_TARGET, value: 'a' }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.clearBinding': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.clearBinding({ target: SDT_TARGET }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.clearContent': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.clearContent({ target: SDT_TARGET }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.copy': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.copy({ target: SDT_TARGET, destination: SDT_TARGET }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.date.clearValue': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
    return adapter.date.clearValue({ target: SDT_TARGET }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.date.setCalendar': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
    return adapter.date.setCalendar(
      { target: SDT_TARGET, calendar: 'gregorian' },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'contentControls.date.setDisplayFormat': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
    return adapter.date.setDisplayFormat(
      { target: SDT_TARGET, format: 'yyyy-MM-dd' },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'contentControls.date.setDisplayLocale': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
    return adapter.date.setDisplayLocale(
      { target: SDT_TARGET, locale: 'en-US' },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'contentControls.date.setStorageFormat': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
    return adapter.date.setStorageFormat(
      { target: SDT_TARGET, format: 'xsd:dateTime' },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'contentControls.date.setValue': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'date', type: 'date' }));
    return adapter.date.setValue({ target: SDT_TARGET, value: '2024-01-01' }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.delete': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.delete({ target: SDT_TARGET }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.group.ungroup': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'group', type: 'group' }));
    return adapter.group.ungroup({ target: SDT_TARGET }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.group.wrap': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.group.wrap({ target: SDT_TARGET }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.insertAfter': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.insertAfter({ target: SDT_TARGET, content: 'after' }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.insertBefore': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.insertBefore({ target: SDT_TARGET, content: 'before' }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.move': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.move({ target: SDT_TARGET, destination: SDT_TARGET }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.normalizeTagPayload': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.normalizeTagPayload({ target: SDT_TARGET }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.normalizeWordCompatibility': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor({ id: 'not-a-number-id' }));
    return adapter.normalizeWordCompatibility(
      { target: { kind: 'block', nodeType: 'sdt', nodeId: 'not-a-number-id' } },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'contentControls.patch': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.patch({ target: SDT_TARGET, alias: 'New Alias' }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.patchRawProperties': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.patchRawProperties(
      { target: SDT_TARGET, patches: [{ op: 'set', name: 'w:tag', element: { val: 'x' } }] },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'contentControls.prependContent': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.prependContent({ target: SDT_TARGET, content: 'prepended' }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.repeatingSection.cloneItem': () => {
    const adapter = createContentControlsAdapter(makeSdtEditorWithRepeatingSectionItems());
    return adapter.repeatingSection.cloneItem({ target: RS_TARGET, index: 0 }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.repeatingSection.deleteItem': () => {
    const adapter = createContentControlsAdapter(makeSdtEditorWithRepeatingSectionItems());
    return adapter.repeatingSection.deleteItem({ target: RS_TARGET, index: 0 }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.repeatingSection.insertItemAfter': () => {
    const adapter = createContentControlsAdapter(makeSdtEditorWithRepeatingSectionItems());
    return adapter.repeatingSection.insertItemAfter(
      { target: RS_TARGET, index: 0 },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'contentControls.repeatingSection.insertItemBefore': () => {
    const adapter = createContentControlsAdapter(makeSdtEditorWithRepeatingSectionItems());
    return adapter.repeatingSection.insertItemBefore(
      { target: RS_TARGET, index: 0 },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'contentControls.repeatingSection.setAllowInsertDelete': () => {
    const adapter = createContentControlsAdapter(
      makeSdtEditor({ controlType: 'repeatingSection', type: 'repeatingSection' }),
    );
    return adapter.repeatingSection.setAllowInsertDelete(
      { target: SDT_TARGET, allow: true },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'contentControls.replaceContent': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.replaceContent({ target: SDT_TARGET, content: 'replaced' }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.setBinding': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.setBinding(
      { target: SDT_TARGET, storeItemId: 'store-1', xpath: '/root' },
      { changeMode: 'direct', dryRun: true },
    );
  },
  'contentControls.setLockMode': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.setLockMode({ target: SDT_TARGET, lockMode: 'locked' }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.setType': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.setType({ target: SDT_TARGET, controlType: 'date' }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.text.clearValue': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'text', type: 'text' }));
    return adapter.text.clearValue({ target: SDT_TARGET }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.text.setMultiline': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'text', type: 'text' }));
    return adapter.text.setMultiline({ target: SDT_TARGET, multiline: true }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.text.setValue': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor({ controlType: 'text', type: 'text' }));
    return adapter.text.setValue({ target: SDT_TARGET, value: 'hello' }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.unwrap': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.unwrap({ target: SDT_TARGET }, { changeMode: 'direct', dryRun: true });
  },
  'contentControls.wrap': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.wrap({ target: SDT_TARGET, kind: 'block' }, { changeMode: 'direct', dryRun: true });
  },
  'create.contentControl': () => {
    const adapter = createContentControlsAdapter(makeSdtEditor());
    return adapter.create({ kind: 'block' }, { changeMode: 'direct', dryRun: true });
  },

  // -------------------------------------------------------------------------
  // SD-2100: Image geometry, content, semantic & caption — dryRun vectors
  // -------------------------------------------------------------------------
  'images.scale': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesScaleWrapper(
      editor,
      { imageId: 'img-1', factor: 1.5 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.setLockAspectRatio': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesSetLockAspectRatioWrapper(
      editor,
      { imageId: 'img-1', locked: false },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.rotate': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesRotateWrapper(editor, { imageId: 'img-1', angle: 90 }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.flip': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesFlipWrapper(
      editor,
      { imageId: 'img-1', horizontal: true },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.crop': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesCropWrapper(
      editor,
      { imageId: 'img-1', crop: { left: 10, top: 5, right: 10, bottom: 5 } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.resetCrop': () => {
    const editor = makeCaptionImageEditor({
      imageId: 'img-cropped-dr',
      extraAttrs: {
        clipPath: 'inset(5% 10% 5% 10%)',
        rawSrcRect: { l: '10000', t: '5000', r: '10000', b: '5000' },
      },
    });
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesResetCropWrapper(
      editor,
      { imageId: 'img-cropped-dr' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.replaceSource': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesReplaceSourceWrapper(
      editor,
      { imageId: 'img-1', src: 'data:image/png;base64,abc' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.setAltText': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesSetAltTextWrapper(
      editor,
      { imageId: 'img-1', description: 'New alt text' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.setDecorative': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesSetDecorativeWrapper(
      editor,
      { imageId: 'img-1', decorative: true },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.setName': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesSetNameWrapper(
      editor,
      { imageId: 'img-1', name: 'NewName' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.setHyperlink': () => {
    const editor = makeImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesSetHyperlinkWrapper(
      editor,
      { imageId: 'img-1', url: 'https://example.com' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.insertCaption': () => {
    const editor = makeCaptionImageEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesInsertCaptionWrapper(
      editor,
      { imageId: 'img-1', text: 'Caption' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.updateCaption': () => {
    const editor = makeCaptionImageEditor({ withCaption: true, imageId: 'img-cap' });
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesUpdateCaptionWrapper(
      editor,
      { imageId: 'img-cap', text: 'New caption' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'images.removeCaption': () => {
    const editor = makeCaptionImageEditor({ withCaption: true, imageId: 'img-cap' });
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof mock> }).dispatch;
    const result = imagesRemoveCaptionWrapper(editor, { imageId: 'img-cap' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
};

beforeAll(() => {
  registerBuiltInExecutors();
  registerPartDescriptor(numberingPartDescriptor);
  registerPartDescriptor(settingsPartDescriptor);
  registerPartDescriptor(stylesPartDescriptor);
});

afterAll(() => {
  clearPartDescriptors();
  clearInvalidationHandlers();
});

const resetMocks = () => {
  mockedDeps.resolveCommentAnchorsById.mockReset();
  mockedDeps.resolveCommentAnchorsById.mockImplementation(() => []);
  mockedDeps.listCommentAnchors.mockReset();
  mockedDeps.listCommentAnchors.mockImplementation(() => []);
  mockedDeps.getTrackChanges.mockReset();
  mockedDeps.getTrackChanges.mockImplementation(() => []);
  // Reset reference resolver mocks — clears any mockReturnValueOnce residue
  for (const fn of Object.values(refResolverMocks)) {
    fn.mockReset();
  }
  // Restore list-returning defaults
  refResolverMocks.findAllBookmarks.mockImplementation(() => []);
  refResolverMocks.findAllLinks.mockImplementation(() => []);
  refResolverMocks.findAllFootnotes.mockImplementation(() => []);
  refResolverMocks.findAllCrossRefs.mockImplementation(() => []);
  refResolverMocks.findAllIndexNodes.mockImplementation(() => []);
  refResolverMocks.findAllIndexEntries.mockImplementation(() => []);
  refResolverMocks.findAllCaptions.mockImplementation(() => []);
  refResolverMocks.findAllFields.mockImplementation(() => []);
  refResolverMocks.findAllCitations.mockImplementation(() => []);
  refResolverMocks.findAllBibliographies.mockImplementation(() => []);
  refResolverMocks.getSourcesFromConverter.mockImplementation(() => []);
  refResolverMocks.findAllAuthorities.mockImplementation(() => []);
  refResolverMocks.findAllAuthorityEntries.mockImplementation(() => []);
};

beforeEach(() => {
  resetMocks();
});

describe('document-api adapter conformance', () => {
  it('has schema coverage for every operation and mutation policy metadata', () => {
    for (const operationId of OPERATION_IDS) {
      const schema = INTERNAL_SCHEMAS.operations[operationId];
      expect(schema).toBeDefined();
      expect(schema.input).toBeDefined();
      expect(schema.output).toBeDefined();

      if (!COMMAND_CATALOG[operationId].mutates) continue;
      expect(COMMAND_CATALOG[operationId].throws.postApplyForbidden).toBe(true);
      if (!NON_RECEIPT_MUTATION_OPS.has(operationId)) {
        expect(schema.success).toBeDefined();
      }
      // Plan-engine meta-ops (mutations.apply) return PlanReceipt (always success) or throw — no failure schema.
      // Operations with no possibleFailureCodes also have no structured failure path.
      if (
        !PLAN_ENGINE_META_OPS.has(operationId) &&
        !NON_RECEIPT_MUTATION_OPS.has(operationId) &&
        HAS_STRUCTURED_FAILURE_RESULT(operationId)
      ) {
        expect(schema.failure).toBeDefined();
      }
    }
  });

  it('covers every implemented mutating operation with throw/failure/apply vectors', () => {
    const vectorKeys = Object.keys(mutationVectors).sort();
    const expectedKeys = [...MUTATING_OPERATION_IDS]
      .filter((id) => !STUB_TABLE_OPS.has(id) && !PLAN_ENGINE_META_OPS.has(id) && !NON_RECEIPT_MUTATION_OPS.has(id))
      .sort();
    expect(vectorKeys).toEqual(expectedKeys);

    for (const operationId of expectedKeys) {
      const vector = mutationVectors[operationId];
      expect(typeof vector?.throwCase, `${operationId} is missing throwCase`).toBe('function');
      expect(typeof vector?.applyCase, `${operationId} is missing applyCase`).toBe('function');
      if (HAS_STRUCTURED_FAILURE_RESULT(operationId) && !CC_DIRECT_DISPATCH_OPS.has(operationId)) {
        expect(typeof vector?.failureCase, `${operationId} is missing failureCase`).toBe('function');
      }
    }
  });

  it('verifies stub table operations throw CAPABILITY_UNAVAILABLE', () => {
    const stubAdapters: Record<string, (editor: Editor, input: unknown, options?: unknown) => unknown> = {};

    // Verify all stub ops are covered
    expect(Object.keys(stubAdapters).sort()).toEqual([...STUB_TABLE_OPS].sort());

    for (const [operationId, adapter] of Object.entries(stubAdapters)) {
      const editor = makeTableEditor();
      let capturedCode: string | null = null;
      try {
        adapter(editor, {});
      } catch (error) {
        capturedCode = (error as { code?: string }).code ?? null;
      }
      expect(capturedCode, `${operationId} should throw CAPABILITY_UNAVAILABLE`).toBe('CAPABILITY_UNAVAILABLE');
    }
  });

  it('enforces pre-apply throw behavior for every mutating operation', () => {
    const implementedMutatingOps = MUTATING_OPERATION_IDS.filter(
      (id) => !STUB_TABLE_OPS.has(id) && !PLAN_ENGINE_META_OPS.has(id) && !NON_RECEIPT_MUTATION_OPS.has(id),
    );
    for (const operationId of implementedMutatingOps) {
      const vector = mutationVectors[operationId];
      expect(vector, `Missing vector for ${operationId}`).toBeDefined();
      expectThrowCode(operationId, () => vector!.throwCase());
    }
  });

  it('enforces structured non-applied outcomes for every mutating operation', () => {
    const implementedMutatingOps = MUTATING_OPERATION_IDS.filter(
      (id) =>
        !STUB_TABLE_OPS.has(id) &&
        !PLAN_ENGINE_META_OPS.has(id) &&
        !NON_RECEIPT_MUTATION_OPS.has(id) &&
        !CC_DIRECT_DISPATCH_OPS.has(id) &&
        HAS_STRUCTURED_FAILURE_RESULT(id),
    );
    for (const operationId of implementedMutatingOps) {
      const vector = mutationVectors[operationId];
      expect(typeof vector?.failureCase, `${operationId} is missing failureCase`).toBe('function');
      const result = vector!.failureCase!() as { success?: boolean; failure?: { code: string } };
      expect(result.success, `${operationId} failureCase should return success=false`).toBe(false);
      if (result.success !== false || !result.failure) continue;
      expect(COMMAND_CATALOG[operationId].possibleFailureCodes).toContain(result.failure.code);
      assertSchema(operationId, 'output', result);
      assertSchema(operationId, 'failure', result);
    }
  });

  it('enforces no post-apply throws across every mutating operation', () => {
    const implementedMutatingOps = MUTATING_OPERATION_IDS.filter(
      (id) => !STUB_TABLE_OPS.has(id) && !PLAN_ENGINE_META_OPS.has(id) && !NON_RECEIPT_MUTATION_OPS.has(id),
    );
    for (const operationId of implementedMutatingOps) {
      const vector = mutationVectors[operationId]!;
      let result: { success?: boolean };
      try {
        result = vector.applyCase() as { success?: boolean };
      } catch (error) {
        const err = error as Error;
        throw new Error(`${operationId} threw post-apply: ${err.message}\n${err.stack ?? ''}`);
      }
      expect(result.success, `${operationId} should report success on applyCase`).toBe(true);
      assertSchema(operationId, 'output', result);
      assertSchema(operationId, 'success', result);
    }
  });

  it('enforces dryRun non-mutation invariants for every dryRun-capable mutation', () => {
    const expectedDryRunOperations = MUTATING_OPERATION_IDS.filter(
      (operationId) =>
        COMMAND_CATALOG[operationId].supportsDryRun &&
        !STUB_TABLE_OPS.has(operationId) &&
        !PLAN_ENGINE_META_OPS.has(operationId),
    );
    const vectorKeys = Object.keys(dryRunVectors).sort();
    expect(vectorKeys).toEqual([...expectedDryRunOperations].sort());

    for (const operationId of expectedDryRunOperations) {
      const run = dryRunVectors[operationId]!;
      const result = run() as { success?: boolean };
      expect(result.success).toBe(true);
      assertSchema(operationId, 'output', result);
      assertSchema(operationId, 'success', result);
    }
  });

  it('does not advance revision for create.table/tables.* dry-run success paths', () => {
    const tableEditor = makeTableEditor();
    initRevision(tableEditor);
    const tableBefore = getRevision(tableEditor);
    const tableDryRun = tablesDeleteWrapper(tableEditor, { nodeId: 'table-1' }, { changeMode: 'direct', dryRun: true });
    expect(tableDryRun.success).toBe(true);
    expect(getRevision(tableEditor)).toBe(tableBefore);

    const insertTableAt = mock(() => true);
    const { editor: createEditor } = makeTextEditor('Hello', {
      commands: { insertTableAt },
      can: mock(() => ({ insertTableAt: mock(() => true) })),
    } as any);
    initRevision(createEditor);
    const createBefore = getRevision(createEditor);
    const createDryRun = createTableWrapper(
      createEditor,
      { rows: 2, columns: 2 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(createDryRun.success).toBe(true);
    expect(getRevision(createEditor)).toBe(createBefore);
    expect(insertTableAt).not.toHaveBeenCalled();
  });

  it('enforces expectedRevision for table wrappers without mutating revision directly', () => {
    const editor = makeTableEditor();
    initRevision(editor);

    expect(() => {
      tablesDeleteWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', expectedRevision: '999' });
    }).toThrow();
    expect(getRevision(editor)).toBe('0');

    const applied = tablesDeleteWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', expectedRevision: '0' });
    expect(applied.success).toBe(true);
    expect(getRevision(editor)).toBe('0');
  });

  it('keeps capabilities tracked/dryRun flags aligned with static contract metadata', () => {
    const fullCapabilities = getDocumentApiCapabilities(makeTextEditor('Hello').editor);

    for (const operationId of OPERATION_IDS) {
      const metadata = COMMAND_CATALOG[operationId];
      const runtime = fullCapabilities.operations[operationId];

      if (!metadata.supportsTrackedMode) {
        expect(runtime.tracked).toBe(false);
      }

      if (!metadata.supportsDryRun) {
        expect(runtime.dryRun).toBe(false);
      }
    }

    const noTrackedEditor = makeTextEditor('Hello', {
      commands: {
        insertTrackedChange: undefined,
        acceptTrackedChangeById: mock(() => true),
        rejectTrackedChangeById: mock(() => true),
        acceptAllTrackedChanges: mock(() => true),
        rejectAllTrackedChanges: mock(() => true),
      },
    }).editor;
    const noTrackedCapabilities = getDocumentApiCapabilities(noTrackedEditor);
    for (const operationId of OPERATION_IDS) {
      if (!COMMAND_CATALOG[operationId].supportsTrackedMode) continue;
      expect(noTrackedCapabilities.operations[operationId].tracked).toBe(false);
    }
  });

  it('rejects row nodeId combined with rowIndex as over-specified input', () => {
    const editor = makeTableEditor();
    expect(() =>
      tablesInsertRowWrapper(editor, { nodeId: 'row-1', rowIndex: 0, position: 'below' } as any, {
        changeMode: 'direct',
      }),
    ).toThrow(/rowIndex must not be provided when target is a row node/);
  });

  it('returns stable cell ids and mutation-ready addresses from tables.getCells', () => {
    const editor = makeTableEditor();
    const result = tablesGetCellsAdapter(editor, { nodeId: 'table-1' });

    expect(result.nodeId).toBe('table-1');
    expect(result.cells.map((cell) => cell.nodeId)).toEqual(
      expect.arrayContaining(['cell-1', 'cell-2', 'cell-3', 'cell-4']),
    );

    const topLeft = result.cells.find((cell) => cell.rowIndex === 0 && cell.columnIndex === 0);
    expect(topLeft?.nodeId).toBe('cell-1');

    // Each cell address mirrors nodeId and is ready for mutation handoff.
    expect(topLeft?.address).toEqual({ kind: 'block', nodeType: 'tableCell', nodeId: 'cell-1' });

    // All cells carry a well-formed address.
    for (const cell of result.cells) {
      expect(cell.address).toEqual({ kind: 'block', nodeType: 'tableCell', nodeId: cell.nodeId });
    }
  });

  it('reads tables.getProperties from nested tableProperties', () => {
    const editor = makeTableEditor();
    const tableNode = editor.state.doc.nodeAt(0) as unknown as { attrs: Record<string, unknown> };
    tableNode.attrs.tableStyleId = 'stale-style';
    tableNode.attrs.justification = 'left';
    tableNode.attrs.tableLayout = 'autofit';
    tableNode.attrs.tableProperties = {
      tableStyleId: 'fresh-style',
      justification: 'center',
      rightToLeft: true,
      tableWidth: { value: 7200, type: 'dxa' },
      tableLayout: 'fixed',
      tblLook: {
        firstRow: true,
        lastRow: false,
        noHBand: false,
        noVBand: true,
      },
    };

    const result = tablesGetPropertiesAdapter(editor, { nodeId: 'table-1' });

    expect(result).toMatchObject({
      nodeId: 'table-1',
      styleId: 'fresh-style',
      alignment: 'center',
      direction: 'rtl',
      preferredWidth: 7200,
      autoFitMode: 'fixedWidth',
      styleOptions: {
        headerRow: true,
        lastRow: false,
        bandedRows: true,
        bandedColumns: false,
      },
    });
  });

  it('keeps tracked change vectors deterministic for accept/reject coverage', () => {
    const change = {
      mark: {
        type: { name: TrackDeleteMarkName },
        attrs: { id: 'tc-delete-1' },
      },
      from: 3,
      to: 4,
    };
    setTrackChanges([change]);
    const { editor } = makeTextEditor();
    const reject = trackChangesRejectWrapper(editor, { id: requireCanonicalTrackChangeId(editor, 'tc-delete-1') });
    expect(reject.success).toBe(true);
    assertSchema('trackChanges.decide', 'output', reject);
    assertSchema('trackChanges.decide', 'success', reject);
  });

  // ---------------------------------------------------------------------------
  // Layer A gap: Tracked-mode parity tests for tracked-eligible table ops
  // ---------------------------------------------------------------------------

  it('rejects tracked mode for table operations that do not support it', () => {
    const nonTrackedTableOps: OperationId[] = [
      'tables.clearContents',
      'tables.move',
      'tables.setLayout',
      'tables.setAltText',
      'tables.setRowHeight',
      'tables.distributeRows',
      'tables.setRowOptions',
      'tables.setColumnWidth',
      'tables.distributeColumns',
      'tables.convertFromText',
      'tables.split',
      'tables.convertToText',
      'tables.mergeCells',
      'tables.unmergeCells',
      'tables.splitCell',
      'tables.setCellProperties',
      'tables.sort',
      'tables.setStyle',
      'tables.clearStyle',
      'tables.setStyleOption',
      'tables.setBorder',
      'tables.clearBorder',
      'tables.applyBorderPreset',
      'tables.setShading',
      'tables.clearShading',
      'tables.setTablePadding',
      'tables.setCellPadding',
      'tables.setCellSpacing',
      'tables.clearCellSpacing',
      'tables.applyStyle',
      'tables.setBorders',
      'tables.setTableOptions',
      'tables.insertCell',
      'tables.deleteCell',
      'tables.setDefaultStyle',
      'tables.clearDefaultStyle',
    ] as OperationId[];

    for (const opId of nonTrackedTableOps) {
      expect(COMMAND_CATALOG[opId].supportsTrackedMode, `${opId} should not support tracked mode`).toBe(false);
    }
  });

  it('allows tracked mode for table operations that support it', () => {
    const trackedTableOps: OperationId[] = [
      'create.table',
      'tables.delete',
      'tables.insertRow',
      'tables.deleteRow',
      'tables.insertColumn',
      'tables.deleteColumn',
    ] as OperationId[];

    for (const opId of trackedTableOps) {
      expect(COMMAND_CATALOG[opId].supportsTrackedMode, `${opId} should support tracked mode`).toBe(true);
    }
  });

  it('verifies tracked-eligible table ops accept changeMode=tracked without throwing CAPABILITY_UNAVAILABLE', () => {
    // These ops support tracked mode at the contract level and have ensureTrackedCapability in the adapter.
    // The tracked path requires insertTrackedChange command and a user on the editor.
    const editor = makeTableEditor({ insertTrackedChange: mock(() => true) });
    (editor as any).options = { user: { name: 'Agent', email: 'agent@test.com' } };
    initRevision(editor);

    // tables.delete with tracked mode
    const deleteResult = tablesDeleteWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'tracked' });
    expect(deleteResult.success).toBe(true);

    // tables.insertRow with tracked mode
    const insertRowResult = tablesInsertRowWrapper(
      editor,
      { nodeId: 'table-1', rowIndex: 0, position: 'below' } as any,
      { changeMode: 'tracked' },
    );
    expect(insertRowResult.success).toBe(true);

    // tables.deleteRow with tracked mode
    const deleteRowResult = tablesDeleteRowWrapper(editor, { nodeId: 'table-1', rowIndex: 0 } as any, {
      changeMode: 'tracked',
    });
    expect(deleteRowResult.success).toBe(true);

    // tables.insertColumn with tracked mode
    const insertColResult = tablesInsertColumnWrapper(
      editor,
      { nodeId: 'table-1', columnIndex: 0, position: 'right' },
      { changeMode: 'tracked' },
    );
    expect(insertColResult.success).toBe(true);

    // tables.deleteColumn with tracked mode
    const deleteColResult = tablesDeleteColumnWrapper(
      editor,
      { nodeId: 'table-1', columnIndex: 0 },
      { changeMode: 'tracked' },
    );
    expect(deleteColResult.success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // tables.getStyles: returns graceful empty result without converter
  // ---------------------------------------------------------------------------
  it('returns empty styles payload when no converter is available (tables.getStyles)', () => {
    const editor = makeSectionsEditor({ includeConverter: false });
    const result = tablesGetStylesAdapter(editor);
    expect(result).toEqual({
      explicitDefaultStyleId: null,
      effectiveDefaultStyleId: null,
      effectiveDefaultSource: 'none',
      styles: [],
    });
  });

  // ---------------------------------------------------------------------------
  // tables.setDefaultStyle: throws INVALID_INPUT for unknown style id
  // ---------------------------------------------------------------------------
  it('throws INVALID_INPUT when styleId is not a known table style (tables.setDefaultStyle)', () => {
    const editor = makeSectionsEditor();
    const converter = (editor as unknown as { converter: Record<string, unknown> }).converter;
    converter.translatedLinkedStyles = {
      styles: { TableGrid: { type: 'table', name: 'Table Grid' } },
      docDefaults: {},
      latentStyles: {},
    };
    let capturedCode: string | null = null;
    try {
      tablesSetDefaultStyleAdapter(editor, { styleId: 'NonExistentStyle' }, { changeMode: 'direct' });
    } catch (error) {
      capturedCode = (error as { code?: string }).code ?? null;
    }
    expect(capturedCode).toBe('INVALID_INPUT');
  });

  // ---------------------------------------------------------------------------
  // Layer A gap: Wrapper parity — doc.tables.<op> vs mutations.apply
  // These tests verify that table wrappers route through executeCompiledPlan
  // (the same path as mutations.apply), eliminating the Layer A bypass.
  // Each case calls the wrapper AND executePlan with an equivalent raw step,
  // asserting both succeed with effect: 'changed'.
  // ---------------------------------------------------------------------------

  const PARITY_CASES: Array<{
    op: string;
    ref: string;
    args: Record<string, unknown>;
    wrapperFn: (e: Editor) => { success: boolean };
  }> = [
    // Lifecycle
    { op: 'tables.delete', ref: 'table-1', args: {}, wrapperFn: (e) => tablesDeleteWrapper(e, { nodeId: 'table-1' }) },
    {
      op: 'tables.clearContents',
      ref: 'table-1',
      args: {},
      wrapperFn: (e) => tablesClearContentsWrapper(e, { nodeId: 'table-1' }),
    },
    {
      op: 'tables.move',
      ref: 'table-1',
      args: { destination: { kind: 'documentEnd' } },
      wrapperFn: (e) => tablesMoveWrapper(e, { nodeId: 'table-1', destination: { kind: 'documentEnd' } } as any),
    },
    {
      op: 'tables.setLayout',
      ref: 'table-1',
      args: { alignment: 'center' },
      wrapperFn: (e) => tablesSetLayoutWrapper(e, { nodeId: 'table-1', alignment: 'center' } as any),
    },
    {
      op: 'tables.setAltText',
      ref: 'table-1',
      args: { altText: 'test' },
      wrapperFn: (e) => tablesSetAltTextWrapper(e, { nodeId: 'table-1', altText: 'test' } as any),
    },
    // Row ops
    {
      op: 'tables.insertRow',
      ref: 'table-1',
      args: { rowIndex: 0, position: 'below' },
      wrapperFn: (e) => tablesInsertRowWrapper(e, { nodeId: 'table-1', rowIndex: 0, position: 'below' } as any),
    },
    {
      op: 'tables.deleteRow',
      ref: 'table-1',
      args: { rowIndex: 0 },
      wrapperFn: (e) => tablesDeleteRowWrapper(e, { nodeId: 'table-1', rowIndex: 0 } as any),
    },
    {
      op: 'tables.setRowHeight',
      ref: 'table-1',
      args: { rowIndex: 0, heightPt: 20, rule: 'atLeast' },
      wrapperFn: (e) =>
        tablesSetRowHeightWrapper(e, { nodeId: 'table-1', rowIndex: 0, heightPt: 20, rule: 'atLeast' } as any),
    },
    {
      op: 'tables.distributeRows',
      ref: 'table-1',
      args: {},
      wrapperFn: (e) => tablesDistributeRowsWrapper(e, { nodeId: 'table-1' } as any),
    },
    {
      op: 'tables.setRowOptions',
      ref: 'table-1',
      args: { rowIndex: 0, allowBreakAcrossPages: true },
      wrapperFn: (e) =>
        tablesSetRowOptionsWrapper(e, { nodeId: 'table-1', rowIndex: 0, allowBreakAcrossPages: true } as any),
    },
    // Column ops
    {
      op: 'tables.insertColumn',
      ref: 'table-1',
      args: { columnIndex: 0, position: 'right' },
      wrapperFn: (e) => tablesInsertColumnWrapper(e, { nodeId: 'table-1', columnIndex: 0, position: 'right' } as any),
    },
    {
      op: 'tables.deleteColumn',
      ref: 'table-1',
      args: { columnIndex: 0 },
      wrapperFn: (e) => tablesDeleteColumnWrapper(e, { nodeId: 'table-1', columnIndex: 0 } as any),
    },
    {
      op: 'tables.setColumnWidth',
      ref: 'table-1',
      args: { columnIndex: 0, widthPt: 100 },
      wrapperFn: (e) => tablesSetColumnWidthWrapper(e, { nodeId: 'table-1', columnIndex: 0, widthPt: 100 } as any),
    },
    {
      op: 'tables.distributeColumns',
      ref: 'table-1',
      args: {},
      wrapperFn: (e) => tablesDistributeColumnsWrapper(e, { nodeId: 'table-1' } as any),
    },
    // Cell ops
    {
      op: 'tables.insertCell',
      ref: 'cell-1',
      args: { mode: 'shiftRight' },
      wrapperFn: (e) => tablesInsertCellWrapper(e, { nodeId: 'cell-1', mode: 'shiftRight' } as any),
    },
    {
      op: 'tables.deleteCell',
      ref: 'cell-1',
      args: { mode: 'shiftLeft' },
      wrapperFn: (e) => tablesDeleteCellWrapper(e, { nodeId: 'cell-1', mode: 'shiftLeft' } as any),
    },
    {
      op: 'tables.mergeCells',
      ref: 'table-1',
      args: { start: { rowIndex: 0, columnIndex: 0 }, end: { rowIndex: 1, columnIndex: 1 } },
      wrapperFn: (e) =>
        tablesMergeCellsWrapper(e, {
          nodeId: 'table-1',
          start: { rowIndex: 0, columnIndex: 0 },
          end: { rowIndex: 1, columnIndex: 1 },
        } as any),
    },
    {
      op: 'tables.unmergeCells',
      ref: 'cell-1',
      args: {},
      wrapperFn: (e) => tablesUnmergeCellsWrapper(e, { nodeId: 'cell-1' }),
    },
    {
      op: 'tables.splitCell',
      ref: 'cell-1',
      args: { rows: 2, columns: 2 },
      wrapperFn: (e) => tablesSplitCellWrapper(e, { nodeId: 'cell-1', rows: 2, columns: 2 } as any),
    },
    {
      op: 'tables.setCellProperties',
      ref: 'cell-1',
      args: { verticalAlign: 'center' },
      wrapperFn: (e) => tablesSetCellPropertiesWrapper(e, { nodeId: 'cell-1', verticalAlign: 'center' } as any),
    },
    // Sort + conversion
    {
      op: 'tables.sort',
      ref: 'table-1',
      args: { keys: [{ columnIndex: 0, direction: 'ascending', type: 'text' }] },
      wrapperFn: (e) =>
        tablesSortWrapper(e, {
          nodeId: 'table-1',
          keys: [{ columnIndex: 0, direction: 'ascending', type: 'text' }],
        } as any),
    },
    {
      op: 'tables.convertFromText',
      ref: 'p1',
      args: {},
      wrapperFn: (e) => tablesConvertFromTextWrapper(e, { nodeId: 'p1' } as any),
    },
    {
      op: 'tables.split',
      ref: 'table-1',
      args: { rowIndex: 1 },
      wrapperFn: (e) => tablesSplitWrapper(e, { nodeId: 'table-1', rowIndex: 1 } as any),
    },
    {
      op: 'tables.convertToText',
      ref: 'table-1',
      args: {},
      wrapperFn: (e) => tablesConvertToTextWrapper(e, { nodeId: 'table-1' }),
    },
    // Style ops
    {
      op: 'tables.setStyle',
      ref: 'table-1',
      args: { styleId: 'TableGrid' },
      wrapperFn: (e) => tablesSetStyleWrapper(e, { nodeId: 'table-1', styleId: 'TableGrid' } as any),
    },
    {
      op: 'tables.clearStyle',
      ref: 'table-1',
      args: {},
      wrapperFn: (e) => tablesClearStyleWrapper(e, { nodeId: 'table-1' }),
    },
    {
      op: 'tables.setStyleOption',
      ref: 'table-1',
      args: { flag: 'headerRow', enabled: true },
      wrapperFn: (e) => tablesSetStyleOptionWrapper(e, { nodeId: 'table-1', flag: 'headerRow', enabled: true } as any),
    },
    // Border ops
    {
      op: 'tables.setBorder',
      ref: 'table-1',
      args: { edge: 'top', lineStyle: 'single', lineWeightPt: 0.5, color: '000000' },
      wrapperFn: (e) =>
        tablesSetBorderWrapper(e, {
          nodeId: 'table-1',
          edge: 'top',
          lineStyle: 'single',
          lineWeightPt: 0.5,
          color: '000000',
        } as any),
    },
    {
      op: 'tables.clearBorder',
      ref: 'table-1',
      args: { edge: 'top' },
      wrapperFn: (e) => tablesClearBorderWrapper(e, { nodeId: 'table-1', edge: 'top' } as any),
    },
    {
      op: 'tables.applyBorderPreset',
      ref: 'table-1',
      args: { preset: 'box' },
      wrapperFn: (e) => tablesApplyBorderPresetWrapper(e, { nodeId: 'table-1', preset: 'box' } as any),
    },
    // Shading ops
    {
      op: 'tables.setShading',
      ref: 'table-1',
      args: { color: 'FF0000' },
      wrapperFn: (e) => tablesSetShadingWrapper(e, { nodeId: 'table-1', color: 'FF0000' } as any),
    },
    {
      op: 'tables.clearShading',
      ref: 'table-1',
      args: {},
      wrapperFn: (e) => tablesClearShadingWrapper(e, { nodeId: 'table-1' }),
    },
    // Padding + spacing ops
    {
      op: 'tables.setTablePadding',
      ref: 'table-1',
      args: { topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 },
      wrapperFn: (e) =>
        tablesSetTablePaddingWrapper(e, { nodeId: 'table-1', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 } as any),
    },
    {
      op: 'tables.setCellPadding',
      ref: 'cell-1',
      args: { topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 },
      wrapperFn: (e) =>
        tablesSetCellPaddingWrapper(e, { nodeId: 'cell-1', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 } as any),
    },
    {
      op: 'tables.setCellSpacing',
      ref: 'table-1',
      args: { spacingPt: 2 },
      wrapperFn: (e) => tablesSetCellSpacingWrapper(e, { nodeId: 'table-1', spacingPt: 2 } as any),
    },
    {
      op: 'tables.clearCellSpacing',
      ref: 'table-1',
      args: {},
      wrapperFn: (e) => tablesClearCellSpacingWrapper(e, { nodeId: 'table-1' }),
    },
    // Note: tables.applyStyle, tables.setBorders, tables.setTableOptions are
    // intentionally excluded from parity tests — they are not yet in the
    // step-op catalog and do not support mutations.apply (SD-2129 scope).
    // create.table (ref is a dummy target — executor ignores targets for create ops)
    {
      op: 'create.table',
      ref: 'p1',
      args: { rows: 2, columns: 2 },
      wrapperFn: (e) => createTableWrapper(e, { rows: 2, columns: 2 }),
    },
  ];

  it.each(PARITY_CASES)(
    'wrapper parity: $op via wrapper matches mutations.apply path',
    ({ op, ref, args, wrapperFn }) => {
      // 1. Wrapper path — calls executeCompiledPlan with _handler closure
      const wrapperEditor = makeTableEditor();
      const wrapperResult = wrapperFn(wrapperEditor);
      expect(wrapperResult.success, `${op} wrapper should succeed`).toBe(true);

      // 2. mutations.apply path — raw step without _handler, executor dispatches via adapter map
      const applyEditor = makeTableEditor();
      const receipt = executePlan(applyEditor, {
        expectedRevision: '0',
        atomic: true,
        changeMode: 'direct',
        steps: [
          {
            id: 'parity-step-1',
            op,
            where: { by: 'ref' as const, ref, require: 'exactlyOne' as const },
            args,
          },
        ],
      } as any);

      expect(receipt.success, `${op} mutations.apply should succeed`).toBe(true);
      expect(receipt.steps.length, `${op} should have step outcomes`).toBeGreaterThan(0);
      expect(receipt.steps[0].effect, `${op} outcome should be 'changed'`).toBe('changed');
    },
  );

  // -------------------------------------------------------------------------
  // Location semantics — coverage for create.image at / images.move to
  // -------------------------------------------------------------------------

  describe('image location semantics', () => {
    /** Editor with two paragraphs to make before/after positions meaningful. */
    function makeMultiBlockImageEditor() {
      const imageNode = createNode('image', [], {
        attrs: {
          sdImageId: 'img-1',
          src: 'https://example.com/test.png',
          isAnchor: true,
          wrap: { type: 'Square', attrs: { wrapText: 'bothSides' } },
          anchorData: { hRelativeFrom: 'column', vRelativeFrom: 'paragraph' },
          marginOffset: null,
          relativeHeight: 251658240,
          originalAttributes: {},
          size: { width: 100, height: 100 },
        },
        isInline: true,
        isLeaf: true,
      });
      // p1: pos=0, nodeSize=3 (1 inline image + 2 wrapper)
      const p1 = createNode('paragraph', [imageNode], {
        attrs: { sdBlockId: 'p-img' },
        isBlock: true,
        inlineContent: true,
      });
      const textNode = createNode('text', [], { text: 'Hello' });
      // p2: pos=3, nodeSize=7 (5 text chars + 2 wrapper)
      const p2 = createNode('paragraph', [textNode], {
        attrs: { sdBlockId: 'p-text' },
        isBlock: true,
        inlineContent: true,
      });
      const doc = createNode('doc', [p1, p2], { isBlock: false });
      // doc.content.size = 10

      const dispatch = mock();
      const tr = {
        insertText: mock().mockReturnThis(),
        delete: mock().mockReturnThis(),
        insert: mock().mockReturnThis(),
        setNodeMarkup: mock().mockReturnThis(),
        replaceWith: mock().mockReturnThis(),
        setMeta: mock().mockReturnThis(),
        mapping: { map: (pos: number) => pos },
        docChanged: true,
        steps: [{}],
        doc,
      };

      return {
        state: {
          doc,
          tr,
          schema: {
            nodes: {
              image: {
                create: mock((attrs: Record<string, unknown>) =>
                  createNode('image', [], { attrs, isInline: true, isLeaf: true }),
                ),
              },
            },
          },
        },
        dispatch,
        commands: {
          setImage: mock(() => true),
          insertContentAt: mock(() => true),
        },
        schema: { marks: {} },
        options: {},
        on: () => {},
      } as unknown as Editor;
    }

    it('create.image with at: documentStart uses insertContentAt at position 0', () => {
      const editor = makeMultiBlockImageEditor();
      const result = createImageWrapper(
        editor,
        { src: 'https://example.com/new.png', size: { width: 100, height: 100 }, at: { kind: 'documentStart' } },
        { changeMode: 'direct' },
      );
      expect(result.success).toBe(true);
      expect((editor.commands as any).insertContentAt).toHaveBeenCalledWith(
        0,
        expect.objectContaining({ type: 'image' }),
      );
      expect((editor.commands as any).setImage).not.toHaveBeenCalled();
    });

    it('create.image with at: documentEnd uses insertContentAt at content size', () => {
      const editor = makeMultiBlockImageEditor();
      const result = createImageWrapper(
        editor,
        { src: 'https://example.com/new.png', size: { width: 100, height: 100 }, at: { kind: 'documentEnd' } },
        { changeMode: 'direct' },
      );
      expect(result.success).toBe(true);
      expect((editor.commands as any).insertContentAt).toHaveBeenCalledWith(
        10, // doc.content.size
        expect.objectContaining({ type: 'image' }),
      );
      expect((editor.commands as any).setImage).not.toHaveBeenCalled();
    });

    it('create.image with at: before resolves block insertion position', () => {
      const editor = makeMultiBlockImageEditor();
      const result = createImageWrapper(
        editor,
        {
          src: 'https://example.com/new.png',
          size: { width: 100, height: 100 },
          at: { kind: 'before', target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p-text' } },
        },
        { changeMode: 'direct' },
      );
      expect(result.success).toBe(true);
      expect((editor.commands as any).insertContentAt).toHaveBeenCalledWith(
        3, // p-text starts at pos 3
        expect.objectContaining({ type: 'image' }),
      );
    });

    it('create.image with at: after resolves block end position', () => {
      const editor = makeMultiBlockImageEditor();
      const result = createImageWrapper(
        editor,
        {
          src: 'https://example.com/new.png',
          size: { width: 100, height: 100 },
          at: { kind: 'after', target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p-img' } },
        },
        { changeMode: 'direct' },
      );
      expect(result.success).toBe(true);
      expect((editor.commands as any).insertContentAt).toHaveBeenCalledWith(
        3, // p-img ends at pos 3 (pos=0 + nodeSize=3)
        expect.objectContaining({ type: 'image' }),
      );
    });

    it('create.image with at: inParagraph resolves inline offset position', () => {
      const editor = makeMultiBlockImageEditor();
      const result = createImageWrapper(
        editor,
        {
          src: 'https://example.com/new.png',
          size: { width: 100, height: 100 },
          at: { kind: 'inParagraph', target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p-text' }, offset: 2 },
        },
        { changeMode: 'direct' },
      );
      expect(result.success).toBe(true);
      // p-text starts at pos 3, +1 enters inline content, +2 offset = 6
      expect((editor.commands as any).insertContentAt).toHaveBeenCalledWith(
        6,
        expect.objectContaining({ type: 'image' }),
      );
    });

    it('create.image without at uses setImage (selection-based)', () => {
      const editor = makeMultiBlockImageEditor();
      const result = createImageWrapper(
        editor,
        { src: 'https://example.com/new.png', size: { width: 100, height: 100 } },
        { changeMode: 'direct' },
      );
      expect(result.success).toBe(true);
      expect((editor.commands as any).setImage).toHaveBeenCalled();
      expect((editor.commands as any).insertContentAt).not.toHaveBeenCalled();
    });

    it('images.move with to: documentStart inserts at position 0', () => {
      const editor = makeMultiBlockImageEditor();
      const result = imagesMoveWrapper(
        editor,
        { imageId: 'img-1', to: { kind: 'documentStart' } },
        { changeMode: 'direct' },
      );
      expect(result.success).toBe(true);
      const tr = (editor.state as unknown as { tr: { insert: ReturnType<typeof mock> } }).tr;
      expect(tr.insert).toHaveBeenCalledWith(0, expect.anything());
    });

    it('images.move with to: before resolves block position', () => {
      const editor = makeMultiBlockImageEditor();
      const result = imagesMoveWrapper(
        editor,
        {
          imageId: 'img-1',
          to: { kind: 'before', target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p-text' } },
        },
        { changeMode: 'direct' },
      );
      expect(result.success).toBe(true);
      const tr = (editor.state as unknown as { tr: { insert: ReturnType<typeof mock> } }).tr;
      // p-text starts at pos 3, mapping.map(3) → 3
      expect(tr.insert).toHaveBeenCalledWith(3, expect.anything());
    });

    it('images.move with to: after resolves block end position', () => {
      const editor = makeMultiBlockImageEditor();
      const result = imagesMoveWrapper(
        editor,
        { imageId: 'img-1', to: { kind: 'after', target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p-text' } } },
        { changeMode: 'direct' },
      );
      expect(result.success).toBe(true);
      const tr = (editor.state as unknown as { tr: { insert: ReturnType<typeof mock> } }).tr;
      // p-text ends at pos 10, mapping.map(10) → 10
      expect(tr.insert).toHaveBeenCalledWith(10, expect.anything());
    });
  });

  // -------------------------------------------------------------------------
  // Image dimension resolution & unique drawing ID
  // -------------------------------------------------------------------------

  describe('image dimension resolution', () => {
    /** Minimal 1x1 PNG as data URI (valid IHDR with width=1, height=1). */
    function makePngDataUri(width: number, height: number): string {
      // Build a minimal PNG header with the given width/height in IHDR
      const buf = new ArrayBuffer(33);
      const view = new DataView(buf);
      const bytes = new Uint8Array(buf);
      bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG signature
      view.setUint32(8, 13); // IHDR length
      bytes.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR tag
      view.setInt32(16, width);
      view.setInt32(20, height);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return `data:image/png;base64,${btoa(binary)}`;
    }

    it('create.image resolves dimensions from a data URI when size is omitted', () => {
      const editor = makeImageEditor();
      const pngUri = makePngDataUri(200, 150);
      const result = createImageWrapper(editor, { src: pngUri }, { changeMode: 'direct' });
      expect(result.success).toBe(true);
      // The setImage command should have been called with resolved size
      const setImage = (editor.commands as any).setImage;
      const attrs = setImage.mock.calls[0]?.[0];
      expect(attrs.size).toEqual({ width: 200, height: 150 });
    });

    it('create.image returns INVALID_INPUT when URL src has no size', () => {
      const editor = makeImageEditor();
      const result = createImageWrapper(editor, { src: 'https://example.com/image.png' }, { changeMode: 'direct' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failure.code).toBe('INVALID_INPUT');
      }
    });

    it('create.image returns INVALID_INPUT for data URI with unsupported format', () => {
      const editor = makeImageEditor();
      // A data URI that doesn't match any known image format
      const badUri = `data:application/octet-stream;base64,${btoa('not a real image')}`;
      const result = createImageWrapper(editor, { src: badUri }, { changeMode: 'direct' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failure.code).toBe('INVALID_INPUT');
      }
    });

    it('create.image assigns a unique drawing ID (attrs.id)', () => {
      const editor = makeImageEditor();
      const result = createImageWrapper(
        editor,
        { src: 'https://example.com/img.png', size: { width: 100, height: 100 } },
        { changeMode: 'direct' },
      );
      expect(result.success).toBe(true);
      const setImage = (editor.commands as any).setImage;
      const attrs = setImage.mock.calls[0]?.[0];
      // id should be a non-empty string (numeric string from generateUniqueDocPrId)
      expect(attrs.id).toBeDefined();
      expect(typeof attrs.id).toBe('string');
      expect(attrs.id.length).toBeGreaterThan(0);
    });
  });
});
