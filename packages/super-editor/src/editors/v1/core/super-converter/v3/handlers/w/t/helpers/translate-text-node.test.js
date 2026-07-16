import { describe, expect, it, vi } from 'vitest';
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
          'w:id': expect.stringMatching(/^\d+$/),
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

  it('does not emit a non-standard w:authorEmail on w:rPrChange even when the mark carries one', () => {
    const trackFormatMark = {
      type: 'trackFormat',
      attrs: {
        id: 'format-email',
        author: 'Missy Fox',
        authorEmail: 'missy.fox@example.com',
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
    const runPropertiesChange = runProperties.elements.find((element) => element.name === 'w:rPrChange');
    expect(runPropertiesChange.attributes).toEqual(
      expect.objectContaining({
        'w:id': expect.stringMatching(/^\d+$/),
        'w:author': 'Missy Fox',
        'w:date': '2026-01-07T20:24:39Z',
      }),
    );
    expect(runPropertiesChange.attributes).not.toHaveProperty('w:authorEmail');
  });

  it('uses the Word revision id allocator for trackFormat export ids', () => {
    const allocate = vi.fn(() => '7');
    const trackFormatMark = {
      type: 'trackFormat',
      attrs: {
        id: 'format-allocated',
        sourceId: '',
        author: 'Missy Fox',
        authorEmail: '',
        date: '2026-01-07T20:24:39Z',
        before: [],
        after: [{ type: 'bold', attrs: { value: true } }],
      },
    };

    const result = getTextNodeForExport('styles', [trackFormatMark], {
      ...buildParams(),
      converter: { wordIdAllocator: { allocate } },
      currentPartPath: 'word/header1.xml',
    });

    expect(allocate).toHaveBeenCalledWith({
      partPath: 'word/header1.xml',
      sourceId: '',
      logicalId: 'format-allocated',
    });

    const runProperties = result.elements.find((element) => element.name === 'w:rPr');
    const runPropertiesChange = runProperties.elements.find((element) => element.name === 'w:rPrChange');
    expect(runPropertiesChange.attributes['w:id']).toBe('7');
  });

  // SD-3278 export safety net: a raw newline left inside a PM text
  // node (e.g. from an imported .docx that stored breaks as literal '\n') must
  // export as a Word-native <w:br/>, not a collapsed newline inside <w:t>.
  describe('raw newline export safety net', () => {
    const contentElements = (result) => result.elements.filter((el) => el.name === 'w:t' || el.name === 'w:br');

    it('exports a single newline as <w:t>/<w:br/>/<w:t> within one run', () => {
      const result = getTextNodeForExport('Alpha\nBeta', [], buildParams());
      expect(result.name).toBe('w:r');
      const content = contentElements(result);
      expect(content.map((el) => el.name)).toEqual(['w:t', 'w:br', 'w:t']);
      expect(content[0].elements[0].text).toBe('Alpha');
      expect(content[2].elements[0].text).toBe('Beta');
    });

    it('never leaves a raw newline inside a <w:t>', () => {
      const result = getTextNodeForExport('Alpha\nBeta', [], buildParams());
      const texts = result.elements.filter((el) => el.name === 'w:t');
      expect(texts.some((el) => el.elements[0].text.includes('\n'))).toBe(false);
    });

    it('emits a soft break (no w:type="page") for the <w:br/>', () => {
      const result = getTextNodeForExport('Alpha\nBeta', [], buildParams());
      const br = result.elements.find((el) => el.name === 'w:br');
      expect(br).toBeDefined();
      expect(br.attributes?.['w:type']).toBeUndefined();
    });

    it('leaves newline-free text as a single <w:t> (unchanged)', () => {
      const result = getTextNodeForExport('hello world', [], buildParams());
      const content = contentElements(result);
      expect(content).toHaveLength(1);
      expect(content[0].name).toBe('w:t');
      expect(content[0].elements[0].text).toBe('hello world');
    });

    it('emits a <w:br/> for each newline including leading, trailing, and consecutive newlines', () => {
      const result = getTextNodeForExport('\nA\n\nB\n', [], buildParams());
      const content = contentElements(result);
      expect(content.map((el) => el.name)).toEqual(['w:br', 'w:t', 'w:br', 'w:br', 'w:t', 'w:br']);
      const texts = content.filter((el) => el.name === 'w:t').map((el) => el.elements[0].text);
      expect(texts).toEqual(['A', 'B']);
    });

    it('sets xml:space="preserve" only on segments with edge whitespace', () => {
      const result = getTextNodeForExport('Alpha \n Beta', [], buildParams());
      const texts = result.elements.filter((el) => el.name === 'w:t');
      expect(texts[0].elements[0].text).toBe('Alpha ');
      expect(texts[0].attributes).toEqual({ 'xml:space': 'preserve' });
      expect(texts[1].elements[0].text).toBe(' Beta');
      expect(texts[1].attributes).toEqual({ 'xml:space': 'preserve' });
    });

    it('does not set xml:space on segments without edge whitespace', () => {
      const result = getTextNodeForExport('Alpha\nBeta', [], buildParams());
      const texts = result.elements.filter((el) => el.name === 'w:t');
      expect(texts[0].attributes).toBeNull();
      expect(texts[1].attributes).toBeNull();
    });

    it('normalizes CRLF to a <w:br/> on export', () => {
      const content = contentElements(getTextNodeForExport('Alpha\r\nBeta', [], buildParams()));
      expect(content.map((el) => el.name)).toEqual(['w:t', 'w:br', 'w:t']);
      expect(content[0].elements[0].text).toBe('Alpha');
      expect(content[2].elements[0].text).toBe('Beta');
    });

    it('normalizes a bare CR to a <w:br/> without leaving a stray carriage return in <w:t>', () => {
      const result = getTextNodeForExport('Alpha\rBeta', [], buildParams());
      const content = contentElements(result);
      expect(content.map((el) => el.name)).toEqual(['w:t', 'w:br', 'w:t']);
      const texts = result.elements.filter((el) => el.name === 'w:t');
      expect(texts.some((el) => el.elements[0].text.includes('\r'))).toBe(false);
    });
  });
});
