import { describe, expect, it } from 'bun:test';
import { INLINE_PROPERTY_BY_KEY, validateInlineRunPatch } from './inline-run-patch.js';
import { DocumentApiValidationError } from '../errors.js';

describe('INLINE_PROPERTY_REGISTRY: caps entry', () => {
  const entry = INLINE_PROPERTY_BY_KEY['caps'];

  it('exists in the registry', () => {
    expect(entry).toBeDefined();
  });

  it('uses mark storage (not runAttribute)', () => {
    expect(entry.storage).toBe('mark');
  });

  it('targets the textStyle mark with textTransform attribute', () => {
    expect(entry.carrier).toEqual({
      storage: 'mark',
      markName: 'textStyle',
      textStyleAttr: 'textTransform',
    });
  });

  it('accepts boolean input type', () => {
    expect(entry.type).toBe('boolean');
  });

  it('maps to the w:caps OOXML element', () => {
    expect(entry.ooxmlElement).toBe('w:caps');
  });
});

describe('validateInlineRunPatch: rejects Object.prototype keys', () => {
  it('rejects toString as an unknown inline property', () => {
    expect(() => validateInlineRunPatch({ toString: true })).toThrow(DocumentApiValidationError);
    expect(() => validateInlineRunPatch({ toString: true })).toThrow('Unknown inline property: "toString"');
  });

  it('rejects constructor as an unknown inline property', () => {
    expect(() => validateInlineRunPatch({ constructor: true })).toThrow(DocumentApiValidationError);
    expect(() => validateInlineRunPatch({ constructor: true })).toThrow('Unknown inline property: "constructor"');
  });

  it('rejects hasOwnProperty as an unknown inline property', () => {
    expect(() => validateInlineRunPatch({ hasOwnProperty: true })).toThrow(DocumentApiValidationError);
  });

  it('rejects __proto__ as an unknown inline property', () => {
    // JSON.parse produces __proto__ as an own property (not the setter)
    const patch = JSON.parse('{"__proto__": true}');
    expect(() => validateInlineRunPatch(patch)).toThrow(DocumentApiValidationError);
  });

  it('still accepts valid inline properties', () => {
    expect(() => validateInlineRunPatch({ bold: true })).not.toThrow();
    expect(() => validateInlineRunPatch({ italic: null })).not.toThrow();
    expect(() => validateInlineRunPatch({ fontSize: 12 })).not.toThrow();
  });
});

describe('INLINE_PROPERTY_REGISTRY: smallCaps entry', () => {
  const entry = INLINE_PROPERTY_BY_KEY['smallCaps'];

  it('uses runAttribute storage (distinct from caps)', () => {
    expect(entry.storage).toBe('runAttribute');
  });

  it('targets the run node with smallCaps property key', () => {
    expect(entry.carrier).toEqual({
      storage: 'runAttribute',
      nodeName: 'run',
      runPropertyKey: 'smallCaps',
    });
  });
});
