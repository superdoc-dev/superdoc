import { describe, expect, it, beforeEach } from 'vitest';
import type { SdtMetadata } from '@superdoc/contracts';
import { renderSdtAncestorLayers } from './container.js';
import type { SdtBoundaryLayer } from './boundaries.js';

const outer = {
  type: 'structuredContent',
  scope: 'block',
  id: 'outer',
  alias: 'Outer Control',
} as unknown as SdtMetadata;
const inner = {
  type: 'structuredContent',
  scope: 'block',
  id: 'inner',
  alias: 'Inner Control',
} as unknown as SdtMetadata;

// A fragment inside [outer, inner]: depth 0 = outer (ancestor), depth 1 = inner (nearest).
const layers: SdtBoundaryLayer[] = [
  { key: 'structuredContent:outer', depth: 0, isStart: true, isEnd: false, showLabel: true },
  { key: 'structuredContent:inner', depth: 1, isStart: true, isEnd: true, showLabel: true },
];

describe('renderSdtAncestorLayers', () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
  });

  it('renders one overlay for the ancestor and skips the nearest (deepest) layer', () => {
    renderSdtAncestorLayers(document, host, layers, [outer, inner], 'default');
    const overlays = host.querySelectorAll('.superdoc-sdt-ancestor-layer');
    expect(overlays.length).toBe(1);
    expect((overlays[0] as HTMLElement).dataset.sdtDepth).toBe('0');
  });

  it('carries start/end boundary attributes from the layer', () => {
    renderSdtAncestorLayers(document, host, layers, [outer, inner], 'default');
    const overlay = host.querySelector('.superdoc-sdt-ancestor-layer') as HTMLElement;
    expect(overlay.dataset.sdtContainerStart).toBe('true');
    expect(overlay.dataset.sdtContainerEnd).toBe('false');
  });

  it('renders the ancestor label from its metadata when showLabel is set', () => {
    renderSdtAncestorLayers(document, host, layers, [outer, inner], 'default');
    const label = host.querySelector('.superdoc-sdt-ancestor-layer span');
    expect(label?.textContent).toBe('Outer Control');
  });

  it('omits the label when chrome is none', () => {
    renderSdtAncestorLayers(document, host, layers, [outer, inner], 'none');
    expect(host.querySelector('.superdoc-sdt-ancestor-layer span')).toBeNull();
    // The overlay box itself is still rendered.
    expect(host.querySelectorAll('.superdoc-sdt-ancestor-layer').length).toBe(1);
  });

  it('renders nothing for a non-nested fragment (single layer)', () => {
    const single: SdtBoundaryLayer[] = [
      { key: 'structuredContent:only', depth: 0, isStart: true, isEnd: true, showLabel: true },
    ];
    renderSdtAncestorLayers(document, host, single, [outer], 'default');
    expect(host.querySelectorAll('.superdoc-sdt-ancestor-layer').length).toBe(0);
  });

  it('skips an ancestor whose metadata is hidden', () => {
    const hiddenOuter = { ...(outer as object), appearance: 'hidden' } as unknown as SdtMetadata;
    renderSdtAncestorLayers(document, host, layers, [hiddenOuter, inner], 'default');
    expect(host.querySelectorAll('.superdoc-sdt-ancestor-layer').length).toBe(0);
  });
});
