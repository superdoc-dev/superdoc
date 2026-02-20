import type { TextRun } from '@superdoc/contracts';
import { type InlineConverterParams } from './common';
import { getNodeInstruction } from '../../sdt/index.js';
import type { PMNode, PMMark } from '../../types.js';
import { textNodeToRun } from './text-run.js';
import { type RunProperties, resolveRunProperties } from '@superdoc/style-engine/ooxml';

export function pageReferenceNodeToBlock(params: InlineConverterParams): TextRun | void {
  const { node, inheritedMarks, visitNode, sdtMetadata, positions, converterContext, paragraphProperties } = params;
  // Create pageReference token run for dynamic resolution
  const instruction = getNodeInstruction(node) || '';
  const nodeAttrs =
    typeof node.attrs === 'object' && node.attrs !== null ? (node.attrs as Record<string, unknown>) : {};
  const refMarks = Array.isArray(nodeAttrs.marksAsAttrs) ? (nodeAttrs.marksAsAttrs as PMMark[]) : [];
  const mergedMarks = [...refMarks, ...(inheritedMarks ?? [])];

  // Extract bookmark ID from instruction, handling optional quotes
  // Examples: "PAGEREF _Toc123 \h" or "PAGEREF "_Toc123" \h"
  const bookmarkMatch = instruction.match(/PAGEREF\s+"?([^"\s\\]+)"?/i);
  const bookmarkId = bookmarkMatch ? bookmarkMatch[1] : '';

  // If we have a bookmark ID, create a token run for dynamic resolution
  let runProperties: RunProperties = {};
  if (bookmarkId) {
    // Check if there's materialized content (pre-baked page number from Word)
    let fallbackText = '??'; // Default placeholder if resolution fails
    if (Array.isArray(node.content) && node.content.length > 0) {
      // Extract text from children as fallback
      const extractText = (n: PMNode): string => {
        if (n.type === 'run') {
          runProperties = n.attrs?.runProperties ?? {};
        }
        if (n.type === 'text' && n.text) return n.text;
        if (Array.isArray(n.content)) {
          return n.content.map(extractText).join('');
        }
        return '';
      };
      fallbackText = node.content.map(extractText).join('').trim() || '??';
    }

    // Create token run with pageReference metadata
    // Get PM positions from the parent pageReference node (not the synthetic text node)
    const pageRefPos = positions.get(node);

    const resolvedRunProperties = resolveRunProperties(
      converterContext,
      runProperties,
      paragraphProperties,
      null,
      false,
      false,
    );
    const tokenRun = textNodeToRun({
      ...params,
      node: { type: 'text', text: fallbackText } as PMNode,
      inheritedMarks: mergedMarks,
      runProperties: resolvedRunProperties,
    });

    // Copy PM positions from parent pageReference node
    if (pageRefPos) {
      (tokenRun as TextRun).pmStart = pageRefPos.start;
      (tokenRun as TextRun).pmEnd = pageRefPos.end;
    }
    (tokenRun as TextRun).token = 'pageReference';
    (tokenRun as TextRun).pageRefMetadata = {
      bookmarkId,
      instruction,
    };
    if (sdtMetadata) {
      tokenRun.sdt = sdtMetadata;
    }
    return tokenRun;
  } else if (Array.isArray(node.content)) {
    // No bookmark found, fall back to treating as transparent container
    node.content.forEach((child) => visitNode(child, mergedMarks, sdtMetadata, runProperties));
  }
}
