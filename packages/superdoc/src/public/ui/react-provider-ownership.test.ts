/**
 * Ownership contract for the `superdoc/ui/react` provider.
 *
 * The provider binds to the controller the SuperDoc instance already owns
 * (`superdoc.ui`). It must not create one — two controllers would give React
 * a divergent copy of command state — and it must not destroy one, because
 * unmounting a provider would otherwise freeze the built-in toolbar and every
 * other consumer of the same instance.
 *
 * `react-dom` is deliberately not a dependency of this package (see
 * `react-shim.d.ts`), so the provider is driven through a minimal hook
 * dispatcher that implements exactly the four React APIs it uses. That is
 * enough to observe what it publishes on the context and when.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { createSuperDocUI } from './create-super-doc-ui.js';
import type { SuperDocLike, SuperDocUI } from './types.js';

/** Hook state for the single component instance under test. */
const dispatcher = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));

vi.mock('react', () => {
  function useState<T>(initial: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void] {
    const index = dispatcher.cursor++;
    if (index >= dispatcher.slots.length) {
      dispatcher.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    }
    const set = (next: T | ((previous: T) => T)): void => {
      const previous = dispatcher.slots[index] as T;
      dispatcher.slots[index] = typeof next === 'function' ? (next as (p: T) => T)(previous) : next;
    };
    return [dispatcher.slots[index] as T, set];
  }
  // Refs live in the same slot array as state, so a ref survives re-renders
  // the way React's does. That identity is the point: the provider uses one
  // to remember a controller it built itself.
  function useRef<T>(initial: T): { current: T } {
    const index = dispatcher.cursor++;
    if (index >= dispatcher.slots.length) dispatcher.slots[index] = { current: initial };
    return dispatcher.slots[index] as { current: T };
  }
  return {
    createContext: () => ({ Provider: (props: unknown) => props }),
    createElement: (type: unknown, props: unknown) => ({ type, props }),
    useCallback: <T>(callback: T): T => callback,
    useRef,
    useContext: () => {
      throw new Error('useContext is not exercised by this test');
    },
    useEffect: (effect: () => void | (() => void)) => {
      effects.push(effect);
    },
    useState,
  };
});

/** Effects registered during a render, so a teardown pass can be forced. */
const effects: Array<() => void | (() => void)> = [];

const { SuperDocUIProvider } = await import('./react.js');
const { SuperDoc } = await import('../../core/SuperDoc.js');
const { BuiltInToolbar } = await import('../../internal/toolbar/built-in-toolbar.js');

interface ContextValue {
  ui: SuperDocUI | null;
  host: SuperDocLike | null;
  setSuperDoc: (superdoc: SuperDocLike) => void;
}

/** Render the provider once and read what it publishes on the context. */
function render(): ContextValue {
  dispatcher.cursor = 0;
  effects.length = 0;
  const element = SuperDocUIProvider({}) as unknown as { props: { value: ContextValue } };
  return element.props.value;
}

/** Run every effect registered by the last render, then its cleanup. */
function runEffectsAndUnmount(): void {
  for (const effect of effects) {
    const cleanup = effect();
    if (typeof cleanup === 'function') cleanup();
  }
}

/** A structural host that owns one controller, the way `SuperDoc` does. */
function makeHost(): { host: SuperDocLike; controller: SuperDocUI } {
  const host: Record<string, unknown> = {
    activeEditor: null,
    config: {},
    on: () => {},
    off: () => {},
  };
  const controller = createSuperDocUI({ superdoc: host as SuperDocLike });
  host.ui = controller;
  return { host: host as SuperDocLike, controller };
}

const controllers: SuperDocUI[] = [];

function host(): SuperDocLike {
  const made = makeHost();
  controllers.push(made.controller);
  return made.host;
}

/**
 * A structural host with no `ui`. `SuperDocHost` aliases `SuperDocLike`, whose
 * `ui` is optional, so custom adapters and test hosts can legitimately look
 * like this. A real `SuperDoc` never does.
 */
function hostWithoutUi(): SuperDocLike {
  return { activeEditor: null, config: {}, on: () => {}, off: () => {} } as unknown as SuperDocLike;
}

beforeEach(() => {
  dispatcher.slots.length = 0;
  dispatcher.cursor = 0;
});

/** Real `SuperDoc` instances created by a test, torn down together. */
const instances: Array<{ destroy: () => void }> = [];

/**
 * A real `SuperDoc`, not a structural stand-in. The ownership tests below use
 * stubs on purpose, to isolate what the provider does. This one exists because
 * a stub cannot show that the provider and the built-in toolbar end up on the
 * same live controller, which is the thing an application actually depends on.
 *
 * The SuperDoc is real; React is not. This file mocks `react` (see the header),
 * so the provider function is invoked directly rather than mounted, and no
 * document is loaded. It proves which controller the provider publishes, not
 * that a mounted React tree re-renders from it.
 */
function realSuperDoc() {
  const selector = document.createElement('div');
  document.body.append(selector);
  const superdoc = new SuperDoc({ selector, telemetry: { enabled: false } } as never);
  instances.push(superdoc as unknown as { destroy: () => void });
  return superdoc;
}

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.destroy();
  for (const instance of instances.splice(0)) instance.destroy();
  document.body.innerHTML = '';
});

describe('SuperDocUIProvider — ownership', () => {
  it('publishes the host-owned controller rather than a new one', () => {
    const superdoc = host();

    render().setSuperDoc(superdoc);

    expect(render().ui).toBe(superdoc.ui);
  });

  it('publishes null until a SuperDoc instance is bound', () => {
    expect(render().ui).toBeNull();
    expect(render().host).toBeNull();
  });

  it('does not destroy the controller when it unmounts', () => {
    const superdoc = host();
    const destroySpy = vi.spyOn(superdoc.ui as SuperDocUI, 'destroy');

    render().setSuperDoc(superdoc);
    render();
    runEffectsAndUnmount();

    expect(destroySpy).not.toHaveBeenCalled();
  });

  it('does not destroy the previous controller when it rebinds', () => {
    const first = host();
    const second = host();
    const firstDestroy = vi.spyOn(first.ui as SuperDocUI, 'destroy');

    render().setSuperDoc(first);
    render().setSuperDoc(second);

    expect(firstDestroy).not.toHaveBeenCalled();
    expect(render().ui).toBe(second.ui);
  });

  it('builds a controller for a structural host that carries none', () => {
    // Regression: binding such a host must not leave every hook unbound.
    render().setSuperDoc(hostWithoutUi());

    expect(render().ui).not.toBeNull();
  });

  it('destroys only the controller it built itself, on unmount', () => {
    render().setSuperDoc(hostWithoutUi());
    const created = render().ui as SuperDocUI;
    const destroySpy = vi.spyOn(created, 'destroy');

    render();
    runEffectsAndUnmount();

    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it('releases a self-built controller when it rebinds to a real instance', () => {
    render().setSuperDoc(hostWithoutUi());
    const created = render().ui as SuperDocUI;
    const destroySpy = vi.spyOn(created, 'destroy');

    const real = host();
    render().setSuperDoc(real);

    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(render().ui).toBe(real.ui);
  });
});

describe('SuperDocUIProvider — against a real SuperDoc', () => {
  it('publishes the same controller the built-in toolbar reads', () => {
    const superdoc = realSuperDoc();
    const toolbar = new BuiltInToolbar({ superdoc: superdoc as never });

    const context = render();
    context.setSuperDoc(superdoc as unknown as SuperDocLike);
    const published = render().ui;

    // One controller, two consumers. A stub host cannot demonstrate this
    // because it has no toolbar to disagree with.
    expect(published).toBe(superdoc.ui);
    expect((toolbar as unknown as { ui: unknown }).ui).toBe(superdoc.ui);

    toolbar.destroy();
  });

  it('leaves the toolbar working when the provider unmounts and remounts', () => {
    const superdoc = realSuperDoc();
    const toolbar = new BuiltInToolbar({ superdoc: superdoc as never });

    const context = render();
    context.setSuperDoc(superdoc as unknown as SuperDocLike);
    render();
    runEffectsAndUnmount();

    // Unmounting a React tree must not disturb the instance's controller, which
    // the toolbar is still bound to.
    expect((toolbar as unknown as { ui: unknown }).ui).toBe(superdoc.ui);
    expect(() => superdoc.ui.commands.get('bold').getState()).not.toThrow();

    // And it can bind again to the same live controller.
    dispatcher.slots.length = 0;
    const second = render();
    second.setSuperDoc(superdoc as unknown as SuperDocLike);
    expect(render().ui).toBe(superdoc.ui);

    toolbar.destroy();
  });

  it('stops publishing live state once the instance is destroyed', () => {
    const superdoc = realSuperDoc();
    const context = render();
    context.setSuperDoc(superdoc as unknown as SuperDocLike);
    const published = render().ui as SuperDocUI;

    superdoc.destroy();

    // The hooks keep their reference; it has to answer rather than throw, and
    // report the document as gone rather than the last one it saw.
    expect(published.document.getSnapshot().ready).toBe(false);
    expect(published.commands.get('bold').getState().enabled).toBe(false);
  });
});
