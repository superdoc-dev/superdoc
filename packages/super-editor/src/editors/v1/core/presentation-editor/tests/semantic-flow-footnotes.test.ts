import { describe, expect, it } from 'vitest';
import type { FlowBlock } from '@superdoc/contracts';

import { buildSemanticFootnoteBlocks } from '../semantic-flow-footnotes.js';
import {
  isSemanticFootnoteBlockId,
  SEMANTIC_FOOTNOTES_HEADING_BLOCK_ID,
  SEMANTIC_FOOTNOTE_BLOCK_ID_PREFIX,
} from '../semantic-flow-constants.js';
import type { FootnotesLayoutInput } from '../types.js';

const createParagraphBlock = (id: string, run: Record<string, unknown>): FlowBlock =>
  ({
    kind: 'paragraph',
    id,
    runs: [run],
  }) as FlowBlock;

describe('semantic-flow-footnotes', () => {
  it('returns an empty list when semantic footnotes mode is disabled', () => {
    const input: FootnotesLayoutInput = {
      refs: [{ id: '1', pos: 11 }],
      blocksById: new Map([['1', [createParagraphBlock('fn-1', { kind: 'text', text: 'One' })]]]),
    };

    const result = buildSemanticFootnoteBlocks(input, 'inline' as unknown as 'endOfDocument');
    expect(result).toEqual([]);
  });

  it('deduplicates footnote refs and strips PM ranges from synthetic blocks', () => {
    const originalRun = { kind: 'text', text: 'First', pmStart: 10, pmEnd: 15, fontFamily: 'Calibri', fontSize: 11 };
    const firstBlock = createParagraphBlock('fn-1', originalRun);
    const secondBlock = createParagraphBlock('fn-2', { kind: 'text', text: 'Second' });
    const input: FootnotesLayoutInput = {
      refs: [
        { id: '1', pos: 11 },
        { id: '1', pos: 12 },
        { id: '2', pos: 20 },
      ],
      blocksById: new Map([
        ['1', [firstBlock]],
        ['2', [secondBlock]],
      ]),
    };

    const result = buildSemanticFootnoteBlocks(input, undefined);
    expect(result[0]?.id).toBe(SEMANTIC_FOOTNOTES_HEADING_BLOCK_ID);
    expect(result).toHaveLength(3);

    const ids = result.map((block) => block.id);
    expect(ids).toContain(`${SEMANTIC_FOOTNOTE_BLOCK_ID_PREFIX}-1-0-0-fn-1`);
    expect(ids).toContain(`${SEMANTIC_FOOTNOTE_BLOCK_ID_PREFIX}-2-1-0-fn-2`);

    const firstSyntheticRun = (result[1] as { runs?: Array<{ pmStart?: unknown; pmEnd?: unknown }> }).runs?.[0];
    expect(firstSyntheticRun?.pmStart).toBeUndefined();
    expect(firstSyntheticRun?.pmEnd).toBeUndefined();

    expect((originalRun as { pmStart?: number }).pmStart).toBe(10);
    expect((originalRun as { pmEnd?: number }).pmEnd).toBe(15);
  });

  it('recognizes semantic footnote heading and body ids', () => {
    expect(isSemanticFootnoteBlockId(SEMANTIC_FOOTNOTES_HEADING_BLOCK_ID)).toBe(true);
    expect(isSemanticFootnoteBlockId(`${SEMANTIC_FOOTNOTE_BLOCK_ID_PREFIX}-1-0-0-fn-1`)).toBe(true);
    expect(isSemanticFootnoteBlockId('footnote-1-0')).toBe(false);
  });
});
