import { describe, it, expect } from 'vitest';
import { buildFontReport, type FontRegistry, type FontLoadStatus } from './index';

class FakeRegistry {
  readonly statuses = new Map<string, FontLoadStatus>();
  getStatus(family: string): FontLoadStatus {
    return this.statuses.get(family) ?? 'unloaded';
  }
  asRegistry(): FontRegistry {
    return this as unknown as FontRegistry;
  }
}

describe('buildFontReport', () => {
  it('reports requested -> rendered -> reason -> loadStatus -> export', () => {
    const reg = new FakeRegistry();
    reg.statuses.set('Carlito', 'loaded');
    expect(buildFontReport(['Calibri'], reg.asRegistry())).toEqual([
      {
        logicalFamily: 'Calibri',
        physicalFamily: 'Carlito',
        reason: 'bundled_substitute',
        loadStatus: 'loaded',
        exportFamily: 'Calibri',
        missing: false,
      },
    ]);
  });

  it('flags a genuinely missing font (no substitute + not loaded)', () => {
    const reg = new FakeRegistry();
    reg.statuses.set('Aptos', 'fallback_used');
    const [rec] = buildFontReport(['Aptos'], reg.asRegistry());
    expect(rec.reason).toBe('as_requested');
    expect(rec.missing).toBe(true);
    expect(rec.exportFamily).toBe('Aptos'); // export still preserves the requested name
  });

  it('an as_requested font that did load is not missing', () => {
    const reg = new FakeRegistry();
    reg.statuses.set('Verdana', 'loaded');
    expect(buildFontReport(['Verdana'], reg.asRegistry())[0].missing).toBe(false);
  });

  it('does not mark a transient unloaded state as missing (no early-pull over-report)', () => {
    const reg = new FakeRegistry();
    reg.statuses.set('Carlito', 'unloaded'); // registered but the gate has not awaited it yet
    const [rec] = buildFontReport(['Calibri'], reg.asRegistry());
    expect(rec.loadStatus).toBe('unloaded');
    expect(rec.missing).toBe(false);
  });

  it('flags a substitute whose asset failed to load as missing (cause kept in reason/loadStatus)', () => {
    const reg = new FakeRegistry();
    reg.statuses.set('Carlito', 'failed'); // e.g. the bundled .woff2 404s from a bad assetBaseUrl
    const [rec] = buildFontReport(['Calibri'], reg.asRegistry());
    expect(rec.physicalFamily).toBe('Carlito');
    expect(rec.reason).toBe('bundled_substitute');
    expect(rec.loadStatus).toBe('failed');
    expect(rec.missing).toBe(true); // broadened: a failed substitute renders wrong, so it is missing
  });

  it('covers all five mappings and dedupes', () => {
    const reg = new FakeRegistry();
    ['Carlito', 'Caladea', 'Liberation Sans', 'Liberation Serif', 'Liberation Mono'].forEach((f) =>
      reg.statuses.set(f, 'loaded'),
    );
    const report = buildFontReport(
      ['Calibri', 'Cambria', 'Arial', 'Times New Roman', 'Courier New', 'Calibri'],
      reg.asRegistry(),
    );
    expect(report.map((r) => r.physicalFamily)).toEqual([
      'Carlito',
      'Caladea',
      'Liberation Sans',
      'Liberation Serif',
      'Liberation Mono',
    ]);
    expect(report.every((r) => r.reason === 'bundled_substitute' && !r.missing)).toBe(true);
  });
});
