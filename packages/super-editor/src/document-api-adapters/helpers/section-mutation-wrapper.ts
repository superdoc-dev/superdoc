import type { SectionAddress, SectionMutationResult, MutationOptions } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { DocumentApiAdapterError } from '../errors.js';
import { applyDirectMutationMeta } from './transaction-meta.js';
import { checkRevision } from '../plan-engine/revision-tracker.js';
import { clearIndexCache } from './index-cache.js';
import { rejectTrackedMode } from './mutation-helpers.js';
import { resolveSectionProjections, getBodySectPrFromEditor, type SectionProjection } from './sections-resolver.js';
import {
  ensureSectPrElement,
  cloneXmlElement,
  readSectPrMargins,
  readSectPrPageSetup,
  type XmlElement,
} from './sections-xml.js';
import { readTargetSectPr } from './section-projection-access.js';

function toSectionFailure(
  code: 'NO_OP' | 'INVALID_TARGET' | 'CAPABILITY_UNAVAILABLE',
  message: string,
): SectionMutationResult {
  return { success: false, failure: { code, message } };
}

function toSectionSuccess(section: SectionAddress): SectionMutationResult {
  return { success: true, section };
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

  const savedBodyNode = converter.savedTagsToRestore?.find(
    (entry: Record<string, unknown>) => entry?.name === 'w:body',
  );
  if (savedBodyNode && Array.isArray(savedBodyNode.elements)) {
    const preservedChildren = savedBodyNode.elements.filter(
      (entry: Record<string, unknown>) => entry?.name !== 'w:sectPr',
    );
    preservedChildren.push(cloneXmlElement(sectPr) as unknown as Record<string, unknown>);
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

interface ConverterLike {
  bodySectPr?: unknown;
  savedTagsToRestore?: Array<Record<string, unknown>>;
  pageStyles?: {
    pageSize?: { width?: number; height?: number };
    pageMargins?: Record<string, number | undefined>;
  };
}

function getConverter(editor: Editor): ConverterLike | undefined {
  return (editor as unknown as { converter?: ConverterLike }).converter;
}

export function applySectPrToProjection(editor: Editor, projection: SectionProjection, sectPr: XmlElement): void {
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

/**
 * Generic sectPr mutation wrapper.
 * Handles: tracked mode rejection, revision check, dry-run, NO_OP detection,
 * applying changes to editor state, clearing index cache.
 */
export function sectionMutationBySectPr<TInput extends { target: SectionAddress }>(
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

export { toSectionFailure, toSectionSuccess };
