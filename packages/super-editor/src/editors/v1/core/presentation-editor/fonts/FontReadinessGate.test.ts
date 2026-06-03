import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FontLoadResult, FontLoadStatus, FontRegistry } from '@superdoc/font-system';
import { FontReadinessGate, type FontEnvironment } from './FontReadinessGate';

/** Minimal FontFace constructor stand-in for the environment (unused when a registry is injected). */
class FakeFontFace {
  constructor(public readonly family: string) {}
  load(): Promise<FakeFontFace> {
    return Promise.resolve(this);
  }
}
const fakeCtor = FakeFontFace as unknown as FontEnvironment['FontFaceCtor'];

/** Structural fake of the slice of FontRegistry the gate uses. */
class FakeRegistry {
  readonly statuses = new Map<string, FontLoadStatus>();
  readonly available = new Set<string>();
  readonly awaitCalls: string[][] = [];

  getStatus(family: string): FontLoadStatus {
    return this.statuses.get(family) ?? 'unloaded';
  }
  isAvailable(family: string): boolean {
    return this.available.has(family);
  }
  async awaitFaces(families: Iterable<string>): Promise<FontLoadResult[]> {
    const unique = [...new Set(families)];
    this.awaitCalls.push(unique);
    return unique.map((family) => ({ family, status: this.getStatus(family) }));
  }
  asRegistry(): FontRegistry {
    return this as unknown as FontRegistry;
  }
}

/** Fake FontFaceSet that lets the test fire `loadingdone` by hand. */
class FakeFontSet {
  readonly handlers: Record<string, Array<(event?: unknown) => void>> = {};
  addEventListener(type: string, cb: (event?: unknown) => void): void {
    (this.handlers[type] ??= []).push(cb);
  }
  removeEventListener(type: string, cb: (event?: unknown) => void): void {
    this.handlers[type] = (this.handlers[type] ?? []).filter((h) => h !== cb);
  }
  fire(type: string, event?: unknown): void {
    (this.handlers[type] ?? []).forEach((h) => h(event));
  }
  asFontSet(): FontFaceSet {
    return this as unknown as FontFaceSet;
  }
}

const calibriToCarlito = (families: string[]) => families.map((f) => (f === 'Calibri' ? 'Carlito' : f));

describe('FontReadinessGate', () => {
  let registry: FakeRegistry;
  let fontSet: FakeFontSet;
  let requestReflow: ReturnType<typeof vi.fn>;
  let invalidateCaches: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    registry = new FakeRegistry();
    fontSet = new FakeFontSet();
    requestReflow = vi.fn();
    invalidateCaches = vi.fn();
  });

  function makeGate(documentFonts: string[]) {
    return new FontReadinessGate({
      registry: registry.asRegistry(),
      getDocumentFonts: () => documentFonts,
      resolveFamilies: calibriToCarlito,
      requestReflow,
      invalidateCaches,
      getFontEnvironment: () => ({ fontSet: fontSet.asFontSet(), FontFaceCtor: fakeCtor }),
      timeoutMs: 1000,
    });
  }

  it('awaits the resolved physical family, not the logical one', async () => {
    registry.statuses.set('Carlito', 'loaded');
    registry.available.add('Carlito');
    const gate = makeGate(['Calibri']);

    const summary = await gate.ensureReadyForMeasure();

    expect(registry.awaitCalls).toEqual([['Carlito']]); // resolver seam: Calibri -> Carlito
    expect(summary.loaded).toBe(1);
  });

  it('skips re-awaiting when the required set is unchanged and already loaded', async () => {
    registry.statuses.set('Carlito', 'loaded');
    registry.available.add('Carlito');
    const gate = makeGate(['Calibri']);

    await gate.ensureReadyForMeasure();
    await gate.ensureReadyForMeasure();

    expect(registry.awaitCalls).toHaveLength(1); // fast path on the second pass
  });

  it('summarizes a timed-out first paint', async () => {
    registry.statuses.set('Carlito', 'timed_out');
    const gate = makeGate(['Calibri']);

    const summary = await gate.ensureReadyForMeasure();

    expect(summary.timedOut).toBe(1);
    expect(summary.loaded).toBe(0);
  });

  it('reflows once when a required face loads after a timed-out first paint', async () => {
    registry.statuses.set('Carlito', 'timed_out');
    const gate = makeGate(['Calibri']);
    await gate.ensureReadyForMeasure();

    // Carlito finishes loading after first paint.
    registry.statuses.set('Carlito', 'loaded');
    registry.available.add('Carlito');
    fontSet.fire('loadingdone', { fontfaces: [{ family: 'Carlito' }] });

    expect(invalidateCaches).toHaveBeenCalledTimes(1);
    expect(requestReflow).toHaveBeenCalledTimes(1);
    expect(gate.fontConfigVersion).toBe(1);
  });

  it('does not reflow again on a second loadingdone for the same face (no loop)', async () => {
    registry.statuses.set('Carlito', 'timed_out');
    const gate = makeGate(['Calibri']);
    await gate.ensureReadyForMeasure();

    registry.statuses.set('Carlito', 'loaded');
    registry.available.add('Carlito');
    fontSet.fire('loadingdone', { fontfaces: [{ family: 'Carlito' }] });
    fontSet.fire('loadingdone', { fontfaces: [{ family: 'Carlito' }] });

    expect(invalidateCaches).toHaveBeenCalledTimes(1);
    expect(requestReflow).toHaveBeenCalledTimes(1);
  });

  it('does not reflow when a loaded face was already available at first measure', async () => {
    registry.statuses.set('Carlito', 'loaded');
    registry.available.add('Carlito');
    const gate = makeGate(['Calibri']);
    await gate.ensureReadyForMeasure();

    fontSet.fire('loadingdone', { fontfaces: [{ family: 'Carlito' }] });

    expect(requestReflow).not.toHaveBeenCalled();
  });

  it('notifyFontConfigChanged bumps the epoch, invalidates, and reflows', () => {
    const gate = makeGate(['Calibri']);

    gate.notifyFontConfigChanged();

    expect(gate.fontConfigVersion).toBe(1);
    expect(invalidateCaches).toHaveBeenCalledTimes(1);
    expect(requestReflow).toHaveBeenCalledTimes(1);
  });

  it('exposes the last summary as diagnostics', async () => {
    registry.statuses.set('Carlito', 'loaded');
    registry.available.add('Carlito');
    const gate = makeGate(['Calibri']);

    await gate.ensureReadyForMeasure();

    expect(gate.getDiagnostics()).toMatchObject({ loaded: 1, results: [{ family: 'Carlito', status: 'loaded' }] });
  });

  it('never rejects when getDocumentFonts throws', async () => {
    const gate = new FontReadinessGate({
      registry: registry.asRegistry(),
      getDocumentFonts: () => {
        throw new Error('converter unavailable');
      },
      requestReflow,
      invalidateCaches,
      getFontEnvironment: () => ({ fontSet: fontSet.asFontSet(), FontFaceCtor: fakeCtor }),
    });

    await expect(gate.ensureReadyForMeasure()).resolves.toMatchObject({ loaded: 0 });
  });
});
