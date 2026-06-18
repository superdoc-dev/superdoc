import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeTrackChangesConfig, __resetDeprecationWarnings } from './normalize-track-changes-config.js';

describe('normalizeTrackChangesConfig', () => {
  let warnSpy;

  beforeEach(() => {
    __resetDeprecationWarnings();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('defaults (no user config)', () => {
    it('fills in safe defaults when nothing is provided', () => {
      const config = {};
      const result = normalizeTrackChangesConfig(config);

      expect(result).toEqual({ visible: false, mode: 'review', enabled: true, replacements: 'paired' });
      expect(config.modules.trackChanges).toEqual(result);
      expect(config.trackChanges).toEqual({ visible: false });
      expect(config.layoutEngineOptions.trackedChanges).toEqual({ mode: 'review', enabled: true });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('defaults mode to "original" in viewing mode when visibility is off', () => {
      const config = { documentMode: 'viewing' };
      const result = normalizeTrackChangesConfig(config);

      expect(result.mode).toBe('original');
      expect(result.visible).toBe(false);
    });

    it('defaults mode to "review" in viewing mode when visibility is on', () => {
      const config = {
        documentMode: 'viewing',
        modules: { trackChanges: { visible: true } },
      };
      const result = normalizeTrackChangesConfig(config);

      expect(result.mode).toBe('review');
      expect(result.visible).toBe(true);
    });
  });

  describe('new canonical path (config.modules.trackChanges)', () => {
    it('reads visible/mode/enabled from the new path without warnings', () => {
      const config = {
        modules: {
          trackChanges: { visible: true, mode: 'original', enabled: false },
        },
      };
      const result = normalizeTrackChangesConfig(config);

      expect(result).toEqual({ visible: true, mode: 'original', enabled: false, replacements: 'paired' });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('preserves the normalized values on the canonical path', () => {
      const config = {
        modules: { trackChanges: { visible: true } },
      };
      normalizeTrackChangesConfig(config);

      expect(config.modules.trackChanges.visible).toBe(true);
      expect(config.modules.trackChanges.mode).toBe('review');
      expect(config.modules.trackChanges.enabled).toBe(true);
    });

    it('preserves canonical author color config for v2 tracked-change rendering', () => {
      const authorColors = {
        enabled: true,
        overrides: { Ada: '#8250df' },
        resolve: vi.fn(),
      };
      const config = {
        modules: { trackChanges: { visible: true, authorColors } },
      };
      const result = normalizeTrackChangesConfig(config);

      expect(result.authorColors).toBe(authorColors);
      expect(config.modules.trackChanges.authorColors).toBe(authorColors);
      expect(config.layoutEngineOptions.trackedChanges).toEqual({ mode: 'review', enabled: true });
    });
  });

  describe('legacy config.trackChanges (visibility alias)', () => {
    it('accepts visible via the legacy key and emits one deprecation warning', () => {
      const config = { trackChanges: { visible: true } };
      const result = normalizeTrackChangesConfig(config);

      expect(result.visible).toBe(true);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/config\.trackChanges/);
      expect(warnSpy.mock.calls[0][0]).toMatch(/config\.modules\.trackChanges/);
    });

    it('mirrors the resolved visible back onto the legacy key', () => {
      const config = { trackChanges: { visible: true } };
      normalizeTrackChangesConfig(config);

      expect(config.trackChanges).toEqual({ visible: true });
    });

    it('warns only once across multiple normalizer calls', () => {
      normalizeTrackChangesConfig({ trackChanges: { visible: true } });
      normalizeTrackChangesConfig({ trackChanges: { visible: false } });

      const visibleWarnings = warnSpy.mock.calls.filter(
        (call) => /config\.trackChanges\b/.test(call[0]) && !/layoutEngineOptions/.test(call[0]),
      );
      expect(visibleWarnings).toHaveLength(1);
    });
  });

  describe('legacy config.layoutEngineOptions.trackedChanges', () => {
    it('accepts mode/enabled via the legacy key and emits one deprecation warning', () => {
      const config = {
        layoutEngineOptions: { trackedChanges: { mode: 'original', enabled: false } },
      };
      const result = normalizeTrackChangesConfig(config);

      expect(result.mode).toBe('original');
      expect(result.enabled).toBe(false);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/layoutEngineOptions\.trackedChanges/);
    });

    it('mirrors resolved mode/enabled back onto the legacy key', () => {
      const config = {
        layoutEngineOptions: { trackedChanges: { mode: 'original', enabled: false } },
      };
      normalizeTrackChangesConfig(config);

      expect(config.layoutEngineOptions.trackedChanges).toEqual({ mode: 'original', enabled: false });
    });

    it('does not clobber sibling layoutEngineOptions fields', () => {
      const config = {
        layoutEngineOptions: { flowMode: 'semantic', trackedChanges: { mode: 'original' } },
      };
      normalizeTrackChangesConfig(config);

      expect(config.layoutEngineOptions.flowMode).toBe('semantic');
      expect(config.layoutEngineOptions.trackedChanges.mode).toBe('original');
    });
  });

  describe('precedence: new > legacy', () => {
    it('prefers modules.trackChanges.visible over config.trackChanges.visible', () => {
      const config = {
        modules: { trackChanges: { visible: false } },
        trackChanges: { visible: true },
      };
      const result = normalizeTrackChangesConfig(config);

      expect(result.visible).toBe(false);
    });

    it('prefers modules.trackChanges.mode over layoutEngineOptions.trackedChanges.mode', () => {
      const config = {
        modules: { trackChanges: { mode: 'review' } },
        layoutEngineOptions: { trackedChanges: { mode: 'original' } },
      };
      const result = normalizeTrackChangesConfig(config);

      expect(result.mode).toBe('review');
    });

    it('falls through to the legacy value when the new path omits the field', () => {
      const config = {
        modules: { trackChanges: { visible: true } }, // no mode/enabled
        layoutEngineOptions: { trackedChanges: { mode: 'original', enabled: false } },
      };
      const result = normalizeTrackChangesConfig(config);

      expect(result).toEqual({ visible: true, mode: 'original', enabled: false, replacements: 'paired' });
    });
  });

  describe('defensive parsing', () => {
    it('ignores non-object legacy values', () => {
      const config = {
        trackChanges: 'not-an-object',
        layoutEngineOptions: { trackedChanges: null },
      };
      const result = normalizeTrackChangesConfig(config);

      expect(result).toEqual({ visible: false, mode: 'review', enabled: true, replacements: 'paired' });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('ignores array-typed modules/canonical/legacy objects', () => {
      const config = {
        modules: [],
        trackChanges: [],
        layoutEngineOptions: { trackedChanges: [] },
      };
      const result = normalizeTrackChangesConfig(config);

      expect(result).toEqual({ visible: false, mode: 'review', enabled: true, replacements: 'paired' });
      expect(Array.isArray(config.modules)).toBe(false);
    });

    it('treats a null canonical object as missing', () => {
      const config = {
        modules: { trackChanges: null },
        trackChanges: { visible: true },
      };
      const result = normalizeTrackChangesConfig(config);

      expect(result.visible).toBe(true);
    });

    it('coerces invalid mode values to the derived default', () => {
      const config = {
        modules: { trackChanges: { mode: 'bogus' } },
      };
      const result = normalizeTrackChangesConfig(config);

      expect(result.mode).toBe('review');
    });

    it('coerces non-boolean visible/enabled to the derived default', () => {
      const config = {
        modules: { trackChanges: { visible: 'yes', enabled: 0 } },
      };
      const result = normalizeTrackChangesConfig(config);

      expect(result.visible).toBe(false);
      expect(result.enabled).toBe(true);
    });
  });

  describe("replacements: 'paired' | 'independent'", () => {
    it("defaults to 'paired' when not supplied", () => {
      const result = normalizeTrackChangesConfig({});
      expect(result.replacements).toBe('paired');
    });

    it("accepts replacements: 'independent' on the canonical path", () => {
      const result = normalizeTrackChangesConfig({
        modules: { trackChanges: { replacements: 'independent' } },
      });
      expect(result.replacements).toBe('independent');
    });

    it('mirrors the resolved replacements onto the canonical path write-through', () => {
      const config = {
        modules: { trackChanges: { replacements: 'independent' } },
      };
      normalizeTrackChangesConfig(config);
      expect(config.modules.trackChanges.replacements).toBe('independent');
    });

    it("coerces invalid values to the default ('paired')", () => {
      const result = normalizeTrackChangesConfig({
        modules: { trackChanges: { replacements: 'whatever' } },
      });
      expect(result.replacements).toBe('paired');
    });

    it('is not derivable from any legacy key (no alias)', () => {
      // Legacy keys never carried this knob — it stays at its default.
      const result = normalizeTrackChangesConfig({
        trackChanges: { visible: true },
        layoutEngineOptions: { trackedChanges: { mode: 'original' } },
      });
      expect(result.replacements).toBe('paired');
    });
  });

  describe('extended mode values (final / off)', () => {
    it('preserves mode: "final" supplied via the legacy layout path', () => {
      const config = {
        layoutEngineOptions: { trackedChanges: { mode: 'final', enabled: true } },
      };
      const result = normalizeTrackChangesConfig(config);

      expect(result.mode).toBe('final');
      expect(config.layoutEngineOptions.trackedChanges.mode).toBe('final');
    });

    it('preserves mode: "off" supplied via the legacy layout path', () => {
      const config = {
        layoutEngineOptions: { trackedChanges: { mode: 'off' } },
      };
      const result = normalizeTrackChangesConfig(config);

      expect(result.mode).toBe('off');
    });

    it('accepts mode: "final" on the canonical path', () => {
      const config = {
        modules: { trackChanges: { mode: 'final' } },
      };
      const result = normalizeTrackChangesConfig(config);

      expect(result.mode).toBe('final');
    });
  });

  describe('conflicting legacy buckets', () => {
    it('warns for both legacy paths and merges their fields independently', () => {
      const config = {
        trackChanges: { visible: true },
        layoutEngineOptions: { trackedChanges: { mode: 'original', enabled: false } },
      };
      const result = normalizeTrackChangesConfig(config);

      expect(result).toEqual({ visible: true, mode: 'original', enabled: false, replacements: 'paired' });
      expect(warnSpy).toHaveBeenCalledTimes(2);
      const messages = warnSpy.mock.calls.map((call) => call[0]);
      expect(messages.some((m) => /config\.trackChanges\b/.test(m) && !/layoutEngineOptions/.test(m))).toBe(true);
      expect(messages.some((m) => /layoutEngineOptions\.trackedChanges/.test(m))).toBe(true);
    });

    it('warns on the legacy bucket even when the canonical value wins', () => {
      const config = {
        modules: { trackChanges: { visible: false } },
        trackChanges: { visible: true },
      };
      normalizeTrackChangesConfig(config);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/config\.trackChanges/);
    });
  });

  describe('idempotency on config reuse', () => {
    it('does not re-warn when the same config object is normalized twice', () => {
      const config = {
        modules: { trackChanges: { visible: true } },
      };

      normalizeTrackChangesConfig(config);
      expect(warnSpy).not.toHaveBeenCalled();

      // Second pass on the SAME object — the write-through populated the legacy
      // paths on the first call, but that shouldn't look like new legacy usage.
      normalizeTrackChangesConfig(config);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('still warns on a fresh config object even after a previous one was normalized', () => {
      normalizeTrackChangesConfig({ modules: { trackChanges: { visible: true } } });

      __resetDeprecationWarnings();
      warnSpy.mockClear();

      const freshConfig = { trackChanges: { visible: true } };
      normalizeTrackChangesConfig(freshConfig);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('produces stable values across repeated normalizations of the same config', () => {
      const config = {
        modules: { trackChanges: { visible: true, mode: 'final' } },
      };
      const first = normalizeTrackChangesConfig(config);
      const second = normalizeTrackChangesConfig(config);

      expect(first).toEqual({ visible: true, mode: 'final', enabled: true, replacements: 'paired' });
      expect(second).toEqual(first);
    });
  });
});
