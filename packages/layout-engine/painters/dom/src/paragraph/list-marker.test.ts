import { describe, expect, it } from 'vite-plus/test';
import { createFontResolver, resolvePhysicalFamily } from '@superdoc/font-system';
import { createListMarkerElement } from './list-marker.js';
import type { MarkerTrackedChangeView } from './marker-tracked-change.js';

describe('createListMarkerElement per-document paint isolation', () => {
  const makeDoc = (): Document => document.implementation.createHTMLDocument('list-marker');
  const markerFontFamily = (container: HTMLElement): string =>
    (container.querySelector('.superdoc-paragraph-marker') as HTMLElement).style.fontFamily;

  it('paints the marker through the document resolver, so two documents with different Calibri maps do not share paint', () => {
    const run = { fontFamily: 'Calibri', fontSize: 16 };

    // Same BUILT-IN logical family, DIFFERENT per-document physical mappings -> non-empty, DISTINCT
    // signatures. (Plain Calibri with an empty signature would only exercise the bundled default and
    // would not prove isolation - the whole point of keying paint by the document resolver.)
    const docA = createFontResolver();
    docA.map('Calibri', 'Liberation Sans');
    const docB = createFontResolver();
    docB.map('Calibri', 'Tinos');
    expect(docA.signature).not.toBe('');
    expect(docA.signature).not.toBe(docB.signature);

    const markerA = createListMarkerElement(makeDoc(), '1.', run, undefined, (f) => docA.resolvePhysicalFamily(f));
    const markerB = createListMarkerElement(makeDoc(), '1.', run, undefined, (f) => docB.resolvePhysicalFamily(f));

    // The marker glyph paints each document's mapped physical family, so the two documents differ.
    expect(markerFontFamily(markerA)).toContain('Liberation Sans');
    expect(markerFontFamily(markerB)).toContain('Tinos');
    expect(markerFontFamily(markerA)).not.toBe(markerFontFamily(markerB));
  });

  it('paints the bundled substitute (Calibri -> Carlito) when the document has no override', () => {
    // No per-document override (empty signature): the marker still paints the bundled physical clone,
    // matching the text and the measured advance - the visible consistency fix for built-in families.
    const run = { fontFamily: 'Calibri', fontSize: 16 };
    const marker = createListMarkerElement(makeDoc(), '1.', run, undefined, resolvePhysicalFamily);
    expect(markerFontFamily(marker)).toContain('Carlito');
  });
});

describe('createListMarkerElement tracked-change marker review (Plan 5)', () => {
  const makeDoc = (): Document => document.implementation.createHTMLDocument('list-marker-tc');
  const run = { fontFamily: 'Calibri', fontSize: 16 };
  const glyph = (container: HTMLElement): HTMLElement =>
    container.querySelector('.superdoc-paragraph-marker') as HTMLElement;

  it('leaves normal markers free of review metadata, classes, and styling when no tracked change is present', () => {
    const markerEl = glyph(createListMarkerElement(makeDoc(), '1.', run, undefined, resolvePhysicalFamily));
    expect(markerEl.dataset.trackChangeId).toBeUndefined();
    expect(markerEl.dataset.trackChangeKind).toBeUndefined();
    expect(markerEl.classList.contains('track-insert-dec')).toBe(false);
    expect(markerEl.classList.contains('track-list-marker-dec')).toBe(false);
    // Critical: no review color/underline leaks onto the normal marker glyph.
    expect(markerEl.style.color).toBe('');
    expect(markerEl.style.textDecorationLine).toBe('');
  });

  it('stamps insert review metadata and underline on the marker glyph without forcing review color', () => {
    const tc: MarkerTrackedChangeView = {
      id: 'tc-1',
      kind: 'insert',
      type: 'paragraph-mark',
      targetKind: 'list-item',
      semanticColor: '#00853d',
      author: 'Ada',
      authorEmail: 'ada@example.com',
      date: '2026-06-26T00:00:00Z',
    };
    const markerEl = glyph(createListMarkerElement(makeDoc(), '1.', run, undefined, resolvePhysicalFamily, tc));
    expect(markerEl.dataset.trackChangeId).toBe('tc-1');
    expect(markerEl.dataset.trackChangeIds).toBe('tc-1');
    expect(markerEl.dataset.trackChangeKind).toBe('insert');
    expect(markerEl.dataset.trackChangeType).toBe('paragraph-mark');
    expect(markerEl.dataset.trackChangeTargetKind).toBe('list-item');
    expect(markerEl.dataset.trackChangeAuthor).toBe('Ada');
    expect(markerEl.dataset.trackChangeMarker).toBe('list');
    expect(markerEl.classList.contains('track-insert-dec')).toBe(true);
    expect(markerEl.classList.contains('track-list-marker-dec')).toBe(true);
    // Word-like marker glyph styling: paragraph foreground + review underline.
    expect(markerEl.style.color).toBe('');
    expect(markerEl.style.textDecorationLine).toBe('underline');
    expect(markerEl.style.textDecorationColor).toBe('currentColor');
    // Shared element-scoped CSS variable family (consistent with run path).
    expect(markerEl.style.getPropertyValue('--sd-tracked-changes-insert-border')).toBe('#00853d');
  });

  it('uses delete styling (strikethrough) for removed list-item markers', () => {
    const tc: MarkerTrackedChangeView = { id: 'tc-2', kind: 'delete', color: '#cb0e47' };
    const markerEl = glyph(createListMarkerElement(makeDoc(), '2.', run, undefined, resolvePhysicalFamily, tc));
    expect(markerEl.dataset.trackChangeKind).toBe('delete');
    expect(markerEl.classList.contains('track-delete-dec')).toBe(true);
    expect(markerEl.style.color).toBe('');
    expect(markerEl.style.textDecorationLine).toBe('line-through');
    expect(markerEl.style.textDecorationColor).toBe('currentColor');
  });

  it('emits grouped data-track-change-ids when several changes affect one marker', () => {
    const tc: MarkerTrackedChangeView = { id: 'tc-a', kind: 'format', groupedIds: ['tc-a', 'tc-b'], color: '#806000' };
    const markerEl = glyph(createListMarkerElement(makeDoc(), 'a.', run, undefined, resolvePhysicalFamily, tc));
    expect(markerEl.dataset.trackChangeId).toBe('tc-a');
    expect(markerEl.dataset.trackChangeIds).toBe('tc-a,tc-b');
    expect(markerEl.classList.contains('track-format-dec')).toBe(true);
    expect(markerEl.style.textDecorationLine).toBe('underline');
  });

  it('keeps visible final-mode insertion markers review-targetable without forcing review glyph styling', () => {
    const tc: MarkerTrackedChangeView = { id: 'tc-final', kind: 'insert', color: '#00853d' };
    const markerEl = glyph(
      createListMarkerElement(makeDoc(), '3.', run, undefined, resolvePhysicalFamily, tc, {
        mode: 'final',
        enabled: true,
      }),
    );
    expect(markerEl.dataset.trackChangeId).toBe('tc-final');
    expect(markerEl.classList.contains('track-insert-dec')).toBe(true);
    expect(markerEl.classList.contains('normal')).toBe(true);
    expect(markerEl.classList.contains('highlighted')).toBe(false);
    expect(markerEl.style.color).toBe('');
    expect(markerEl.style.textDecorationLine).toBe('');
  });

  it('does not stamp marker review metadata when tracked changes are off', () => {
    const tc: MarkerTrackedChangeView = { id: 'tc-off', kind: 'insert', color: '#00853d' };
    const markerEl = glyph(
      createListMarkerElement(makeDoc(), '4.', run, undefined, resolvePhysicalFamily, tc, {
        mode: 'off',
        enabled: true,
      }),
    );
    expect(markerEl.dataset.trackChangeId).toBeUndefined();
    expect(markerEl.classList.contains('track-insert-dec')).toBe(false);
    expect(markerEl.style.color).toBe('');
    expect(markerEl.style.textDecorationLine).toBe('');
  });
});
