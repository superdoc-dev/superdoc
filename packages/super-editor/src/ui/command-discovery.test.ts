import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSuperDocUI } from './create-super-doc-ui.js';
import { BUILT_IN_COMMAND_IDS } from '../headless-toolbar/types.js';
import { createToolbarRegistry } from '../headless-toolbar/toolbar-registry.js';
import type { SuperDocLike } from './types.js';

/**
 * Tests for SD-2920 command discovery helpers:
 * - `BUILT_IN_COMMAND_IDS` runtime list (and its parity with the actual
 *   toolbar registry, so the static const cannot drift from the
 *   dynamic source of truth).
 * - `ui.commands.has(id)` — true for built-ins and registered customs.
 * - `ui.commands.require(id)` — throws when the id is unknown.
 */
function makeSuperdocStub(): SuperDocLike {
  return {
    activeEditor: {
      on: vi.fn(),
      off: vi.fn(),
      doc: {
        selection: {
          current: vi.fn(() => ({ empty: true, text: undefined, target: null })),
        },
      },
    },
    config: { documentMode: 'editing' },
    on: vi.fn(),
    off: vi.fn(),
  };
}

describe('command discovery (SD-2920)', () => {
  let teardown: Array<() => void> = [];

  afterEach(() => {
    teardown.forEach((fn) => fn());
    teardown = [];
  });

  describe('BUILT_IN_COMMAND_IDS', () => {
    it('matches the runtime toolbar registry', () => {
      const runtimeIds = Object.keys(createToolbarRegistry()).sort();
      const constIds = [...BUILT_IN_COMMAND_IDS].sort();
      expect(constIds).toEqual(runtimeIds);
    });

    it('contains canonical commands', () => {
      expect(BUILT_IN_COMMAND_IDS).toContain('bold');
      expect(BUILT_IN_COMMAND_IDS).toContain('undo');
      expect(BUILT_IN_COMMAND_IDS).toContain('table-insert');
    });
  });

  describe('ui.commands.has(id)', () => {
    it('returns true for every built-in id', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      teardown.push(() => ui.destroy());

      for (const id of BUILT_IN_COMMAND_IDS) {
        expect(ui.commands.has(id)).toBe(true);
      }
    });

    it('returns false for unknown ids', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      teardown.push(() => ui.destroy());

      expect(ui.commands.has('blod')).toBe(false);
      expect(ui.commands.has('')).toBe(false);
      expect(ui.commands.has('company.notRegistered')).toBe(false);
    });

    it('returns true after a custom command registers, false after unregister', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      teardown.push(() => ui.destroy());

      const reg = ui.commands.register({ id: 'company.aiRewrite', execute: () => true });
      expect(ui.commands.has('company.aiRewrite')).toBe(true);

      reg.unregister();
      expect(ui.commands.has('company.aiRewrite')).toBe(false);
    });
  });

  describe('ui.commands.require(id)', () => {
    it('returns a handle for built-ins', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      teardown.push(() => ui.destroy());

      const handle = ui.commands.require('bold');
      expect(handle).toBeDefined();
      expect(typeof handle.execute).toBe('function');
      expect(typeof handle.observe).toBe('function');
    });

    it('returns a handle for registered customs', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      teardown.push(() => ui.destroy());

      ui.commands.register({ id: 'company.test', execute: () => true });
      const handle = ui.commands.require('company.test');
      expect(handle).toBeDefined();
    });

    it('throws for unknown ids', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      teardown.push(() => ui.destroy());

      expect(() => ui.commands.require('blod')).toThrow(/unknown command id "blod"/);
      expect(() => ui.commands.require('')).toThrow(/unknown command id/);
    });
  });
});
