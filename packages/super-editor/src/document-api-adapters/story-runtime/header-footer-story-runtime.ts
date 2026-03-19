/**
 * Header/footer story runtime resolution.
 *
 * Resolves headerFooterSlot and headerFooterPart locators to a StoryRuntime
 * by creating a headless story editor from the converter's cached PM JSON.
 */

import type { HeaderFooterSlotStoryLocator, HeaderFooterPartStoryLocator } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type { StoryRuntime } from './story-types.js';
import { buildStoryKey } from './story-key.js';
import { createStoryEditor } from '../../core/story-editor-factory.js';
import { DocumentApiAdapterError } from '../errors.js';
import { resolveSectionProjections, type SectionProjection } from '../helpers/sections-resolver.js';
import { readTargetSectPr } from '../helpers/section-projection-access.js';
import {
  ensureSectPrElement,
  readSectPrHeaderFooterRefs,
  setSectPrHeaderFooterRef,
  type XmlElement,
} from '../helpers/sections-xml.js';
import { resolveEffectiveRef } from '../helpers/header-footer-refs-mutation.js';
import { createHeaderFooterPart } from '../helpers/header-footer-parts.js';
import { applySectPrToProjection } from '../helpers/section-mutation-wrapper.js';
import { exportSubEditorToPart } from '../../core/parts/adapters/header-footer-sync.js';

// ---------------------------------------------------------------------------
// Converter shape (minimal interface for type safety)
// ---------------------------------------------------------------------------

interface ConverterForStoryRuntime {
  headers?: Record<string, unknown>;
  footers?: Record<string, unknown>;
  headerEditors?: Array<{ id: string; editor: Editor }>;
  footerEditors?: Array<{ id: string; editor: Editor }>;
}

function getConverter(editor: Editor): ConverterForStoryRuntime | undefined {
  return (editor as unknown as { converter?: ConverterForStoryRuntime }).converter;
}

// ---------------------------------------------------------------------------
// Slot resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a headerFooterSlot locator to a StoryRuntime.
 *
 * Resolution strategy:
 * 1. Find the target section's sectPr and read its header/footer references
 * 2. For 'effective' resolution, walk backward through sections if no explicit ref
 * 3. Check for a live sub-editor in the converter's headerEditors/footerEditors
 * 4. Fall back to creating a headless story editor from the converter's PM JSON cache
 *
 * The `resolution` field controls whether to follow inheritance:
 * - 'effective' (default): follow section chain to find the effective content
 * - 'explicit': only match explicitly defined slots
 */
export function resolveHeaderFooterSlotRuntime(
  hostEditor: Editor,
  locator: HeaderFooterSlotStoryLocator,
): StoryRuntime {
  const storyKey = buildStoryKey(locator);
  const converter = getConverter(hostEditor);

  if (!converter) {
    throw new DocumentApiAdapterError(
      'STORY_NOT_FOUND',
      `Cannot resolve header/footer slot: no converter available on the editor.`,
      { storyKey },
    );
  }

  const resolution = locator.resolution ?? 'effective';
  const { headerFooterKind, variant } = locator;

  // Resolve section projections and find the target section
  const sections = resolveSectionProjections(hostEditor);
  const projection = sections.find((s) => s.sectionId === locator.section.sectionId);

  if (!projection) {
    throw new DocumentApiAdapterError('STORY_NOT_FOUND', `Section "${locator.section.sectionId}" not found.`, {
      storyKey,
    });
  }

  // Read the section's sectPr to find the explicit header/footer reference
  const sectPr = readTargetSectPr(hostEditor, projection) ?? undefined;
  const refs = sectPr ? readSectPrHeaderFooterRefs(sectPr, headerFooterKind) : undefined;
  const explicitRefId = refs?.[variant] ?? null;

  let effectiveRefId: string | null = explicitRefId;

  if (!explicitRefId) {
    if (resolution === 'explicit') {
      throw new DocumentApiAdapterError(
        'STORY_NOT_FOUND',
        `No explicit ${headerFooterKind} (${variant}) defined for section "${locator.section.sectionId}".`,
        { storyKey, resolution },
      );
    }

    // For 'effective' resolution, walk the section chain backward
    const resolved = resolveEffectiveRef(
      hostEditor,
      sections,
      projection.range.sectionIndex,
      headerFooterKind,
      variant,
    );
    effectiveRefId = resolved?.refId ?? null;
  }

  if (!effectiveRefId) {
    throw new DocumentApiAdapterError(
      'STORY_NOT_FOUND',
      `No ${headerFooterKind} (${variant}) found for section "${locator.section.sectionId}".`,
      { storyKey },
    );
  }

  // Track whether the slot is inherited — used by the commit callback
  // to decide whether materialization is needed on write.
  const isInherited = explicitRefId === null;
  const onWrite = locator.onWrite ?? 'materializeIfInherited';

  // For 'error' mode, reject inherited slots immediately (even on reads)
  // since the caller explicitly requires an explicit slot.
  if (isInherited && onWrite === 'error') {
    throw new DocumentApiAdapterError(
      'PRECONDITION_FAILED',
      `Slot is inherited and onWrite is 'error'. Section "${locator.section.sectionId}" has no explicit ${headerFooterKind} (${variant}).`,
      { storyKey },
    );
  }

  const collection = headerFooterKind === 'header' ? 'headers' : 'footers';

  // When the slot is inherited and onWrite will materialize, we must NOT
  // reuse the live editor for the inherited part — edits would leak into
  // the source section's content before the new local part is created.
  // Instead, always create an isolated headless editor from the PM JSON
  // snapshot so mutations stay local to this runtime.
  if (isInherited && onWrite === 'materializeIfInherited') {
    const pmJson = converter[collection]?.[effectiveRefId];
    if (!pmJson || typeof pmJson !== 'object') {
      throw new DocumentApiAdapterError(
        'STORY_NOT_FOUND',
        `No cached content for ${headerFooterKind} "${effectiveRefId}".`,
        { storyKey, refId: effectiveRefId },
      );
    }

    const isolatedEditor = createStoryEditor(hostEditor, pmJson as Record<string, unknown>, {
      documentId: `${effectiveRefId}:materialization-pending`,
      isHeaderOrFooter: true,
      headless: true,
    });

    return {
      locator,
      storyKey,
      editor: isolatedEditor,
      kind: 'headerFooter',
      dispose: () => isolatedEditor.destroy(),
      commit: buildSlotCommit(hostEditor, locator, isolatedEditor, effectiveRefId, isInherited, onWrite),
    };
  }

  // Non-inherited slot or editResolvedPart — safe to reuse the live editor
  // since writes target the correct explicit part directly.
  const liveEditor = findLiveSubEditor(converter, collection, effectiveRefId);
  if (liveEditor) {
    return {
      locator,
      storyKey,
      editor: liveEditor,
      kind: 'headerFooter',
      commit: buildSlotCommit(hostEditor, locator, liveEditor, effectiveRefId, isInherited, onWrite),
    };
  }

  // Fall back to cached PM JSON (keyed by refId)
  const pmJson = converter[collection]?.[effectiveRefId];
  if (!pmJson || typeof pmJson !== 'object') {
    throw new DocumentApiAdapterError(
      'STORY_NOT_FOUND',
      `No cached content for ${headerFooterKind} "${effectiveRefId}".`,
      { storyKey, refId: effectiveRefId },
    );
  }

  const storyEditor = createStoryEditor(hostEditor, pmJson as Record<string, unknown>, {
    documentId: effectiveRefId,
    isHeaderOrFooter: true,
    headless: true,
  });

  return {
    locator,
    storyKey,
    editor: storyEditor,
    kind: 'headerFooter',
    dispose: () => storyEditor.destroy(),
    commit: buildSlotCommit(hostEditor, locator, storyEditor, effectiveRefId, isInherited, onWrite),
  };
}

/**
 * Builds a commit callback for a slot-resolved runtime.
 *
 * For explicit (non-inherited) slots and `editResolvedPart` mode, commit
 * writes directly to the effective part.
 *
 * For inherited slots with `materializeIfInherited`, commit first clones
 * the inherited part into a new local part, updates the section's sectPr,
 * then exports the editor content to the new part. This ensures reads
 * never cause materialization — only actual writes trigger it.
 *
 * **Important**: Section projection and sectPr are re-resolved at commit
 * time (not captured at resolution time) because body edits between
 * resolution and commit can shift paragraph positions, making captured
 * coordinates stale.
 */
function buildSlotCommit(
  _hostEditor: Editor,
  locator: HeaderFooterSlotStoryLocator,
  storyEditor: Editor,
  inheritedRefId: string,
  isInherited: boolean,
  onWrite: 'materializeIfInherited' | 'editResolvedPart' | 'error',
): (hostEditor: Editor) => void {
  const { headerFooterKind, variant, section } = locator;

  return (hostEditor: Editor) => {
    let targetRefId = inheritedRefId;

    if (isInherited && onWrite === 'materializeIfInherited') {
      // Re-resolve section state at commit time so we write to the
      // correct position even if body edits shifted paragraphs.
      const freshSections = resolveSectionProjections(hostEditor);
      const freshProjection = freshSections.find((s) => s.sectionId === section.sectionId);
      if (!freshProjection) {
        throw new DocumentApiAdapterError(
          'MATERIALIZATION_FAILED',
          `Section "${section.sectionId}" no longer found at commit time.`,
          { sectionId: section.sectionId },
        );
      }
      const freshSectPr = readTargetSectPr(hostEditor, freshProjection) ?? undefined;

      // Clone inherited part into a new local part
      const materialized = createHeaderFooterPart(hostEditor, {
        kind: headerFooterKind,
        variant,
        sourceRefId: inheritedRefId,
      });

      // Update the section's sectPr to reference the new part
      const nextSectPr = ensureSectPrElement(freshSectPr);
      setSectPrHeaderFooterRef(nextSectPr, headerFooterKind, variant, materialized.refId);
      applySectPrToProjection(hostEditor, freshProjection, nextSectPr);

      targetRefId = materialized.refId;
    }

    exportAndSyncCache(hostEditor, storyEditor, targetRefId, headerFooterKind);
  };
}

// ---------------------------------------------------------------------------
// Part resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a headerFooterPart locator to a StoryRuntime.
 *
 * Direct part targeting — bypasses section-level resolution.
 * The refId is a relationship ID (e.g., 'rId7') that maps to a header/footer
 * part. We look it up directly in the converter's headers/footers cache,
 * which is keyed by refId.
 */
export function resolveHeaderFooterPartRuntime(
  hostEditor: Editor,
  locator: HeaderFooterPartStoryLocator,
): StoryRuntime {
  const storyKey = buildStoryKey(locator);
  const converter = getConverter(hostEditor);

  if (!converter) {
    throw new DocumentApiAdapterError('STORY_NOT_FOUND', `Cannot resolve header/footer part: no converter available.`, {
      storyKey,
    });
  }

  // Look up directly by refId in both header and footer collections
  const pmJson = findPmJsonByRefId(converter, locator.refId);
  if (!pmJson) {
    throw new DocumentApiAdapterError('STORY_NOT_FOUND', `No header/footer part found for refId "${locator.refId}".`, {
      storyKey,
      refId: locator.refId,
    });
  }

  // Determine whether this refId refers to a header or footer part
  const hfType: 'header' | 'footer' = converter.headers?.[locator.refId] ? 'header' : 'footer';

  // Check for a live sub-editor first
  const liveEditor =
    findLiveSubEditor(converter, 'headers', locator.refId) ?? findLiveSubEditor(converter, 'footers', locator.refId);

  if (liveEditor) {
    return {
      locator,
      storyKey,
      editor: liveEditor,
      kind: 'headerFooter',
      commit: (hostEditor: Editor) => {
        exportAndSyncCache(hostEditor, liveEditor, locator.refId, hfType);
      },
    };
  }

  const storyEditor = createStoryEditor(hostEditor, pmJson, {
    documentId: locator.refId,
    isHeaderOrFooter: true,
    headless: true,
  });

  return {
    locator,
    storyKey,
    editor: storyEditor,
    kind: 'headerFooter',
    dispose: () => storyEditor.destroy(),
    commit: (hostEditor: Editor) => {
      exportAndSyncCache(hostEditor, storyEditor, locator.refId, hfType);
    },
  };
}

// ---------------------------------------------------------------------------
// Commit helpers
// ---------------------------------------------------------------------------

/**
 * Exports a story editor's content to the OOXML part and syncs the
 * converter's PM JSON cache.
 *
 * The OOXML write goes through `exportSubEditorToPart` → `mutatePart`.
 * The PM cache update is needed because the part descriptor's afterCommit
 * hook skips re-import for `SOURCE_HEADER_FOOTER_LOCAL` (it assumes the
 * UI blur path already refreshed the cache). The headless document-api
 * path bypasses that handler, so we must update the cache explicitly.
 */
function exportAndSyncCache(hostEditor: Editor, subEditor: Editor, refId: string, hfType: 'header' | 'footer'): void {
  exportSubEditorToPart(hostEditor, subEditor, refId, hfType);

  const conv = getConverter(hostEditor);
  if (!conv) return;

  const pmJson =
    typeof subEditor.getUpdatedJson === 'function'
      ? subEditor.getUpdatedJson()
      : (subEditor as unknown as { getJSON?: () => unknown }).getJSON?.();
  if (!pmJson) return;

  const cacheKey = hfType === 'header' ? 'headers' : 'footers';
  if (conv[cacheKey]) {
    (conv[cacheKey] as Record<string, unknown>)[refId] = pmJson;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find a live sub-editor by refId.
 *
 * The converter's headerEditors/footerEditors arrays store entries as
 * `{ id: string, editor: Editor }` where `id` is the relationship ID (refId).
 */
function findLiveSubEditor(
  converter: ConverterForStoryRuntime,
  collection: 'headers' | 'footers',
  refId: string,
): Editor | null {
  const editorsList = collection === 'headers' ? converter.headerEditors : converter.footerEditors;
  if (!Array.isArray(editorsList)) return null;

  const entry = editorsList.find((item: { id: string; editor: Editor }) => item.id === refId);
  return entry?.editor ?? null;
}

/**
 * Look up PM JSON by refId in both header and footer collections.
 *
 * The converter stores PM JSON keyed by relationship ID (e.g., 'rId7')
 * in `converter.headers` and `converter.footers`.
 */
function findPmJsonByRefId(converter: ConverterForStoryRuntime, refId: string): Record<string, unknown> | null {
  // Search headers
  if (converter.headers) {
    const pmJson = converter.headers[refId];
    if (pmJson && typeof pmJson === 'object') return pmJson as Record<string, unknown>;
  }
  // Search footers
  if (converter.footers) {
    const pmJson = converter.footers[refId];
    if (pmJson && typeof pmJson === 'object') return pmJson as Record<string, unknown>;
  }
  return null;
}
