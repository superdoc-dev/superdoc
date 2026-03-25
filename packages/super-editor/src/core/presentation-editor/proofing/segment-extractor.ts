/**
 * Segment Extractor
 *
 * Walks the ProseMirror document and produces proofing segments —
 * one per paragraph-like unit — with offset maps back to PM positions.
 *
 * This is the platform's single source of truth for proofing text.
 * Providers never inspect the document model directly.
 */

import type { Node as PmNode } from 'prosemirror-model';
import type { ProofingSegment, OffsetSlice, SegmentOffsetMap } from './types.js';
import { resolveSegmentLanguage } from './language-resolution.js';

// =============================================================================
// Public API
// =============================================================================

export type ExtractionResult = {
  segments: ProofingSegment[];
  offsetMaps: Map<string, SegmentOffsetMap>;
  /** Maps segment ID to its paragraph start position (for dirty-range matching). */
  segmentPositions: Map<string, number>;
};

/** Optional resolver that maps a PM position to a page index. */
export type PageResolver = (pmPos: number) => number | undefined;

/**
 * Extract segments with their offset maps (used by the session manager
 * for PM-range resolution).
 *
 * @param pageResolver - Optional function that maps a PM position to a
 *   page index. When provided, segments are tagged with `metadata.pageIndex`
 *   so visible-first scheduling can prioritize mounted pages.
 */
export function extractSegmentsWithMaps(
  doc: PmNode,
  defaultLanguage?: string | null,
  pageResolver?: PageResolver,
): ExtractionResult {
  const segments: ProofingSegment[] = [];
  const offsetMaps = new Map<string, SegmentOffsetMap>();
  const segmentPositions = new Map<string, number>();

  walkParagraphs(doc, (paraNode, paraPos, surface) => {
    const { text, slices } = extractParagraphText(paraNode, paraPos);
    if (text.length === 0) return;

    const segmentId = buildSegmentId(paraNode, paraPos);
    const language = resolveSegmentLanguage(paraNode, defaultLanguage ?? null);
    const pageIndex = pageResolver?.(paraPos);

    segments.push({
      id: segmentId,
      text,
      language,
      metadata: {
        blockId: (paraNode.attrs as Record<string, unknown>).sdBlockId as string | undefined,
        pageIndex,
        surface,
      },
    });

    offsetMaps.set(segmentId, { segmentId, slices });
    segmentPositions.set(segmentId, paraPos);
  });

  return { segments, offsetMaps, segmentPositions };
}

// =============================================================================
// Internal: Document Walking
// =============================================================================

type ParagraphVisitor = (paraNode: PmNode, paraPos: number, surface: ProofingSegment['metadata']['surface']) => void;

/**
 * Walk all proofable paragraph-like nodes in document order.
 * Includes body paragraphs and table-cell paragraphs.
 * Excludes header/footer content (v1).
 */
function walkParagraphs(doc: PmNode, visitor: ParagraphVisitor): void {
  doc.descendants((node, pos) => {
    // Skip header/footer nodes if they exist at document level
    const typeName = node.type.name;
    if (typeName === 'header' || typeName === 'footer') {
      return false; // Skip descendants
    }

    if (typeName === 'paragraph') {
      // Determine surface: is this inside a table cell?
      const surface = isInsideTableCell(doc, pos) ? ('table-cell' as const) : ('body' as const);
      visitor(node, pos, surface);
      return false; // Don't recurse into paragraph children (we handle them in extractParagraphText)
    }

    return true; // Continue walking
  });
}

/**
 * Check if a position is inside a table cell by walking up the resolved path.
 */
function isInsideTableCell(doc: PmNode, pos: number): boolean {
  const resolved = doc.resolve(pos);
  for (let depth = resolved.depth; depth > 0; depth--) {
    const ancestor = resolved.node(depth);
    if (ancestor.type.name === 'tableCell' || ancestor.type.name === 'tableHeader') {
      return true;
    }
  }
  return false;
}

// =============================================================================
// Internal: Paragraph Text Extraction
// =============================================================================

type TextExtractionResult = {
  text: string;
  slices: OffsetSlice[];
};

/**
 * Extract plain text and offset slices from a paragraph node.
 *
 * Rules:
 * - noProof runs → emit space (word boundary) with no PM mapping
 * - Deleted tracked-change runs → skip entirely
 * - Hidden (vanish) runs → skip entirely
 * - Field annotations, equations, images → emit space (word boundary)
 * - Inline non-text nodes → emit space (word boundary)
 * - Normal text runs → emit text with PM mapping
 */
function extractParagraphText(paraNode: PmNode, paraPos: number): TextExtractionResult {
  const parts: string[] = [];
  const slices: OffsetSlice[] = [];
  let textOffset = 0;

  // Content starts after the paragraph's opening tag
  const contentStart = paraPos + 1;

  paraNode.forEach((child, offset) => {
    const childPos = contentStart + offset;
    processNode(child, childPos);
  });

  return { text: parts.join(''), slices };

  function processNode(node: PmNode, pos: number): void {
    const typeName = node.type.name;

    // Run node: check properties and recurse into children
    if (typeName === 'run') {
      const runProps = (node.attrs as Record<string, unknown>).runProperties as Record<string, unknown> | null;

      // Skip hidden text
      if (runProps?.vanish === true) {
        emitBoundary();
        return;
      }

      // noProof runs: emit boundary (word separator) but don't extract text
      if (runProps?.noProof === true) {
        emitBoundary();
        return;
      }

      // Process run children
      const runContentStart = pos + 1;
      node.forEach((child, childOff) => {
        processNode(child, runContentStart + childOff);
      });
      return;
    }

    // Text node
    if (node.isText && node.text) {
      // Check for tracked deletion mark — exclude deleted text
      if (hasTrackDeleteMark(node)) return;

      const text = node.text;
      const pmFrom = pos;
      const pmTo = pos + text.length;

      slices.push({
        textStart: textOffset,
        textEnd: textOffset + text.length,
        pmFrom,
        pmTo,
      });

      parts.push(text);
      textOffset += text.length;
      return;
    }

    // Non-text inline nodes: emit word boundary
    if (isNonTextInlineNode(typeName)) {
      emitBoundary();
      return;
    }

    // For any other node with children, recurse
    if (node.childCount > 0) {
      const contentStart = pos + 1;
      node.forEach((child, childOff) => {
        processNode(child, contentStart + childOff);
      });
    }
  }

  /** Emit a space as a word boundary (unmapped — no PM positions). */
  function emitBoundary(): void {
    // Only emit if last char wasn't already a boundary
    if (parts.length > 0 && !parts[parts.length - 1].endsWith(' ')) {
      parts.push(' ');
      textOffset += 1;
    }
  }
}

// =============================================================================
// Internal: Helpers
// =============================================================================

/** Check if a text node has a trackDelete mark. */
function hasTrackDeleteMark(node: PmNode): boolean {
  return node.marks?.some((m) => m.type.name === 'trackDelete') ?? false;
}

/** Inline node types that are not proofable text but act as word boundaries. */
const NON_TEXT_INLINE_NODES = new Set([
  'fieldAnnotation',
  'image',
  'equation',
  'hardBreak',
  'lineBreak',
  'tab',
  'footnoteReference',
  'symbol',
]);

function isNonTextInlineNode(typeName: string): boolean {
  return NON_TEXT_INLINE_NODES.has(typeName);
}

/**
 * Build a stable segment ID for a paragraph.
 * Prefers sdBlockId (a UUID assigned by BlockNodePlugin that survives
 * position shifts from edits to other paragraphs). Falls back to
 * position-based IDs for paragraphs that don't have one yet (e.g.,
 * freshly split paragraphs before the plugin runs).
 */
function buildSegmentId(paraNode: PmNode, paraPos: number): string {
  const blockId = (paraNode.attrs as Record<string, unknown>).sdBlockId as string | undefined;
  return blockId ? `blk-${blockId}` : `pos-${paraPos}`;
}
