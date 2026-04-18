import { describe, it, expect } from 'vitest';
import { findNoteEntryById } from './note-entry-lookup.js';

describe('findNoteEntryById', () => {
  it('returns the matching regular entry', () => {
    const entries = [
      { id: '1', type: null, content: ['real content'] },
      { id: '2', type: null, content: ['other'] },
    ];
    expect(findNoteEntryById(entries, '1')?.content).toEqual(['real content']);
  });

  it('returns undefined when no entry matches', () => {
    const entries = [{ id: '1', type: null, content: [] }];
    expect(findNoteEntryById(entries, '99')).toBeUndefined();
  });

  it('returns the regular note when both a special and regular entry share the same id', () => {
    const entries = [
      { id: '1', type: 'continuationSeparator', content: [] },
      { id: '1', type: null, content: ['real content'] },
    ];
    const result = findNoteEntryById(entries, '1');
    expect(result?.type).toBeNull();
    expect(result?.content).toEqual(['real content']);
  });

  it('returns the regular note even when it appears before the special entry', () => {
    const entries = [
      { id: '1', type: null, content: ['real content'] },
      { id: '1', type: 'separator', content: [] },
    ];
    const result = findNoteEntryById(entries, '1');
    expect(result?.type).toBeNull();
  });

  it('falls back to the special entry when no regular note exists for the id', () => {
    const entries = [
      { id: '-1', type: 'separator', content: [] },
      { id: '0', type: 'continuationSeparator', content: [] },
    ];
    const result = findNoteEntryById(entries, '-1');
    expect(result?.type).toBe('separator');
  });

  it('handles undefined and null inputs gracefully', () => {
    expect(findNoteEntryById(undefined, '1')).toBeUndefined();
    expect(findNoteEntryById(null, '1')).toBeUndefined();
  });

  it('handles numeric id entries via string coercion', () => {
    const entries = [{ id: 5, type: null, content: ['five'] }];
    expect(
      findNoteEntryById(entries as { id: string | number; type: null; content: string[] }[], '5')?.content,
    ).toEqual(['five']);
  });
});
