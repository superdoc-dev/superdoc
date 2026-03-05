import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { FlowBlock, Measure, SectionMetadata } from '@superdoc/contracts';
import type { ConverterContext } from '@superdoc/pm-adapter';
import { readSettingsRoot, readDefaultTableStyle } from '../../../document-api-adapters/document-settings.js';
import { getAtomNodeTypes as getAtomNodeTypesFromSchema } from '../utils/SchemaNodeTypes.js';
import { buildPositionMapFromPmDoc } from '../utils/PositionMapFromPm.js';

/**
 * Computes footnote numbering by first appearance in the document.
 * Returns the numbering map and the ordered list of footnote IDs (for cache invalidation).
 */
export function computeFootnoteNumbering(doc: ProseMirrorNode | null | undefined): {
  footnoteNumberById: Record<string, number>;
  footnoteOrder: string[];
} {
  const footnoteNumberById: Record<string, number> = {};
  const footnoteOrder: string[] = [];
  if (!doc?.descendants) return { footnoteNumberById, footnoteOrder };

  try {
    const seen = new Set<string>();
    let counter = 1;
    doc.descendants((node: ProseMirrorNode) => {
      if (node?.type?.name !== 'footnoteReference') return;
      const rawId = (node?.attrs as { id?: unknown })?.id;
      if (rawId == null) return;
      const key = String(rawId);
      if (!key || seen.has(key)) return;
      seen.add(key);
      footnoteNumberById[key] = counter;
      footnoteOrder.push(key);
      counter += 1;
    });
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[PresentationEditor] Failed to compute footnote numbering:', e);
    }
  }

  return { footnoteNumberById, footnoteOrder };
}

/**
 * Builds the converter context needed for toFlowBlocks from the editor's converter.
 */
export function buildConverterContext(
  converter: Record<string, unknown> | null | undefined,
  footnoteNumberById: Record<string, number>,
): ConverterContext | undefined {
  if (!converter) return undefined;

  let defaultTableStyleId: string | undefined;
  const settingsRoot = readSettingsRoot(converter);
  if (settingsRoot) {
    defaultTableStyleId = readDefaultTableStyle(settingsRoot) ?? undefined;
  }

  return {
    docx: converter.convertedXml,
    ...(Object.keys(footnoteNumberById).length ? { footnoteNumberById } : {}),
    translatedLinkedStyles: converter.translatedLinkedStyles,
    translatedNumbering: converter.translatedNumbering,
    ...(defaultTableStyleId ? { defaultTableStyleId } : {}),
  } as ConverterContext;
}

/**
 * Collects header/footer blocks and measures from layout results and per-rId layouts.
 */
export function collectHeaderFooterBlocks(
  headerLayouts: Array<{ blocks: FlowBlock[]; measures: Measure[] }> | undefined,
  footerLayouts: Array<{ blocks: FlowBlock[]; measures: Measure[] }> | undefined,
  headerLayoutsByRId: Map<string, { blocks: FlowBlock[]; measures: Measure[] }> | undefined,
  footerLayoutsByRId: Map<string, { blocks: FlowBlock[]; measures: Measure[] }> | undefined,
  extraBlocks?: FlowBlock[],
  extraMeasures?: Measure[],
): {
  headerBlocks: FlowBlock[];
  headerMeasures: Measure[];
  footerBlocks: FlowBlock[];
  footerMeasures: Measure[];
} {
  const headerBlocks: FlowBlock[] = [];
  const headerMeasures: Measure[] = [];
  if (headerLayouts) {
    for (const result of headerLayouts) {
      headerBlocks.push(...result.blocks);
      headerMeasures.push(...result.measures);
    }
  }
  if (headerLayoutsByRId) {
    for (const result of headerLayoutsByRId.values()) {
      headerBlocks.push(...result.blocks);
      headerMeasures.push(...result.measures);
    }
  }

  const footerBlocks: FlowBlock[] = [];
  const footerMeasures: Measure[] = [];
  if (footerLayouts) {
    for (const result of footerLayouts) {
      footerBlocks.push(...result.blocks);
      footerMeasures.push(...result.measures);
    }
  }
  if (footerLayoutsByRId) {
    for (const result of footerLayoutsByRId.values()) {
      footerBlocks.push(...result.blocks);
      footerMeasures.push(...result.measures);
    }
  }

  if (extraBlocks && extraMeasures && extraBlocks.length === extraMeasures.length && extraBlocks.length > 0) {
    footerBlocks.push(...extraBlocks);
    footerMeasures.push(...extraMeasures);
  }

  return { headerBlocks, headerMeasures, footerBlocks, footerMeasures };
}

/**
 * Builds the blockId → pageNumber map for TOC page-number resolution.
 */
export function buildTocPageMap(layout: {
  pages: Array<{ number: number; fragments: Array<{ blockId: string }> }>;
}): Map<string, number> {
  const pageMap = new Map<string, number>();
  for (const page of layout.pages) {
    for (const fragment of page.fragments) {
      if (!pageMap.has(fragment.blockId)) {
        pageMap.set(fragment.blockId, page.number);
      }
    }
  }
  return pageMap;
}
