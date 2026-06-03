// @ts-check
/**
 * Test fixture helpers for the review graph.
 *
 * Plan: v1-3220 / phase0-002 ("Tests"). These helpers exist so unit tests
 * can build tracked mark configurations against a real PM
 * schema without each test re-inventing the boilerplate.
 *
 * Not exported from the public package surface — they are internal test
 * affordances. The eventual cross-feature fixture corpus owned by
 * overlap fixture coverage lives under `extensions/track-changes/fixtures/`.
 */

import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { TrackInsertMarkName, TrackDeleteMarkName, TrackFormatMarkName } from '../constants.js';

/** @type {Record<string, import('prosemirror-model').NodeSpec>} */
const NODES = {
  doc: { content: 'block+' },
  paragraph: {
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM: () => ['p', 0],
  },
  text: { group: 'inline' },
};

const MARK_DEFS_WITH_GRAPH_ATTRS = {
  id: { default: '' },
  author: { default: '' },
  authorId: { default: '' },
  authorEmail: { default: '' },
  authorImage: { default: '' },
  date: { default: '' },
  sourceId: { default: '' },
  importedAuthor: { default: '' },
  revisionGroupId: { default: '' },
  splitFromId: { default: '' },
  changeType: { default: '' },
  replacementGroupId: { default: '' },
  replacementSideId: { default: '' },
  overlapParentId: { default: '' },
  sourceIds: { default: null },
  origin: { default: '' },
};

const MARKS = {
  [TrackInsertMarkName]: {
    inclusive: false,
    attrs: MARK_DEFS_WITH_GRAPH_ATTRS,
  },
  [TrackDeleteMarkName]: {
    inclusive: false,
    attrs: MARK_DEFS_WITH_GRAPH_ATTRS,
  },
  [TrackFormatMarkName]: {
    inclusive: false,
    attrs: {
      ...MARK_DEFS_WITH_GRAPH_ATTRS,
      before: { default: [] },
      after: { default: [] },
    },
  },
};

/**
 * A minimal PM schema sufficient for review-graph unit tests. Mirrors the
 * tracked-change mark shape used in production; consumers needing a richer
 * schema can use `initTestEditor` from the package tests helpers instead.
 */
export const createReviewGraphTestSchema = () => new Schema({ nodes: NODES, marks: MARKS });

/**
 * @typedef {Object} TextSpanSpec
 * @property {string} text
 * @property {Array<{ markType: 'trackInsert'|'trackDelete'|'trackFormat', attrs: Record<string, unknown> }>} [marks]
 */

/**
 * Build an EditorState containing one paragraph composed of the given
 * tracked text spans. Positions inside the resulting doc are stable and
 * documented:
 *
 *   pos 0           = before doc
 *   pos 1           = inside paragraph, before first inline content
 *   pos 1 + offset  = inside paragraph at character offset
 *
 * @param {{ schema: Schema, spans: TextSpanSpec[] }} input
 * @returns {{ state: EditorState, schema: Schema, paragraphStart: number }}
 */
export const stateFromTrackedSpans = ({ schema, spans }) => {
  const inlineNodes = spans.map(({ text, marks = [] }) => {
    const pmMarks = marks.map(({ markType, attrs }) => schema.marks[markType].create(attrs));
    return schema.text(text, pmMarks);
  });

  const paragraph = schema.nodes.paragraph.create({}, inlineNodes);
  const doc = schema.nodes.doc.create({}, [paragraph]);
  const state = EditorState.create({ schema, doc });
  return { state, schema, paragraphStart: 1 };
};

/**
 * Build a tracked-mark attrs blob with sensible defaults so test
 * declarations stay short.
 *
 * @param {Partial<Record<string, unknown>> & { id: string }} attrs
 * @returns {Record<string, unknown>}
 */
export const markAttrs = (attrs) => ({
  id: '',
  author: '',
  authorId: '',
  authorEmail: '',
  authorImage: '',
  date: '',
  sourceId: '',
  importedAuthor: '',
  revisionGroupId: '',
  splitFromId: '',
  changeType: '',
  replacementGroupId: '',
  replacementSideId: '',
  overlapParentId: '',
  sourceIds: null,
  origin: '',
  ...attrs,
});
