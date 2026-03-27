import { describe, expect, it, vi } from 'vitest';
import { replayNumbering } from './replay-numbering';

describe('replayNumbering', () => {
  it('applies numbering diffs and rebuilds the legacy numbering model', () => {
    const converter = {
      translatedNumbering: {
        abstracts: {
          '1': {
            abstractNumId: 1,
            levels: {
              '0': {
                ilvl: 0,
                start: 1,
                numFmt: { val: 'decimal' },
                lvlText: '%1.',
              },
            },
          },
        },
        definitions: {
          '10': {
            numId: 10,
            abstractNumId: 1,
          },
        },
      },
      numbering: {
        abstracts: {},
        definitions: {},
      },
      documentModified: false,
      promoteToGuid: vi.fn(),
    };
    const emit = vi.fn();

    const result = replayNumbering({
      numberingDiff: {
        added: {
          'definitions.11.numId': 11,
          'definitions.11.abstractNumId': 1,
        },
        deleted: {
          'definitions.10.numId': 10,
          'definitions.10.abstractNumId': 1,
        },
        modified: {
          'abstracts.1.levels.0.lvlText': {
            from: '%1.',
            to: '%1)',
          },
        },
      },
      editor: {
        converter,
        emit,
      },
    });

    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.warnings).toEqual([]);

    expect(converter.translatedNumbering.definitions['10']).toBeUndefined();
    expect(converter.translatedNumbering.definitions['11']).toEqual({
      numId: 11,
      abstractNumId: 1,
    });
    expect(converter.translatedNumbering.abstracts['1'].levels['0'].lvlText).toBe('%1)');

    expect(converter.numbering.definitions['10']).toBeUndefined();
    expect(converter.numbering.definitions['11']?.name).toBe('w:num');
    expect(converter.numbering.definitions['11']?.attributes?.['w:numId']).toBe('11');

    const rawAbstract = converter.numbering.abstracts['1'];
    const levelNode = rawAbstract?.elements?.find((element) => element.name === 'w:lvl');
    const lvlTextNode = levelNode?.elements?.find((element) => element.name === 'w:lvlText');
    expect(lvlTextNode?.attributes?.['w:val']).toBe('%1)');

    expect(converter.documentModified).toBe(true);
    expect(converter.promoteToGuid).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      'list-definitions-change',
      expect.objectContaining({
        change: { type: 'replay-numbering' },
      }),
    );
  });

  it('skips replay when converter is unavailable', () => {
    const result = replayNumbering({
      numberingDiff: {
        added: {},
        deleted: {},
        modified: {
          'definitions.1.numId': {
            from: 1,
            to: 2,
          },
        },
      },
    });

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.warnings).toEqual(['Numbering replay skipped: editor converter is unavailable.']);
  });
});
