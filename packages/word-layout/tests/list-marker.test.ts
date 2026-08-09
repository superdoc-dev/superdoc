import { describe, expect, it } from 'bun:test';

import { computeWordListMarker, createNumberingManager } from '../src/index.js';
import type { WordListMarkerDefinition } from '../src/index.js';

const baseDef = (overrides: Partial<WordListMarkerDefinition> = {}): WordListMarkerDefinition => ({
  numId: 1,
  abstractId: 0,
  ilvl: 0,
  start: 1,
  startOverridden: false,
  lvlText: '%1.',
  numFmt: 'decimal',
  suffix: 'tab',
  justification: 'left',
  ...overrides,
});

describe('computeWordListMarker', () => {
  it('produces decimal marker text starting at "1."', () => {
    const manager = createNumberingManager();
    const result = computeWordListMarker({
      definition: baseDef(),
      manager,
      paragraphOrdinal: 1,
    });
    expect(result.listRenderingAttrs.markerText).toBe('1.');
    expect(result.listRenderingAttrs.numberingType).toBe('decimal');
    expect(result.path).toEqual([1]);
    expect(result.counter).toBe(1);
  });

  it('advances decimal counters across sequential paragraphs', () => {
    const manager = createNumberingManager();
    const def = baseDef();
    const a = computeWordListMarker({ definition: def, manager, paragraphOrdinal: 1 });
    const b = computeWordListMarker({ definition: def, manager, paragraphOrdinal: 2 });
    const c = computeWordListMarker({ definition: def, manager, paragraphOrdinal: 3 });
    expect(a.listRenderingAttrs.markerText).toBe('1.');
    expect(b.listRenderingAttrs.markerText).toBe('2.');
    expect(c.listRenderingAttrs.markerText).toBe('3.');
  });

  it('normalizes Symbol/Wingdings bullet glyph to the canonical bullet', () => {
    //  is the Symbol-font bullet codepoint used by Word's default bullet list.
    const manager = createNumberingManager();
    const result = computeWordListMarker({
      definition: baseDef({ numFmt: 'bullet', lvlText: '' }),
      manager,
      paragraphOrdinal: 1,
    });
    expect(result.listRenderingAttrs.markerText).toBe('•');
  });

  it('preserves the original lvlText when bullet glyph is not in the normalize table', () => {
    const manager = createNumberingManager();
    const result = computeWordListMarker({
      definition: baseDef({ numFmt: 'bullet', lvlText: '★' }),
      manager,
      paragraphOrdinal: 1,
    });
    expect(result.listRenderingAttrs.markerText).toBe('★');
  });

  it('builds nested three-level paths and renders %N templates', () => {
    const manager = createNumberingManager();
    const lvl0 = baseDef({ ilvl: 0, lvlText: '%1.' });
    const lvl1 = baseDef({ ilvl: 1, lvlText: '%1.%2.' });
    const lvl2 = baseDef({ ilvl: 2, lvlText: '%1.%2.%3' });

    computeWordListMarker({ definition: lvl0, manager, paragraphOrdinal: 1 });
    computeWordListMarker({ definition: lvl1, manager, paragraphOrdinal: 2 });
    const lvl2result = computeWordListMarker({ definition: lvl2, manager, paragraphOrdinal: 3 });
    expect(lvl2result.path).toEqual([1, 1, 1]);
    expect(lvl2result.listRenderingAttrs.markerText).toBe('1.1.1');

    computeWordListMarker({ definition: lvl2, manager, paragraphOrdinal: 4 });
    const lvl2third = computeWordListMarker({ definition: lvl2, manager, paragraphOrdinal: 5 });
    expect(lvl2third.path).toEqual([1, 1, 3]);
    expect(lvl2third.listRenderingAttrs.markerText).toBe('1.1.3');
  });

  it('restarts nested counters when the parent level fires (v1 parity)', () => {
    const manager = createNumberingManager();
    const lvl0 = baseDef({ ilvl: 0, lvlText: '%1.' });
    const lvl1 = baseDef({ ilvl: 1, lvlText: '%1.%2.' });

    computeWordListMarker({ definition: lvl0, manager, paragraphOrdinal: 1 });
    const child1 = computeWordListMarker({ definition: lvl1, manager, paragraphOrdinal: 2 });
    const child2 = computeWordListMarker({ definition: lvl1, manager, paragraphOrdinal: 3 });
    computeWordListMarker({ definition: lvl0, manager, paragraphOrdinal: 4 });
    const child3 = computeWordListMarker({ definition: lvl1, manager, paragraphOrdinal: 5 });
    expect(child1.listRenderingAttrs.markerText).toBe('1.1.');
    expect(child2.listRenderingAttrs.markerText).toBe('1.2.');
    // After the lvl0 fires again, lvl1 should restart at its start (1).
    expect(child3.listRenderingAttrs.markerText).toBe('2.1.');
  });

  it('shares counters across two concrete numIds backed by the same abstractId', () => {
    const manager = createNumberingManager();
    const def1 = baseDef({ numId: 10, abstractId: 0 });
    const def2 = baseDef({ numId: 11, abstractId: 0 });

    const a = computeWordListMarker({ definition: def1, manager, paragraphOrdinal: 1 });
    const b = computeWordListMarker({ definition: def2, manager, paragraphOrdinal: 2 });
    expect(a.listRenderingAttrs.markerText).toBe('1.');
    expect(b.listRenderingAttrs.markerText).toBe('2.');
  });

  it('startOverridden scopes the override START but counters still share the abstract pool (v1 parity)', () => {
    const manager = createNumberingManager();
    const def1 = baseDef({ numId: 10, abstractId: 0 });
    const def2 = baseDef({
      numId: 11,
      abstractId: 0,
      start: 5,
      startOverridden: true,
    });

    const a1 = computeWordListMarker({ definition: def1, manager, paragraphOrdinal: 1 });
    const b1 = computeWordListMarker({ definition: def2, manager, paragraphOrdinal: 2 });
    const b2 = computeWordListMarker({ definition: def2, manager, paragraphOrdinal: 3 });
    const a2 = computeWordListMarker({ definition: def1, manager, paragraphOrdinal: 4 });

    expect(a1.counter).toBe(1);
    // numId 11 with startOverride=5 begins at 5 in its own scope.
    expect(b1.counter).toBe(5);
    // Second numId 11 paragraph continues from its own numId-scoped history.
    expect(b2.counter).toBe(6);
    // numId 10 (no override) reads the shared abstract pool, which now
    // includes numId 11's writes (latest count 6 at pos 3) → next is 7.
    expect(a2.counter).toBe(7);
  });

  it('passes through suffix tab/space/nothing', () => {
    const manager = createNumberingManager();
    const r1 = computeWordListMarker({
      definition: baseDef({ suffix: 'tab' }),
      manager,
      paragraphOrdinal: 1,
    });
    const r2 = computeWordListMarker({
      definition: baseDef({ numId: 2, suffix: 'space' }),
      manager,
      paragraphOrdinal: 1,
    });
    const r3 = computeWordListMarker({
      definition: baseDef({ numId: 3, suffix: 'nothing' }),
      manager,
      paragraphOrdinal: 1,
    });
    expect(r1.listRenderingAttrs.suffix).toBe('tab');
    expect(r2.listRenderingAttrs.suffix).toBe('space');
    expect(r3.listRenderingAttrs.suffix).toBe('nothing');
  });

  it('passes through justification (lvlJc) with start/end normalization', () => {
    const manager = createNumberingManager();
    const left = computeWordListMarker({
      definition: baseDef({ justification: 'left' }),
      manager,
      paragraphOrdinal: 1,
    });
    const center = computeWordListMarker({
      definition: baseDef({ numId: 2, justification: 'center' }),
      manager,
      paragraphOrdinal: 1,
    });
    const end = computeWordListMarker({
      definition: baseDef({ numId: 3, justification: 'end' }),
      manager,
      paragraphOrdinal: 1,
    });
    expect(left.listRenderingAttrs.justification).toBe('left');
    expect(center.listRenderingAttrs.justification).toBe('center');
    expect(end.listRenderingAttrs.justification).toBe('right');
  });

  it('renders 2.1 for a first-emitted ilvl=1 marker with ancestor start 2', () => {
    const manager = createNumberingManager();
    const def = baseDef({
      numId: 30,
      abstractId: 2,
      ilvl: 1,
      start: 1,
      lvlText: '%1.%2',
      ancestorStartSettings: [{ ilvl: 0, start: 2, startOverridden: false }],
    });
    const r = computeWordListMarker({ definition: def, manager, paragraphOrdinal: 1 });
    expect(r.path).toEqual([2, 1]);
    expect(r.listRenderingAttrs.markerText).toBe('2.1');
  });

  it('increments the second child of a first-emitted ilvl=1 list to 2.2', () => {
    const manager = createNumberingManager();
    const def = baseDef({
      numId: 30,
      abstractId: 2,
      ilvl: 1,
      start: 1,
      lvlText: '%1.%2',
      ancestorStartSettings: [{ ilvl: 0, start: 2, startOverridden: false }],
    });
    const a = computeWordListMarker({ definition: def, manager, paragraphOrdinal: 1 });
    const b = computeWordListMarker({ definition: def, manager, paragraphOrdinal: 2 });
    expect(a.listRenderingAttrs.markerText).toBe('2.1');
    expect(b.listRenderingAttrs.markerText).toBe('2.2');
  });

  it('renders 2.3.1 for a first-emitted ilvl=2 marker with ancestor starts 2 and 3', () => {
    const manager = createNumberingManager();
    const def = baseDef({
      numId: 40,
      abstractId: 3,
      ilvl: 2,
      start: 1,
      lvlText: '%1.%2.%3',
      ancestorStartSettings: [
        { ilvl: 0, start: 2, startOverridden: false },
        { ilvl: 1, start: 3, startOverridden: false },
      ],
    });
    const r = computeWordListMarker({ definition: def, manager, paragraphOrdinal: 1 });
    expect(r.path).toEqual([2, 3, 1]);
    expect(r.listRenderingAttrs.markerText).toBe('2.3.1');
  });

  it('lets a real prior ancestor counter override the definition start fallback', () => {
    const manager = createNumberingManager();
    const parent = baseDef({ numId: 30, abstractId: 2, ilvl: 0, start: 2, lvlText: '%1' });
    const child = baseDef({
      numId: 30,
      abstractId: 2,
      ilvl: 1,
      start: 1,
      lvlText: '%1.%2',
      ancestorStartSettings: [{ ilvl: 0, start: 2, startOverridden: false }],
    });
    // Parent emits twice → level 0 counter reaches 3 (start 2, then 3).
    computeWordListMarker({ definition: parent, manager, paragraphOrdinal: 1 });
    computeWordListMarker({ definition: parent, manager, paragraphOrdinal: 2 });
    const r = computeWordListMarker({ definition: child, manager, paragraphOrdinal: 3 });
    // Ancestor segment is the real counter (3), not the primed start (2).
    expect(r.path).toEqual([3, 1]);
    expect(r.listRenderingAttrs.markerText).toBe('3.1');
  });

  it('keeps a shared abstract ancestor counter flowing across concrete numIds (startOverridden=false)', () => {
    const manager = createNumberingManager();
    const parent = baseDef({ numId: 10, abstractId: 0, ilvl: 0, start: 1, lvlText: '%1' });
    const child = baseDef({
      numId: 11,
      abstractId: 0,
      ilvl: 1,
      start: 1,
      lvlText: '%1.%2',
      ancestorStartSettings: [{ ilvl: 0, start: 2, startOverridden: false }],
    });
    const a = computeWordListMarker({ definition: parent, manager, paragraphOrdinal: 1 });
    const b = computeWordListMarker({ definition: child, manager, paragraphOrdinal: 2 });
    expect(a.listRenderingAttrs.markerText).toBe('1');
    // numId 11's ancestor reads the shared abstract pool (numId 10's counter=1),
    // not its own primed fallback start (2).
    expect(b.path).toEqual([1, 1]);
    expect(b.listRenderingAttrs.markerText).toBe('1.1');
  });

  it('scopes ancestor lookup to the concrete numId when startOverridden=true', () => {
    const manager = createNumberingManager();
    const parent = baseDef({ numId: 10, abstractId: 0, ilvl: 0, start: 1, lvlText: '%1' });
    const child = baseDef({
      numId: 11,
      abstractId: 0,
      ilvl: 1,
      start: 1,
      lvlText: '%1.%2',
      ancestorStartSettings: [{ ilvl: 0, start: 7, startOverridden: true }],
    });
    computeWordListMarker({ definition: parent, manager, paragraphOrdinal: 1 });
    const b = computeWordListMarker({ definition: child, manager, paragraphOrdinal: 2 });
    // startOverridden scopes the ancestor lookup to numId 11 (no own level-0
    // counter), so it falls back to the scoped start 7, ignoring numId 10.
    expect(b.path).toEqual([7, 1]);
    expect(b.listRenderingAttrs.markerText).toBe('7.1');
  });

  it('formats decimalZero custom zero-padding (path > 1 entry)', () => {
    const manager = createNumberingManager();
    const lvl0 = baseDef({ ilvl: 0, lvlText: '%1', numFmt: 'decimal' });
    const lvl1 = baseDef({ ilvl: 1, lvlText: '%1.%2', numFmt: 'decimalZero' });
    computeWordListMarker({ definition: lvl0, manager, paragraphOrdinal: 1 });
    const r = computeWordListMarker({ definition: lvl1, manager, paragraphOrdinal: 2 });
    // Path is [1,1]; first entry (idx 0) is unpadded, second entry pads.
    expect(r.listRenderingAttrs.markerText).toBe('1.01');
  });
});
