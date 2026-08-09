import { describe, expect, it } from 'vite-plus/test';
import { applyMarkerTrackedChange } from './marker-tracked-change.js';

const markerEl = (): HTMLElement => document.implementation.createHTMLDocument('marker').createElement('span');

describe('applyMarkerTrackedChange story-key stamping', () => {
  it('stamps the projected story key on the marker glyph', () => {
    const el = markerEl();
    applyMarkerTrackedChange(el, { id: 'tc-m1', kind: 'insert', storyKey: 'hf:rId8' });
    expect(el.dataset.trackChangeId).toBe('tc-m1');
    expect(el.dataset.storyKey).toBe('hf:rId8');
  });

  it('omits data-story-key when the owning story is unknown (IT-1250)', () => {
    const el = markerEl();
    applyMarkerTrackedChange(el, { id: 'tc-m2', kind: 'delete' });
    expect(el.dataset.trackChangeId).toBe('tc-m2');
    // Fail closed: an unknown owning story must not masquerade as 'body'.
    expect(el.dataset.storyKey).toBeUndefined();
  });
});
