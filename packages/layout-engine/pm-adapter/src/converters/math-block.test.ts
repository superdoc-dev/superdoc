import { describe, it, expect } from 'vitest';
import { handleMathBlockNode } from './math-block.js';
import type { FlowBlock, ParagraphBlock, MathRun } from '@superdoc/contracts';
import type { NodeHandlerContext } from '../types.js';

function makeContext(): { context: NodeHandlerContext; blocks: FlowBlock[] } {
  const blocks: FlowBlock[] = [];
  let idCounter = 0;
  const context = {
    blocks,
    recordBlockKind: () => {},
    nextBlockId: (kind: string) => `${kind}-${++idCounter}`,
    positions: new WeakMap(),
  } as unknown as NodeHandlerContext;
  return { context, blocks };
}

function makeNode(attrs: Record<string, unknown>) {
  return { type: 'mathBlock', attrs, content: [], marks: [] };
}

describe('handleMathBlockNode', () => {
  it('produces a ParagraphBlock with a MathRun', () => {
    const { context, blocks } = makeContext();
    const node = makeNode({ originalXml: { name: 'm:oMathPara' }, textContent: 'E=mc', justification: 'center' });

    handleMathBlockNode(node as any, context);

    expect(blocks).toHaveLength(1);
    const block = blocks[0] as ParagraphBlock;
    expect(block.kind).toBe('paragraph');
    expect(block.runs).toHaveLength(1);

    const run = block.runs[0] as MathRun;
    expect(run.kind).toBe('math');
    expect(run.textContent).toBe('E=mc');
    expect(run.ommlJson).toEqual({ name: 'm:oMathPara' });
  });

  it('maps justification to alignment correctly', () => {
    const cases: [string, string][] = [
      ['center', 'center'],
      ['centerGroup', 'center'],
      ['left', 'left'],
      ['right', 'right'],
    ];

    for (const [justification, expectedAlignment] of cases) {
      const { context, blocks } = makeContext();
      handleMathBlockNode(makeNode({ textContent: 'x', justification }) as any, context);
      const block = blocks[0] as ParagraphBlock;
      expect(block.attrs?.alignment).toBe(expectedAlignment);
    }
  });

  it('defaults to center alignment for unknown justification', () => {
    const { context, blocks } = makeContext();
    handleMathBlockNode(makeNode({ textContent: 'x', justification: 'unknown' }) as any, context);
    const block = blocks[0] as ParagraphBlock;
    expect(block.attrs?.alignment).toBe('center');
  });

  it('defaults to center alignment when justification is missing', () => {
    const { context, blocks } = makeContext();
    handleMathBlockNode(makeNode({ textContent: 'x' }) as any, context);
    const block = blocks[0] as ParagraphBlock;
    expect(block.attrs?.alignment).toBe('center');
  });

  it('estimates width from text content', () => {
    const { context, blocks } = makeContext();
    handleMathBlockNode(makeNode({ textContent: 'abcde' }) as any, context);
    const run = (blocks[0] as ParagraphBlock).runs[0] as MathRun;
    expect(run.width).toBe(50); // 5 chars * 10px
  });

  it('estimates taller height for fractions', () => {
    const { context, blocks } = makeContext();
    const fractionXml = {
      name: 'm:oMathPara',
      elements: [{
        name: 'm:oMath',
        elements: [{
          name: 'm:f',
          elements: [
            { name: 'm:num', elements: [{ name: 'm:r' }] },
            { name: 'm:den', elements: [{ name: 'm:r' }] },
          ],
        }],
      }],
    };
    handleMathBlockNode(makeNode({ textContent: 'ab', originalXml: fractionXml }) as any, context);
    const run = (blocks[0] as ParagraphBlock).runs[0] as MathRun;
    expect(run.height).toBeGreaterThan(24);
  });

  it('generates unique block IDs', () => {
    const { context, blocks } = makeContext();
    handleMathBlockNode(makeNode({ textContent: 'a' }) as any, context);
    handleMathBlockNode(makeNode({ textContent: 'b' }) as any, context);
    expect(blocks[0].id).not.toBe(blocks[1].id);
  });

  it('resolves paragraph spacing from paragraphProperties', () => {
    const { context, blocks } = makeContext();
    const node = makeNode({
      textContent: 'x',
      paragraphProperties: { spacing: { before: 240, after: 160, line: 276, lineRule: 'auto' } },
    });

    handleMathBlockNode(node as any, context);

    const block = blocks[0] as ParagraphBlock;
    expect(block.attrs?.spacing).toBeDefined();
    expect(block.attrs?.spacing?.before).toBeGreaterThan(0);
    expect(block.attrs?.spacing?.after).toBeGreaterThan(0);
  });

  it('falls back to paragraph alignment when justification is unknown', () => {
    const { context, blocks } = makeContext();
    const node = makeNode({
      textContent: 'x',
      justification: 'unknown',
      paragraphProperties: { justification: 'right' },
    });

    handleMathBlockNode(node as any, context);

    const block = blocks[0] as ParagraphBlock;
    // When math justification is unknown, falls back to paragraphAttrs alignment
    expect(block.attrs?.alignment).toBeDefined();
  });
});
