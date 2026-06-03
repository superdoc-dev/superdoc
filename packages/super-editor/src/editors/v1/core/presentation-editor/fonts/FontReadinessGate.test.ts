import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  FontFaceLoadResult,
  FontFaceRequest,
  FontLoadResult,
  FontLoadStatus,
  FontRegistry,
} from '@superdoc/font-system';
import { FontReadinessGate, type FontEnvironment } from './FontReadinessGate';

const faceKey = (r: FontFaceRequest) => `${r.family.toLowerCase()}|${r.weight}|${r.style}`;

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

  // Face-level slice for the face path.
  readonly faceStatuses = new Map<string, FontLoadStatus>();
  readonly faceAwaitCalls: string[][] = [];
  faceAwaitOptions: { timeoutMs?: number } | undefined;
  getFaceStatus(request: FontFaceRequest): FontLoadStatus {
    return this.faceStatuses.get(faceKey(request)) ?? 'unloaded';
  }
  async awaitFaceRequests(
    requests: Iterable<FontFaceRequest>,
    options?: { timeoutMs?: number },
  ): Promise<FontFaceLoadResult[]> {
    const unique = [...requests];
    this.faceAwaitCalls.push(unique.map(faceKey));
    this.faceAwaitOptions = options;
    return unique.map((request) => ({ request, status: this.getFaceStatus(request) }));
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

  describe('face-aware path (getRequiredFaces)', () => {
    const BOLD: FontFaceRequest = { family: 'Carlito', weight: '700', style: 'normal' };

    function makeFaceGate(getRequiredFaces: () => FontFaceRequest[]) {
      return new FontReadinessGate({
        registry: registry.asRegistry(),
        getDocumentFonts: () => [],
        getRequiredFaces,
        requestReflow,
        invalidateCaches,
        getFontEnvironment: () => ({ fontSet: fontSet.asFontSet(), FontFaceCtor: fakeCtor }),
        timeoutMs: 1000,
      });
    }

    it('awaits the exact required faces (family + weight + style), not families', async () => {
      registry.faceStatuses.set(faceKey(BOLD), 'loaded');
      const gate = makeFaceGate(() => [BOLD]);
      const summary = await gate.ensureReadyForMeasure();
      expect(registry.faceAwaitCalls).toEqual([['carlito|700|normal']]);
      // The gate forwards its configured per-font budget, not the registry default.
      expect(registry.faceAwaitOptions).toEqual({ timeoutMs: 1000 });
      expect(summary.loaded).toBe(1);
    });

    it('summarizes per family, not per face (counts distinct physical families)', async () => {
      const REGULAR: FontFaceRequest = { family: 'Carlito', weight: '400', style: 'normal' };
      registry.faceStatuses.set(faceKey(REGULAR), 'loaded');
      registry.faceStatuses.set(faceKey(BOLD), 'loaded');
      const gate = makeFaceGate(() => [REGULAR, BOLD]);
      const summary = await gate.ensureReadyForMeasure();
      // Two Carlito faces, one Carlito family on the public summary.
      expect(summary.loaded).toBe(1);
      expect(summary.results).toEqual([{ family: 'Carlito', status: 'loaded' }]);
    });

    it('rolls a family up to its worst face status (failed bold not masked by loaded regular)', async () => {
      const REGULAR: FontFaceRequest = { family: 'Carlito', weight: '400', style: 'normal' };
      registry.faceStatuses.set(faceKey(REGULAR), 'loaded');
      registry.faceStatuses.set(faceKey(BOLD), 'failed');
      const gate = makeFaceGate(() => [REGULAR, BOLD]);
      const summary = await gate.ensureReadyForMeasure();
      expect(summary.loaded).toBe(0);
      expect(summary.failed).toBe(1);
      expect(summary.results).toEqual([{ family: 'Carlito', status: 'failed' }]);
    });

    it('reflows once when the required bold face loads after a timed-out first paint', async () => {
      registry.faceStatuses.set(faceKey(BOLD), 'timed_out');
      const gate = makeFaceGate(() => [BOLD]);
      await gate.ensureReadyForMeasure();
      expect(requestReflow).not.toHaveBeenCalled();

      // A REGULAR Carlito face finishing must NOT reflow - it is not a required face.
      fontSet.fire('loadingdone', { fontfaces: [{ family: 'Carlito', weight: 'normal', style: 'normal' }] });
      expect(requestReflow).not.toHaveBeenCalled();

      // The required BOLD face finishing DOES reflow, exactly once.
      registry.faceStatuses.set(faceKey(BOLD), 'loaded');
      fontSet.fire('loadingdone', { fontfaces: [{ family: 'Carlito', weight: 'bold', style: 'normal' }] });
      expect(requestReflow).toHaveBeenCalledTimes(1);
      expect(invalidateCaches).toHaveBeenCalledTimes(1);

      // A second loadingdone for the same face does not reflow again (no loop).
      fontSet.fire('loadingdone', { fontfaces: [{ family: 'Carlito', weight: 'bold', style: 'normal' }] });
      expect(requestReflow).toHaveBeenCalledTimes(1);
    });

    it('falls back to the family path when face planning throws', async () => {
      registry.statuses.set('Carlito', 'loaded');
      const gate = new FontReadinessGate({
        registry: registry.asRegistry(),
        getDocumentFonts: () => ['Calibri'],
        resolveFamilies: calibriToCarlito,
        getRequiredFaces: () => {
          throw new Error('planner blew up');
        },
        requestReflow,
        invalidateCaches,
        getFontEnvironment: () => ({ fontSet: fontSet.asFontSet(), FontFaceCtor: fakeCtor }),
        timeoutMs: 1000,
      });

      const summary = await gate.ensureReadyForMeasure();

      // The face path bailed before awaiting any face, and the gate degraded to the family
      // path - which still awaits the resolved physical family (Calibri -> Carlito) rather
      // than skipping load and letting fallback metrics reach measurement.
      expect(registry.faceAwaitCalls).toEqual([]);
      expect(registry.awaitCalls).toEqual([['Carlito']]);
      expect(summary.loaded).toBe(1);
    });
  });
});
