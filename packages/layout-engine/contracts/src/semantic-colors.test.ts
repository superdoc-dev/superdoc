import { describe, expect, it } from 'vite-plus/test';
import {
  DEFAULT_TRACKED_CHANGE_SEMANTIC_COLORS,
  TRACKED_CHANGE_AFFECTED_RANGE_KEYS,
  TRACKED_CHANGE_CONFIGURABLE_SEMANTIC_COLOR_KEYS,
  TRACKED_CHANGE_SEMANTIC_COLOR_KEYS,
  TRACKED_CHANGE_SEMANTIC_TARGET_KINDS,
  composeSemanticColorResolver,
  defaultSemanticColor,
  isConfigurableSemanticColorKey,
  semanticColorAnchorScope,
  semanticColorTargetKind,
  stampTrackedChangeSemanticColors,
  structuralSemanticColorKey,
} from './semantic-colors.js';
import type { FlowBlock, ParagraphBlock, TableBlock, TextRun, TrackedChangeSemanticColorKey } from './index.js';

describe('semantic color defaults', () => {
  it('exposes JS-configurable defaults by key; table-structure categories are CSS-only', () => {
    expect(DEFAULT_TRACKED_CHANGE_SEMANTIC_COLORS).toEqual({
      insertion: '#1f6feb',
      deletion: '#cb0e47',
      move: '#00853d',
      'move-from': '#00853d',
      'move-to': '#00853d',
      'table-cell-insertion': '#1f6feb',
      'table-cell-deletion': '#cb0e47',
      'cell-merge': '#d4a72c',
      'cell-split': '#f4964f',
      'image-insertion': '#1f6feb',
      'image-deletion': '#cb0e47',
      'image-property-change': '#d4a72c',
    });
  });

  it('lists every configurable key and matches the default map', () => {
    expect([...TRACKED_CHANGE_CONFIGURABLE_SEMANTIC_COLOR_KEYS].sort()).toEqual(
      Object.keys(DEFAULT_TRACKED_CHANGE_SEMANTIC_COLORS).sort(),
    );
    for (const key of TRACKED_CHANGE_CONFIGURABLE_SEMANTIC_COLOR_KEYS) {
      expect(isConfigurableSemanticColorKey(key)).toBe(true);
      expect(defaultSemanticColor(key)).toBe(DEFAULT_TRACKED_CHANGE_SEMANTIC_COLORS[key]);
    }
  });

  it('keeps the configurable subset inside the full category vocabulary and marks the rest CSS-only', () => {
    const configurable = new Set<string>(TRACKED_CHANGE_CONFIGURABLE_SEMANTIC_COLOR_KEYS);
    for (const key of TRACKED_CHANGE_SEMANTIC_COLOR_KEYS) {
      expect(isConfigurableSemanticColorKey(key)).toBe(configurable.has(key));
      if (!configurable.has(key)) {
        expect(defaultSemanticColor(key)).toBeUndefined();
      }
    }
    expect(TRACKED_CHANGE_SEMANTIC_COLOR_KEYS.filter((key) => !isConfigurableSemanticColorKey(key)).sort()).toEqual([
      'table-deletion',
      'table-insertion',
      'table-row-deletion',
      'table-row-insertion',
      'table-split',
    ]);
    expect(isConfigurableSemanticColorKey(undefined)).toBe(false);
    expect(isConfigurableSemanticColorKey(null)).toBe(false);
  });
});

describe('semantic taxonomy', () => {
  it('maps every key to a target kind', () => {
    expect(Object.keys(TRACKED_CHANGE_SEMANTIC_TARGET_KINDS).sort()).toEqual(
      [...TRACKED_CHANGE_SEMANTIC_COLOR_KEYS].sort(),
    );
    expect(semanticColorTargetKind('table-insertion')).toBe('table');
    expect(semanticColorTargetKind('table-row-deletion')).toBe('row');
    expect(semanticColorTargetKind('table-cell-insertion')).toBe('cell');
    expect(semanticColorTargetKind('table-split')).toBe('table');
    expect(semanticColorTargetKind('insertion')).toBe('text');
    expect(semanticColorTargetKind(undefined)).toBeUndefined();
    expect(semanticColorTargetKind(null)).toBeUndefined();
  });

  it('marks only range-paint keys with the affected-range anchor scope', () => {
    for (const key of TRACKED_CHANGE_SEMANTIC_COLOR_KEYS) {
      expect(semanticColorAnchorScope(key)).toBe(TRACKED_CHANGE_AFFECTED_RANGE_KEYS.has(key) ? 'affected-range' : null);
    }
    expect([...TRACKED_CHANGE_AFFECTED_RANGE_KEYS].sort()).toEqual(['cell-merge', 'cell-split', 'table-split']);
    expect(semanticColorAnchorScope(undefined)).toBeNull();
  });

  it('derives structural keys from marker kind and target, and round-trips target kinds', () => {
    for (const targetKind of ['table', 'row', 'cell'] as const) {
      for (const kind of ['insert', 'delete'] as const) {
        const key = structuralSemanticColorKey(kind, targetKind);
        expect(key).toBeDefined();
        expect(semanticColorTargetKind(key)).toBe(targetKind);
      }
    }
    expect(structuralSemanticColorKey('insert', 'row')).toBe('table-row-insertion');
    expect(structuralSemanticColorKey('delete', 'table')).toBe('table-deletion');
    expect(structuralSemanticColorKey('format', 'table')).toBeUndefined();
    expect(structuralSemanticColorKey(undefined, 'cell')).toBeUndefined();
  });
});

describe('composeSemanticColorResolver', () => {
  it('resolves defaults when config is missing and returns undefined only when disabled', () => {
    expect(composeSemanticColorResolver(undefined)!({ key: 'cell-merge' })).toBe('#d4a72c');
    expect(composeSemanticColorResolver(null)!({ key: 'cell-split' })).toBe('#f4964f');
    expect(composeSemanticColorResolver({ enabled: false, overrides: { 'cell-merge': '#fff' } })).toBeUndefined();
  });

  it('resolves the default color for a configurable key when no override or resolver matches', () => {
    const resolve = composeSemanticColorResolver({})!;
    for (const key of TRACKED_CHANGE_CONFIGURABLE_SEMANTIC_COLOR_KEYS) {
      expect(resolve({ key })).toBe(DEFAULT_TRACKED_CHANGE_SEMANTIC_COLORS[key]);
    }
  });

  it('prefers overrides by semantic key over defaults', () => {
    const resolve = composeSemanticColorResolver({
      overrides: { 'table-cell-insertion': '#111111' },
    })!;
    expect(resolve({ key: 'table-cell-insertion' })).toBe('#111111');
    // Keys without an override still fall back to the default.
    expect(resolve({ key: 'table-cell-deletion' })).toBe('#cb0e47');
  });

  it('uses the host resolver after overrides and before defaults', () => {
    const resolve = composeSemanticColorResolver({
      overrides: { 'move-from': '#000000' },
      resolve: (input) => (input.key === 'cell-merge' ? '#abcabc' : undefined),
    })!;
    // Override wins over resolver.
    expect(resolve({ key: 'move-from' })).toBe('#000000');
    // Resolver wins over default when it returns a color.
    expect(resolve({ key: 'cell-merge' })).toBe('#abcabc');
    // Resolver declines (undefined), so default applies.
    expect(resolve({ key: 'cell-split' })).toBe('#f4964f');
  });

  it('uses the move group override for both move sides unless a side override exists', () => {
    const resolve = composeSemanticColorResolver({
      overrides: { move: '#00853d', 'move-from': '#006b31' },
    })!;

    expect(resolve({ key: 'move-from' })).toBe('#006b31');
    expect(resolve({ key: 'move-to' })).toBe('#00853d');
  });

  it('passes the full input (author/type/subtype/targetKind/semanticAnchorScope) to the host resolver', () => {
    let received: unknown;
    const resolve = composeSemanticColorResolver({
      resolve: (input) => {
        received = input;
        return '#123456';
      },
    })!;
    resolve({
      key: 'table-cell-deletion',
      author: { name: 'Alice', email: 'a@x.test' },
      type: 'cellDel',
      subtype: 'table-cell-deletion',
      targetKind: 'cell',
      semanticAnchorScope: 'affected-range',
    });
    expect(received).toEqual({
      key: 'table-cell-deletion',
      author: { name: 'Alice', email: 'a@x.test' },
      type: 'cellDel',
      subtype: 'table-cell-deletion',
      targetKind: 'cell',
      semanticAnchorScope: 'affected-range',
    });
  });

  it('falls back to the default color when the host resolver throws', () => {
    const resolve = composeSemanticColorResolver({
      resolve: () => {
        throw new Error('boom');
      },
    })!;
    expect(resolve({ key: 'move-to' })).toBe('#00853d');
  });
});

describe('stampTrackedChangeSemanticColors', () => {
  const makeParagraph = (run: TextRun): ParagraphBlock => ({
    kind: 'paragraph',
    id: 'p1',
    runs: [run],
  });

  it('stamps semanticColor on run layers that carry a semantic key', () => {
    const run: TextRun = {
      kind: 'text',
      text: 'hi',
      fontFamily: 'Arial',
      fontSize: 12,
      trackedChanges: [
        { kind: 'delete', id: 'tc1', author: 'Alice', semanticColorKey: 'deletion' },
        { kind: 'insert', id: 'tc2', author: 'Alice', semanticColorKey: 'move-to' },
      ],
    };
    run.trackedChange = run.trackedChanges![0];

    stampTrackedChangeSemanticColors([makeParagraph(run)], composeSemanticColorResolver({})!);

    expect(run.trackedChanges![0]!.semanticColor).toBe('#cb0e47');
    expect(run.trackedChanges![1]!.semanticColor).toBe('#00853d');
    expect(run.trackedChange!.semanticColor).toBe('#cb0e47');
  });

  it('does not stamp layers without a semantic key', () => {
    const run: TextRun = {
      kind: 'text',
      text: 'hi',
      fontFamily: 'Arial',
      fontSize: 12,
      trackedChanges: [{ kind: 'insert', id: 'tc1', author: 'Alice' }],
    };

    stampTrackedChangeSemanticColors([makeParagraph(run)], composeSemanticColorResolver({})!);

    expect(run.trackedChanges![0]!.semanticColor).toBeUndefined();
  });

  it('never mutates or clears the author color field', () => {
    const run: TextRun = {
      kind: 'text',
      text: 'hi',
      fontFamily: 'Arial',
      fontSize: 12,
      trackedChanges: [
        { kind: 'delete', id: 'tc1', author: 'Alice', color: '#aaaaaa', semanticColorKey: 'table-cell-deletion' },
      ],
    };

    stampTrackedChangeSemanticColors([makeParagraph(run)], composeSemanticColorResolver({})!);

    // Semantic color stamped, author color untouched.
    expect(run.trackedChanges![0]!.semanticColor).toBe('#cb0e47');
    expect(run.trackedChanges![0]!.color).toBe('#aaaaaa');

    // Clearing semantic colors must still leave author color intact.
    stampTrackedChangeSemanticColors([makeParagraph(run)], undefined);
    expect(run.trackedChanges![0]!.semanticColor).toBeUndefined();
    expect(run.trackedChanges![0]!.color).toBe('#aaaaaa');
  });

  it('clears stale semanticColor when the resolver is disabled/absent', () => {
    const run: TextRun = {
      kind: 'text',
      text: 'hi',
      fontFamily: 'Arial',
      fontSize: 12,
      trackedChanges: [
        { kind: 'insert', id: 'tc1', author: 'Alice', semanticColorKey: 'cell-merge', semanticColor: '#d4a72c' },
      ],
    };

    stampTrackedChangeSemanticColors([makeParagraph(run)], undefined);
    expect(run.trackedChanges![0]!.semanticColor).toBeUndefined();
  });

  it('clears stale semanticColor when the layer no longer carries a semantic key', () => {
    const run: TextRun = {
      kind: 'text',
      text: 'hi',
      fontFamily: 'Arial',
      fontSize: 12,
      // semanticColor present but no key (e.g. reused cached block after the
      // structural classification changed).
      trackedChanges: [{ kind: 'insert', id: 'tc1', author: 'Alice', semanticColor: '#d4a72c' }],
    };

    stampTrackedChangeSemanticColors([makeParagraph(run)], composeSemanticColorResolver({})!);
    expect(run.trackedChanges![0]!.semanticColor).toBeUndefined();
  });

  it('honors override precedence per key while stamping', () => {
    const run: TextRun = {
      kind: 'text',
      text: 'hi',
      fontFamily: 'Arial',
      fontSize: 12,
      trackedChanges: [{ kind: 'insert', id: 'tc1', author: 'Alice', semanticColorKey: 'cell-split' }],
    };

    stampTrackedChangeSemanticColors(
      [makeParagraph(run)],
      composeSemanticColorResolver({ overrides: { 'cell-split': '#654321' } })!,
    );
    expect(run.trackedChanges![0]!.semanticColor).toBe('#654321');
  });

  it('never stamps a JS color onto CSS-only row-level structural categories', () => {
    const table: TableBlock = {
      kind: 'table',
      id: 't1',
      rows: [
        {
          id: 'r1',
          attrs: {
            trackedChange: {
              kind: 'insert',
              id: 'row-tc1',
              author: 'Alice',
              semanticColorKey: 'table-row-insertion',
              // Stale color from a reused cached block must be cleared: the
              // table-structure categories are themed via CSS variables only.
              semanticColor: '#123456',
            },
          },
          cells: [{ id: 'c1', paragraph: { kind: 'paragraph', id: 'p1', runs: [] } }],
        },
      ],
    };

    stampTrackedChangeSemanticColors([table], composeSemanticColorResolver({})!);
    expect(table.rows[0]!.attrs?.trackedChange?.semanticColor).toBeUndefined();
    expect(table.rows[0]!.attrs?.trackedChange?.semanticColorKey).toBe('table-row-insertion');
  });

  it('stamps cell-level structural tracked-change metadata', () => {
    const table: TableBlock = {
      kind: 'table',
      id: 't1',
      rows: [
        {
          id: 'r1',
          cells: [
            {
              id: 'c1',
              attrs: {
                trackedChange: {
                  kind: 'delete',
                  id: 'cell-tc1',
                  author: 'Bob',
                  semanticColorKey: 'table-cell-deletion',
                },
              },
              paragraph: { kind: 'paragraph', id: 'p1', runs: [] },
            },
          ],
        },
      ],
    };

    stampTrackedChangeSemanticColors([table], composeSemanticColorResolver({})!);
    expect(table.rows[0]!.cells[0]!.attrs?.trackedChange?.semanticColor).toBe('#cb0e47');

    // And clears when disabled, without touching any author color.
    table.rows[0]!.cells[0]!.attrs!.trackedChange!.color = '#777777';
    stampTrackedChangeSemanticColors([table], undefined);
    expect(table.rows[0]!.cells[0]!.attrs?.trackedChange?.semanticColor).toBeUndefined();
    expect(table.rows[0]!.cells[0]!.attrs?.trackedChange?.color).toBe('#777777');
  });

  it('leaves blocks without tracked changes untouched', () => {
    const run: TextRun = { kind: 'text', text: 'plain', fontFamily: 'Arial', fontSize: 12 };
    const blocks: FlowBlock[] = [makeParagraph(run)];
    expect(() => stampTrackedChangeSemanticColors(blocks, composeSemanticColorResolver({})!)).not.toThrow();
  });

  it('keeps a stamped key value addressable as a typed semantic key', () => {
    const key: TrackedChangeSemanticColorKey = 'insertion';
    expect(defaultSemanticColor(key)).toBe('#1f6feb');
  });
});
