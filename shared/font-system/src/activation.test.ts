import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASELINE_BUNDLED, FULLY_ACTIVE_BUNDLED, createBundledActivation, deriveBundledActivation } from './activation';
import { __resetBundledPackPresent, isBundledPackPresent, markBundledPackPresent } from './bundled';

describe('createBundledActivation', () => {
  it('no pack configured: nothing active, with a distinct non-empty signature', () => {
    const a = createBundledActivation({ packConfigured: false });
    expect(a).toBe(BASELINE_BUNDLED);
    expect(a.packConfigured).toBe(false);
    expect(a.isActive('Calibri')).toBe(false);
    expect(a.isActive('Arial')).toBe(false);
    // Non-empty so a no-pack document never shares a full-pack document's measure cache.
    expect(a.signature).not.toBe('');
  });

  it('pack configured with no curation: fully active, empty signature (preserves cache sharing)', () => {
    const a = createBundledActivation({ packConfigured: true });
    expect(a).toBe(FULLY_ACTIVE_BUNDLED);
    expect(a.packConfigured).toBe(true);
    expect(a.isActive('Calibri')).toBe(true);
    expect(a.signature).toBe('');
  });

  it('include is an allow-list, matched case-insensitively after quote-strip', () => {
    const a = createBundledActivation({ packConfigured: true, include: ['Calibri', 'Cambria'] });
    expect(a.isActive('Calibri')).toBe(true);
    expect(a.isActive('"calibri"')).toBe(true);
    expect(a.isActive('Cambria')).toBe(true);
    expect(a.isActive('Arial')).toBe(false);
    expect(a.signature).not.toBe('');
  });

  it('exclude keeps every family but the listed ones', () => {
    const a = createBundledActivation({ packConfigured: true, exclude: ['Cooper Black'] });
    expect(a.isActive('Cooper Black')).toBe(false);
    expect(a.isActive('cooper black')).toBe(false);
    expect(a.isActive('Calibri')).toBe(true);
  });

  it('include wins over exclude when both are given', () => {
    const a = createBundledActivation({ packConfigured: true, include: ['Calibri'], exclude: ['Calibri'] });
    expect(a.isActive('Calibri')).toBe(true);
    expect(a.isActive('Arial')).toBe(false);
  });

  it('include/exclude with no usable entries are ignored (no accidental empty toolbar)', () => {
    expect(createBundledActivation({ packConfigured: true, include: [] })).toBe(FULLY_ACTIVE_BUNDLED);
    expect(createBundledActivation({ packConfigured: true, exclude: ['', '  '] })).toBe(FULLY_ACTIVE_BUNDLED);
  });

  it('curation is moot with no pack: still baseline', () => {
    expect(createBundledActivation({ packConfigured: false, include: ['Calibri'] })).toBe(BASELINE_BUNDLED);
  });

  it('signatures distinguish baseline / full / curated, and equal curation gives an equal signature', () => {
    const baseline = createBundledActivation({ packConfigured: false }).signature;
    const full = createBundledActivation({ packConfigured: true }).signature;
    const inc = createBundledActivation({ packConfigured: true, include: ['Calibri'] }).signature;
    const exc = createBundledActivation({ packConfigured: true, exclude: ['Calibri'] }).signature;
    expect(new Set([baseline, full, inc, exc]).size).toBe(4);
    // Order-independent and de-duplicated, so the same curation is the same signature.
    expect(
      createBundledActivation({ packConfigured: true, include: ['Cambria', 'Calibri', 'Calibri'] }).signature,
    ).toBe(createBundledActivation({ packConfigured: true, include: ['Calibri', 'Cambria'] }).signature);
  });

  it('ignores malformed (non-array) curation instead of crashing - falls back to the full pack', () => {
    // Raw JS config can hand-write a bare string; deriving activation must never throw at init.
    const a = createBundledActivation({ packConfigured: true, include: 'Calibri' as unknown as string[] });
    expect(a).toBe(FULLY_ACTIVE_BUNDLED);
    expect(a.isActive('Calibri')).toBe(true);
  });

  it('drops non-string entries from a curation array', () => {
    const a = createBundledActivation({
      packConfigured: true,
      include: ['Calibri', 123, null] as unknown as string[],
    });
    expect(a.isActive('Calibri')).toBe(true);
    expect(a.isActive('Cambria')).toBe(false);
  });
});

describe('deriveBundledActivation', () => {
  beforeEach(() => __resetBundledPackPresent());
  afterEach(() => __resetBundledPackPresent());

  it('npm with no config and no CDN flag: baseline', () => {
    expect(isBundledPackPresent()).toBe(false);
    expect(deriveBundledActivation(undefined)).toBe(BASELINE_BUNDLED);
    expect(deriveBundledActivation(null)).toBe(BASELINE_BUNDLED);
    expect(deriveBundledActivation({})).toBe(BASELINE_BUNDLED);
  });

  it('resolveAssetUrl or assetBaseUrl marks the pack configured (rich)', () => {
    expect(deriveBundledActivation({ resolveAssetUrl: () => 'x' }).packConfigured).toBe(true);
    expect(deriveBundledActivation({ assetBaseUrl: '/fonts/' }).packConfigured).toBe(true);
  });

  it('passes bundled curation through', () => {
    const a = deriveBundledActivation({ assetBaseUrl: '/fonts/', bundled: { exclude: ['Cooper Black'] } });
    expect(a.packConfigured).toBe(true);
    expect(a.isActive('Cooper Black')).toBe(false);
    expect(a.isActive('Calibri')).toBe(true);
  });

  it('CDN: markBundledPackPresent makes a no-config document rich', () => {
    markBundledPackPresent();
    expect(deriveBundledActivation(undefined).packConfigured).toBe(true);
    expect(deriveBundledActivation({}).isActive('Calibri')).toBe(true);
  });

  it('does not crash on malformed raw bundled config (a string instead of an array)', () => {
    const a = deriveBundledActivation({
      assetBaseUrl: '/fonts/',
      bundled: { include: 'Calibri' as unknown as string[] },
    });
    expect(a.packConfigured).toBe(true);
    expect(a.isActive('Calibri')).toBe(true); // malformed curation ignored -> full pack
  });
});
