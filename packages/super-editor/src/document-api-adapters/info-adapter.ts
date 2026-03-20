import type {
  DocumentDefaults,
  DocumentInfo,
  DocumentStyleInfo,
  DocumentStyles,
  FindOutput,
  InfoInput,
  NodeInfo,
} from '@superdoc/document-api';
import type { Editor } from '../core/Editor.js';
import { HEADING_STYLE_PATTERN } from '../core/helpers/findNearbyMarks.js';
import { findLegacyAdapter } from './find-adapter.js';
import { getRevision } from './plan-engine/revision-tracker.js';
import { getLiveDocumentCounts } from './helpers/live-document-counts.js';

type HeadingNodeInfo = Extract<NodeInfo, { nodeType: 'heading' }>;

function clampHeadingLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  const rounded = Math.floor(value);
  if (rounded < 1) return 1;
  if (rounded > 6) return 6;
  return rounded;
}

function isHeadingNodeInfo(node: NodeInfo | undefined): node is HeadingNodeInfo {
  return node?.kind === 'block' && node.nodeType === 'heading';
}

function getHeadingText(node: HeadingNodeInfo | undefined): string {
  if (!node) return '';
  if (typeof node.text === 'string' && node.text.length > 0) return node.text;
  if (typeof node.summary?.text === 'string' && node.summary.text.length > 0) return node.summary.text;
  return '';
}

function buildOutline(result: FindOutput): DocumentInfo['outline'] {
  const outline: DocumentInfo['outline'] = [];

  for (const item of result.items) {
    if (item.address.kind !== 'block') continue;

    const maybeHeading = isHeadingNodeInfo(item.node) ? item.node : undefined;
    outline.push({
      level: clampHeadingLevel(maybeHeading?.properties.headingLevel),
      text: getHeadingText(maybeHeading),
      nodeId: item.address.nodeId,
    });
  }

  return outline;
}

/**
 * Extract fontFamily and fontSize from a paragraph's first text run marks.
 */
function extractTextFormatting(node: import('prosemirror-model').Node): { fontFamily?: string; fontSize?: number } {
  let fontFamily: string | undefined;
  let fontSize: number | undefined;

  // Extract from the first text node that has marks. Stop after one text node
  // to get consistent "first run" formatting rather than mixed properties.
  node.descendants((child) => {
    if (fontFamily !== undefined || fontSize !== undefined) return false;
    if (!child.isText || child.marks.length === 0) return;
    for (const mark of child.marks) {
      const attrs = mark.attrs as Record<string, unknown>;
      if (typeof attrs.fontFamily === 'string' && attrs.fontFamily) {
        fontFamily = attrs.fontFamily;
      }
      if (attrs.fontSize != null) {
        const raw = typeof attrs.fontSize === 'string' ? parseFloat(attrs.fontSize) : attrs.fontSize;
        if (typeof raw === 'number' && Number.isFinite(raw)) fontSize = raw;
      }
    }
    return false; // always stop after first text node with marks
  });

  return { fontFamily, fontSize };
}

/**
 * Scan the document for paragraph styles with their formatting,
 * and detect the document's default body text formatting.
 */
function collectDocumentStyles(editor: Editor): { styles: DocumentStyles; defaults: DocumentDefaults } {
  const headingPattern = HEADING_STYLE_PATTERN;

  // Per-style data
  const styleData = new Map<string, { count: number; fontFamily?: string; fontSize?: number }>();

  // Global font/size frequency for defaults detection
  const fontCounts = new Map<string, number>();
  const sizeCounts = new Map<number, number>();

  editor.state.doc.descendants((node) => {
    if (node.type.name !== 'paragraph') return;

    const props = node.attrs.paragraphProperties as { styleId?: string } | undefined;
    const sid = props?.styleId;
    const isHeading = sid ? headingPattern.test(sid) : false;

    // Extract formatting from first text run
    const fmt = extractTextFormatting(node);

    // Track per-style
    if (sid) {
      const existing = styleData.get(sid);
      if (existing) {
        existing.count++;
        if (!existing.fontFamily && fmt.fontFamily) existing.fontFamily = fmt.fontFamily;
        if (existing.fontSize === undefined && fmt.fontSize !== undefined) existing.fontSize = fmt.fontSize;
      } else {
        styleData.set(sid, { count: 1, fontFamily: fmt.fontFamily, fontSize: fmt.fontSize });
      }
    }

    // Track body text fonts for defaults (skip headings)
    if (!isHeading) {
      if (fmt.fontFamily) {
        fontCounts.set(fmt.fontFamily, (fontCounts.get(fmt.fontFamily) ?? 0) + 1);
      }
      if (fmt.fontSize !== undefined) {
        sizeCounts.set(fmt.fontSize, (sizeCounts.get(fmt.fontSize) ?? 0) + 1);
      }
    }
  });

  // Build style list sorted by frequency
  const paragraphStyles: DocumentStyleInfo[] = Array.from(styleData.entries())
    .map(([styleId, data]) => ({
      styleId,
      count: data.count,
      ...(data.fontFamily ? { fontFamily: data.fontFamily } : {}),
      ...(data.fontSize !== undefined ? { fontSize: data.fontSize } : {}),
    }))
    .sort((a, b) => b.count - a.count);

  // Detect defaults from most common body text formatting
  let defaultFont: string | undefined;
  let defaultSize: number | undefined;

  let maxFontCount = 0;
  for (const [font, count] of fontCounts) {
    if (count > maxFontCount) {
      defaultFont = font;
      maxFontCount = count;
    }
  }

  let maxSizeCount = 0;
  for (const [size, count] of sizeCounts) {
    if (count > maxSizeCount) {
      defaultSize = size;
      maxSizeCount = count;
    }
  }

  // Default style is the most common non-heading style, or 'Normal'
  const bodyStyles = paragraphStyles.filter((s) => !headingPattern.test(s.styleId));
  const defaultStyle = bodyStyles.length > 0 ? bodyStyles[0].styleId : 'Normal';

  const defaults: DocumentDefaults = {
    ...(defaultFont ? { fontFamily: defaultFont } : {}),
    ...(defaultSize !== undefined ? { fontSize: defaultSize } : {}),
    styleId: defaultStyle,
  };

  return { styles: { paragraphStyles }, defaults };
}

/**
 * Build `doc.info` payload from live document counts, heading outline,
 * and style inventory.
 *
 * Counts are derived from the centralized live-document-counts helper.
 * Outline generation still uses the heading find query (needs NodeInfo data
 * for text and level that the block index does not provide).
 */
export function infoAdapter(editor: Editor, _input: InfoInput): DocumentInfo {
  const counts = getLiveDocumentCounts(editor);

  const headingResult = findLegacyAdapter(editor, {
    select: { type: 'node', nodeType: 'heading' },
    includeNodes: true,
  });

  const { styles, defaults } = collectDocumentStyles(editor);

  return {
    counts,
    outline: buildOutline(headingResult),
    capabilities: {
      canFind: true,
      canGetNode: true,
      canComment: true,
      canReplace: true,
    },
    revision: getRevision(editor),
    styles,
    defaults,
  };
}
