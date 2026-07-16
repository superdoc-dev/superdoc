/**
 * Pins the FlowBlock emission contract around explicit page breaks (SD-3366).
 *
 * The layout engine suppresses a style/direct pageBreakBefore when it directly
 * follows an explicit page break, identified structurally as the window
 * [explicit pageBreak, empty remnant paragraph, pageBreak source=pageBreakBefore]
 * (see isPageBreakBeforeSatisfiedByExplicitBreak in @superdoc/layout-engine).
 * That check relies on the emission shapes asserted here. If one of these
 * tests fails after an adapter change, the layout-engine window check must be
 * revisited together with it.
 */
import { describe, it, expect } from 'vitest';
import { toFlowBlocks as baseToFlowBlocks } from '../index.js';
import type { PMNode, AdapterOptions } from '../index.js';

const DEFAULT_CONVERTER_CONTEXT = {
  docx: {},
  translatedLinkedStyles: { docDefaults: {}, latentStyles: {}, styles: {} },
  translatedNumbering: { abstracts: {}, definitions: {} },
};

const toFlowBlocks = (content: object[], options: AdapterOptions = {}) =>
  baseToFlowBlocks({ type: 'doc', content } as unknown as PMNode, {
    converterContext: DEFAULT_CONVERTER_CONTEXT,
    ...options,
  });

const textPara = (text: string) => ({
  type: 'paragraph',
  attrs: { paragraphProperties: {} },
  content: [{ type: 'run', attrs: {}, content: [{ type: 'text', text }] }],
});

/** Paragraph whose only content is an explicit page break (`w:br w:type="page"`). */
const breakPara = () => ({
  type: 'paragraph',
  attrs: { paragraphProperties: {} },
  content: [{ type: 'run', attrs: {}, content: [{ type: 'hardBreak', attrs: { lineBreakType: 'page' } }] }],
});

const pbbPara = (text: string) => ({
  type: 'paragraph',
  attrs: { paragraphProperties: { pageBreakBefore: true } },
  content: [{ type: 'run', attrs: {}, content: [{ type: 'text', text }] }],
});

type EmittedShape = { kind: string; source?: unknown; texts?: Array<string | undefined> };

const shapeOf = (blocks: ReturnType<typeof toFlowBlocks>['blocks']): EmittedShape[] =>
  blocks.map((block) => {
    const b = block as { kind: string; attrs?: Record<string, unknown>; runs?: Array<{ text?: string }> };
    const shape: EmittedShape = { kind: b.kind };
    if (b.attrs?.source !== undefined) shape.source = b.attrs.source;
    if (b.runs) shape.texts = b.runs.map((r) => r.text);
    return shape;
  });

describe('explicit page break emission shapes (SD-3366)', () => {
  it('a break-only paragraph emits the pageBreak followed by its empty remnant paragraph', () => {
    const { blocks } = toFlowBlocks([textPara('Prior'), breakPara(), pbbPara('Styled')]);

    expect(shapeOf(blocks)).toEqual([
      { kind: 'paragraph', texts: ['Prior'] },
      { kind: 'pageBreak' },
      { kind: 'paragraph', texts: [''] },
      { kind: 'pageBreak', source: 'pageBreakBefore' },
      { kind: 'paragraph', texts: ['Styled'] },
    ]);
  });

  it('a break at the end of a text paragraph emits no remnant paragraph', () => {
    const { blocks } = toFlowBlocks([
      {
        type: 'paragraph',
        attrs: { paragraphProperties: {} },
        content: [
          {
            type: 'run',
            attrs: {},
            content: [
              { type: 'text', text: 'Prior' },
              { type: 'hardBreak', attrs: { lineBreakType: 'page' } },
            ],
          },
        ],
      },
      pbbPara('Styled'),
    ]);

    expect(shapeOf(blocks)).toEqual([
      { kind: 'paragraph', texts: ['Prior'] },
      { kind: 'pageBreak' },
      { kind: 'pageBreak', source: 'pageBreakBefore' },
      { kind: 'paragraph', texts: ['Styled'] },
    ]);
  });

  it('text after the break in the same paragraph emits a non-empty trailing paragraph', () => {
    const { blocks } = toFlowBlocks([
      {
        type: 'paragraph',
        attrs: { paragraphProperties: {} },
        content: [
          {
            type: 'run',
            attrs: {},
            content: [
              { type: 'hardBreak', attrs: { lineBreakType: 'page' } },
              { type: 'text', text: 'After' },
            ],
          },
        ],
      },
      pbbPara('Styled'),
    ]);

    expect(shapeOf(blocks)).toEqual([
      { kind: 'pageBreak' },
      { kind: 'paragraph', texts: ['After'] },
      { kind: 'pageBreak', source: 'pageBreakBefore' },
      { kind: 'paragraph', texts: ['Styled'] },
    ]);
  });
});
