import type { FontRegistry } from '@superdoc/font-system';
import { createFontResolver, type FontFaceRequest, type RegisterFaceResult } from '@superdoc/font-system';
import { describe, expect, it, vi } from 'vitest';
import { DocumentFontController, type EmbeddedFontFace } from './DocumentFontController';
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

  readonly ownedRegistered: Array<{ family: string; weight: string; style: string }> = [];
  readonly ownedReleased: Array<{ family: string; weight: string; style: string }> = [];

  /** Model the document-owned binary face path: each call registers a distinct face and returns a
   *  disposer that releases exactly it. Reflected in `hasFace` so the resolver's `registered_face`
   *  rung sees it. (Refcounting a shared key is the real registry's job, covered in registry.test.ts;
   *  these controller tests use distinct families.) */
  registerOwnedFace(input: {
    family: string;
    source: ArrayBuffer | ArrayBufferView;
    weight: '400' | '700';
    style: 'normal' | 'italic';
  }): (() => boolean) | null {
    const record = { family: input.family, weight: input.weight, style: input.style };
    this.ownedRegistered.push(record);
    const key = `${input.family.toLowerCase()}|${input.weight}|${input.style}`;
    this.#sources.set(key, 'owned');
    let released = false;
    return () => {
      if (released) return false;
      released = true;
      this.ownedReleased.push(record);
      this.#sources.delete(key);
      return true;
    };
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

function makeController(sharedRegistry?: FakeRegistry) {
  // Pass a shared registry to model two editors on one FontFaceSet (the real per-document sharing).
  const registry = sharedRegistry ?? new FakeRegistry();
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

    expect(resolver.resolvePrimaryPhysicalFamily('Georgia')).toBe('Gelasio');
    expect(notifyDocumentFontConfigChanged).not.toHaveBeenCalled();
  });

  it('reset followed by initial config reapplies configured mappings without stale runtime mappings', () => {
    const { controller, resolver, notifyDocumentFontConfigChanged, onDocumentFontConfigApplied, flushMicrotasks } =
      makeController();

    controller.map({ Georgia: 'Tinos', Verdana: 'Some Runtime Font' });
    controller.reset();
    // assetBaseUrl marks the pack configured, so bundled substitutes stay active and Verdana reverts
    // to its bundled default (Noto Sans) - proving reset cleared the stale runtime Verdana mapping.
    controller.applyInitialConfig({ assetBaseUrl: '/fonts/', map: { Georgia: 'Gelasio' } });
    flushMicrotasks();

    expect(resolver.resolvePrimaryPhysicalFamily('Georgia')).toBe('Gelasio');
    expect(resolver.resolvePrimaryPhysicalFamily('Verdana')).toBe('Noto Sans');
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

  describe('applyEmbeddedFaces (embedded DOCX fonts)', () => {
    const embed = (over: Partial<EmbeddedFontFace> & { family: string }): EmbeddedFontFace => ({
      source: new ArrayBuffer(8),
      weight: '400',
      style: 'normal',
      fsType: 0,
      embeddable: true,
      relationshipId: 'rId1',
      ...over,
    });

    // These tests need a small fake of the bundled clone faces that production registers through
    // installBundledSubstitutes. After #3653 the resolver only
    // takes the bundled_substitute rung when the clone face is loadable (hasFace-gated), so a fake that
    // omits the pack resolves e.g. Calibri to identity instead of Carlito. Report the clones as present -
    // all are four-face, so they supply every weight/style - mirroring resolver.test.ts's clone-aware
    // hasFace. Deliberately NOT pushed into registry.registered, which other tests assert on.
    const BUNDLED_CLONE_FAMILIES = new Set([
      'carlito',
      'caladea',
      'liberation sans',
      'liberation serif',
      'liberation mono',
    ]);
    const hasFaceOf = (registry: FakeRegistry) => (f: string, w: '400' | '700', s: 'normal' | 'italic') =>
      registry.hasFace(f, w, s) || BUNDLED_CLONE_FAMILIES.has(f.trim().toLowerCase());
    const regular = { weight: '400', style: 'normal' } as const;

    it('registers embeddable faces under a unique physical family, skips restricted, invalidates without reflow/event', () => {
      const {
        controller,
        resolver,
        registry,
        invalidateCachesForConfigRegistration,
        notifyDocumentFontConfigChanged,
        onDocumentFontConfigApplied,
      } = makeController();
      const hasFace = hasFaceOf(registry);

      controller.applyEmbeddedFaces([
        embed({ family: 'Calibri', weight: '400' }),
        embed({ family: 'Calibri', weight: '700', relationshipId: 'rId2' }),
        // Restricted-License (fsType bit 1) / unreadable OS/2: not embeddable -> skipped.
        embed({ family: 'SecretFont', fsType: 0x0002, embeddable: false, relationshipId: 'rId3' }),
      ]);

      // Both Calibri faces register under ONE document-unique physical family - never the shared
      // logical name "Calibri" (which would let another document render these bytes).
      const phys = resolver.resolveFace('Calibri', regular, hasFace).physicalFamily;
      expect(phys).toMatch(/^__superdoc_embedded_\d+__\d+_\d+_Calibri$/);
      expect(registry.ownedRegistered).toEqual([
        { family: phys, weight: '400', style: 'normal' },
        { family: phys, weight: '700', style: 'normal' },
      ]);
      expect(registry.hasFace(phys, '700', 'normal')).toBe(true);
      expect(registry.hasFace('Calibri', '400', 'normal')).toBe(false); // logical name NOT in the shared set
      expect(registry.hasFace('SecretFont', '400', 'normal')).toBe(false); // restricted never registered
      // Config-time registration: clears the shared measure caches, but no reflow/event.
      expect(invalidateCachesForConfigRegistration).toHaveBeenCalledTimes(1);
      expect(onDocumentFontConfigApplied).not.toHaveBeenCalled();
      expect(notifyDocumentFontConfigChanged).not.toHaveBeenCalled();
    });

    it('resolves the logical family to the unique physical via registered_face, and paint swaps to it', () => {
      const { controller, resolver, registry } = makeController();
      const hasFace = hasFaceOf(registry);

      // Before: Calibri falls back to the bundled substitute (Carlito).
      expect(resolver.resolveFace('Calibri', regular, hasFace).physicalFamily).toBe('Carlito');

      controller.applyEmbeddedFaces([embed({ family: 'Calibri' })]);

      const resolved = resolver.resolveFace('Calibri', regular, hasFace);
      expect(resolved.reason).toBe('registered_face');
      expect(resolved.physicalFamily).not.toBe('Calibri'); // NOT the shared logical name
      expect(resolved.physicalFamily).toMatch(/^__superdoc_embedded_\d+__\d+_\d+_Calibri$/);
      // The paint/measure seam swaps the primary to the unique physical family (fallbacks preserved).
      expect(resolver.resolvePhysicalFamilyForFace('Calibri, serif', regular, hasFace)).toBe(
        `${resolved.physicalFamily}, serif`,
      );
    });

    it('releases embedded faces and resolver bindings on reset (document swap)', () => {
      const { controller, resolver, registry } = makeController();
      const hasFace = hasFaceOf(registry);
      controller.applyEmbeddedFaces([
        embed({ family: 'Calibri', weight: '400' }),
        embed({ family: 'Calibri', weight: '700' }),
      ]);
      const phys = resolver.resolveFace('Calibri', regular, hasFace).physicalFamily;
      expect(registry.hasFace(phys, '400', 'normal')).toBe(true);

      controller.reset();

      expect(registry.ownedReleased).toEqual([
        { family: phys, weight: '400', style: 'normal' },
        { family: phys, weight: '700', style: 'normal' },
      ]);
      expect(registry.hasFace(phys, '400', 'normal')).toBe(false);
      // Resolver reverts: Calibri falls back to the bundled substitute again.
      expect(resolver.resolveFace('Calibri', regular, hasFace).physicalFamily).toBe('Carlito');
    });

    it('releases embedded faces and resolver bindings on dispose (teardown)', () => {
      const { controller, resolver, registry } = makeController();
      const hasFace = hasFaceOf(registry);
      controller.applyEmbeddedFaces([embed({ family: 'Calibri' })]);
      const phys = resolver.resolveFace('Calibri', regular, hasFace).physicalFamily;

      controller.dispose();

      expect(registry.ownedReleased).toEqual([{ family: phys, weight: '400', style: 'normal' }]);
      expect(resolver.resolveFace('Calibri', regular, hasFace).physicalFamily).toBe('Carlito');
    });

    it('replaces the prior embedded set on re-apply (releases old, binds new)', () => {
      const { controller, resolver, registry } = makeController();
      const hasFace = hasFaceOf(registry);
      controller.applyEmbeddedFaces([embed({ family: 'Calibri' })]);
      const calibriPhys = resolver.resolveFace('Calibri', regular, hasFace).physicalFamily;

      controller.applyEmbeddedFaces([embed({ family: 'Cambria' })]);

      expect(registry.ownedReleased).toEqual([{ family: calibriPhys, weight: '400', style: 'normal' }]);
      expect(resolver.resolveFace('Calibri', regular, hasFace).physicalFamily).toBe('Carlito'); // released -> bundled
      const cambria = resolver.resolveFace('Cambria', regular, hasFace);
      expect(cambria.reason).toBe('registered_face');
      expect(cambria.physicalFamily).toMatch(/^__superdoc_embedded_\d+__\d+_\d+_Cambria$/);
    });

    it('does nothing (no invalidate) when there are no embeddable faces', () => {
      const { controller, resolver, registry, invalidateCachesForConfigRegistration } = makeController();
      const hasFace = hasFaceOf(registry);
      controller.applyEmbeddedFaces([embed({ family: 'SecretFont', embeddable: false })]);

      expect(registry.ownedRegistered).toHaveLength(0);
      expect(invalidateCachesForConfigRegistration).not.toHaveBeenCalled();
      expect(resolver.resolveFace('SecretFont', regular, hasFace).reason).toBe('as_requested');
    });

    it('gives each document a distinct physical family for the SAME logical name (render isolation)', () => {
      // Two editors on ONE FontFaceSet, both embedding "Calibri" with different bytes. The unique
      // physical families keep render ownership document-scoped: neither cleanup nor matching crosses.
      const registry = new FakeRegistry();
      const docA = makeController(registry);
      const docB = makeController(registry);
      const hasFace = hasFaceOf(registry);

      docA.controller.applyEmbeddedFaces([embed({ family: 'Calibri' })]);
      docB.controller.applyEmbeddedFaces([embed({ family: 'Calibri' })]); // same logical family, other doc

      const physA = docA.resolver.resolveFace('Calibri', regular, hasFace).physicalFamily;
      const physB = docB.resolver.resolveFace('Calibri', regular, hasFace).physicalFamily;
      expect(physA).not.toBe(physB); // distinct physical families for the same logical "Calibri"

      docA.controller.reset();

      expect(registry.hasFace(physA, '400', 'normal')).toBe(false); // doc A released
      expect(registry.hasFace(physB, '400', 'normal')).toBe(true); // doc B intact
      expect(docB.resolver.resolveFace('Calibri', regular, hasFace).reason).toBe('registered_face');
    });

    it('mints a fresh physical family across a same-controller document swap (no in-flight name reuse)', () => {
      // One controller, two documents in sequence with reset() between (the real same-controller swap).
      // The namespace is fixed per controller and reset() clears the per-family index, so WITHOUT a
      // per-apply generation the second document would re-mint the first's physical name and alias its
      // (possibly still in-flight) face on the shared registry. The generation keeps the names distinct.
      const { controller, resolver, registry } = makeController();
      const hasFace = hasFaceOf(registry);

      controller.applyEmbeddedFaces([embed({ family: 'Calibri' })]);
      const physFirst = resolver.resolveFace('Calibri', regular, hasFace).physicalFamily;

      controller.reset(); // document swap: releases the face, clears the index
      controller.applyEmbeddedFaces([embed({ family: 'Calibri' })]);
      const physSecond = resolver.resolveFace('Calibri', regular, hasFace).physicalFamily;

      expect(physSecond).not.toBe(physFirst); // generation bumped: never a reused name
      // Same controller -> same namespace; the GENERATION segment is what differs (not the namespace,
      // unlike the cross-controller test above). Pin that so a regression to namespace-only uniqueness fails.
      const namespaceOf = (phys: string) => phys.match(/^(__superdoc_embedded_\d+__)/)?.[1];
      expect(namespaceOf(physSecond)).toBe(namespaceOf(physFirst));
      // Only the second document's face is live in the shared registry; the first was released on swap.
      expect(registry.hasFace(physFirst, '400', 'normal')).toBe(false);
      expect(registry.hasFace(physSecond, '400', 'normal')).toBe(true);
    });
  });
});
