// @ts-check
import { describe, it, expect } from 'vitest';
import { getInstructionPreProcessor } from './index.js';
import { preProcessPageInstruction } from './page-preprocessor.js';
import { preProcessNumPagesInstruction } from './num-pages-preprocessor.js';
import { preProcessPageRefInstruction } from './page-ref-preprocessor.js';
import { preProcessHyperlinkInstruction } from './hyperlink-preprocessor.js';
import { preProcessTocInstruction } from './toc-preprocessor.js';

describe('getInstructionPreProcessor', () => {
  const mockDocx = {
    'word/_rels/document.xml.rels': {
      elements: [{ name: 'Relationships', elements: [] }],
    },
  };

  it('should return preProcessPageInstruction for PAGE instruction', () => {
    const instruction = 'PAGE';
    const processor = getInstructionPreProcessor(instruction);
    expect(processor).toBe(preProcessPageInstruction);
  });

  it('should return preProcessNumPagesInstruction for NUMPAGES instruction', () => {
    const instruction = 'NUMPAGES';
    const processor = getInstructionPreProcessor(instruction);
    expect(processor).toBe(preProcessNumPagesInstruction);
  });

  it('should return preProcessPageRefInstruction for PAGEREF instruction', () => {
    const instruction = 'PAGEREF _Toc123456789 h';
    const processor = getInstructionPreProcessor(instruction);
    expect(processor).toBe(preProcessPageRefInstruction);
  });

  it('should return preProcessHyperlinkInstruction for HYPERLINK instruction', () => {
    const instruction = 'HYPERLINK "http://example.com"';
    const processor = getInstructionPreProcessor(instruction);
    expect(processor).toBe(preProcessHyperlinkInstruction);
    // Test that the processor can be called with docx
    expect(processor([], instruction, mockDocx)).toBeDefined();
  });

  it('should return preProcessTocInstruction for TOC instruction', () => {
    const instruction = 'TOC \\o "1-3" \\h \\z \\u';
    const processor = getInstructionPreProcessor(instruction);
    expect(processor).toBe(preProcessTocInstruction);
  });

  it('should return null for unknown instruction', () => {
    const instruction = 'UNKNOWN';
    const processor = getInstructionPreProcessor(instruction);
    expect(processor).toBeNull();
  });
});
