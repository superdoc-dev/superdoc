import { describe, expect, it } from 'vitest';
import { toFlowBlocks as baseToFlowBlocks } from './index.js';
import type { AdapterOptions, PMNode } from './index.js';

const DEFAULT_CONVERTER_CONTEXT = {
  docx: {},
  translatedLinkedStyles: {
    docDefaults: {},
    latentStyles: {},
    styles: {},
  },
  translatedNumbering: {
    abstracts: {},
    definitions: {},
  },
};

const toFlowBlocks = (pmDoc: PMNode | object, options: AdapterOptions = {}) =>
  baseToFlowBlocks(pmDoc, { converterContext: DEFAULT_CONVERTER_CONTEXT, ...options });

describe('pm-adapter source anchors', () => {
  it('carries paragraph and table source anchors into FlowBlocks', () => {
    const paragraphAnchor = {
      sourceNodeId: 'srcnode_p_1',
      occurrenceId: 'occ_p_1',
      rawFactIds: ['raw_p_1'],
      schemaQNames: [{ qName: 'w:p' }],
      anchorConfidence: 'high' as const,
    };
    const tableAnchor = {
      sourceNodeId: 'srcnode_tbl_1',
      occurrenceId: 'occ_tbl_1',
      rawFactIds: ['raw_tbl_1'],
      schemaQNames: [{ qName: 'w:tbl' }],
      anchorConfidence: 'high' as const,
    };
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { sourceAnchor: paragraphAnchor },
          content: [{ type: 'text', text: 'Anchored paragraph' }],
        },
        {
          type: 'table',
          attrs: { sourceAnchor: tableAnchor },
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Cell' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const { blocks } = toFlowBlocks(doc);
    const paragraph = blocks.find((block) => block.kind === 'paragraph');
    const table = blocks.find((block) => block.kind === 'table');

    expect(paragraph?.sourceAnchor?.sourceNodeId).toBe('srcnode_p_1');
    expect(table?.sourceAnchor?.sourceNodeId).toBe('srcnode_tbl_1');
  });
});
