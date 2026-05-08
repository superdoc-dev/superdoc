import type { EditorState } from 'prosemirror-state';
import type { FlowBlock, Run as LayoutRun, TextRun } from '@superdoc/contracts';
import { toFlowBlocks } from '@superdoc/pm-adapter';
import type { ConverterContext } from '@superdoc/pm-adapter/converter-context.js';
import { SUBSCRIPT_SUPERSCRIPT_SCALE } from '@superdoc/pm-adapter/constants.js';

import type { ProseMirrorJSON } from '../../types/EditorTypes.js';
import { findNoteEntryById } from '../../../document-api-adapters/helpers/note-entry-lookup.js';
import { normalizeNotePmJson } from '../../../document-api-adapters/helpers/note-pm-json.js';
import { buildStoryKey } from '../../../document-api-adapters/story-runtime/story-key.js';
import type { NoteRenderOverride } from './FootnotesBuilder.js';

export type EndnoteConverterLike = {
  endnotes?: Array<{ id?: unknown; content?: unknown[] }>;
};

type ParagraphBlock = FlowBlock & {
  kind: 'paragraph';
  runs?: LayoutRun[];
};

const ENDNOTE_MARKER_DATA_ATTR = 'data-sd-endnote-number';
const DEFAULT_MARKER_FONT_FAMILY = 'Arial';
const DEFAULT_MARKER_FONT_SIZE = 12;

export function buildEndnoteBlocks(
  editorState: EditorState | null | undefined,
  converter: EndnoteConverterLike | null | undefined,
  converterContext: ConverterContext | undefined,
  themeColors: unknown,
  renderOverride: NoteRenderOverride | null = null,
): FlowBlock[] {
  if (!editorState) return [];

  const endnoteNumberById = converterContext?.endnoteNumberById;
  const importedEndnotes = Array.isArray(converter?.endnotes) ? converter.endnotes : [];
  if (importedEndnotes.length === 0) return [];

  const orderedEndnoteIds: string[] = [];
  const seen = new Set<string>();

  editorState.doc.descendants((node) => {
    if (node.type?.name !== 'endnoteReference') return;
    const id = node.attrs?.id;
    if (id == null) return;
    const key = String(id);
    if (!key || seen.has(key)) return;
    seen.add(key);
    orderedEndnoteIds.push(key);
  });

  if (orderedEndnoteIds.length === 0) return [];

  const blocks: FlowBlock[] = [];

  orderedEndnoteIds.forEach((id) => {
    try {
      const endnoteDoc = resolveEndnoteDocJson(id, importedEndnotes, renderOverride);
      if (!endnoteDoc) return;

      const result = toFlowBlocks(endnoteDoc, {
        blockIdPrefix: `endnote-${id}-`,
        storyKey: buildStoryKey({ kind: 'story', storyType: 'endnote', noteId: id }),
        enableRichHyperlinks: true,
        themeColors: themeColors as never,
        converterContext: converterContext as never,
      });

      if (result?.blocks?.length) {
        ensureEndnoteMarker(result.blocks, id, endnoteNumberById);
        blocks.push(...result.blocks);
      }
    } catch {}
  });

  return blocks;
}

function isTextRun(run: LayoutRun): run is TextRun {
  return (run.kind === 'text' || run.kind == null) && typeof (run as { text?: unknown }).text === 'string';
}

function isEndnoteMarker(run: LayoutRun): boolean {
  return isTextRun(run) && Boolean(run.dataAttrs?.[ENDNOTE_MARKER_DATA_ATTR]);
}

function resolveDisplayNumber(id: string, endnoteNumberById: Record<string, number> | undefined): number {
  if (!endnoteNumberById || typeof endnoteNumberById !== 'object') return 1;
  const num = endnoteNumberById[id];
  if (typeof num === 'number' && Number.isFinite(num) && num > 0) return num;
  return 1;
}

function resolveMarkerFontFamily(firstTextRun: TextRun | undefined): string {
  return typeof firstTextRun?.fontFamily === 'string' ? firstTextRun.fontFamily : DEFAULT_MARKER_FONT_FAMILY;
}

function resolveMarkerBaseFontSize(firstTextRun: TextRun | undefined): number {
  if (
    typeof firstTextRun?.fontSize === 'number' &&
    Number.isFinite(firstTextRun.fontSize) &&
    firstTextRun.fontSize > 0
  ) {
    return firstTextRun.fontSize;
  }

  return DEFAULT_MARKER_FONT_SIZE;
}

function buildMarkerRun(markerText: string, firstTextRun: TextRun | undefined): TextRun {
  const markerRun: TextRun = {
    kind: 'text',
    text: markerText,
    dataAttrs: { [ENDNOTE_MARKER_DATA_ATTR]: 'true' },
    fontFamily: resolveMarkerFontFamily(firstTextRun),
    fontSize: resolveMarkerBaseFontSize(firstTextRun) * SUBSCRIPT_SUPERSCRIPT_SCALE,
    vertAlign: 'superscript',
  };

  if (typeof firstTextRun?.bold === 'boolean') markerRun.bold = firstTextRun.bold;
  if (typeof firstTextRun?.italic === 'boolean') markerRun.italic = firstTextRun.italic;
  if (typeof firstTextRun?.letterSpacing === 'number' && Number.isFinite(firstTextRun.letterSpacing)) {
    markerRun.letterSpacing = firstTextRun.letterSpacing;
  }
  if (firstTextRun?.color != null) markerRun.color = firstTextRun.color;

  return markerRun;
}

function syncMarkerRun(target: TextRun, source: TextRun): void {
  target.kind = source.kind;
  target.text = source.text;
  target.dataAttrs = source.dataAttrs;
  target.fontFamily = source.fontFamily;
  target.fontSize = source.fontSize;
  target.bold = source.bold;
  target.italic = source.italic;
  target.letterSpacing = source.letterSpacing;
  target.color = source.color;
  target.vertAlign = source.vertAlign;
  target.baselineShift = source.baselineShift;
  delete target.pmStart;
  delete target.pmEnd;
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneNoteContentJson(content: unknown[]): ProseMirrorJSON[] {
  return cloneJsonValue(content) as ProseMirrorJSON[];
}

function resolveEndnoteDocJson(
  id: string,
  importedEndnotes: Array<{ id?: unknown; content?: unknown[] }>,
  renderOverride: NoteRenderOverride | null,
): ProseMirrorJSON | null {
  if (renderOverride && renderOverride.noteId === id) {
    return normalizeNotePmJson(cloneJsonValue(renderOverride.docJson));
  }

  const entry = findNoteEntryById(importedEndnotes, id);
  const content = entry?.content;
  if (!Array.isArray(content) || content.length === 0) {
    return null;
  }

  return normalizeNotePmJson({
    type: 'doc',
    content: cloneNoteContentJson(content),
  });
}

function ensureEndnoteMarker(
  blocks: FlowBlock[],
  id: string,
  endnoteNumberById: Record<string, number> | undefined,
): void {
  const firstParagraph = blocks.find((block): block is ParagraphBlock => block.kind === 'paragraph');
  if (!firstParagraph) return;

  const runs = Array.isArray(firstParagraph.runs) ? firstParagraph.runs : [];
  firstParagraph.runs = runs;

  const firstTextRun = runs.find(
    (run): run is TextRun => isTextRun(run) && !isEndnoteMarker(run) && run.text.length > 0,
  );
  const markerRun = buildMarkerRun(String(resolveDisplayNumber(id, endnoteNumberById)), firstTextRun);

  if (runs[0] && isTextRun(runs[0]) && isEndnoteMarker(runs[0])) {
    syncMarkerRun(runs[0], markerRun);
    return;
  }

  runs.unshift(markerRun);
}
