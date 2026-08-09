import { describe, expect, it, mock } from 'bun:test';
import type { ExtractResult } from '../types/extract.types.js';
import { executeExtract } from './extract.js';
import type { ExtractAdapter } from './extract.js';

const DEFAULT_EXTRACT: ExtractResult = {
  blocks: [
    { nodeId: 'h1', type: 'heading', text: 'Introduction', headingLevel: 1 },
    { nodeId: 'p1', type: 'paragraph', text: 'First paragraph content.' },
    { nodeId: 'p2', type: 'paragraph', text: '' },
  ],
  comments: [
    { entityId: 'c1', text: 'Fix this', anchoredText: 'content', blockId: 'p1', status: 'open', author: 'Alice' },
  ],
  trackedChanges: [{ entityId: 'tc1', type: 'insert', excerpt: 'new text', author: 'Bob', date: '2026-01-01' }],
  revision: '5',
};

describe('executeExtract', () => {
  it('delegates to adapter.extract with the input', () => {
    const adapter: ExtractAdapter = {
      extract: mock(() => DEFAULT_EXTRACT),
    };

    const result = executeExtract(adapter, {});

    expect(result).toBe(DEFAULT_EXTRACT);
    expect(adapter.extract).toHaveBeenCalledWith({});
  });

  it('passes through full text without truncation', () => {
    const longText = 'A'.repeat(200);
    const extractResult: ExtractResult = {
      ...DEFAULT_EXTRACT,
      blocks: [{ nodeId: 'p1', type: 'paragraph', text: longText }],
    };
    const adapter: ExtractAdapter = {
      extract: mock(() => extractResult),
    };

    const result = executeExtract(adapter, {});

    expect(result.blocks[0].text).toBe(longText);
    expect(result.blocks[0].text.length).toBe(200);
  });
});
