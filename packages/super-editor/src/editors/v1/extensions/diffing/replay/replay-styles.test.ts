import { describe, expect, it, vi } from 'vitest';
import { replayStyles } from './replay-styles';

describe('replayStyles', () => {
  it('replays style diffs, syncs styles.xml, and emits style update event', () => {
    const converter = {
      translatedLinkedStyles: {
        docDefaults: {
          runProperties: {
            bold: false,
          },
        },
        latentStyles: {
          defQFormat: false,
        },
        styles: {
          Normal: {
            styleId: 'Normal',
            type: 'paragraph',
            name: 'Normal',
          },
          Gone: {
            styleId: 'Gone',
            type: 'paragraph',
            name: 'Remove me',
          },
        },
      },
      convertedXml: {
        'word/styles.xml': {
          elements: [
            {
              name: 'w:styles',
              attributes: {
                'mc:Ignorable': 'w14',
              },
              elements: [
                { name: 'w:docDefaults', elements: [] },
                { name: 'w:latentStyles', elements: [] },
                { name: 'w:style', attributes: { 'w:styleId': 'Normal' }, elements: [] },
                { name: 'w:style', attributes: { 'w:styleId': 'Gone' }, elements: [] },
                { name: 'w:customUnknown', attributes: { keep: 'yes' }, elements: [] },
              ],
            },
          ],
        },
      },
      promoteToGuid: vi.fn(() => 'guid-1'),
      documentModified: false,
    };
    const editor = {
      converter,
      emit: vi.fn(),
    };

    const result = replayStyles({
      stylesDiff: {
        docDefaultsDiff: {
          added: {},
          deleted: {},
          modified: {
            'runProperties.bold': { from: false, to: true },
          },
        },
        latentStylesDiff: {
          added: {},
          deleted: {},
          modified: {
            defQFormat: { from: false, to: true },
          },
        },
        addedStyles: {
          Added: {
            styleId: 'Added',
            type: 'paragraph',
            name: 'Added Style',
          },
        },
        removedStyles: {
          Gone: {
            styleId: 'Gone',
            type: 'paragraph',
            name: 'Remove me',
          },
        },
        modifiedStyles: {
          Normal: {
            added: {
              'runProperties.italic': true,
            },
            deleted: {},
            modified: {
              name: { from: 'Normal', to: 'Normal Updated' },
            },
          },
        },
      },
      editor,
    });

    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
    expect(editor.emit).toHaveBeenCalledWith('stylesDefaultsChanged');
    expect(converter.documentModified).toBe(true);
    expect(converter.promoteToGuid).toHaveBeenCalledTimes(1);

    expect(converter.translatedLinkedStyles.docDefaults.runProperties.bold).toBe(true);
    expect(converter.translatedLinkedStyles.latentStyles.defQFormat).toBe(true);
    expect(converter.translatedLinkedStyles.styles.Gone).toBeUndefined();
    expect(converter.translatedLinkedStyles.styles.Added).toBeDefined();
    expect(converter.translatedLinkedStyles.styles.Normal.name).toBe('Normal Updated');
    expect(converter.translatedLinkedStyles.styles.Normal.runProperties.italic).toBe(true);

    const stylesRoot = converter.convertedXml['word/styles.xml'].elements[0];
    const styleIds = stylesRoot.elements
      .filter((element) => element.name === 'w:style')
      .map((element) => element.attributes?.['w:styleId']);
    expect(styleIds).toContain('Normal');
    expect(styleIds).toContain('Added');
    expect(styleIds).not.toContain('Gone');
    expect(stylesRoot.elements.some((element) => element.name === 'w:customUnknown')).toBe(true);
  });

  it('skips when converter is not available', () => {
    const result = replayStyles({
      stylesDiff: {
        docDefaultsDiff: null,
        latentStylesDiff: null,
        addedStyles: {},
        removedStyles: {},
        modifiedStyles: {},
      },
      editor: undefined,
    });

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.warnings[0]).toContain('converter is unavailable');
  });
});
