/**
 * Phase 6 hardening tests: strict import normalization for core-4 inline properties.
 *
 * Covers:
 * - ST_OnOff: all 6 accepted values, bare element, invalid tokens
 * - ST_Underline: all accepted enum values, bare element, invalid tokens
 * - Case-sensitivity enforcement
 * - Tri-state roundtrip (encode → decode)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createStrictTogglePropertyHandler, parseStrictStOnOff } from '../../handlers/utils.js';
import { startCollection, drainDiagnostics } from '../../handlers/import-diagnostics.js';
import { translator as boldTranslator } from './b/b-translator.js';
import { translator as italicTranslator } from './i/i-translator.js';
import { translator as strikeTranslator } from './strike/strike-translator.js';
import { config as underlineConfig, translator as underlineTranslator } from './u/u-translator.js';

// ---------------------------------------------------------------------------
// §1: parseStrictStOnOff — strict ST_OnOff token validation
// ---------------------------------------------------------------------------
describe('parseStrictStOnOff', () => {
  describe('valid ON tokens', () => {
    it.each([
      ['true', true],
      ['1', true],
      ['on', true],
    ])('accepts "%s" as ON → true', (token, expected) => {
      expect(parseStrictStOnOff(token)).toBe(expected);
    });
  });

  describe('valid OFF tokens', () => {
    it.each([
      ['false', false],
      ['0', false],
      ['off', false],
    ])('accepts "%s" as OFF → false', (token, expected) => {
      expect(parseStrictStOnOff(token)).toBe(expected);
    });
  });

  describe('bare element (absent w:val)', () => {
    it('null → ON (true)', () => {
      expect(parseStrictStOnOff(null)).toBe(true);
    });
    it('undefined → ON (true)', () => {
      expect(parseStrictStOnOff(undefined)).toBe(true);
    });
  });

  describe('invalid tokens → CLEAR (undefined)', () => {
    it.each([
      ['True', 'wrong case'],
      ['FALSE', 'all caps'],
      ['ON', 'wrong case'],
      ['Off', 'mixed case'],
      ['yes', 'not an ST_OnOff token'],
      ['no', 'not an ST_OnOff token'],
      ['', 'empty string'],
      ['2', 'numeric but not 0 or 1'],
      ['null', 'string null'],
      ['undefined', 'string undefined'],
      ['bold', 'property name as value'],
    ])('rejects "%s" (%s) → undefined', (token) => {
      expect(parseStrictStOnOff(token)).toBeUndefined();
    });
  });

  describe('type coercion via String()', () => {
    it('boolean true → "true" → ON', () => {
      expect(parseStrictStOnOff(true)).toBe(true);
    });
    it('boolean false → "false" → OFF', () => {
      expect(parseStrictStOnOff(false)).toBe(false);
    });
    it('number 1 → "1" → ON', () => {
      expect(parseStrictStOnOff(1)).toBe(true);
    });
    it('number 0 → "0" → OFF', () => {
      expect(parseStrictStOnOff(0)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// §2: Core-4 toggle translators (bold, italic, strike) — encode
// ---------------------------------------------------------------------------
describe('strict toggle encode (bold, italic, strike)', () => {
  const translators = [
    { name: 'bold', translator: boldTranslator },
    { name: 'italic', translator: italicTranslator },
    { name: 'strike', translator: strikeTranslator },
  ];

  translators.forEach(({ name, translator }) => {
    describe(`w:${name === 'bold' ? 'b' : name === 'italic' ? 'i' : 'strike'}`, () => {
      // Valid ON tokens
      it.each(['true', '1', 'on'])('encode w:val="%s" → true (ON)', (token) => {
        const result = translator.encode({ nodes: [{ attributes: { 'w:val': token } }] });
        expect(result).toBe(true);
      });

      // Valid OFF tokens
      it.each(['false', '0', 'off'])('encode w:val="%s" → false (OFF)', (token) => {
        const result = translator.encode({ nodes: [{ attributes: { 'w:val': token } }] });
        expect(result).toBe(false);
      });

      // Bare element
      it('encode bare element (no w:val) → true (ON)', () => {
        const result = translator.encode({ nodes: [{ attributes: {} }] });
        expect(result).toBe(true);
      });

      // Invalid tokens → CLEAR
      it.each(['True', 'FALSE', 'ON', 'yes', '', 'potato'])(
        'encode invalid w:val="%s" → undefined (CLEAR)',
        (token) => {
          const result = translator.encode({ nodes: [{ attributes: { 'w:val': token } }] });
          expect(result).toBeUndefined();
        },
      );
    });
  });
});

// ---------------------------------------------------------------------------
// §3: Core-4 toggle translators — decode (PM → OOXML export)
// ---------------------------------------------------------------------------
describe('strict toggle decode (bold, italic, strike)', () => {
  const translators = [
    { name: 'bold', sdName: 'bold', translator: boldTranslator },
    { name: 'italic', sdName: 'italic', translator: italicTranslator },
    { name: 'strike', sdName: 'strike', translator: strikeTranslator },
  ];

  translators.forEach(({ name, sdName, translator }) => {
    describe(`w:${name === 'bold' ? 'b' : name === 'italic' ? 'i' : 'strike'}`, () => {
      it('ON (true) → bare element (no w:val)', () => {
        const result = translator.decode({ node: { attrs: { [sdName]: true } } });
        expect(result).toEqual({ attributes: {} });
      });

      it('OFF (false) → w:val="0"', () => {
        const result = translator.decode({ node: { attrs: { [sdName]: false } } });
        expect(result).toEqual({ attributes: { 'w:val': '0' } });
      });

      it('CLEAR (undefined) → no element', () => {
        const result = translator.decode({ node: { attrs: {} } });
        expect(result).toBeUndefined();
      });

      it('CLEAR (null) → no element', () => {
        const result = translator.decode({ node: { attrs: { [sdName]: null } } });
        expect(result).toBeUndefined();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// §4: Toggle encode→decode roundtrip
// ---------------------------------------------------------------------------
describe('toggle encode→decode roundtrip', () => {
  const handler = createStrictTogglePropertyHandler('w:b', 'bold');

  it('ON roundtrip: encode ON → decode ON → bare element', () => {
    const encoded = handler.encode({ nodes: [{ attributes: {} }] });
    expect(encoded).toBe(true);
    const decoded = handler.decode({ node: { attrs: { bold: encoded } } });
    expect(decoded).toEqual({ attributes: {} });
  });

  it('OFF roundtrip: encode OFF → decode OFF → w:val="0"', () => {
    const encoded = handler.encode({ nodes: [{ attributes: { 'w:val': '0' } }] });
    expect(encoded).toBe(false);
    const decoded = handler.decode({ node: { attrs: { bold: encoded } } });
    expect(decoded).toEqual({ attributes: { 'w:val': '0' } });
  });

  it('CLEAR roundtrip: invalid token → no element', () => {
    const encoded = handler.encode({ nodes: [{ attributes: { 'w:val': 'INVALID' } }] });
    expect(encoded).toBeUndefined();
    // CLEAR means no attribute in PM → no element in export
    const decoded = handler.decode({ node: { attrs: {} } });
    expect(decoded).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §5: Underline encode — ST_Underline strict validation
// ---------------------------------------------------------------------------
describe('underline encode — ST_Underline validation', () => {
  const validOnTypes = [
    'single',
    'double',
    'thick',
    'dotted',
    'dottedHeavy',
    'dash',
    'dashedHeavy',
    'dashLong',
    'dashLongHeavy',
    'dotDash',
    'dashDotHeavy',
    'dotDotDash',
    'dashDotDotHeavy',
    'wave',
    'wavyHeavy',
    'wavyDouble',
    'words',
  ];

  describe('valid ON types', () => {
    it.each(validOnTypes)('encode w:val="%s" → accepted', (type) => {
      const result = underlineConfig.encode({ nodes: [{ attributes: { 'w:val': type } }] });
      expect(result).toBeDefined();
      expect(result.attributes['w:val']).toBe(type);
    });
  });

  describe('OFF type (none)', () => {
    it('encode w:val="none" → accepted with underlineType "none"', () => {
      const result = underlineConfig.encode({ nodes: [{ attributes: { 'w:val': 'none' } }] });
      expect(result).toBeDefined();
      expect(result.attributes['w:val']).toBe('none');
    });

    it('OFF state strips rich attrs even if present on source', () => {
      const result = underlineConfig.encode({
        nodes: [{ attributes: { 'w:val': 'none', 'w:color': 'FF0000', 'w:themeColor': 'accent1' } }],
      });
      expect(result).toBeDefined();
      expect(result.attributes).toEqual({ 'w:val': 'none' });
    });
  });

  describe('bare element', () => {
    it('encode bare element → ON with null underlineType', () => {
      const result = underlineConfig.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeDefined();
      expect(result.attributes['w:val']).toBeNull();
    });
  });

  describe('invalid tokens → CLEAR', () => {
    it.each([
      'Single', // wrong case
      'DOUBLE', // all caps
      'wavy', // not a valid ST_Underline token (correct is 'wave')
      'underline', // not an ST_Underline token
      '', // empty string
      'bold', // wrong property entirely
      'true', // ST_OnOff but not ST_Underline
    ])('encode invalid w:val="%s" → undefined (CLEAR)', (token) => {
      const result = underlineConfig.encode({ nodes: [{ attributes: { 'w:val': token } }] });
      expect(result).toBeUndefined();
    });
  });

  describe('rich attrs included for ON types', () => {
    it('includes color and theme attrs for ON types', () => {
      const result = underlineConfig.encode({
        nodes: [
          {
            attributes: {
              'w:val': 'single',
              'w:color': 'FF0000',
              'w:themeColor': 'accent1',
              'w:themeTint': '80',
              'w:themeShade': '0F',
            },
          },
        ],
      });
      expect(result.attributes).toEqual({
        'w:val': 'single',
        'w:color': 'FF0000',
        'w:themeColor': 'accent1',
        'w:themeTint': '80',
        'w:themeShade': '0F',
      });
    });
  });
});

// ---------------------------------------------------------------------------
// §6: Underline decode — canonical OOXML export
// ---------------------------------------------------------------------------
describe('underline decode — canonical export', () => {
  it('ON with type → w:val present', () => {
    const result = underlineTranslator.decode({
      node: { attrs: { underlineType: 'single' } },
    });
    expect(result).toBeDefined();
    expect(result.attributes['w:val']).toBe('single');
  });

  it('OFF (none) → w:val="none", no rich attrs', () => {
    const result = underlineTranslator.decode({
      node: { attrs: { underlineType: 'none', underlineColor: '#FF0000' } },
    });
    expect(result).toBeDefined();
    expect(result.attributes).toEqual({ 'w:val': 'none' });
  });

  it('CLEAR → no element', () => {
    const result = underlineTranslator.decode({
      node: { attrs: {} },
    });
    expect(result).toBeUndefined();
  });

  it('canonical attribute ordering: w:val before w:color before w:themeColor', () => {
    const result = underlineTranslator.decode({
      node: {
        attrs: {
          underlineType: 'wave',
          underlineColor: '#FF0000',
          underlineThemeColor: 'accent1',
          underlineThemeTint: '80',
          underlineThemeShade: '0F',
        },
      },
    });
    const keys = Object.keys(result.attributes);
    expect(keys).toEqual(['w:val', 'w:color', 'w:themeColor', 'w:themeTint', 'w:themeShade']);
  });
});

// ---------------------------------------------------------------------------
// §7: Non-fatal continuation — invalid tokens don't crash import
// ---------------------------------------------------------------------------
describe('non-fatal continuation', () => {
  it('invalid bold token returns undefined (does not throw)', () => {
    expect(() => {
      boldTranslator.encode({ nodes: [{ attributes: { 'w:val': 'GARBAGE' } }] });
    }).not.toThrow();
  });

  it('invalid italic token returns undefined (does not throw)', () => {
    expect(() => {
      italicTranslator.encode({ nodes: [{ attributes: { 'w:val': 'TrUe' } }] });
    }).not.toThrow();
  });

  it('invalid underline token returns undefined (does not throw)', () => {
    expect(() => {
      underlineConfig.encode({ nodes: [{ attributes: { 'w:val': 'not_an_underline' } }] });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// §8: Structured diagnostic collection — INVALID_INLINE_TOKEN records
// ---------------------------------------------------------------------------
describe('structured diagnostic collection', () => {
  beforeEach(() => {
    startCollection();
  });

  describe('toggle properties (bold, italic, strike)', () => {
    it('collects INVALID_INLINE_TOKEN for invalid bold w:val', () => {
      boldTranslator.encode({ nodes: [{ attributes: { 'w:val': 'GARBAGE' } }] });
      const diagnostics = drainDiagnostics();
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        code: 'INVALID_INLINE_TOKEN',
        property: 'bold',
        attribute: 'val',
        token: 'GARBAGE',
        xpath: 'w:b/@w:val',
      });
    });

    it('collects INVALID_INLINE_TOKEN for invalid italic w:val', () => {
      italicTranslator.encode({ nodes: [{ attributes: { 'w:val': 'TrUe' } }] });
      const diagnostics = drainDiagnostics();
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        code: 'INVALID_INLINE_TOKEN',
        property: 'italic',
        attribute: 'val',
        token: 'TrUe',
        xpath: 'w:i/@w:val',
      });
    });

    it('collects INVALID_INLINE_TOKEN for invalid strike w:val', () => {
      strikeTranslator.encode({ nodes: [{ attributes: { 'w:val': 'YES' } }] });
      const diagnostics = drainDiagnostics();
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        code: 'INVALID_INLINE_TOKEN',
        property: 'strike',
        attribute: 'val',
        token: 'YES',
        xpath: 'w:strike/@w:val',
      });
    });

    it('does NOT collect diagnostic for valid tokens', () => {
      boldTranslator.encode({ nodes: [{ attributes: { 'w:val': 'true' } }] });
      boldTranslator.encode({ nodes: [{ attributes: { 'w:val': '0' } }] });
      boldTranslator.encode({ nodes: [{ attributes: {} }] });
      const diagnostics = drainDiagnostics();
      expect(diagnostics).toHaveLength(0);
    });

    it('collects multiple diagnostics across properties', () => {
      boldTranslator.encode({ nodes: [{ attributes: { 'w:val': 'BAD1' } }] });
      italicTranslator.encode({ nodes: [{ attributes: { 'w:val': 'BAD2' } }] });
      strikeTranslator.encode({ nodes: [{ attributes: { 'w:val': 'BAD3' } }] });
      const diagnostics = drainDiagnostics();
      expect(diagnostics).toHaveLength(3);
      expect(diagnostics.map((d) => d.property)).toEqual(['bold', 'italic', 'strike']);
      expect(diagnostics.map((d) => d.token)).toEqual(['BAD1', 'BAD2', 'BAD3']);
    });
  });

  describe('underline', () => {
    it('collects INVALID_INLINE_TOKEN for invalid underline w:val', () => {
      underlineConfig.encode({ nodes: [{ attributes: { 'w:val': 'wavy' } }] });
      const diagnostics = drainDiagnostics();
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        code: 'INVALID_INLINE_TOKEN',
        property: 'underline',
        attribute: 'val',
        token: 'wavy',
      });
    });

    it('does NOT collect diagnostic for valid underline tokens', () => {
      underlineConfig.encode({ nodes: [{ attributes: { 'w:val': 'single' } }] });
      underlineConfig.encode({ nodes: [{ attributes: { 'w:val': 'none' } }] });
      underlineConfig.encode({ nodes: [{ attributes: {} }] });
      const diagnostics = drainDiagnostics();
      expect(diagnostics).toHaveLength(0);
    });
  });

  describe('drain resets buffer', () => {
    it('drainDiagnostics clears the collection', () => {
      boldTranslator.encode({ nodes: [{ attributes: { 'w:val': 'INVALID' } }] });
      expect(drainDiagnostics()).toHaveLength(1);
      expect(drainDiagnostics()).toHaveLength(0);
    });

    it('startCollection resets previous diagnostics', () => {
      boldTranslator.encode({ nodes: [{ attributes: { 'w:val': 'INVALID' } }] });
      startCollection();
      expect(drainDiagnostics()).toHaveLength(0);
    });
  });
});
