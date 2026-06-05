import { describe, expect, it, vi } from 'vitest';
import { createFontResolver, type FontFaceRequest, type RegisterFaceResult } from '@superdoc/font-system';
import type { FontRegistry } from '@superdoc/font-system';
import { DocumentFontController } from './DocumentFontController';
import type { FontReadinessGate } from './FontReadinessGate';

class FakeRegistry {
  readonly registered: Array<{ family: string; source: string; weight?: string; style?: string }> = [];
  readonly awaited: FontFaceRequest[][] = [];
  readonly #sources = new Map<string, string>();

  register(input: {
    family: string;
    source: string;
    descriptors?: { weight?: string | number; style?: string };
  }): RegisterFaceResult {
    const weight = input.descriptors?.weight == null ? '400' : String(input.descriptors.weight);
    const style = input.descriptors?.style ?? 'normal';
    const key = `${input.family.toLowerCase()}|${weight}|${style}`;
    const existing = this.#sources.get(key);
    if (existing === input.source) return { family: input.family, status: 'unloaded', changed: false };
    if (existing !== undefined) throw new Error('already registered from a different source');
    this.#sources.set(key, input.source);
    this.registered.push({ family: input.family, source: input.source, weight, style });
    return { family: input.family, status: 'unloaded', changed: true };
  }

  async awaitFaceRequests(requests: Iterable<FontFaceRequest>): Promise<[]> {
    this.awaited.push([...requests]);
    return [];
  }

  hasFace(family: string, weight: '400' | '700', style: 'normal' | 'italic'): boolean {
    return this.#sources.has(`${family.toLowerCase()}|${weight}|${style}`);
  }

  asRegistry(): FontRegistry {
    return this as unknown as FontRegistry;
  }
}

function makeController() {
  const registry = new FakeRegistry();
  const notifyDocumentFontConfigChanged = vi.fn();
  const invalidateCachesForConfigRegistration = vi.fn();
  const onDocumentFontConfigApplied = vi.fn();
  const microtasks: Array<() => void> = [];
  const gate = {
    resolveRegistry: () => registry.asRegistry(),
    notifyDocumentFontConfigChanged,
    invalidateCachesForConfigRegistration,
  } as unknown as FontReadinessGate;
  const resolver = createFontResolver();
  const controller = new DocumentFontController({
    resolver,
    getGate: () => gate,
    onDocumentFontConfigApplied,
    scheduleMicrotask: (callback) => {
      microtasks.push(callback);
    },
  });
  const flushMicrotasks = () => {
    while (microtasks.length) microtasks.shift()?.();
  };
  return {
    controller,
    registry,
    resolver,
    notifyDocumentFontConfigChanged,
    invalidateCachesForConfigRegistration,
    onDocumentFontConfigApplied,
    flushMicrotasks,
  };
}

describe('DocumentFontController', () => {
  it('coalesces same-tick add + map into one runtime config-change reflow', () => {
    const {
      controller,
      resolver,
      registry,
      notifyDocumentFontConfigChanged,
      onDocumentFontConfigApplied,
      flushMicrotasks,
    } = makeController();

    controller.add([{ family: 'Gelasio', faces: [{ source: '/fonts/Gelasio-Regular.woff2' }] }]);
    controller.map({ Georgia: 'Gelasio' });

    expect(notifyDocumentFontConfigChanged).not.toHaveBeenCalled();
    expect(registry.registered[0]).toMatchObject({
      family: 'Gelasio',
      source: 'url("/fonts/Gelasio-Regular.woff2")',
    });
    expect(resolver.resolvePrimaryPhysicalFamily('Georgia')).toBe('Gelasio');

    flushMicrotasks();

    expect(onDocumentFontConfigApplied).toHaveBeenCalledTimes(1);
    expect(notifyDocumentFontConfigChanged).toHaveBeenCalledTimes(1);
    // The batch included a registration, so the gate must invalidate the shared measure caches:
    // the resolver signature is unchanged for the added family, so it cannot bust them.
    expect(notifyDocumentFontConfigChanged).toHaveBeenCalledWith({ availabilityChanged: true });
  });

  it('signals a mapping-only change without an availability change (signature busts the caches)', () => {
    const { controller, notifyDocumentFontConfigChanged, flushMicrotasks } = makeController();

    controller.map({ Georgia: 'Gelasio' });
    flushMicrotasks();

    expect(notifyDocumentFontConfigChanged).toHaveBeenCalledTimes(1);
    expect(notifyDocumentFontConfigChanged).toHaveBeenCalledWith({ availabilityChanged: false });
  });

  it('does not reflow on an idempotent add', () => {
    const { controller, notifyDocumentFontConfigChanged, flushMicrotasks } = makeController();
    const family = { family: 'Gelasio', faces: [{ source: '/fonts/Gelasio-Regular.woff2' }] };

    controller.add([family]);
    flushMicrotasks();
    controller.add([family]);
    flushMicrotasks();

    expect(notifyDocumentFontConfigChanged).toHaveBeenCalledTimes(1);
  });

  it('applies initial config without a runtime event or reflow, but invalidates caches for the registration', () => {
    const {
      controller,
      resolver,
      registry,
      notifyDocumentFontConfigChanged,
      invalidateCachesForConfigRegistration,
      onDocumentFontConfigApplied,
      flushMicrotasks,
    } = makeController();

    controller.applyInitialConfig({
      families: [{ family: 'Gelasio', faces: [{ source: '/fonts/Gelasio-Regular.woff2', weight: 400 }] }],
      map: { Georgia: 'Gelasio' },
    });
    flushMicrotasks();

    expect(resolver.resolvePrimaryPhysicalFamily('Georgia')).toBe('Gelasio');
    expect(registry.registered).toHaveLength(1);
    expect(onDocumentFontConfigApplied).not.toHaveBeenCalled();
    expect(notifyDocumentFontConfigChanged).not.toHaveBeenCalled();
    // The registered family changes availability without moving the signature, so the first measure
    // must not reuse a stale fallback width: clear the shared caches (no reflow/event).
    expect(invalidateCachesForConfigRegistration).toHaveBeenCalledTimes(1);
  });

  it('applies a mapping-only initial config without invalidating caches (the signature busts them)', () => {
    const { controller, resolver, invalidateCachesForConfigRegistration } = makeController();

    controller.applyInitialConfig({ map: { Georgia: 'Gelasio' } });

    expect(resolver.resolvePrimaryPhysicalFamily('Georgia')).toBe('Gelasio');
    expect(invalidateCachesForConfigRegistration).not.toHaveBeenCalled();
  });

  it('reset cancels a pending runtime batch and clears mappings', () => {
    const { controller, resolver, notifyDocumentFontConfigChanged, flushMicrotasks } = makeController();

    controller.map({ Georgia: 'Gelasio' });
    controller.reset();
    flushMicrotasks();

    expect(resolver.resolvePrimaryPhysicalFamily('Georgia')).toBe('Georgia');
    expect(notifyDocumentFontConfigChanged).not.toHaveBeenCalled();
  });

  it('reset followed by initial config reapplies configured mappings without stale runtime mappings', () => {
    const { controller, resolver, notifyDocumentFontConfigChanged, onDocumentFontConfigApplied, flushMicrotasks } =
      makeController();

    controller.map({ Georgia: 'Tinos', Verdana: 'Some Runtime Font' });
    controller.reset();
    controller.applyInitialConfig({ map: { Georgia: 'Gelasio' } });
    flushMicrotasks();

    expect(resolver.resolvePrimaryPhysicalFamily('Georgia')).toBe('Gelasio');
    expect(resolver.resolvePrimaryPhysicalFamily('Verdana')).toBe('Verdana');
    expect(onDocumentFontConfigApplied).not.toHaveBeenCalled();
    expect(notifyDocumentFontConfigChanged).not.toHaveBeenCalled();
  });

  it('keeps mappings and runtime reflows isolated across controllers', () => {
    const docA = makeController();
    const docB = makeController();

    docA.controller.add([{ family: 'Gelasio', faces: [{ source: '/fonts/Gelasio-Regular.woff2' }] }]);
    docA.controller.map({ Georgia: 'Gelasio' });
    docB.controller.map({ Georgia: 'Tinos' });

    docA.flushMicrotasks();

    expect(docA.resolver.resolvePrimaryPhysicalFamily('Georgia')).toBe('Gelasio');
    expect(docB.resolver.resolvePrimaryPhysicalFamily('Georgia')).toBe('Tinos');
    expect(docA.notifyDocumentFontConfigChanged).toHaveBeenCalledTimes(1);
    expect(docB.notifyDocumentFontConfigChanged).not.toHaveBeenCalled();

    docB.flushMicrotasks();

    expect(docA.notifyDocumentFontConfigChanged).toHaveBeenCalledTimes(1);
    expect(docB.notifyDocumentFontConfigChanged).toHaveBeenCalledTimes(1);
  });

  it('preload resolves logical families through the document resolver', async () => {
    const { controller, registry } = makeController();

    // Register Gelasio (so the map target is loadable), then map Georgia -> Gelasio.
    controller.applyInitialConfig({
      families: [{ family: 'Gelasio', faces: [{ source: '/fonts/Gelasio-Regular.woff2' }] }],
      map: { Georgia: 'Gelasio' },
    });
    await controller.preload(['Georgia']);

    expect(registry.awaited).toEqual([[{ family: 'Gelasio', weight: '400', style: 'normal' }]]);
  });

  it('preload prefers a registered real face over the bundled substitute (provider precedence)', async () => {
    const { controller, registry } = makeController();

    // The document registered real Calibri faces; preload must load Calibri, NOT the bundled Carlito.
    controller.applyInitialConfig({
      families: [{ family: 'Calibri', faces: [{ source: '/fonts/Calibri.woff2' }] }],
    });
    await controller.preload(['Calibri']);

    expect(registry.awaited).toEqual([[{ family: 'Calibri', weight: '400', style: 'normal' }]]);
  });

  it('still reflows for faces committed before a later conflicting face throws', () => {
    const { controller, notifyDocumentFontConfigChanged, flushMicrotasks } = makeController();

    // Two 400/normal faces for the same family with different sources: the first commits, the
    // second is a conflicting source and throws. The committed face must still reflow.
    expect(() =>
      controller.add([{ family: 'Gelasio', faces: [{ source: '/a.woff2' }, { source: '/b.woff2' }] }]),
    ).toThrow(/different source/);

    flushMicrotasks();

    expect(notifyDocumentFontConfigChanged).toHaveBeenCalledTimes(1);
    expect(notifyDocumentFontConfigChanged).toHaveBeenCalledWith({ availabilityChanged: true });
  });

  it('rejects an add family with no faces with an actionable error', () => {
    const { controller, notifyDocumentFontConfigChanged, flushMicrotasks } = makeController();

    expect(() => controller.add([{ family: 'Gelasio' } as never])).toThrow(/needs at least one face/);

    flushMicrotasks();
    expect(notifyDocumentFontConfigChanged).not.toHaveBeenCalled();
  });

  it('rejects an add family with no name with an actionable error', () => {
    const { controller } = makeController();

    expect(() => controller.add([{ faces: [{ source: '/x.woff2' }] } as never])).toThrow(/non-empty "family"/);
  });

  it('rejects an add face with no source with an actionable error', () => {
    const { controller } = makeController();

    expect(() => controller.add([{ family: 'Gelasio', faces: [{} as never] }])).toThrow(/no "source"/);
  });

  it('rejects a non-array preload argument with an actionable error', async () => {
    const { controller } = makeController();

    await expect(controller.preload('Georgia' as never)).rejects.toThrow(/expects an array/);
  });

  it('does not reflow on a redundant identity map (a true no-op stays cache-shareable)', () => {
    const { controller, resolver, notifyDocumentFontConfigChanged, flushMicrotasks } = makeController();

    // Mapping a family to its OWN name is the absence of an override: no reflow, signature stays ''.
    controller.map({ Georgia: 'Georgia' });
    flushMicrotasks();

    expect(resolver.signature).toBe('');
    expect(notifyDocumentFontConfigChanged).not.toHaveBeenCalled();
  });

  it('mapping a family to the bundled clone now stores an explicit pin (reflows; not a silent no-op)', () => {
    const { controller, resolver, notifyDocumentFontConfigChanged, flushMicrotasks } = makeController();

    // After provider precedence, map({ Calibri: 'Carlito' }) is an explicit pin to the clone, not a
    // no-op: it stores a custom_mapping override (so it beats a registered real Calibri) and reflows.
    controller.map({ Calibri: 'Carlito' });
    flushMicrotasks();

    expect(resolver.resolvePrimaryPhysicalFamily('Calibri')).toBe('Carlito');
    expect(resolver.signature).not.toBe('');
    expect(notifyDocumentFontConfigChanged).toHaveBeenCalledTimes(1);
  });

  it('unmap reverts a pin (mapping to the clone re-pins rather than reverting)', () => {
    const { controller, resolver, notifyDocumentFontConfigChanged, flushMicrotasks } = makeController();

    controller.map({ Calibri: 'Tinos' });
    flushMicrotasks();
    expect(notifyDocumentFontConfigChanged).toHaveBeenCalledTimes(1);

    // Mapping to the clone now RE-PINS (stores Calibri -> Carlito), it does not revert.
    controller.map({ Calibri: 'Carlito' });
    flushMicrotasks();
    expect(resolver.resolvePrimaryPhysicalFamily('Calibri')).toBe('Carlito');
    expect(resolver.signature).not.toBe(''); // still pinned
    expect(notifyDocumentFontConfigChanged).toHaveBeenCalledTimes(2);

    // unmap is the revert: back to the shared default.
    controller.unmap('Calibri');
    flushMicrotasks();
    expect(resolver.signature).toBe('');
    expect(notifyDocumentFontConfigChanged).toHaveBeenCalledTimes(3);
  });
});
