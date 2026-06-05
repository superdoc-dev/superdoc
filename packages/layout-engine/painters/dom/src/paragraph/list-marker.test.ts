import { describe, expect, it } from 'vitest';
import { createFontResolver, resolvePhysicalFamily } from '@superdoc/font-system';
import { createListMarkerElement } from './list-marker.js';

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
