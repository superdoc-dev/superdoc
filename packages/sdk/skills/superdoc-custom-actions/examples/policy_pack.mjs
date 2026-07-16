/**
 * ACME's in-house custom actions — Node/JavaScript twin of policy_pack.py.
 * The kit API maps 1:1 across languages: defineAction/extendPreset/
 * registerPreset here are define_action/extend_preset/register_preset there,
 * and steps/run specs behave identically (same templating, same receipts).
 *
 * Two tiers demonstrated:
 *   - `steps` (declarative): compose built-in core actions — inherits target
 *     resolution, placement handling, receipts, and verification.
 *   - `run` (native): an async function against the typed doc handle, for
 *     things the built-in actions can't express.
 *
 * Wire into your app at its toolkit seam — hand the actions to the toolkit
 * (no registerPreset, no preset id):
 *   import { createAgentToolkit } from '@superdoc-dev/sdk';
 *   import { ACTIONS } from './actions/policy_pack.mjs';
 *   const kit = await createAgentToolkit({ provider: 'openai', actions: ACTIONS });
 */

import { defineAction } from '@superdoc-dev/sdk';

export const stampConfidential = defineAction({
  name: 'superdoc.stamp_confidential',
  description:
    'Insert a confidentiality banner paragraph at the very top of the document ' +
    'and flag it with a review comment for the distribution team.',
  input: {
    type: 'object',
    properties: {
      label: { type: 'string', default: 'CONFIDENTIAL', description: 'Banner text' },
    },
    required: [],
  },
  steps: [
    {
      action: 'insert_paragraphs',
      args: { texts: ['{{label}}'], placement: { at: 'document_start' } },
    },
    {
      action: 'add_comments',
      args: {
        selectors: [{ kind: 'textSearch', terms: ['{{label}}'], occurrence: 1 }],
        commentText: 'Auto-stamped by ACME policy. Verify the distribution list before sending.',
      },
    },
  ],
});

export const docStats = defineAction({
  name: 'superdoc.doc_stats',
  description: 'Report document structure statistics: block/table/comment counts and empty-block count.',
  input: { type: 'object', properties: {}, required: [] },
  async run(doc, _args) {
    // Cross-domain read the built-in actions can't express as one verb.
    const blocks = await doc.blocks.list();
    const comments = await doc.comments.list({});
    const rows = blocks.blocks ?? [];
    const commentItems = comments.comments ?? comments.items ?? [];
    return {
      blocks: blocks.total,
      emptyBlocks: rows.filter((b) => b.isEmpty).length,
      tables: rows.filter((b) => b.nodeType === 'table').length,
      comments: commentItems.length,
    };
  },
});

export const ACTIONS = [stampConfidential, docStats];
