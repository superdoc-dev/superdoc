import type { DocumentInfo, InfoInput, NodeInfo, NodeType, QueryResult } from '@superdoc/document-api';
import type { Editor } from '../core/Editor.js';
import { findAdapter } from './find-adapter.js';
import { getTextAdapter } from './get-text-adapter.js';

type HeadingNodeInfo = Extract<NodeInfo, { nodeType: 'heading' }>;
type CommentNodeInfo = Extract<NodeInfo, { nodeType: 'comment' }>;

function countWords(text: string): number {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

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

function isCommentNodeInfo(node: NodeInfo | undefined): node is CommentNodeInfo {
  return node?.kind === 'inline' && node.nodeType === 'comment';
}

function getHeadingText(node: HeadingNodeInfo | undefined): string {
  if (!node) return '';
  if (typeof node.text === 'string' && node.text.length > 0) return node.text;
  if (typeof node.summary?.text === 'string' && node.summary.text.length > 0) return node.summary.text;
  return '';
}

function buildOutline(result: QueryResult): DocumentInfo['outline'] {
  const outline: DocumentInfo['outline'] = [];

  for (const [index, match] of result.matches.entries()) {
    if (match.kind !== 'block') continue;

    const maybeHeading = isHeadingNodeInfo(result.nodes?.[index]) ? result.nodes[index] : undefined;
    outline.push({
      level: clampHeadingLevel(maybeHeading?.properties.headingLevel),
      text: getHeadingText(maybeHeading),
      nodeId: match.nodeId,
    });
  }

  return outline;
}

function countDistinctCommentIds(result: QueryResult): number {
  const commentIds = new Set<string>();
  for (const node of result.nodes ?? []) {
    if (!isCommentNodeInfo(node)) continue;
    if (typeof node.properties.commentId !== 'string' || node.properties.commentId.length === 0) continue;
    commentIds.add(node.properties.commentId);
  }

  // When node data is available, deduplicate by commentId. Otherwise fall
  // back to the query total (e.g. when includeNodes was not requested).
  if (commentIds.size > 0) {
    return commentIds.size;
  }
  return result.total;
}

function findByNodeType(editor: Editor, nodeType: NodeType, includeNodes = false): QueryResult {
  return findAdapter(editor, {
    select: { type: 'node', nodeType },
    includeNodes,
  });
}

/**
 * Build `doc.info` payload from engine-backed find/getText adapters.
 *
 * This keeps `document-api` engine-agnostic while centralizing composition
 * logic in the super-editor adapter layer.
 */
export function infoAdapter(editor: Editor, _input: InfoInput): DocumentInfo {
  const text = getTextAdapter(editor, {});
  const paragraphResult = findByNodeType(editor, 'paragraph');
  const headingResult = findByNodeType(editor, 'heading', true);
  const tableResult = findByNodeType(editor, 'table');
  const imageResult = findByNodeType(editor, 'image');
  const commentResult = findByNodeType(editor, 'comment', true);

  return {
    counts: {
      words: countWords(text),
      paragraphs: paragraphResult.total,
      headings: headingResult.total,
      tables: tableResult.total,
      images: imageResult.total,
      comments: countDistinctCommentIds(commentResult),
    },
    outline: buildOutline(headingResult),
    capabilities: {
      canFind: true,
      canGetNode: true,
      canComment: true,
      canReplace: true,
    },
  };
}
