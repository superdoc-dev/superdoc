import { describe, it, expect } from 'vite-plus/test';
import { textReceiptToSDReceipt, buildStructuralReceipt } from './receipt-bridge.js';
import type { ReceiptEffects, TextMutationReceipt } from './types/index.js';

const EFFECTS: ReceiptEffects = {
  insertedText: [
    {
      kind: 'insertedText',
      target: { kind: 'text', blockId: 'B1', range: { start: 4, end: 7 } },
      selectionTarget: {
        kind: 'selection',
        start: { kind: 'text', blockId: 'B1', offset: 4 },
        end: { kind: 'text', blockId: 'B1', offset: 7 },
      },
      text: 'XYZ',
    },
  ],
};

describe('receipt-bridge: created-content effects', () => {
  it('preserves effects from a successful text receipt onto the SDMutationReceipt', () => {
    const textReceipt: TextMutationReceipt = {
      success: true,
      resolution: {
        target: { kind: 'text', blockId: 'B1', range: { start: 4, end: 4 } },
        range: { from: 4, to: 4 },
        text: '',
      },
      effects: EFFECTS,
    };
    const sdReceipt = textReceiptToSDReceipt(textReceipt);
    expect(sdReceipt.success).toBe(true);
    // resolution.target stays the collapsed insertion point.
    expect(sdReceipt.resolution?.target).toMatchObject({ blockId: 'B1', range: { start: 4, end: 4 } });
    // effects carries the created span (nonzero base offset).
    expect(sdReceipt.effects?.insertedText?.[0]).toMatchObject({
      kind: 'insertedText',
      target: { blockId: 'B1', range: { start: 4, end: 7 } },
      text: 'XYZ',
    });
  });

  it('omits effects when the text receipt has none', () => {
    const textReceipt: TextMutationReceipt = {
      success: true,
      resolution: {
        target: { kind: 'text', blockId: 'B1', range: { start: 0, end: 0 } },
        range: { from: 0, to: 0 },
        text: '',
      },
    };
    expect(textReceiptToSDReceipt(textReceipt).effects).toBeUndefined();
  });

  it('carries effects through buildStructuralReceipt', () => {
    const receipt = buildStructuralReceipt(true, {
      target: { kind: 'block', nodeType: 'paragraph', nodeId: 'P1' },
      range: { from: 0, to: 0 },
      effects: {
        insertedBlocks: [{ kind: 'insertedBlock', target: { kind: 'block', nodeType: 'paragraph', nodeId: 'P1' } }],
      },
    });
    expect(receipt.success).toBe(true);
    expect(receipt.effects?.insertedBlocks?.[0]).toMatchObject({ kind: 'insertedBlock', target: { nodeId: 'P1' } });
  });
});
