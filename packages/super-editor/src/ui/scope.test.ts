import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSuperDocUI } from './create-super-doc-ui.js';
import type { SuperDocLike } from './types.js';

/**
 * Minimal SuperDoc stub for scope tests. Only the bits the controller
 * reads on `createSuperDocUI({ superdoc })` and during `destroy()` are
 * present; scope behavior is intentionally independent of editor
 * state.
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

describe('SuperDocUIScope', () => {
  let teardown: Array<() => void> = [];

  afterEach(() => {
    teardown.forEach((fn) => fn());
    teardown = [];
  });

  describe('add()', () => {
    it('runs every queued teardown in reverse order on destroy', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      teardown.push(() => ui.destroy());
      const scope = ui.createScope();

      const order: number[] = [];
      scope.add(() => order.push(1));
      scope.add(() => order.push(2));
      scope.add(() => order.push(3));

      scope.destroy();
      expect(order).toEqual([3, 2, 1]);
    });

    it('invokes the teardown immediately when the scope is already destroyed', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      teardown.push(() => ui.destroy());
      const scope = ui.createScope();
      scope.destroy();

      const fn = vi.fn();
      scope.add(fn);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('continues running later teardowns when an earlier one throws', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      teardown.push(() => ui.destroy());
      const scope = ui.createScope();

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ok = vi.fn();
      scope.add(ok);
      scope.add(() => {
        throw new Error('first teardown blew up');
      });

      scope.destroy();
      expect(ok).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('on()', () => {
    it('attaches the listener and removes it on destroy with the same options', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      teardown.push(() => ui.destroy());
      const scope = ui.createScope();

      const target = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as EventTarget & {
        addEventListener: ReturnType<typeof vi.fn>;
        removeEventListener: ReturnType<typeof vi.fn>;
      };

      const listener = vi.fn();
      const options = { capture: true, passive: true } as const;
      scope.on(target, 'click', listener, options);

      expect(target.addEventListener).toHaveBeenCalledWith('click', listener, options);
      expect(target.removeEventListener).not.toHaveBeenCalled();

      scope.destroy();
      expect(target.removeEventListener).toHaveBeenCalledWith('click', listener, options);
    });

    it('is a no-op when the scope is already destroyed', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      teardown.push(() => ui.destroy());
      const scope = ui.createScope();
      scope.destroy();

      const target = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as EventTarget & {
        addEventListener: ReturnType<typeof vi.fn>;
      };
      scope.on(target, 'click', vi.fn());
      expect(target.addEventListener).not.toHaveBeenCalled();
    });
  });

  describe('register()', () => {
    it('forwards to the controller registry and unregisters on destroy', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      teardown.push(() => ui.destroy());
      const scope = ui.createScope();

      const execute = vi.fn(() => true);
      const reg = scope.register({ id: 'company.test', execute });

      // Active: the controller's get() resolves to a real handle.
      expect(ui.commands.get('company.test')).toBeDefined();

      scope.destroy();

      // Destroyed: the registry no longer carries the id.
      expect(ui.commands.get('company.test')).toBeUndefined();

      // The returned handle stays inert (consumer keeps the reference
      // around their own teardown, which is fine).
      expect(typeof reg.handle.execute).toBe('function');
    });

    it('throws when called on a destroyed scope', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      teardown.push(() => ui.destroy());
      const scope = ui.createScope();
      scope.destroy();

      expect(() => scope.register({ id: 'company.dead', execute: () => true })).toThrow(/scope has been destroyed/);
    });
  });

  describe('child()', () => {
    it('destroying the parent destroys live children', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      teardown.push(() => ui.destroy());
      const parent = ui.createScope();
      const child = parent.child();

      const childTeardown = vi.fn();
      child.add(childTeardown);

      parent.destroy();
      expect(child.destroyed).toBe(true);
      expect(childTeardown).toHaveBeenCalledTimes(1);
    });

    it('children destroy before the parent runs its own teardowns', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      teardown.push(() => ui.destroy());
      const parent = ui.createScope();
      const child = parent.child();

      const order: string[] = [];
      child.add(() => order.push('child'));
      parent.add(() => order.push('parent'));

      parent.destroy();
      expect(order).toEqual(['child', 'parent']);
    });

    it('returns an already-destroyed scope when the parent is destroyed', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      teardown.push(() => ui.destroy());
      const parent = ui.createScope();
      parent.destroy();

      const child = parent.child();
      expect(child.destroyed).toBe(true);
    });
  });

  describe('destroy()', () => {
    it('is idempotent', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      teardown.push(() => ui.destroy());
      const scope = ui.createScope();

      const fn = vi.fn();
      scope.add(fn);
      scope.destroy();
      scope.destroy();

      expect(fn).toHaveBeenCalledTimes(1);
      expect(scope.destroyed).toBe(true);
    });
  });

  describe('ui.createScope() after ui.destroy()', () => {
    it('returns an already-destroyed scope so it cannot leak', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      ui.destroy();

      const scope = ui.createScope();
      expect(scope.destroyed).toBe(true);

      // Methods follow the standard destroyed-scope contract.
      const fn = vi.fn();
      scope.add(fn);
      expect(fn).toHaveBeenCalledTimes(1);

      expect(() => scope.register({ id: 'company.late', execute: () => true })).toThrow(/scope has been destroyed/);
    });
  });

  describe('cascade from ui.destroy()', () => {
    it('destroys every live scope before tearing down the controller', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      const scopeA = ui.createScope();
      const scopeB = ui.createScope();

      const aTeardown = vi.fn();
      const bTeardown = vi.fn();
      scopeA.add(aTeardown);
      scopeB.add(bTeardown);

      ui.destroy();

      expect(aTeardown).toHaveBeenCalledTimes(1);
      expect(bTeardown).toHaveBeenCalledTimes(1);
      expect(scopeA.destroyed).toBe(true);
      expect(scopeB.destroyed).toBe(true);
    });

    it('still destroys remaining scopes when one scope throws during destroy', () => {
      const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const scopeA = ui.createScope();
      scopeA.add(() => {
        throw new Error('A blew up');
      });
      const scopeB = ui.createScope();
      const bTeardown = vi.fn();
      scopeB.add(bTeardown);

      ui.destroy();

      expect(bTeardown).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });
  });
});
