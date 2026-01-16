import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getSelectionDebugConfig, type SelectionDebugConfig, type SelectionDebugLogLevel } from './SelectionDebug.js';

describe('SelectionDebug', () => {
  // Store original window.superdocDebug to restore after tests
  let originalSuperdocDebug: typeof window.superdocDebug;

  beforeEach(() => {
    originalSuperdocDebug = window.superdocDebug;
    // Clear any existing debug config before each test
    delete window.superdocDebug;
  });

  afterEach(() => {
    // Restore original state
    if (originalSuperdocDebug !== undefined) {
      window.superdocDebug = originalSuperdocDebug;
    } else {
      delete window.superdocDebug;
    }
  });

  describe('getSelectionDebugConfig', () => {
    describe('default values', () => {
      it('returns default config when window.superdocDebug is not set', () => {
        const config = getSelectionDebugConfig();

        expect(config).toEqual({
          logLevel: 'off',
          hud: false,
          dumpRects: false,
          disableRectDedupe: false,
        });
      });

      it('returns default config when window.superdocDebug.selection is empty', () => {
        window.superdocDebug = { selection: {} };

        const config = getSelectionDebugConfig();

        expect(config).toEqual({
          logLevel: 'off',
          hud: false,
          dumpRects: false,
          disableRectDedupe: false,
        });
      });

      it('defaults dumpRects to false when not specified', () => {
        window.superdocDebug = {
          selection: {
            logLevel: 'verbose',
          },
        };

        const config = getSelectionDebugConfig();

        expect(config.dumpRects).toBe(false);
      });

      it('defaults disableRectDedupe to false when not specified', () => {
        window.superdocDebug = {
          selection: {
            logLevel: 'info',
          },
        };

        const config = getSelectionDebugConfig();

        expect(config.disableRectDedupe).toBe(false);
      });
    });

    describe('reading from window.superdocDebug.selection', () => {
      it('reads logLevel from window.superdocDebug.selection', () => {
        window.superdocDebug = {
          selection: {
            logLevel: 'verbose' as SelectionDebugLogLevel,
          },
        };

        const config = getSelectionDebugConfig();

        expect(config.logLevel).toBe('verbose');
      });

      it('reads hud from window.superdocDebug.selection', () => {
        window.superdocDebug = {
          selection: {
            hud: true,
          },
        };

        const config = getSelectionDebugConfig();

        expect(config.hud).toBe(true);
      });

      it('reads dumpRects from window.superdocDebug.selection', () => {
        window.superdocDebug = {
          selection: {
            dumpRects: true,
          },
        };

        const config = getSelectionDebugConfig();

        expect(config.dumpRects).toBe(true);
      });

      it('reads disableRectDedupe from window.superdocDebug.selection', () => {
        window.superdocDebug = {
          selection: {
            disableRectDedupe: true,
          },
        };

        const config = getSelectionDebugConfig();

        expect(config.disableRectDedupe).toBe(true);
      });

      it('reads all config properties together', () => {
        window.superdocDebug = {
          selection: {
            logLevel: 'info' as SelectionDebugLogLevel,
            hud: true,
            dumpRects: true,
            disableRectDedupe: true,
          },
        };

        const config = getSelectionDebugConfig();

        expect(config).toEqual({
          logLevel: 'info',
          hud: true,
          dumpRects: true,
          disableRectDedupe: true,
        });
      });
    });

    describe('partial configuration', () => {
      it('uses defaults for unspecified properties', () => {
        window.superdocDebug = {
          selection: {
            logLevel: 'warn' as SelectionDebugLogLevel,
            dumpRects: true,
          },
        };

        const config = getSelectionDebugConfig();

        expect(config).toEqual({
          logLevel: 'warn',
          hud: false, // default
          dumpRects: true,
          disableRectDedupe: false, // default
        });
      });

      it('handles only dumpRects being set', () => {
        window.superdocDebug = {
          selection: {
            dumpRects: true,
          },
        };

        const config = getSelectionDebugConfig();

        expect(config.dumpRects).toBe(true);
        expect(config.logLevel).toBe('off');
        expect(config.hud).toBe(false);
        expect(config.disableRectDedupe).toBe(false);
      });

      it('handles only disableRectDedupe being set', () => {
        window.superdocDebug = {
          selection: {
            disableRectDedupe: true,
          },
        };

        const config = getSelectionDebugConfig();

        expect(config.disableRectDedupe).toBe(true);
        expect(config.logLevel).toBe('off');
        expect(config.hud).toBe(false);
        expect(config.dumpRects).toBe(false);
      });
    });

    describe('config value types', () => {
      it('accepts all valid log levels', () => {
        const levels: SelectionDebugLogLevel[] = ['off', 'error', 'warn', 'info', 'verbose'];

        for (const level of levels) {
          window.superdocDebug = {
            selection: {
              logLevel: level,
            },
          };

          const config = getSelectionDebugConfig();
          expect(config.logLevel).toBe(level);
        }
      });

      it('handles boolean true for dumpRects', () => {
        window.superdocDebug = {
          selection: {
            dumpRects: true,
          },
        };

        const config = getSelectionDebugConfig();

        expect(config.dumpRects).toBe(true);
      });

      it('handles boolean false for dumpRects', () => {
        window.superdocDebug = {
          selection: {
            dumpRects: false,
          },
        };

        const config = getSelectionDebugConfig();

        expect(config.dumpRects).toBe(false);
      });

      it('handles boolean true for disableRectDedupe', () => {
        window.superdocDebug = {
          selection: {
            disableRectDedupe: true,
          },
        };

        const config = getSelectionDebugConfig();

        expect(config.disableRectDedupe).toBe(true);
      });

      it('handles boolean false for disableRectDedupe', () => {
        window.superdocDebug = {
          selection: {
            disableRectDedupe: false,
          },
        };

        const config = getSelectionDebugConfig();

        expect(config.disableRectDedupe).toBe(false);
      });
    });

    describe('initialization behavior', () => {
      it('initializes window.superdocDebug if not present', () => {
        expect(window.superdocDebug).toBeUndefined();

        getSelectionDebugConfig();

        expect(window.superdocDebug).toBeDefined();
        expect(window.superdocDebug?.selection).toBeDefined();
      });

      it('initializes window.superdocDebug.selection if not present', () => {
        window.superdocDebug = {};

        expect(window.superdocDebug.selection).toBeUndefined();

        getSelectionDebugConfig();

        expect(window.superdocDebug.selection).toBeDefined();
      });

      it('does not overwrite existing window.superdocDebug.selection', () => {
        window.superdocDebug = {
          selection: {
            logLevel: 'verbose' as SelectionDebugLogLevel,
            dumpRects: true,
          },
        };

        getSelectionDebugConfig();

        expect(window.superdocDebug.selection?.logLevel).toBe('verbose');
        expect(window.superdocDebug.selection?.dumpRects).toBe(true);
      });
    });

    describe('idempotency', () => {
      it('returns same config values on subsequent calls without changes', () => {
        window.superdocDebug = {
          selection: {
            logLevel: 'info' as SelectionDebugLogLevel,
            hud: true,
            dumpRects: true,
            disableRectDedupe: true,
          },
        };

        const config1 = getSelectionDebugConfig();
        const config2 = getSelectionDebugConfig();

        expect(config1).toEqual(config2);
      });

      it('reflects runtime changes to window.superdocDebug.selection', () => {
        window.superdocDebug = {
          selection: {
            dumpRects: false,
          },
        };

        const config1 = getSelectionDebugConfig();
        expect(config1.dumpRects).toBe(false);

        // Simulate runtime change
        window.superdocDebug.selection!.dumpRects = true;

        const config2 = getSelectionDebugConfig();
        expect(config2.dumpRects).toBe(true);
      });
    });
  });
});
