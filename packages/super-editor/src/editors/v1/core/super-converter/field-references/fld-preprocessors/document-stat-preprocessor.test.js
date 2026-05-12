import { describe, it, expect } from 'vitest';
import { preProcessDocumentStatInstruction } from './document-stat-preprocessor.js';

describe('document-stat-preprocessor', () => {
  it('creates an sd:documentStatField node with the instruction attribute', () => {
    const result = preProcessDocumentStatInstruction([], 'NUMWORDS');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('sd:documentStatField');
    expect(result[0].attributes.instruction).toBe('NUMWORDS');
  });

  it('preserves content nodes in the elements array', () => {
    const contentNodes = [
      {
        name: 'w:r',
        elements: [{ name: 'w:t', elements: [{ type: 'text', text: '42' }] }],
      },
    ];

    const result = preProcessDocumentStatInstruction(contentNodes, 'NUMCHARS');

    expect(result[0].name).toBe('sd:documentStatField');
    expect(result[0].attributes.instruction).toBe('NUMCHARS');
    // Content nodes should be included
    expect(result[0].elements).toBeDefined();
  });

  it('extracts rPr from content nodes (priority 1)', () => {
    const rPrNode = { name: 'w:rPr', elements: [{ name: 'w:b' }] };
    const contentNodes = [
      { name: 'w:r', elements: [rPrNode, { name: 'w:t', elements: [{ type: 'text', text: '10' }] }] },
    ];

    const result = preProcessDocumentStatInstruction(contentNodes, 'NUMWORDS');

    expect(result[0].elements).toContain(rPrNode);
  });

  it('falls back to fieldRunRPr when no content rPr exists (priority 2)', () => {
    const fieldRPr = { name: 'w:rPr', elements: [{ name: 'w:i' }] };
    const contentNodes = [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '10' }] }] }];

    const result = preProcessDocumentStatInstruction(contentNodes, 'NUMWORDS', { fieldRunRPr: fieldRPr });

    expect(result[0].elements).toContain(fieldRPr);
  });

  it('ignores fieldRunRPr that is not w:rPr', () => {
    const notRPr = { name: 'w:other', elements: [] };
    const contentNodes = [];

    const result = preProcessDocumentStatInstruction(contentNodes, 'NUMWORDS', { fieldRunRPr: notRPr });

    expect(result[0].elements).not.toContain(notRPr);
  });

  it('handles instruction with switches (e.g. NUMWORDS \\* MERGEFORMAT)', () => {
    const result = preProcessDocumentStatInstruction([], 'NUMWORDS \\* MERGEFORMAT');

    expect(result[0].attributes.instruction).toBe('NUMWORDS \\* MERGEFORMAT');
  });

  it('uses options.fieldRunRPr without depending on docx shape', () => {
    const docx = { name: 'w:rPr' };
    const fieldRPr = { name: 'w:rPr', elements: [{ name: 'w:b' }] };
    const contentNodes = [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '10' }] }] }];

    const result = preProcessDocumentStatInstruction(contentNodes, 'NUMWORDS', { docx, fieldRunRPr: fieldRPr });

    expect(result[0].elements[0]).toBe(fieldRPr);
  });

  it('uses options.fieldRunRPr for header/footer processing', () => {
    const fieldRPr = { name: 'w:rPr', elements: [{ name: 'w:i' }] };
    const contentNodes = [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '5' }] }] }];

    const result = preProcessDocumentStatInstruction(contentNodes, 'NUMCHARS', { fieldRunRPr: fieldRPr });

    expect(result[0].elements[0]).toBe(fieldRPr);
  });
});
