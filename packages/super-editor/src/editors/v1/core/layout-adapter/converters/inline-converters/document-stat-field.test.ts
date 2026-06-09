import { describe, expect, it, vi } from 'vitest';
import type { PMMark, PMNode, PositionMap } from '../../types.js';
import type { TextRun } from '@superdoc/contracts';
import { documentStatFieldNodeToRun } from './document-stat-field.js';
import { textNodeToRun } from './text-run.js';

vi.mock('./text-run.js', () => ({
  textNodeToRun: vi.fn(() => ({ text: '0', fontFamily: 'Arial', fontSize: 16 }) satisfies TextRun),
}));

describe('documentStatFieldNodeToRun', () => {
  it('passes marksAsAttrs through to the synthetic text node', () => {
    const marksAsAttrs: PMMark[] = [{ type: 'bold' }, { type: 'italic' }];
    const node = {
      type: 'documentStatField',
      attrs: {
        resolvedText: '17',
        marksAsAttrs,
      },
      marks: [],
    } as unknown as PMNode;

    const positions: PositionMap = new WeakMap();
    positions.set(node, { start: 10, end: 11 });

    const run = documentStatFieldNodeToRun({
      node,
      positions,
      defaultFont: 'Arial',
      defaultSize: 16,
      inheritedMarks: [],
      hyperlinkConfig: { enableRichHyperlinks: false },
      themeColors: undefined,
      enableComments: false,
      runProperties: undefined,
      converterContext: undefined,
      sdtMetadata: undefined,
    });

    expect(textNodeToRun).toHaveBeenCalledWith(
      expect.objectContaining({
        node: expect.objectContaining({
          type: 'text',
          text: '17',
          attrs: { marksAsAttrs },
        }),
      }),
    );
    expect(run).toMatchObject({ pmStart: 10, pmEnd: 11 });
  });
});
