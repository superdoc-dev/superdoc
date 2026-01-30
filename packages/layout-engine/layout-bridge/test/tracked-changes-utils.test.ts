import { describe, it, expect } from 'bun:test';
import { hasTrackedChange, resolveTrackedChangesEnabled } from '../src/tracked-changes-utils';
import type { Run, TextRun, TabRun, TrackedChangeMeta, ParagraphBlock } from '@superdoc/contracts';

describe('hasTrackedChange', () => {
  it('returns true for TextRun with trackedChange metadata', () => {
    const run: TextRun = {
      text: 'hello',
      fontFamily: 'Arial',
      fontSize: 16,
      trackedChange: {
        kind: 'insertion',
        id: 'tc-1',
        author: 'John Doe',
        date: '2025-01-01T00:00:00Z',
      },
    };

    expect(hasTrackedChange(run)).toBe(true);

    // Verify type narrowing
    if (hasTrackedChange(run)) {
      // TypeScript should know trackedChange exists
      expect(run.trackedChange.kind).toBe('insertion');
      expect(run.trackedChange.id).toBe('tc-1');
      expect(run.trackedChange.author).toBe('John Doe');
    }
  });

  it('returns false for TabRun', () => {
    const run: TabRun = {
      kind: 'tab',
      width: 20,
    };

    expect(hasTrackedChange(run)).toBe(false);
  });

  it('returns false for TextRun without trackedChange', () => {
    const run: TextRun = {
      text: 'hello',
      fontFamily: 'Arial',
      fontSize: 16,
    };

    expect(hasTrackedChange(run)).toBe(false);
  });

  it('returns false for runs with null trackedChange', () => {
    const run: TextRun = {
      text: 'hello',
      fontFamily: 'Arial',
      fontSize: 16,
      trackedChange: null as unknown as TrackedChangeMeta,
    };

    expect(hasTrackedChange(run)).toBe(false);
  });

  it('returns false for runs with undefined trackedChange', () => {
    const run: TextRun = {
      text: 'hello',
      fontFamily: 'Arial',
      fontSize: 16,
      trackedChange: undefined as unknown as TrackedChangeMeta,
    };

    expect(hasTrackedChange(run)).toBe(false);
  });

  it('narrows type correctly to TextRun & { trackedChange: TrackedChangeMeta }', () => {
    const run: Run = {
      text: 'test',
      fontFamily: 'Arial',
      fontSize: 16,
      trackedChange: {
        kind: 'deletion',
        id: 'tc-2',
        author: 'Jane Smith',
        date: '2025-01-02T00:00:00Z',
        before: { text: 'original' },
      },
    };

    if (hasTrackedChange(run)) {
      // These properties should be accessible without type errors
      expect(run.trackedChange.kind).toBe('deletion');
      expect(run.trackedChange.before).toEqual({ text: 'original' });
      expect(run.text).toBe('test');
    } else {
      throw new Error('Expected hasTrackedChange to return true');
    }
  });
});

describe('resolveTrackedChangesEnabled', () => {
  it('returns default value (true) when attrs is undefined', () => {
    expect(resolveTrackedChangesEnabled(undefined)).toBe(true);
  });

  it('returns default value (true) when trackedChangesEnabled is not present', () => {
    const attrs = {};
    expect(resolveTrackedChangesEnabled(attrs as ParagraphBlock['attrs'])).toBe(true);
  });

  it('returns false when trackedChangesEnabled is explicitly false', () => {
    const attrs = { trackedChangesEnabled: false };
    expect(resolveTrackedChangesEnabled(attrs as ParagraphBlock['attrs'])).toBe(false);
  });

  it('returns true when trackedChangesEnabled is true', () => {
    const attrs = { trackedChangesEnabled: true };
    expect(resolveTrackedChangesEnabled(attrs as ParagraphBlock['attrs'])).toBe(true);
  });

  it('handles null attrs gracefully', () => {
    expect(resolveTrackedChangesEnabled(null as unknown as ParagraphBlock['attrs'])).toBe(true);
  });

  it('uses custom default value when provided', () => {
    expect(resolveTrackedChangesEnabled(undefined, false)).toBe(false);
    expect(resolveTrackedChangesEnabled(undefined, true)).toBe(true);
  });

  it('returns default when attrs exists but trackedChangesEnabled is undefined', () => {
    const attrs = { otherProp: 'value' };
    expect(resolveTrackedChangesEnabled(attrs as ParagraphBlock['attrs'], true)).toBe(true);
    expect(resolveTrackedChangesEnabled(attrs as ParagraphBlock['attrs'], false)).toBe(false);
  });

  it('prioritizes explicit false over default true', () => {
    const attrs = { trackedChangesEnabled: false };
    expect(resolveTrackedChangesEnabled(attrs as ParagraphBlock['attrs'], true)).toBe(false);
  });

  it('returns true when trackedChangesEnabled is any truthy value', () => {
    const attrs = { trackedChangesEnabled: true };
    expect(resolveTrackedChangesEnabled(attrs as ParagraphBlock['attrs'], false)).toBe(true);
  });

  it('handles attrs with other properties correctly', () => {
    const attrs = {
      trackedChangesEnabled: false,
      trackedChangesMode: 'review',
      alignment: 'left',
    };
    expect(resolveTrackedChangesEnabled(attrs as ParagraphBlock['attrs'])).toBe(false);
  });
});
