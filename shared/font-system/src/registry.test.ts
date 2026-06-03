import { describe, it, expect, beforeEach } from 'vitest';
import {
  FontRegistry,
  getFontRegistryFor,
  getDefaultFontRegistry,
  __resetDefaultFontRegistry,
  type FontSetLike,
  type FontFaceLike,
} from './index';

/** Extract the quoted family from a CSS `font` shorthand like `16px "Carlito"`. */
function parseFamily(font: string): string {
  const match = font.match(/"((?:[^"\\]|\\.)*)"/);
  return match ? match[1].replace(/\\(.)/g, '$1') : font.trim().split(/\s+/).slice(1).join(' ');
}

type Behavior = 'load-ok' | 'load-empty' | 'never' | 'reject';

class FakeFontFace implements FontFaceLike {
  status = 'unloaded';
  constructor(
    public readonly family: string,
    public readonly source: unknown,
    public readonly descriptors?: unknown,
  ) {}
  load(): Promise<FontFaceLike> {
    return Promise.resolve(this);
  }
}

/** Controllable FontFaceSet stand-in: per-family behavior + manual availability. */
class FakeFontSet implements FontSetLike {
  readonly added: FontFaceLike[] = [];
  readonly behaviors = new Map<string, Behavior>();
  readonly available = new Set<string>();

  add(face: FontFaceLike): void {
    this.added.push(face);
  }
  load(font: string): Promise<FontFaceLike[]> {
    const family = parseFamily(font);
    switch (this.behaviors.get(family) ?? 'load-empty') {
      case 'load-ok':
        this.available.add(family);
        return Promise.resolve([new FakeFontFace(family, 'x')]);
      case 'load-empty':
        return Promise.resolve([]);
      case 'reject':
        return Promise.reject(new Error('decode failed'));
      case 'never':
        return new Promise<FontFaceLike[]>(() => {});
    }
  }
  check(font: string): boolean {
    return this.available.has(parseFamily(font));
  }
}

/** Injectable timer the test can fire by hand, so `timed_out` is deterministic. */
function makeManualTimer() {
  const pending: Array<() => void> = [];
  return {
    scheduleTimeout: (cb: () => void) => {
      pending.push(cb);
      return pending.length - 1;
    },
    cancelTimeout: () => {},
    fire: () => {
      const due = pending.splice(0);
      due.forEach((cb) => cb());
    },
  };
}

function makeRegistry(fontSet: FakeFontSet, timer = makeManualTimer()) {
  const registry = new FontRegistry({
    fontSet,
    FontFaceCtor: FakeFontFace,
    scheduleTimeout: timer.scheduleTimeout,
    cancelTimeout: timer.cancelTimeout,
  });
  return { registry, timer };
}

describe('FontRegistry skeleton contract', () => {
  let fontSet: FakeFontSet;

  beforeEach(() => {
    fontSet = new FakeFontSet();
    __resetDefaultFontRegistry();
  });

  it('registers a managed face, adds it to the set, and tracks it as unloaded', () => {
    const { registry } = makeRegistry(fontSet);
    const result = registry.register({ family: 'Carlito', source: 'url(carlito.woff2)' });

    expect(result).toEqual({ family: 'Carlito', status: 'unloaded' });
    expect(registry.isManaged('Carlito')).toBe(true);
    expect(fontSet.added.map((f) => f.family)).toContain('Carlito');
    expect(registry.getStatus('Carlito')).toBe('unloaded');
  });

  it('reports `loaded` when a real face loads', async () => {
    fontSet.behaviors.set('Carlito', 'load-ok');
    const { registry } = makeRegistry(fontSet);

    const result = await registry.awaitFace('Carlito', 1000);

    expect(result).toEqual({ family: 'Carlito', status: 'loaded' });
    expect(registry.isAvailable('Carlito')).toBe(true);
  });

  it('reports `fallback_used` when no face matches the family', async () => {
    fontSet.behaviors.set('Aptos', 'load-empty');
    const { registry } = makeRegistry(fontSet);

    const result = await registry.awaitFace('Aptos', 1000);

    expect(result.status).toBe('fallback_used');
  });

  it('reports `failed` when the face load rejects', async () => {
    fontSet.behaviors.set('Broken', 'reject');
    const { registry } = makeRegistry(fontSet);

    const result = await registry.awaitFace('Broken', 1000);

    expect(result.status).toBe('failed');
  });

  it('reports `timed_out` when the load does not settle in budget', async () => {
    fontSet.behaviors.set('Slow', 'never');
    const { registry, timer } = makeRegistry(fontSet);

    const pending = registry.awaitFace('Slow', 1000);
    timer.fire();
    const result = await pending;

    expect(result.status).toBe('timed_out');
  });

  it('shares the in-flight probe for concurrent awaits of one family', () => {
    fontSet.behaviors.set('Carlito', 'never');
    const { registry } = makeRegistry(fontSet);

    const a = registry.awaitFace('Carlito', 1000);
    const b = registry.awaitFace('Carlito', 1000);

    expect(a).toBe(b);
  });

  it('awaitFaces de-duplicates and resolves every required family', async () => {
    fontSet.behaviors.set('Carlito', 'load-ok');
    fontSet.behaviors.set('Caladea', 'load-empty');
    const { registry } = makeRegistry(fontSet);

    const results = await registry.awaitFaces(['Carlito', 'Caladea', 'Carlito'], { timeoutMs: 1000 });

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.family === 'Carlito')?.status).toBe('loaded');
    expect(results.find((r) => r.family === 'Caladea')?.status).toBe('fallback_used');
  });

  it('exposes required faces as { family, status, ready } handles', async () => {
    fontSet.behaviors.set('Carlito', 'load-ok');
    const { registry } = makeRegistry(fontSet);

    const [handle] = registry.getRequiredFaces(['Carlito'], 1000);

    expect(handle.family).toBe('Carlito');
    expect(handle.status).toBe('unloaded'); // synchronous snapshot, before the await settles
    expect((await handle.ready).status).toBe('loaded');
  });

  it('quotes families with spaces so they resolve as one family', async () => {
    fontSet.behaviors.set('Times New Roman', 'load-ok');
    const { registry } = makeRegistry(fontSet);

    const result = await registry.awaitFace('Times New Roman', 1000);

    expect(result.status).toBe('loaded');
  });

  it('resolves to `fallback_used` with no font set (SSR)', async () => {
    const registry = new FontRegistry({});
    const result = await registry.awaitFace('Carlito', 1000);
    expect(result.status).toBe('fallback_used');
  });

  it('default registry is DOM-less under node and resolves to fallback', async () => {
    const registry = getDefaultFontRegistry();
    const result = await registry.awaitFace('Carlito', 1000);
    expect(result.status).toBe('fallback_used');
  });
});

describe('getFontRegistryFor', () => {
  beforeEach(() => __resetDefaultFontRegistry());

  it('returns the same registry for the same font set (shared per document)', () => {
    const setA = new FakeFontSet();
    const a1 = getFontRegistryFor(setA, FakeFontFace);
    const a2 = getFontRegistryFor(setA, FakeFontFace);
    expect(a1).toBe(a2);
  });

  it('returns distinct registries for distinct font sets (iframe isolation)', () => {
    const setA = new FakeFontSet();
    const setB = new FakeFontSet();
    expect(getFontRegistryFor(setA, FakeFontFace)).not.toBe(getFontRegistryFor(setB, FakeFontFace));
  });

  it('returns a shared DOM-less registry when no font set is given', () => {
    expect(getFontRegistryFor(null, null)).toBe(getFontRegistryFor(null, null));
  });
});

describe('FontRegistry face-aware APIs', () => {
  let fontSet: FakeFontSet;
  beforeEach(() => {
    fontSet = new FakeFontSet();
    __resetDefaultFontRegistry();
  });

  it('register seeds a face-level status from weight/style descriptors', () => {
    const { registry } = makeRegistry(fontSet);
    registry.register({
      family: 'Carlito',
      source: 'url(c-bold.woff2)',
      descriptors: { weight: 'bold', style: 'normal' },
    });
    expect(registry.getFaceStatus({ family: 'Carlito', weight: '700', style: 'normal' })).toBe('unloaded');
    // A different face of the same family is not implied by registering one.
    expect(registry.getFaceStatus({ family: 'Carlito', weight: '400', style: 'italic' })).toBe('unloaded');
  });

  it('awaitFaceRequest loads the exact face and rolls the family up to loaded', async () => {
    fontSet.behaviors.set('Carlito', 'load-ok');
    const { registry } = makeRegistry(fontSet);
    const res = await registry.awaitFaceRequest({ family: 'Carlito', weight: '700', style: 'italic' }, 1000);
    expect(res.status).toBe('loaded');
    expect(registry.getFaceStatus({ family: 'Carlito', weight: '700', style: 'italic' })).toBe('loaded');
    expect(registry.getStatus('Carlito')).toBe('loaded'); // family rollup for diagnostics
  });

  it('awaitFaceRequests dedupes by face key but keeps distinct weight/style as separate faces', async () => {
    fontSet.behaviors.set('Liberation Sans', 'load-ok');
    const { registry } = makeRegistry(fontSet);
    const results = await registry.awaitFaceRequests(
      [
        { family: 'Liberation Sans', weight: '400', style: 'normal' },
        { family: 'Liberation Sans', weight: '400', style: 'normal' }, // dup
        { family: 'Liberation Sans', weight: '700', style: 'normal' },
      ],
      { timeoutMs: 1000 },
    );
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'loaded')).toBe(true);
  });

  it('getStatus stays unloaded for a family registered but never awaited (not "missing")', () => {
    const { registry } = makeRegistry(fontSet);
    registry.register({
      family: 'Carlito',
      source: 'url(c.woff2)',
      descriptors: { weight: 'normal', style: 'normal' },
    });
    expect(registry.getStatus('Carlito')).toBe('unloaded');
  });

  it('a failed face surfaces in the family rollup when nothing else loaded', async () => {
    fontSet.behaviors.set('Broken', 'reject');
    const { registry } = makeRegistry(fontSet);
    const res = await registry.awaitFaceRequest({ family: 'Broken', weight: '400', style: 'normal' }, 1000);
    expect(res.status).toBe('failed');
    expect(registry.getStatus('Broken')).toBe('failed');
  });
});
