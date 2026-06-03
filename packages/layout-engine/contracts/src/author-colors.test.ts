import { describe, expect, it } from 'vitest';
import { composeAuthorColorResolver, fallbackAuthorColor, stampTrackedChangeColors } from './author-colors.js';
import type { FlowBlock, ParagraphBlock, TableBlock, TextRun } from './index.js';

describe('composeAuthorColorResolver', () => {
  it('returns undefined when config is missing or disabled', () => {
    expect(composeAuthorColorResolver(undefined)).toBeUndefined();
    expect(composeAuthorColorResolver(null)).toBeUndefined();
    expect(composeAuthorColorResolver({ enabled: false, overrides: { a: '#fff' } })).toBeUndefined();
  });

  it('resolves overrides by email first, then name (exact match)', () => {
    const resolve = composeAuthorColorResolver({
      overrides: { 'a@x.test': '#111111', Alice: '#222222' },
    })!;
    expect(resolve({ email: 'a@x.test', name: 'Alice' })).toBe('#111111');
    expect(resolve({ name: 'Alice' })).toBe('#222222');
  });

  it('falls through to resolve() when no override matches', () => {
    const resolve = composeAuthorColorResolver({
      overrides: { Bob: '#000000' },
      resolve: (author) => (author.name === 'Alice' ? '#abcabc' : undefined),
    })!;
    expect(resolve({ name: 'Alice' })).toBe('#abcabc');
  });

  it('uses a deterministic fallback when overrides and resolve decline', () => {
    const resolve = composeAuthorColorResolver({ resolve: () => undefined })!;
    const first = resolve({ name: 'Discovered Author' });
    const second = resolve({ name: 'Discovered Author' });
    expect(first).toMatch(/^#[0-9a-f]{6}$/i);
    expect(first).toBe(second);
    expect(first).toBe(fallbackAuthorColor({ name: 'Discovered Author' }));
  });

  it('does not throw when the host resolver throws', () => {
    const resolve = composeAuthorColorResolver({
      resolve: () => {
        throw new Error('boom');
      },
    })!;
    expect(resolve({ name: 'Alice' })).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('stampTrackedChangeColors', () => {
  const makeParagraph = (run: TextRun): ParagraphBlock => ({
    kind: 'paragraph',
    id: 'p1',
    runs: [run],
  });

  it('stamps color on every tracked-change layer from the author identity', () => {
    const run: TextRun = {
      kind: 'text',
      text: 'hi',
      fontFamily: 'Arial',
      fontSize: 12,
      trackedChanges: [
        { kind: 'insert', id: 'tc1', author: 'Alice' },
        { kind: 'format', id: 'tc2', author: 'Bob' },
      ],
    };
    run.trackedChange = run.trackedChanges![0];

    const blocks: FlowBlock[] = [makeParagraph(run)];
    stampTrackedChangeColors(blocks, composeAuthorColorResolver({ overrides: { Alice: '#123456', Bob: '#654321' } })!);

    expect(run.trackedChanges![0]!.color).toBe('#123456');
    expect(run.trackedChanges![1]!.color).toBe('#654321');
    // trackedChange mirror (first layer) is colored too.
    expect(run.trackedChange!.color).toBe('#123456');
  });

  it('clears stale colors when no resolver is provided', () => {
    const run: TextRun = {
      kind: 'text',
      text: 'hi',
      fontFamily: 'Arial',
      fontSize: 12,
      trackedChanges: [{ kind: 'insert', id: 'tc1', author: 'Alice', color: '#123456' }],
    };
    run.trackedChange = run.trackedChanges![0];

    stampTrackedChangeColors([makeParagraph(run)], undefined);

    expect(run.trackedChanges![0]!.color).toBeUndefined();
    expect(run.trackedChange!.color).toBeUndefined();
  });

  it('leaves runs without tracked changes untouched', () => {
    const run: TextRun = { kind: 'text', text: 'plain', fontFamily: 'Arial', fontSize: 12 };
    stampTrackedChangeColors([makeParagraph(run)], composeAuthorColorResolver({ overrides: {} })!);
    expect((run as TextRun).color).toBeUndefined();
  });

  it('stamps color on a structural row-level tracked change', () => {
    const table: TableBlock = {
      kind: 'table',
      id: 't1',
      rows: [
        {
          id: 'r1',
          attrs: { trackedChange: { kind: 'insert', id: 'row-tc1', author: 'Alice' } },
          cells: [{ id: 'c1', paragraph: { kind: 'paragraph', id: 'p1', runs: [] } }],
        },
      ],
    };

    stampTrackedChangeColors([table], composeAuthorColorResolver({ overrides: { Alice: '#abcdef' } })!);

    expect(table.rows[0]!.attrs?.trackedChange?.color).toBe('#abcdef');
  });

  it('clears stale color on a row-level tracked change when no resolver is provided', () => {
    const table: TableBlock = {
      kind: 'table',
      id: 't1',
      rows: [
        {
          id: 'r1',
          attrs: { trackedChange: { kind: 'delete', id: 'row-tc2', author: 'Bob', color: '#abcdef' } },
          cells: [{ id: 'c1', paragraph: { kind: 'paragraph', id: 'p1', runs: [] } }],
        },
      ],
    };

    stampTrackedChangeColors([table], undefined);

    expect(table.rows[0]!.attrs?.trackedChange?.color).toBeUndefined();
  });
});
