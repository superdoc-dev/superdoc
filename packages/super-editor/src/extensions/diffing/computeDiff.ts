import type { Node as PMNode, Schema } from 'prosemirror-model';
import type { NumberingProperties, StylesDocumentProperties } from '@superdoc/style-engine/ooxml';
import { diffComments, type CommentInput, type CommentDiff } from './algorithm/comment-diffing';
import { diffNodes, normalizeNodes, type NodeDiff } from './algorithm/generic-diffing';
import { diffStyles, type StylesDiff } from './algorithm/styles-diffing';
import { diffNumbering, type NumberingDiff } from './algorithm/numbering-diffing';

/**
 * Result payload for document diffing.
 */
export interface DiffResult {
  /** Diffs computed from the ProseMirror document structure. */
  docDiffs: NodeDiff[];
  /** Diffs computed from comment content and metadata. */
  commentDiffs: CommentDiff[];
  /** Diffs computed from OOXML styles metadata. */
  stylesDiff: StylesDiff | null;
  /** Diffs computed from OOXML numbering metadata. */
  numberingDiff: NumberingDiff | null;
}

/**
 * Computes structural diffs between two ProseMirror documents, emitting insert/delete/modify operations for any block
 * node (paragraphs, images, tables, etc.). Paragraph mutations include inline text and inline-node diffs so consumers
 * can reflect character-level and formatting changes as well.
 *
 * Diffs are intended to be replayed on top of the old document in reverse order: `pos` marks the cursor location
 * that should be used before applying the diff at that index. For example, consecutive additions that sit between the
 * same pair of old nodes will share the same `pos`, so applying them from the end of the list guarantees they appear
 * in the correct order in the reconstructed document.
 *
 * @param oldPmDoc The previous ProseMirror document.
 * @param newPmDoc The updated ProseMirror document.
 * @param schema The schema used to interpret document nodes.
 * @param oldComments Comment list from the old document.
 * @param newComments Comment list from the new document.
 * @param oldStyles OOXML style snapshot from the old document.
 * @param newStyles OOXML style snapshot from the new document.
 * @param oldNumbering OOXML numbering snapshot from the old document.
 * @param newNumbering OOXML numbering snapshot from the new document.
 * @returns Object containing document, comment, style, and numbering diffs.
 */
export function computeDiff(
  oldPmDoc: PMNode,
  newPmDoc: PMNode,
  schema: Schema,
  oldComments: CommentInput[] = [],
  newComments: CommentInput[] = [],
  oldStyles: StylesDocumentProperties | null | undefined = null,
  newStyles: StylesDocumentProperties | null | undefined = null,
  oldNumbering: NumberingProperties | null | undefined = null,
  newNumbering: NumberingProperties | null | undefined = null,
): DiffResult {
  return {
    docDiffs: diffNodes(normalizeNodes(oldPmDoc), normalizeNodes(newPmDoc)),
    commentDiffs: diffComments(oldComments, newComments, schema),
    stylesDiff: diffStyles(oldStyles, newStyles),
    numberingDiff: diffNumbering(oldNumbering, newNumbering),
  };
}
