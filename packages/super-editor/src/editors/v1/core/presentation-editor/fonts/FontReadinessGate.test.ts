import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getFontConfigVersion, __resetFontConfigVersion } from '@superdoc/font-system';
import type {
  FontFaceLoadResult,
  FontFaceRequest,
  FontLoadResult,
  FontLoadStatus,
  FontRegistry,
  UsedFace,
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

/** Virtual clock so tests can advance past the late-load scheduler's quiet/cooldown windows. */
function makeClock() {
  let nowMs = 0;
  let seq = 0;
  const timers = new Map<number, { due: number; cb: () => void }>();
  return {
    scheduleTimeout: (cb: () => void, ms: number) => {
      const id = ++seq;
      timers.set(id, { due: nowMs + ms, cb });
      return id;
    },
    cancelTimeout: (handle: unknown) => {
      timers.delete(handle as number);
    },
    advance: (ms: number) => {
      const target = nowMs + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.due <= target).sort((a, b) => a[1].due - b[1].due);
        if (due.length === 0) break;
        const [id, t] = due[0];
        timers.delete(id);
        nowMs = t.due;
        t.cb();
      }
      nowMs = target;
    },
  };
}

describe('FontReadinessGate', () => {
  let registry: FakeRegistry;
  let fontSet: FakeFontSet;
  let requestReflow: ReturnType<typeof vi.fn>;
  let invalidateCaches: ReturnType<typeof vi.fn>;
  let clock: ReturnType<typeof makeClock>;

  beforeEach(() => {
    registry = new FakeRegistry();
    fontSet = new FakeFontSet();
    requestReflow = vi.fn();
    invalidateCaches = vi.fn();
    clock = makeClock();
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
      scheduleTimeout: clock.scheduleTimeout,
      cancelTimeout: clock.cancelTimeout,
    });
  }

  it('installs the bundled pack even with NO font set, so bundled substitutes are not disabled', () => {
    // A document with no `document.fonts` (SSR/jsdom, some iframe/embedded timings) still needs the
    // bundled face METADATA so `hasFace` is true and a substitute (e.g. Calibri -> Carlito) applies;
    // loading needs a font set, availability must not.
    const onRegistryResolved = vi.fn();
    const gate = new FontReadinessGate({
      registry: registry.asRegistry(),
      getDocumentFonts: () => [],
      requestReflow,
      invalidateCaches,
      getFontEnvironment: () => null, // no font set
      onRegistryResolved,
      timeoutMs: 1000,
      scheduleTimeout: clock.scheduleTimeout,
      cancelTimeout: clock.cancelTimeout,
    });

    gate.resolveRegistry();
    expect(onRegistryResolved).toHaveBeenCalledTimes(1); // installed despite no font set
    gate.resolveRegistry();
    expect(onRegistryResolved).toHaveBeenCalledTimes(1); // idempotent per registry instance
  });

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

    // Reflow is batched: nothing until the scheduler's quiet window elapses.
    expect(requestReflow).not.toHaveBeenCalled();
    clock.advance(300);
    expect(invalidateCaches).toHaveBeenCalledTimes(1);
    expect(requestReflow).toHaveBeenCalledTimes(1);
    expect(gate.fontConfigVersion).toBe(1);
  });

  it('batches several late faces into one reflow within the quiet window', async () => {
    registry.statuses.set('Carlito', 'timed_out');
    registry.statuses.set('Caladea', 'timed_out');
    const gate = makeGate(['Carlito', 'Caladea']);
    await gate.ensureReadyForMeasure();

    registry.statuses.set('Carlito', 'loaded');
    registry.statuses.set('Caladea', 'loaded');
    fontSet.fire('loadingdone', { fontfaces: [{ family: 'Carlito' }] });
    clock.advance(100); // still within the quiet window
    fontSet.fire('loadingdone', { fontfaces: [{ family: 'Caladea' }] });
    expect(requestReflow).not.toHaveBeenCalled();
    // Caches + epoch are cleared immediately as each face arrives (measure caches are not
    // epoch-keyed), so a re-measure in the quiet window already sees the loaded font.
    expect(invalidateCaches).toHaveBeenCalledTimes(2);
    expect(gate.fontConfigVersion).toBe(2);

    clock.advance(300);
    expect(requestReflow).toHaveBeenCalledTimes(1); // but only ONE (expensive) reflow for both
  });

  it('does not reflow again on a second loadingdone for the same face (no loop)', async () => {
    registry.statuses.set('Carlito', 'timed_out');
    const gate = makeGate(['Calibri']);
    await gate.ensureReadyForMeasure();

    registry.statuses.set('Carlito', 'loaded');
    registry.available.add('Carlito');
    fontSet.fire('loadingdone', { fontfaces: [{ family: 'Carlito' }] });
    fontSet.fire('loadingdone', { fontfaces: [{ family: 'Carlito' }] });
    clock.advance(300);

    expect(invalidateCaches).toHaveBeenCalledTimes(1);
    expect(requestReflow).toHaveBeenCalledTimes(1);
  });

  it('does not reflow when a loaded face was already available at first measure', async () => {
    registry.statuses.set('Carlito', 'loaded');
    registry.available.add('Carlito');
    const gate = makeGate(['Calibri']);
    await gate.ensureReadyForMeasure();

    fontSet.fire('loadingdone', { fontfaces: [{ family: 'Carlito' }] });
    clock.advance(300);

    expect(requestReflow).not.toHaveBeenCalled();
  });

  it('dispose cancels a pending batched reflow (no reflow after teardown)', async () => {
    registry.statuses.set('Carlito', 'timed_out');
    const gate = makeGate(['Calibri']);
    await gate.ensureReadyForMeasure();

    registry.statuses.set('Carlito', 'loaded');
    fontSet.fire('loadingdone', { fontfaces: [{ family: 'Carlito' }] }); // invalidates now; schedules the reflow
    gate.dispose();
    clock.advance(5000);

    // The cache clear is immediate (on load, before dispose); dispose cancels the pending reflow.
    expect(invalidateCaches).toHaveBeenCalledTimes(1);
    expect(requestReflow).not.toHaveBeenCalled();
  });

  it('notifyDocumentFontConfigChanged (mapping change) bumps the LOCAL version and reflows, without the global epoch', () => {
    __resetFontConfigVersion();
    const gate = makeGate(['Calibri']);

    gate.notifyDocumentFontConfigChanged();

    expect(gate.fontConfigVersion).toBe(1); // local version bumped so fonts-changed re-emits
    expect(getFontConfigVersion()).toBe(0); // a mapping is document-local: NO global epoch bump
    expect(invalidateCaches).not.toHaveBeenCalled(); // the per-document signature busts the cache
    expect(requestReflow).toHaveBeenCalledTimes(1);
  });

  it('notifyDocumentFontConfigChanged (availabilityChanged) invalidates caches and bumps the global epoch', () => {
    // A `fonts.add` registers a face for a family the document may already render with fallback
    // metrics. The resolver signature is unchanged, so it cannot bust the measure caches; the gate
    // must clear them and bump the global epoch (like a late load) or the reflow keeps stale widths.
    __resetFontConfigVersion();
    const gate = makeGate(['Calibri']);

    gate.notifyDocumentFontConfigChanged({ availabilityChanged: true });

    expect(gate.fontConfigVersion).toBe(1); // local version bumped so fonts-changed re-emits
    expect(getFontConfigVersion()).toBe(1); // a registration is a GLOBAL availability change
    expect(invalidateCaches).toHaveBeenCalledTimes(1); // signature is unchanged, so clear explicitly
    expect(requestReflow).toHaveBeenCalledTimes(1);
  });

  it('invalidateCachesForConfigRegistration clears caches without reflow, event, or epoch bump', () => {
    // Config-time registration (before first layout) has the same unchanged-signature risk, but must
    // not reflow/emit/bump - the first layout measures fresh against the cleared cache.
    __resetFontConfigVersion();
    const gate = makeGate(['Calibri']);

    gate.invalidateCachesForConfigRegistration();

    expect(invalidateCaches).toHaveBeenCalledTimes(1); // so the first measure can't reuse stale widths
    expect(requestReflow).not.toHaveBeenCalled(); // nothing has rendered yet
    expect(gate.fontConfigVersion).toBe(0); // no event
    expect(getFontConfigVersion()).toBe(0); // no global epoch bump at config time
  });

  it('notifyDocumentFontConfigChanged cancels a pending batched late-load (no double reflow)', async () => {
    registry.statuses.set('Carlito', 'timed_out');
    const gate = makeGate(['Calibri']);
    await gate.ensureReadyForMeasure();

    registry.statuses.set('Carlito', 'loaded');
    fontSet.fire('loadingdone', { fontfaces: [{ family: 'Carlito' }] }); // schedules a batched reflow
    gate.notifyDocumentFontConfigChanged(); // immediate reflow; must also cancel the pending batch
    expect(requestReflow).toHaveBeenCalledTimes(1);

    clock.advance(300); // the cancelled quiet timer must NOT fire a second reflow
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
        scheduleTimeout: clock.scheduleTimeout,
        cancelTimeout: clock.cancelTimeout,
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

    it('replans once when a required face terminally FAILS, so it can demote to the clone (Fix 2b)', async () => {
      registry.faceStatuses.set(faceKey(BOLD), 'failed');
      const gate = makeFaceGate(() => [BOLD]);

      await gate.ensureReadyForMeasure();
      // The failed required face triggers a demotion replan: caches invalidated synchronously, the
      // (batched) reflow flushes after the scheduler window. The next render re-resolves to the clone.
      expect(invalidateCaches).toHaveBeenCalledTimes(1);
      expect(requestReflow).not.toHaveBeenCalled();
      clock.advance(300);
      expect(requestReflow).toHaveBeenCalledTimes(1);

      // A second measure pass with the SAME face still failed must NOT replan again - fire-once, so it
      // cannot loop when the bundled clone it steps down to also fails. Drain the full cooldown.
      await gate.ensureReadyForMeasure();
      clock.advance(2500);
      expect(invalidateCaches).toHaveBeenCalledTimes(1);
      expect(requestReflow).toHaveBeenCalledTimes(1);
    });

    it('reflows once when the required bold face loads after a timed-out first paint', async () => {
      registry.faceStatuses.set(faceKey(BOLD), 'timed_out');
      const gate = makeFaceGate(() => [BOLD]);
      await gate.ensureReadyForMeasure();
      expect(requestReflow).not.toHaveBeenCalled();

      // A REGULAR Carlito face finishing must NOT reflow - it is not a required face.
      fontSet.fire('loadingdone', { fontfaces: [{ family: 'Carlito', weight: 'normal', style: 'normal' }] });
      clock.advance(300);
      expect(requestReflow).not.toHaveBeenCalled();

      // The required BOLD face finishing DOES reflow (batched), exactly once after the window.
      registry.faceStatuses.set(faceKey(BOLD), 'loaded');
      fontSet.fire('loadingdone', { fontfaces: [{ family: 'Carlito', weight: 'bold', style: 'normal' }] });
      expect(requestReflow).not.toHaveBeenCalled(); // batched, not yet flushed
      clock.advance(300);
      expect(requestReflow).toHaveBeenCalledTimes(1);
      expect(invalidateCaches).toHaveBeenCalledTimes(1);

      // A second loadingdone for the SAME face must not reflow again. Drain the full cooldown:
      // a broken dedup would re-invalidate immediately AND flush a trailing reflow at cooldown
      // end, so advancing past it (not just 300ms inside it) is what makes this assertion real.
      fontSet.fire('loadingdone', { fontfaces: [{ family: 'Carlito', weight: 'bold', style: 'normal' }] });
      clock.advance(2500); // past the post-flush cooldown (2000ms)
      expect(requestReflow).toHaveBeenCalledTimes(1);
      expect(invalidateCaches).toHaveBeenCalledTimes(1);
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

    it('resetForDocumentChange clears the cached summary so an empty new document does not reuse it', async () => {
      const REGULAR: FontFaceRequest = { family: 'Carlito', weight: '400', style: 'normal' };
      registry.faceStatuses.set(faceKey(REGULAR), 'loaded');
      let faces: FontFaceRequest[] = [REGULAR];
      const gate = new FontReadinessGate({
        registry: registry.asRegistry(),
        getDocumentFonts: () => [],
        getRequiredFaces: () => faces,
        requestReflow,
        invalidateCaches,
        getFontEnvironment: () => ({ fontSet: fontSet.asFontSet(), FontFaceCtor: fakeCtor }),
        timeoutMs: 1000,
        scheduleTimeout: clock.scheduleTimeout,
        cancelTimeout: clock.cancelTimeout,
      });

      const first = await gate.ensureReadyForMeasure();
      expect(first.loaded).toBe(1); // Carlito loaded for the first document

      // Swap to a document with no required faces. With #lastSummary uncleared, the empty
      // plan short-circuits to the prior summary; the reset must prevent that.
      gate.resetForDocumentChange();
      faces = [];
      const second = await gate.ensureReadyForMeasure();
      expect(second.loaded).toBe(0);
      expect(second.results).toEqual([]);
    });
  });
});

describe('FontReadinessGate.getDocumentFontOptions (document-used fonts, public read API)', () => {
  // The full public chain needs a painted render plan, so this covers the gate seam that owns used-face wiring.
  class FaceRegistry {
    getStatus(): FontLoadStatus {
      return 'unloaded';
    }
    getFaceStatus(): FontLoadStatus {
      return 'unloaded';
    }
    hasFace(): boolean {
      return false;
    }
    asRegistry(): FontRegistry {
      return this as unknown as FontRegistry;
    }
  }

  const regular = (logicalFamily: string): UsedFace => ({ logicalFamily, weight: '400', style: 'normal' });

  function makeOptionsGate(getUsedFaces: () => UsedFace[], documentFonts: string[] = []) {
    return new FontReadinessGate({
      registry: new FaceRegistry().asRegistry(),
      getDocumentFonts: () => documentFonts,
      getUsedFaces,
      requestReflow: vi.fn(),
      invalidateCaches: vi.fn(),
      getFontEnvironment: () => null,
    });
  }

  it('returns one option per RENDERED font, ignoring declared-but-unused font-table rows and the defaults', () => {
    const gate = makeOptionsGate(() => [regular('Aptos')], ['Calibri', 'Georgia', 'Aptos']);

    const options = gate.getDocumentFontOptions();

    expect(options.map((o) => o.logicalFamily)).toEqual(['Aptos']);
    expect(options[0]).toEqual({ logicalFamily: 'Aptos', previewFamily: 'Aptos' });
  });

  it('returns [] when the document renders no fonts, even with declared families (no defaults leak in)', () => {
    const gate = makeOptionsGate(() => [], ['Calibri', 'Arial']);
    expect(gate.getDocumentFontOptions()).toEqual([]);
  });

  it('never throws (font UI must not break layout): returns [] when the used-faces read fails', () => {
    const gate = makeOptionsGate(() => {
      throw new Error('render plan unavailable');
    });
    expect(gate.getDocumentFontOptions()).toEqual([]);
  });
});
