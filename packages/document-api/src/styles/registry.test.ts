import { describe, it, expect } from 'bun:test';
import { PROPERTY_REGISTRY, EXCLUDED_KEYS, STYLE_EXCLUDED_KEYS } from './registry.js';

// ---------------------------------------------------------------------------
// SD-2018 coverage gate — machine-checked completeness assertion
// ---------------------------------------------------------------------------

describe('SD-2018 coverage gate', () => {
  // SD-2018 enumerated what docDefaults accepts. The registry now also backs
  // the `style` scope, which reaches four run properties Word forbids in
  // docDefaults, so the gate filters to what this scope can actually reach —
  // the set it was written to pin — and the style-only additions are pinned
  // separately below.
  const registryKeys = (channel: 'run' | 'paragraph') =>
    PROPERTY_REGISTRY.filter((d) => d.channel === channel && !EXCLUDED_KEYS[channel].has(d.key))
      .map((d) => d.key)
      .sort();

  it('run channel contains exactly the SD-2018 property set', () => {
    expect(registryKeys('run')).toEqual(
      [
        'bold',
        'boldCs',
        'borders',
        'color',
        'dstrike',
        'eastAsianLayout',
        'effect',
        'em',
        'emboss',
        'fitText',
        'fontFamily',
        'fontSize',
        'fontSizeCs',
        'iCs',
        'imprint',
        'kern',
        'lang',
        'letterSpacing',
        'italic',
        'noProof',
        'outline',
        'position',
        'shading',
        'shadow',
        'smallCaps',
        'snapToGrid',
        'specVanish',
        'strike',
        'textTransform',
        'underline',
        'vanish',
        'vertAlign',
        'w',
        'webHidden',
      ].sort(),
    );
  });

  it('run channel reaches exactly four more properties under the style scope', () => {
    const styleScopeKeys = PROPERTY_REGISTRY.filter(
      (d) => d.channel === 'run' && !STYLE_EXCLUDED_KEYS.run.has(d.key),
    ).map((d) => d.key);
    expect(styleScopeKeys.filter((key) => EXCLUDED_KEYS.run.has(key)).sort()).toEqual(
      ['cs', 'highlight', 'oMath', 'rtl'].sort(),
    );
  });

  it('the paragraph channel is the same set in both scopes', () => {
    expect([...STYLE_EXCLUDED_KEYS.paragraph.keys()].sort()).toEqual([...EXCLUDED_KEYS.paragraph.keys()].sort());
  });

  it('paragraph channel contains exactly the SD-2018 property set', () => {
    expect(registryKeys('paragraph')).toEqual(
      [
        'adjustRightInd',
        'autoSpaceDE',
        'autoSpaceDN',
        'borders',
        'contextualSpacing',
        'framePr',
        'indent',
        'justification',
        'keepLines',
        'keepNext',
        'kinsoku',
        'mirrorIndents',
        'numberingProperties',
        'outlineLvl',
        'overflowPunct',
        'pageBreakBefore',
        'rightToLeft',
        'shading',
        'snapToGrid',
        'spacing',
        'suppressAutoHyphens',
        'suppressLineNumbers',
        'suppressOverlap',
        'tabStops',
        'textAlignment',
        'textDirection',
        'textboxTightWrap',
        'topLinePunct',
        'widowControl',
        'wordWrap',
      ].sort(),
    );
  });

  it('excluded keys are exactly the SD-2018 exclusion set', () => {
    expect([...EXCLUDED_KEYS.run.keys()].sort()).toEqual(
      ['cs', 'highlight', 'oMath', 'rPrChange', 'rStyle', 'rtl'].sort(),
    );
    expect([...EXCLUDED_KEYS.paragraph.keys()].sort()).toEqual(
      ['cnfStyle', 'divId', 'pPrChange', 'pStyle', 'runProperties', 'sectPr'].sort(),
    );
  });

  it('no duplicate keys in the registry', () => {
    const seen = new Set<string>();
    for (const def of PROPERTY_REGISTRY) {
      const id = `${def.channel}:${def.key}`;
      expect(seen.has(id), `Duplicate registry entry: ${id}`).toBe(false);
      seen.add(id);
    }
  });

  it('every registry entry has a valid mergeStrategy', () => {
    const validStrategies = new Set(['replace', 'shallowMerge', 'edgeMerge']);
    for (const def of PROPERTY_REGISTRY) {
      expect(
        validStrategies.has(def.mergeStrategy),
        `${def.channel}.${def.key} has invalid mergeStrategy: ${def.mergeStrategy}`,
      ).toBe(true);
    }
  });
});
