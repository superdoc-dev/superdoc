import { describe, it, expect } from 'vitest';
import { mergeTextNodes } from './mergeTextNodes.js';

const textNode = (text, marks) => ({ type: 'text', text, marks });
const mark = (type, attrs) => ({ type, attrs });

describe('mergeTextNodes', () => {
  it('returns original value when input is not an array', () => {
    const invalidInputs = [undefined, null, 'text', { foo: 'bar' }];

    invalidInputs.forEach((input) => {
      expect(mergeTextNodes(input)).toBe(input);
    });
  });

  it('merges consecutive text nodes when their marks match exactly', () => {
    const nodes = [
      textNode('Hello', [mark('bold', { level: 1 })]),
      textNode(' World', [mark('bold', { level: 1 })]),
      { type: 'paragraph', content: [] },
      textNode('Again', [mark('italic', { lang: 'en' })]),
      textNode('!', [mark('italic', { lang: 'en' })]),
    ];

    const result = mergeTextNodes(nodes);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      type: 'text',
      text: 'Hello World',
      marks: [{ type: 'bold', attrs: { level: 1 } }],
    });
    expect(result[1]).toEqual({ type: 'paragraph', content: [] });
    expect(result[2]).toMatchObject({
      type: 'text',
      text: 'Again!',
      marks: [{ type: 'italic', attrs: { lang: 'en' } }],
    });
  });

  it('does not merge when marks differ', () => {
    const nodes = [textNode('A', [mark('bold')]), textNode('B', [mark('italic')])];

    const result = mergeTextNodes(nodes);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: 'text', text: 'A', marks: [{ type: 'bold', attrs: {} }] });
    expect(result[1]).toMatchObject({ type: 'text', text: 'B', marks: [{ type: 'italic', attrs: {} }] });
  });

  it('flushes accumulated text nodes before pushing a non-text node', () => {
    const nodes = [
      textNode('One', undefined),
      textNode(' Two', undefined),
      { type: 'rule' },
      textNode('Three', undefined),
    ];

    const result = mergeTextNodes(nodes);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ type: 'text', text: 'One Two' });
    expect(result[0].marks).toBeUndefined();
    expect(result[1]).toEqual({ type: 'rule' });
    expect(result[2]).toMatchObject({ type: 'text', text: 'Three' });
  });

  it('treats missing attrs as empty objects when comparing marks', () => {
    const first = textNode('Start', [mark('underline')]);
    const second = textNode(' End', [mark('underline', {})]);

    const result = mergeTextNodes([first, second]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'text',
      text: 'Start End',
      marks: [{ type: 'underline', attrs: {} }],
    });
  });
});
