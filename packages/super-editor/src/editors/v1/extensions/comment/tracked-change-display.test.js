import { describe, it, expect } from 'vitest';
import {
  resolveTrackedFormatDisplay,
  HyperlinkAddedDisplayType,
  HyperlinkModifiedDisplayType,
} from './tracked-change-display.js';

const makeNode = ({ text = '', marks = [] } = {}) => ({
  text,
  textContent: text,
  marks,
});

const makeLinkMark = (href = 'https://example.com') => ({
  type: { name: 'link' },
  attrs: { href },
});

describe('resolveTrackedFormatDisplay', () => {
  it('returns null when attrs have no link in after snapshots and no underline-only delta', () => {
    const result = resolveTrackedFormatDisplay({
      attrs: { before: [], after: [{ type: 'bold', attrs: {} }] },
      nodes: [],
    });
    expect(result).toBeNull();
  });

  it('detects hyperlink added when link snapshot is in after array', () => {
    const result = resolveTrackedFormatDisplay({
      attrs: {
        before: [],
        after: [
          { type: 'underline', attrs: {} },
          { type: 'link', attrs: { href: 'https://example.com', text: 'click' } },
        ],
      },
      nodes: [makeNode({ text: 'click' })],
    });
    expect(result).toEqual({
      trackedChangeDisplayType: HyperlinkAddedDisplayType,
      trackedChangeText: 'https://example.com',
    });
  });

  it('returns hyperlinkModified when link exists in both before and after (link edit)', () => {
    const result = resolveTrackedFormatDisplay({
      attrs: {
        before: [{ type: 'link', attrs: { href: 'https://old.com' } }],
        after: [{ type: 'link', attrs: { href: 'https://new.com' } }],
      },
      nodes: [makeNode({ text: 'click' })],
    });
    expect(result).toEqual({
      trackedChangeDisplayType: HyperlinkModifiedDisplayType,
      trackedChangeText: 'https://new.com',
    });
  });

  it('suppresses no-op link re-saves by returning empty text', () => {
    const result = resolveTrackedFormatDisplay({
      attrs: {
        before: [{ type: 'link', attrs: { href: 'https://example.com' } }],
        after: [
          { type: 'link', attrs: { href: 'https://example.com' } },
          { type: 'underline', attrs: {} },
        ],
      },
      nodes: [makeNode({ text: 'click' })],
    });
    expect(result).toEqual({
      trackedChangeDisplayType: null,
      trackedChangeText: '',
    });
  });

  it('treats same-target link text edits as a modification, not a no-op', () => {
    const result = resolveTrackedFormatDisplay({
      attrs: {
        before: [{ type: 'link', attrs: { href: 'https://example.com', text: 'old label' } }],
        after: [
          { type: 'link', attrs: { href: 'https://example.com', text: 'new label' } },
          { type: 'underline', attrs: {} },
        ],
      },
      nodes: [makeNode({ text: 'new label' })],
    });
    expect(result).toEqual({
      trackedChangeDisplayType: HyperlinkModifiedDisplayType,
      trackedChangeText: 'https://example.com',
    });
  });

  it('returns null for link modification when no label can be resolved', () => {
    const result = resolveTrackedFormatDisplay({
      attrs: {
        before: [{ type: 'link', attrs: { href: 'https://old.com' } }],
        after: [{ type: 'link', attrs: {} }],
      },
      nodes: [],
    });
    expect(result).toBeNull();
  });

  it('uses anchor attribute when href is absent', () => {
    const result = resolveTrackedFormatDisplay({
      attrs: {
        before: [],
        after: [{ type: 'link', attrs: { anchor: 'heading-1' } }],
      },
      nodes: [makeNode({ text: 'link text' })],
    });
    expect(result).toEqual({
      trackedChangeDisplayType: HyperlinkAddedDisplayType,
      trackedChangeText: '#heading-1',
    });
  });

  it('falls back to link text attr when href and anchor are empty', () => {
    const result = resolveTrackedFormatDisplay({
      attrs: {
        before: [],
        after: [{ type: 'link', attrs: { href: '', text: 'display text' } }],
      },
      nodes: [],
    });
    expect(result).toEqual({
      trackedChangeDisplayType: HyperlinkAddedDisplayType,
      trackedChangeText: 'display text',
    });
  });

  it('falls back to node text when link snapshot has no useful attributes', () => {
    const result = resolveTrackedFormatDisplay({
      attrs: {
        before: [],
        after: [{ type: 'link', attrs: {} }],
      },
      nodes: [makeNode({ text: 'node content' })],
    });
    expect(result).toEqual({
      trackedChangeDisplayType: HyperlinkAddedDisplayType,
      trackedChangeText: 'node content',
    });
  });

  it('returns null when no label can be resolved from any source', () => {
    const result = resolveTrackedFormatDisplay({
      attrs: {
        before: [],
        after: [{ type: 'link', attrs: {} }],
      },
      nodes: [],
    });
    expect(result).toBeNull();
  });

  it('infers hyperlink from live link mark when format delta is underline-only', () => {
    const result = resolveTrackedFormatDisplay({
      attrs: {
        before: [],
        after: [{ type: 'underline', attrs: {} }],
      },
      nodes: [makeNode({ text: 'website', marks: [makeLinkMark('https://inferred.com')] })],
    });
    expect(result).toEqual({
      trackedChangeDisplayType: HyperlinkAddedDisplayType,
      trackedChangeText: 'https://inferred.com',
    });
  });

  it('does not infer hyperlink when format delta includes more than underline', () => {
    const result = resolveTrackedFormatDisplay({
      attrs: {
        before: [],
        after: [
          { type: 'underline', attrs: {} },
          { type: 'bold', attrs: {} },
        ],
      },
      nodes: [makeNode({ text: 'text', marks: [makeLinkMark()] })],
    });
    expect(result).toBeNull();
  });

  it('does not infer hyperlink when format delta removes marks alongside underline add', () => {
    const result = resolveTrackedFormatDisplay({
      attrs: {
        before: [{ type: 'italic', attrs: {} }],
        after: [{ type: 'underline', attrs: {} }],
      },
      nodes: [makeNode({ text: 'text', marks: [makeLinkMark()] })],
    });
    expect(result).toBeNull();
  });

  it('handles missing attrs gracefully', () => {
    expect(resolveTrackedFormatDisplay({ attrs: undefined, nodes: [] })).toBeNull();
    expect(resolveTrackedFormatDisplay({ attrs: {}, nodes: [] })).toBeNull();
  });

  it('handles non-array before/after gracefully', () => {
    const result = resolveTrackedFormatDisplay({
      attrs: { before: 'invalid', after: null },
      nodes: [],
    });
    expect(result).toBeNull();
  });

  it('joins text from multiple nodes', () => {
    const result = resolveTrackedFormatDisplay({
      attrs: {
        before: [],
        after: [{ type: 'link', attrs: {} }],
      },
      nodes: [makeNode({ text: 'hello ' }), makeNode({ text: 'world' })],
    });
    expect(result).toEqual({
      trackedChangeDisplayType: HyperlinkAddedDisplayType,
      trackedChangeText: 'hello world',
    });
  });
});
