import { describe, it, expect } from 'vitest';
import { schema } from 'prosemirror-test-builder';
import { getHTMLFromFragment } from './getHTMLFromFragment.js';

describe('getHTMLFromFragment', () => {
  it('serializes a fragment to HTML', () => {
    const fragment = schema.node('paragraph', null, schema.text('Hello')).content;
    expect(getHTMLFromFragment(fragment, schema)).toBe('Hello');
  });
});
