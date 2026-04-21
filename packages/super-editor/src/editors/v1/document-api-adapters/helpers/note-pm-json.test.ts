import { describe, it, expect } from 'vitest';
import { normalizeNotePmJson } from './note-pm-json.js';

describe('normalizeNotePmJson', () => {
  it('returns the input unchanged when there is no content array', () => {
    const doc = { type: 'doc' };
    expect(normalizeNotePmJson(doc)).toEqual({ type: 'doc' });
  });

  it('drops empty leading run nodes inside paragraphs', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'run', content: [] },
            { type: 'run', content: [{ type: 'text', text: 'hello' }] },
          ],
        },
      ],
    };

    expect(normalizeNotePmJson(doc)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'run', content: [{ type: 'text', text: 'hello' }] }],
        },
      ],
    });
  });

  it('preserves empty run nodes outside paragraphs', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'custom',
          content: [{ type: 'run', content: [] }],
        },
      ],
    };

    expect(normalizeNotePmJson(doc)).toEqual(doc);
  });

  it('treats runs with no content array as empty and strips them from paragraphs', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'run' }, { type: 'text', text: 'x' }],
        },
      ],
    };

    expect(normalizeNotePmJson(doc)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'x' }],
        },
      ],
    });
  });

  it('recurses into nested structures', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'section',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'run', content: [] },
                { type: 'run', content: [{ type: 'text', text: 'deep' }] },
              ],
            },
          ],
        },
      ],
    };

    const normalized = normalizeNotePmJson(doc) as {
      content: Array<{ content: Array<{ content: unknown[] }> }>;
    };
    expect(normalized.content[0].content[0].content).toEqual([
      { type: 'run', content: [{ type: 'text', text: 'deep' }] },
    ]);
  });

  it('does not mutate the input document', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'run', content: [] }],
        },
      ],
    };
    const before = JSON.stringify(doc);
    normalizeNotePmJson(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });
});
