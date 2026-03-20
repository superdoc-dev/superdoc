import { describe, it, expect } from 'vitest';
import { Schema, Slice, Fragment } from 'prosemirror-model';
import {
  getLinkedStyle,
  getSpacingStyle,
  getSpacingStyleString,
  getMarksStyle,
  getQuickFormatList,
  generateLinkedStyleString,
  stepInsertsTextIntoStyledParagraph,
} from './helpers.js';
import { getUnderlineCssString } from './underline-css.js';

const normalizeCss = (css) =>
  css
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .sort()
    .join('; ');

describe('getLinkedStyle', () => {
  it('returns linked and basedOn styles', () => {
    const styles = [
      { id: 'Base', definition: { attrs: {} } },
      { id: 'Heading1', definition: { attrs: { basedOn: 'Base' } } },
    ];
    const { linkedStyle, basedOnStyle } = getLinkedStyle('Heading1', styles);
    expect(linkedStyle.id).toBe('Heading1');
    expect(basedOnStyle.id).toBe('Base');
  });

  it('returns undefined basedOn when missing', () => {
    const styles = [{ id: 'Normal', definition: { attrs: {} } }];
    const { linkedStyle, basedOnStyle } = getLinkedStyle('Normal', styles);
    expect(linkedStyle.id).toBe('Normal');
    expect(basedOnStyle).toBeUndefined();
  });
});

describe('spacing helpers', () => {
  const spacing = { before: 180, after: 120, line: 24, lineRule: 'auto' };

  it('getSpacingStyle returns CSS property map', () => {
    const style = getSpacingStyle({ lineSpaceBefore: 12, lineSpaceAfter: 8, line: 24, lineRule: 'auto' });
    expect(style['margin-top']).toBe('12px');
    expect(style['margin-bottom']).toBe('8px');
  });

  it('getSpacingStyleString returns trimmed CSS string', () => {
    const css = getSpacingStyleString(spacing);
    expect(css).toContain('margin-top: 12px');
    expect(css).toContain('margin-bottom: 8px');
  });
});

describe('getMarksStyle', () => {
  it('translates mark attrs into CSS string', () => {
    const css = getMarksStyle([
      { type: 'bold' },
      { type: 'italic' },
      { type: 'highlight', attrs: { color: '#FFFF00' } },
      { type: 'textStyle', attrs: { fontFamily: 'Inter', fontSize: '14pt' } },
    ]);
    expect(css).toContain('font-weight: bold');
    expect(css).toContain('font-style: italic');
    expect(css).toContain('background-color: #FFFF00');
    expect(css).toContain('font-family: Inter');
    expect(css).toContain('font-size: 14pt');
  });
});

describe('getQuickFormatList', () => {
  it('returns [] when editor is missing', () => {
    expect(getQuickFormatList(undefined)).toEqual([]);
    expect(getQuickFormatList(null)).toEqual([]);
    expect(getQuickFormatList({})).toEqual([]);
    expect(getQuickFormatList({ converter: {} })).toEqual([]);
    expect(getQuickFormatList({ converter: { linkedStyles: null } })).toEqual([]);
  });

  it('returns [] when linkedStyles is empty', () => {
    const editor = { converter: { linkedStyles: [] } };
    expect(getQuickFormatList(editor)).toEqual([]);
  });

  it('filters to paragraph styles with definition.attrs present', () => {
    const editor = {
      converter: {
        linkedStyles: [
          // kept: paragraph + attrs
          { type: 'paragraph', definition: { attrs: { name: 'Para A', foo: 1 } } },
          // dropped: not paragraph
          { type: 'heading', definition: { attrs: { name: 'Heading 1' } } },
          // dropped: paragraph without attrs
          { type: 'paragraph', definition: {} },
          // dropped: paragraph with no definition
          { type: 'paragraph' },
        ],
      },
    };

    const out = getQuickFormatList(editor);
    expect(out).toHaveLength(1);
    expect(out[0].definition.attrs.name).toBe('Para A');
  });

  it('sorts by attrs.name (undefined treated as empty string)', () => {
    const editor = {
      converter: {
        linkedStyles: [
          // name undefined -> treated as ''
          { type: 'paragraph', definition: { attrs: {} } },
          { type: 'paragraph', definition: { attrs: { name: 'Zebra' } } },
          { type: 'paragraph', definition: { attrs: { name: 'alpha' } } },
          { type: 'paragraph', definition: { attrs: { name: 'Beta' } } },
          // non-paragraph should be ignored regardless of name
          { type: 'heading', definition: { attrs: { name: 'AAA' } } },
        ],
      },
    };

    const out = getQuickFormatList(editor);
    const names = out.map((s) => s.definition.attrs.name ?? '');
    // Expect empty-string entry first, then ascending by localeCompare
    expect(names[0]).toBe(''); // the undefined-name entry
    // The rest should be sorted lexicographically per localeCompare
    expect(names.slice(1)).toEqual([...names.slice(1)].sort((a, b) => a.localeCompare(b)));
  });

  it('does not throw if some items lack definition entirely (they are filtered out)', () => {
    const editor = {
      converter: {
        linkedStyles: [
          { type: 'paragraph' },
          { type: 'paragraph', definition: null },
          { type: 'paragraph', definition: { attrs: { name: 'Keep me' } } },
        ],
      },
    };

    const out = getQuickFormatList(editor);
    expect(out).toHaveLength(1);
    expect(out[0].definition.attrs.name).toBe('Keep me');
  });

  it('does not mutate the original linkedStyles array', () => {
    const linkedStyles = [
      { type: 'paragraph', definition: { attrs: { name: 'B' } } },
      { type: 'paragraph', definition: { attrs: { name: 'A' } } },
    ];
    const editor = { converter: { linkedStyles } };

    const before = JSON.stringify(linkedStyles);
    const out = getQuickFormatList(editor);

    expect(out.map((s) => s.definition.attrs.name)).toEqual(['A', 'B']); // sorted
    expect(JSON.stringify(linkedStyles)).toBe(before); // original unchanged
  });
});

describe('generateLinkedStyleString', () => {
  const paragraphNode = (marks = [], typeName = 'paragraph') => ({
    marks,
    type: { name: typeName },
  });
  const parentNode = (attrs = {}) => ({ attrs });

  const linkedStyle = (styles) => ({ definition: { styles } });

  it('returns empty string when linked style has no styles', () => {
    expect(generateLinkedStyleString(linkedStyle({}), null)).toBe('');
  });

  it('applies inherited styles from basedOn when missing locally', () => {
    const result = generateLinkedStyleString(
      linkedStyle({}),
      { definition: { styles: { 'font-family': 'Inter' } } },
      paragraphNode(),
      parentNode(),
    );
    expect(result).toContain('font-family: Inter');
  });

  it('honours bold/italic/strike defaults when node lacks overriding marks', () => {
    const style = linkedStyle({ bold: true, italic: { value: '1' }, strike: true });
    const css = normalizeCss(generateLinkedStyleString(style, null, paragraphNode(), parentNode())).split('; ');
    expect(css).toContain('font-style: italic');
    expect(css).toContain('font-weight: bold');
    expect(css).toContain('text-decoration: line-through');
  });

  it('does not override when node already has matching marks', () => {
    const marks = [
      { type: { name: 'bold' }, attrs: { value: '1' } },
      { type: { name: 'italic' }, attrs: { value: '1' } },
    ];
    const css = generateLinkedStyleString(
      linkedStyle({ bold: true, italic: true }),
      null,
      paragraphNode(marks),
      parentNode(),
    );
    expect(css).not.toContain('font-weight');
    expect(css).not.toContain('font-style');
  });

  it('merges underline styles via underline-css helper', () => {
    const style = linkedStyle({ underline: { value: 'dash', color: '#FF0000' } });
    const css = generateLinkedStyleString(style, null, paragraphNode(), parentNode());
    const expected = normalizeCss(getUnderlineCssString({ type: 'dash', color: '#FF0000' }));
    expect(normalizeCss(css)).toContain(expected);
  });

  it('honours includeSpacing=false to skip spacing/indent', () => {
    const style = linkedStyle({
      spacing: { lineSpaceBefore: 10, lineSpaceAfter: 5, line: null },
      indent: { firstLine: 20 },
    });
    const css = generateLinkedStyleString(style, null, paragraphNode(), parentNode(), false);
    expect(css).not.toContain('margin-top');
    expect(css).not.toContain('text-indent');
  });
});

describe('stepInsertsTextIntoStyledParagraph', () => {
  const createSchema = () =>
    new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'inline*',
          group: 'block',
          attrs: {
            paragraphProperties: { default: {} },
          },
        },
        text: { group: 'inline' },
      },
      marks: {},
    });

  const createDoc = (schema, styleId) => {
    const paragraph = schema.nodes.paragraph.create(
      { paragraphProperties: styleId ? { styleId } : {} },
      schema.text('Existing text'),
    );
    return schema.nodes.doc.create(null, [paragraph]);
  };

  const createStep = (schema, text) => {
    const fragment = typeof text === 'string' ? Fragment.from(schema.text(text)) : Fragment.empty;
    const slice = new Slice(fragment, 0, 0);
    return { slice, from: 1 };
  };

  it('returns true when text is inserted into a styled paragraph', () => {
    const schema = createSchema();
    const doc = createDoc(schema, 'Heading1');
    const step = createStep(schema, 'a');
    const result = stepInsertsTextIntoStyledParagraph({ docs: [doc] }, { doc }, step, 0);
    expect(result).toBe(true);
  });

  it('returns false when paragraph has no styleId', () => {
    const schema = createSchema();
    const doc = createDoc(schema, null);
    const step = createStep(schema, 'a');
    const result = stepInsertsTextIntoStyledParagraph({ docs: [doc] }, { doc }, step, 0);
    expect(result).toBe(false);
  });

  it('returns false when the inserted slice does not contain text', () => {
    const schema = createSchema();
    const doc = createDoc(schema, 'Heading1');
    const step = createStep(schema, null);
    const result = stepInsertsTextIntoStyledParagraph({ docs: [doc] }, { doc }, step, 0);
    expect(result).toBe(false);
  });
});
