import { describe, it, expect } from 'vitest';
import { collectReferencedNumIds, filterOrphanedNumberingDefinitions } from './strip-orphaned-numbering.js';

// ---------------------------------------------------------------------------
// Helpers for building XML-JSON structures
// ---------------------------------------------------------------------------

function makeNumIdElement(numId) {
  return {
    name: 'w:numId',
    type: 'element',
    attributes: { 'w:val': String(numId) },
  };
}

function makeParagraphWithNumId(numId) {
  return {
    name: 'w:p',
    type: 'element',
    elements: [
      {
        name: 'w:pPr',
        type: 'element',
        elements: [
          {
            name: 'w:numPr',
            type: 'element',
            elements: [makeNumIdElement(numId), { name: 'w:ilvl', type: 'element', attributes: { 'w:val': '0' } }],
          },
        ],
      },
    ],
  };
}

function makeDocumentXml(paragraphs) {
  return {
    elements: [
      {
        name: 'w:document',
        type: 'element',
        elements: [{ name: 'w:body', type: 'element', elements: paragraphs }],
      },
    ],
  };
}

function makeNumDef(numId, abstractNumId, extraElements = []) {
  return {
    name: 'w:num',
    type: 'element',
    attributes: { 'w:numId': String(numId) },
    elements: [
      {
        name: 'w:abstractNumId',
        type: 'element',
        attributes: { 'w:val': String(abstractNumId) },
      },
      ...extraElements,
    ],
  };
}

function makeAbstractDef(abstractNumId) {
  return {
    name: 'w:abstractNum',
    type: 'element',
    attributes: { 'w:abstractNumId': String(abstractNumId) },
    elements: [],
  };
}

// ---------------------------------------------------------------------------
// collectReferencedNumIds
// ---------------------------------------------------------------------------

describe('collectReferencedNumIds', () => {
  it('collects numIds from document body paragraphs', () => {
    const convertedXml = {
      'word/document.xml': makeDocumentXml([makeParagraphWithNumId(1), makeParagraphWithNumId(3)]),
    };
    const result = collectReferencedNumIds(convertedXml);
    expect(result).toEqual(new Set([1, 3]));
  });

  it('collects numIds from headers and footers', () => {
    const convertedXml = {
      'word/document.xml': makeDocumentXml([makeParagraphWithNumId(1)]),
      'word/header1.xml': {
        elements: [{ name: 'w:hdr', type: 'element', elements: [makeParagraphWithNumId(5)] }],
      },
      'word/footer1.xml': {
        elements: [{ name: 'w:ftr', type: 'element', elements: [makeParagraphWithNumId(7)] }],
      },
    };
    const result = collectReferencedNumIds(convertedXml);
    expect(result).toEqual(new Set([1, 5, 7]));
  });

  it('ignores word/numbering.xml to avoid self-referencing', () => {
    const convertedXml = {
      'word/document.xml': makeDocumentXml([makeParagraphWithNumId(1)]),
      'word/numbering.xml': {
        elements: [
          {
            name: 'w:numbering',
            type: 'element',
            elements: [makeNumDef(1, 10), makeNumDef(99, 20)],
          },
        ],
      },
    };
    const result = collectReferencedNumIds(convertedXml);
    // Only numId 1 from document body — numId 99 from numbering.xml should NOT appear
    expect(result).toEqual(new Set([1]));
  });

  it('ignores non-word paths', () => {
    const convertedXml = {
      'word/document.xml': makeDocumentXml([makeParagraphWithNumId(1)]),
      'docProps/custom.xml': { elements: [makeParagraphWithNumId(999)] },
    };
    const result = collectReferencedNumIds(convertedXml);
    expect(result).toEqual(new Set([1]));
  });

  it('returns empty set when no paragraphs have numbering', () => {
    const convertedXml = {
      'word/document.xml': makeDocumentXml([{ name: 'w:p', type: 'element', elements: [] }]),
    };
    const result = collectReferencedNumIds(convertedXml);
    expect(result).toEqual(new Set());
  });

  it('deduplicates repeated numIds', () => {
    const convertedXml = {
      'word/document.xml': makeDocumentXml([
        makeParagraphWithNumId(2),
        makeParagraphWithNumId(2),
        makeParagraphWithNumId(2),
      ]),
    };
    const result = collectReferencedNumIds(convertedXml);
    expect(result).toEqual(new Set([2]));
  });
});

// ---------------------------------------------------------------------------
// filterOrphanedNumberingDefinitions
// ---------------------------------------------------------------------------

describe('filterOrphanedNumberingDefinitions', () => {
  it('keeps definitions referenced by document paragraphs', () => {
    const numbering = {
      abstracts: { 10: makeAbstractDef(10) },
      definitions: { 1: makeNumDef(1, 10) },
    };
    const referencedNumIds = new Set([1]);

    const { liveAbstracts, liveDefinitions } = filterOrphanedNumberingDefinitions(numbering, referencedNumIds);

    expect(liveDefinitions).toHaveLength(1);
    expect(liveDefinitions[0].attributes['w:numId']).toBe('1');
    expect(liveAbstracts).toHaveLength(1);
    expect(liveAbstracts[0].attributes['w:abstractNumId']).toBe('10');
  });

  it('strips orphaned w:num not referenced by any paragraph', () => {
    const numbering = {
      abstracts: { 10: makeAbstractDef(10), 20: makeAbstractDef(20) },
      definitions: { 1: makeNumDef(1, 10), 99: makeNumDef(99, 20) },
    };
    // Only numId 1 is referenced — numId 99 is orphaned
    const referencedNumIds = new Set([1]);

    const { liveAbstracts, liveDefinitions } = filterOrphanedNumberingDefinitions(numbering, referencedNumIds);

    expect(liveDefinitions).toHaveLength(1);
    expect(liveDefinitions[0].attributes['w:numId']).toBe('1');
    // abstractNum 20 is also orphaned (only referenced by stripped numId 99)
    expect(liveAbstracts).toHaveLength(1);
    expect(liveAbstracts[0].attributes['w:abstractNumId']).toBe('10');
  });

  it('keeps abstract shared by multiple w:num when at least one survives', () => {
    const numbering = {
      abstracts: { 10: makeAbstractDef(10) },
      definitions: {
        1: makeNumDef(1, 10),
        2: makeNumDef(2, 10), // same abstract as numId 1
        3: makeNumDef(3, 10), // orphaned — not referenced
      },
    };
    const referencedNumIds = new Set([1, 2]);

    const { liveAbstracts, liveDefinitions } = filterOrphanedNumberingDefinitions(numbering, referencedNumIds);

    expect(liveDefinitions).toHaveLength(2);
    expect(liveAbstracts).toHaveLength(1);
    expect(liveAbstracts[0].attributes['w:abstractNumId']).toBe('10');
  });

  it('strips all definitions when no numIds are referenced', () => {
    const numbering = {
      abstracts: { 10: makeAbstractDef(10) },
      definitions: { 1: makeNumDef(1, 10) },
    };
    const referencedNumIds = new Set();

    const { liveAbstracts, liveDefinitions } = filterOrphanedNumberingDefinitions(numbering, referencedNumIds);

    expect(liveDefinitions).toHaveLength(0);
    expect(liveAbstracts).toHaveLength(0);
  });

  it('handles empty numbering gracefully', () => {
    const numbering = { abstracts: {}, definitions: {} };
    const referencedNumIds = new Set([1]);

    const { liveAbstracts, liveDefinitions } = filterOrphanedNumberingDefinitions(numbering, referencedNumIds);

    expect(liveDefinitions).toHaveLength(0);
    expect(liveAbstracts).toHaveLength(0);
  });

  it('preserves w:num entries with lvlOverride elements', () => {
    const lvlOverride = {
      name: 'w:lvlOverride',
      type: 'element',
      attributes: { 'w:ilvl': '0' },
      elements: [{ name: 'w:startOverride', type: 'element', attributes: { 'w:val': '5' } }],
    };
    const numbering = {
      abstracts: { 10: makeAbstractDef(10) },
      definitions: { 1: makeNumDef(1, 10, [lvlOverride]) },
    };
    const referencedNumIds = new Set([1]);

    const { liveDefinitions } = filterOrphanedNumberingDefinitions(numbering, referencedNumIds);

    expect(liveDefinitions).toHaveLength(1);
    // Verify lvlOverride is preserved
    expect(liveDefinitions[0].elements).toHaveLength(2); // abstractNumId + lvlOverride
  });
});
