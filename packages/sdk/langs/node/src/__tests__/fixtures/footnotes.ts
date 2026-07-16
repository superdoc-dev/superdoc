/**
 * Footnote actions — the shared test fixture for custom actions.
 *
 * Footnotes are NOT built-in core actions; these define five namespaced
 * `run`-tier custom actions (`footnotes.add` / `.list` / `.edit` / `.remove` /
 * `.renumber`) over the typed `doc.footnotes.*` Document API. They run in the
 * caller's process against the session-bound handle — the same tier a customer
 * reaches for when the built-in actions don't cover their domain.
 *
 * This is a test fixture only: it is not exported from the package and lives
 * under __tests__ so it never ships in dist. Both the unit tests (against a
 * fake base) and the e2e test (against the real CLI host) import it.
 *
 * Shapes (from packages/document-api/src/footnotes/footnotes.types.ts):
 *   - insert `at` is a TextTarget: { kind:'text', segments:[{ blockId, range:{start,end} }] }
 *   - update/remove target a FootnoteAddress: { kind:'entity', entityType:'footnote', noteId }
 *   - configure takes { type, scope:{kind:'document'}, numbering:{ format?, start? } }
 */

import { defineAction, type ActionSpec } from '../../actions/define.js';

type FootnotesApi = {
  footnotes: {
    insert: (input: Record<string, unknown>) => Promise<unknown>;
    list: (input: Record<string, unknown>) => Promise<unknown>;
    update: (input: Record<string, unknown>) => Promise<unknown>;
    remove: (input: Record<string, unknown>) => Promise<unknown>;
    configure: (input: Record<string, unknown>) => Promise<unknown>;
  };
};

export const footnoteAdd: ActionSpec = defineAction({
  name: 'footnotes.add',
  description:
    "Insert a footnote (or endnote) at a text target. args: { at: TextTarget {kind:'text',segments:[{blockId,range:{start,end}}]}, content: string, type?: 'footnote'|'endnote' }.",
  input: {
    type: 'object',
    additionalProperties: false,
    required: ['at', 'content'],
    properties: {
      at: { type: 'object', description: "TextTarget: {kind:'text',segments:[{blockId,range:{start,end}}]}" },
      content: { type: 'string' },
      type: { type: 'string', enum: ['footnote', 'endnote'] },
    },
  },
  run: (doc, args) =>
    (doc as FootnotesApi).footnotes.insert({
      at: args.at,
      type: (args.type as string) || 'footnote',
      content: args.content,
    }),
});

export const footnoteList: ActionSpec = defineAction({
  name: 'footnotes.list',
  description: "List footnotes (or endnotes). args: { type?: 'footnote'|'endnote' }.",
  input: {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: { type: 'string', enum: ['footnote', 'endnote'] },
    },
  },
  run: (doc, args) => (doc as FootnotesApi).footnotes.list(args.type ? { type: args.type } : {}),
});

export const footnoteEdit: ActionSpec = defineAction({
  name: 'footnotes.edit',
  description: "Edit a footnote's content by noteId. args: { noteId: string, content: string }.",
  input: {
    type: 'object',
    additionalProperties: false,
    required: ['noteId', 'content'],
    properties: {
      noteId: { type: 'string' },
      content: { type: 'string' },
    },
  },
  run: (doc, args) =>
    (doc as FootnotesApi).footnotes.update({
      target: { kind: 'entity', entityType: 'footnote', noteId: args.noteId },
      patch: { content: args.content },
    }),
});

export const footnoteRemove: ActionSpec = defineAction({
  name: 'footnotes.remove',
  description: 'Remove a footnote by noteId. args: { noteId: string }.',
  input: {
    type: 'object',
    additionalProperties: false,
    required: ['noteId'],
    properties: {
      noteId: { type: 'string' },
    },
  },
  run: (doc, args) =>
    (doc as FootnotesApi).footnotes.remove({
      target: { kind: 'entity', entityType: 'footnote', noteId: args.noteId },
    }),
});

export const footnoteRenumber: ActionSpec = defineAction({
  name: 'footnotes.renumber',
  description:
    "Reconfigure footnote numbering for the whole document. args: { type?: 'footnote'|'endnote', format?: string, start?: number }.",
  input: {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: { type: 'string', enum: ['footnote', 'endnote'] },
      format: {
        type: 'string',
        enum: ['decimal', 'lowerRoman', 'upperRoman', 'lowerLetter', 'upperLetter', 'symbol'],
      },
      start: { type: 'number' },
    },
  },
  run: (doc, args) =>
    (doc as FootnotesApi).footnotes.configure({
      type: (args.type as string) || 'footnote',
      scope: { kind: 'document' },
      numbering: {
        ...(args.format ? { format: args.format } : {}),
        ...(args.start != null ? { start: args.start } : {}),
      },
    }),
});

/** All five footnote actions, in a stable order. */
export const footnoteActions: readonly ActionSpec[] = [
  footnoteAdd,
  footnoteList,
  footnoteEdit,
  footnoteRemove,
  footnoteRenumber,
];
