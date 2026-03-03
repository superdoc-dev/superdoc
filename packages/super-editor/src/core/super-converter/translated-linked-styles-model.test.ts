import { describe, expect, it } from 'vitest';
import {
  ensureTranslatedLinkedStylesModel,
  isTranslatedLinkedStylesModel,
  normalizeTranslatedLinkedStyles,
} from './translated-linked-styles-model.js';

describe('translated-linked-styles-model', () => {
  it('normalizes empty input into the canonical top-level shape', () => {
    const normalized = normalizeTranslatedLinkedStyles(undefined);

    expect(normalized).toEqual({
      docDefaults: {},
      latentStyles: { lsdExceptions: [] },
      styles: [],
    });
  });

  it('preserves existing style data while enforcing required branches', () => {
    const source = {
      docDefaults: { runProperties: { bold: true } },
      latentStyles: { defQFormat: true, lsdExceptions: [{ name: 'Normal' }] },
      styles: [{ type: 'paragraph', styleId: 'Heading1' }],
    };

    const normalized = normalizeTranslatedLinkedStyles(source);

    expect(normalized.docDefaults).toBe(source.docDefaults);
    expect(normalized.latentStyles.lsdExceptions).toBe(source.latentStyles.lsdExceptions);
    expect(normalized.styles).toBe(source.styles);
  });

  it('repairs invalid top-level branches to empty defaults', () => {
    const normalized = normalizeTranslatedLinkedStyles({
      docDefaults: 'bad',
      latentStyles: 123,
      styles: null,
    });

    expect(normalized).toEqual({
      docDefaults: {},
      latentStyles: { lsdExceptions: [] },
      styles: [],
    });
  });

  it('converts legacy keyed-object styles to array via Object.values', () => {
    const normalized = normalizeTranslatedLinkedStyles({
      docDefaults: {},
      latentStyles: { lsdExceptions: [] },
      styles: {
        Normal: { styleId: 'Normal', name: 'Normal', type: 'paragraph' },
        Heading1: { styleId: 'Heading1', name: 'Heading 1', type: 'paragraph' },
      },
    });

    expect(Array.isArray(normalized.styles)).toBe(true);
    expect(normalized.styles).toHaveLength(2);
    expect(normalized.styles.map((s) => s.styleId)).toContain('Normal');
    expect(normalized.styles.map((s) => s.styleId)).toContain('Heading1');
  });

  it('converts legacy keyed-object lsdExceptions to array via Object.values', () => {
    const normalized = normalizeTranslatedLinkedStyles({
      docDefaults: {},
      latentStyles: {
        defQFormat: true,
        lsdExceptions: {
          Normal: { name: 'Normal', uiPriority: 0 },
          NoList: { name: 'NoList', locked: true },
        },
      },
      styles: [],
    });

    expect(Array.isArray(normalized.latentStyles.lsdExceptions)).toBe(true);
    expect(normalized.latentStyles.lsdExceptions).toHaveLength(2);
    expect(normalized.latentStyles.lsdExceptions!.map((e) => e.name)).toContain('Normal');
    expect(normalized.latentStyles.lsdExceptions!.map((e) => e.name)).toContain('NoList');
    expect(normalized.latentStyles.defQFormat).toBe(true);
  });

  it('normalizes converter.translatedLinkedStyles in-place', () => {
    const converter = { translatedLinkedStyles: null as unknown };
    const model = ensureTranslatedLinkedStylesModel(converter);

    expect(converter.translatedLinkedStyles).toBe(model);
    expect(model).toEqual({
      docDefaults: {},
      latentStyles: { lsdExceptions: [] },
      styles: [],
    });
  });

  it('validates model shape with a type guard', () => {
    expect(isTranslatedLinkedStylesModel({ docDefaults: {}, latentStyles: { lsdExceptions: [] }, styles: [] })).toBe(
      true,
    );
    expect(isTranslatedLinkedStylesModel({ docDefaults: {}, latentStyles: { lsdExceptions: [] }, styles: {} })).toBe(
      false,
    );
    expect(isTranslatedLinkedStylesModel({ docDefaults: {} })).toBe(false);
    // latentStyles without lsdExceptions array fails the guard
    expect(isTranslatedLinkedStylesModel({ docDefaults: {}, latentStyles: {}, styles: [] })).toBe(false);
  });

  it('rejects legacy keyed-object lsdExceptions in the type guard', () => {
    // Legacy shape: lsdExceptions is a keyed object, not an array.
    // The guard must reject this so ensureTranslatedLinkedStylesModel
    // runs normalization instead of returning the un-normalized value.
    const legacy = {
      docDefaults: {},
      latentStyles: { lsdExceptions: { Normal: { name: 'Normal' } } },
      styles: [],
    };
    expect(isTranslatedLinkedStylesModel(legacy)).toBe(false);

    // ensureTranslatedLinkedStylesModel must normalize it
    const converter = { translatedLinkedStyles: legacy };
    const model = ensureTranslatedLinkedStylesModel(converter);
    expect(Array.isArray(model.latentStyles.lsdExceptions)).toBe(true);
  });
});
