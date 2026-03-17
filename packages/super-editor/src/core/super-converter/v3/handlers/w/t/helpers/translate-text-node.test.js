import { describe, expect, it } from 'vitest';
import { getTextNodeForExport } from './translate-text-node.js';

const buildParams = (runProperties = {}) => ({
  extraParams: { runProperties },
  editor: { extensionService: { extensions: [] } },
});

describe('getTextNodeForExport', () => {
  it('adds a nested w:rPrChange for trackFormat marks', () => {
    const trackFormatMark = {
      type: 'trackFormat',
      attrs: {
        id: 'format-1',
        author: 'Missy Fox',
        authorEmail: '',
        date: '2026-01-07T20:24:39Z',
        before: [],
        after: [{ type: 'bold', attrs: { value: true } }],
      },
    };

    const result = getTextNodeForExport(
      'styles',
      [{ type: 'bold', attrs: { value: true } }, trackFormatMark],
      buildParams(),
    );

    const runProperties = result.elements.find((element) => element.name === 'w:rPr');
    expect(runProperties).toBeDefined();

    const runPropertiesChange = runProperties.elements.find((element) => element.name === 'w:rPrChange');
    expect(runPropertiesChange).toEqual(
      expect.objectContaining({
        name: 'w:rPrChange',
        attributes: expect.objectContaining({
          'w:id': 'format-1',
          'w:author': 'Missy Fox',
          'w:date': '2026-01-07T20:24:39Z',
        }),
      }),
    );

    const previousRunProperties = runPropertiesChange.elements.find((element) => element.name === 'w:rPr');
    expect(previousRunProperties).toBeDefined();
    expect(previousRunProperties.elements).toEqual([]);
  });

  it('creates an rPr node for pure trackFormat changes even without visible formatting marks', () => {
    const trackFormatMark = {
      type: 'trackFormat',
      attrs: {
        id: 'format-2',
        author: 'Missy Fox',
        authorEmail: '',
        date: '2026-01-07T20:24:39Z',
        before: [{ type: 'italic', attrs: { value: true } }],
        after: [],
      },
    };

    const result = getTextNodeForExport('plain', [trackFormatMark], buildParams());
    const runProperties = result.elements.find((element) => element.name === 'w:rPr');
    const runPropertiesChange = runProperties.elements.find((element) => element.name === 'w:rPrChange');
    const previousRunProperties = runPropertiesChange.elements.find((element) => element.name === 'w:rPr');

    expect(runProperties).toBeDefined();
    expect(previousRunProperties.elements).toEqual([
      expect.objectContaining({
        name: 'w:i',
      }),
    ]);
  });
});
