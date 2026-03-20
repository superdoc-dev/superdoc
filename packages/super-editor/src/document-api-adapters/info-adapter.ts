import type { DocumentInfo, FindOutput, InfoInput, NodeInfo } from '@superdoc/document-api';
import type { Editor } from '../core/Editor.js';
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
 * Build `doc.info` payload from live document counts and heading outline.
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
  };
}
