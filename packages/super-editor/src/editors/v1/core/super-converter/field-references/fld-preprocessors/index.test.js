// @ts-check
import { describe, it, expect } from 'vitest';
import { getInstructionPreProcessor } from './index.js';
import { preProcessPageInstruction } from './page-preprocessor.js';
import { preProcessNumPagesInstruction } from './num-pages-preprocessor.js';
import { preProcessSectionPagesInstruction } from './section-pages-preprocessor.js';
import { preProcessPageRefInstruction } from './page-ref-preprocessor.js';
import { preProcessHyperlinkInstruction } from './hyperlink-preprocessor.js';
import { preProcessTocInstruction } from './toc-preprocessor.js';
import { preProcessRefInstruction } from './ref-preprocessor.js';
import { preProcessSeqInstruction } from './seq-preprocessor.js';

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

  it.each(['page \\* arabic', 'Page', 'PAGE'])(
    'should return preProcessPageInstruction for case-insensitive PAGE instruction %s',
    (instruction) => {
      const processor = getInstructionPreProcessor(instruction);
      expect(processor).toBe(preProcessPageInstruction);
    },
  );

  it('should return preProcessNumPagesInstruction for NUMPAGES instruction', () => {
    const instruction = 'NUMPAGES';
    const processor = getInstructionPreProcessor(instruction);
    expect(processor).toBe(preProcessNumPagesInstruction);
  });

  it('should return preProcessNumPagesInstruction when instruction uses non-space whitespace', () => {
    const instruction = 'NUMPAGES\t\\# "00"';
    const processor = getInstructionPreProcessor(instruction);
    expect(processor).toBe(preProcessNumPagesInstruction);
  });

  it.each(['numpages', 'NumPages', 'NUMPAGES'])(
    'should return preProcessNumPagesInstruction for case-insensitive NUMPAGES instruction %s',
    (instruction) => {
      const processor = getInstructionPreProcessor(instruction);
      expect(processor).toBe(preProcessNumPagesInstruction);
    },
  );

  it.each(['sectionpages', 'SectionPages', 'SECTIONPAGES \\* roman'])(
    'should return preProcessSectionPagesInstruction for case-insensitive SECTIONPAGES instruction %s',
    (instruction) => {
      const processor = getInstructionPreProcessor(instruction);
      expect(processor).toBe(preProcessSectionPagesInstruction);
    },
  );
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

  it.each([
    ['pageref _Toc123456789 h', preProcessPageRefInstruction],
    ['hyperlink "http://example.com"', preProcessHyperlinkInstruction],
    ['toc \\o "1-3" \\h \\z \\u', preProcessTocInstruction],
    ['ref BookmarkName \\h', preProcessRefInstruction],
  ])('should dispatch non-page field instruction case-insensitively: %s', (instruction, expectedProcessor) => {
    const processor = getInstructionPreProcessor(instruction);
    expect(processor).toBe(expectedProcessor);
  });

  it('should dispatch uppercase SEQ fields', () => {
    const processor = getInstructionPreProcessor('SEQ Figure \\* ARABIC');
    expect(processor).toBe(preProcessSeqInstruction);
  });

  it('should leave lowercase seq fields unprocessed to preserve cached numbering results', () => {
    const processor = getInstructionPreProcessor('seq level2 \\*arabic');
    expect(processor).toBeNull();
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
