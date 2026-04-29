import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { SuperDocUIProvider, useSetSuperDoc, useSuperDocHost, useSuperDocSlice, useSuperDocUI } from './provider.js';
import { shallowEqual } from '../equality.js';

// Stub mirroring the controller test stubs — just enough surface for
// `createSuperDocUI({ superdoc })` to succeed. Tracks subscription
// counts so the StrictMode regression below can assert that the
// provider only attaches one set of listeners per setSuperDoc call.
function makeSuperdocStub() {
  const editorListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const superdocListeners = new Map<string, Set<(...args: unknown[]) => void>>();

  const editor = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!editorListeners.has(event)) editorListeners.set(event, new Set());
      editorListeners.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      editorListeners.get(event)?.delete(handler);
    }),
    state: { selection: { empty: true, from: 0, to: 0 } },
    options: { documentId: 'doc-1', isHeaderOrFooter: false },
    commands: {},
    isEditable: true,
    doc: {
      selection: {
        current: vi.fn(() => ({ empty: true, target: null, activeMarks: [] })),
      },
    },
  };

  const superdoc = {
    activeEditor: editor,
    config: { documentMode: 'editing' as const },
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!superdocListeners.has(event)) superdocListeners.set(event, new Set());
      superdocListeners.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      superdocListeners.get(event)?.delete(handler);
    }),
    export: vi.fn(async () => ({ ok: true })),
    // Test-only window into how many editor handlers are currently
    // attached for a given event. Lets the StrictMode regression
    // below assert "exactly one set of subscriptions" without leaking
    // the listener Maps into production typing.
    __activeEditorListeners(event: string): number {
      return editorListeners.get(event)?.size ?? 0;
    },
  };

  return superdoc;
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('<SuperDocUIProvider> + core hooks', () => {
  it('useSuperDocUI returns null until setSuperDoc is called, then returns the controller', () => {
    let captured: ReturnType<typeof useSuperDocUI> | undefined;
    let setSuperDoc: ReturnType<typeof useSetSuperDoc> | undefined;

    function Probe() {
      captured = useSuperDocUI();
      setSuperDoc = useSetSuperDoc();
      return null;
    }

    render(
      <SuperDocUIProvider>
        <Probe />
      </SuperDocUIProvider>,
    );

    expect(captured).toBeNull();
    expect(typeof setSuperDoc).toBe('function');

    const superdoc = makeSuperdocStub();
    act(() => {
      setSuperDoc!(superdoc);
    });

    expect(captured).not.toBeNull();
    expect(typeof captured?.select).toBe('function');
  });

  it('useSuperDocHost returns the host instance once setSuperDoc is called', () => {
    let host: ReturnType<typeof useSuperDocHost> | undefined;
    let setSuperDoc: ReturnType<typeof useSetSuperDoc> | undefined;

    function Probe() {
      host = useSuperDocHost();
      setSuperDoc = useSetSuperDoc();
      return null;
    }

    render(
      <SuperDocUIProvider>
        <Probe />
      </SuperDocUIProvider>,
    );

    expect(host).toBeNull();

    const superdoc = makeSuperdocStub();
    act(() => {
      setSuperDoc!(superdoc);
    });

    expect(host).toBe(superdoc);
    // The host's export method is reachable — same shape consumers use
    // for the Export DOCX button.
    expect(typeof host?.export).toBe('function');
  });

  it('destroys the controller on provider unmount', () => {
    let setSuperDoc: ReturnType<typeof useSetSuperDoc> | undefined;
    let captured: ReturnType<typeof useSuperDocUI> | undefined;

    function Probe() {
      captured = useSuperDocUI();
      setSuperDoc = useSetSuperDoc();
      return null;
    }

    const { unmount } = render(
      <SuperDocUIProvider>
        <Probe />
      </SuperDocUIProvider>,
    );

    const superdoc = makeSuperdocStub();
    act(() => {
      setSuperDoc!(superdoc);
    });

    const ui = captured!;
    expect(ui).not.toBeNull();
    const destroySpy = vi.spyOn(ui!, 'destroy');

    unmount();
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it('replacing the SuperDoc instance destroys the prior controller before creating a new one', () => {
    let setSuperDoc: ReturnType<typeof useSetSuperDoc> | undefined;
    let captured: ReturnType<typeof useSuperDocUI> | undefined;

    function Probe() {
      captured = useSuperDocUI();
      setSuperDoc = useSetSuperDoc();
      return null;
    }

    render(
      <SuperDocUIProvider>
        <Probe />
      </SuperDocUIProvider>,
    );

    act(() => {
      setSuperDoc!(makeSuperdocStub());
    });
    const first = captured!;
    const firstDestroy = vi.spyOn(first!, 'destroy');

    act(() => {
      setSuperDoc!(makeSuperdocStub());
    });
    const second = captured!;

    expect(firstDestroy).toHaveBeenCalledTimes(1);
    expect(second).not.toBe(first);
  });

  it('useSuperDocUI throws outside the provider', () => {
    function Probe() {
      useSuperDocUI();
      return null;
    }
    // Suppress React's expected-error log for this test.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/inside <SuperDocUIProvider>/);
    errSpy.mockRestore();
  });

  // Regression for PR #3011 review comment: React StrictMode
  // (development behavior) invokes state-updater functions twice for
  // purity-checking. If `createSuperDocUI` is called inside a
  // `setUI((prev) => ...)` updater, the second invocation builds a
  // second controller that React then discards but whose
  // subscriptions stay attached to the SuperDoc / editor instance.
  // The fix moves controller construction out of the updater into the
  // callback body. This test asserts that one setSuperDoc call under
  // StrictMode produces exactly one controller's worth of editor
  // subscriptions, not two.
  it('does not leak a controller when setSuperDoc runs under StrictMode', () => {
    // First, measure how many editor.on calls a single controller
    // registers in the no-StrictMode case. The number depends on
    // headless-toolbar + EDITOR_EVENTS + LIST_REFRESH_EVENTS internal
    // wiring; capturing it here keeps the assertion stable against
    // future event-list changes.
    let baselineSetSuperDoc: ReturnType<typeof useSetSuperDoc> | undefined;
    function BaselineProbe() {
      baselineSetSuperDoc = useSetSuperDoc();
      return null;
    }
    const { unmount: unmountBaseline } = render(
      <SuperDocUIProvider>
        <BaselineProbe />
      </SuperDocUIProvider>,
    );
    const baselineStub = makeSuperdocStub();
    act(() => {
      baselineSetSuperDoc!(baselineStub);
    });
    const perControllerOnCalls = (baselineStub.activeEditor.on as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(perControllerOnCalls).toBeGreaterThan(0);
    unmountBaseline();

    // Now mount the same provider inside StrictMode. If the bug were
    // present (controller created inside `setUI((prev) => ...)`),
    // React's purity-check would build a second controller and we'd
    // see 2x the per-controller call count.
    let setSuperDoc: ReturnType<typeof useSetSuperDoc> | undefined;
    function Probe() {
      setSuperDoc = useSetSuperDoc();
      return null;
    }
    render(
      <StrictMode>
        <SuperDocUIProvider>
          <Probe />
        </SuperDocUIProvider>
      </StrictMode>,
    );
    const stub = makeSuperdocStub();
    act(() => {
      setSuperDoc!(stub);
    });

    const onCallsUnderStrictMode = (stub.activeEditor.on as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(onCallsUnderStrictMode).toBe(perControllerOnCalls);
  });

  it('useSuperDocSlice returns the initial value before setSuperDoc, then live values after', async () => {
    let slice: { empty: boolean } | undefined;
    let setSuperDoc: ReturnType<typeof useSetSuperDoc> | undefined;

    function Probe() {
      slice = useSuperDocSlice<{ empty: boolean }>(
        (ui) => ui.select((state) => ({ empty: state.selection.empty }), shallowEqual),
        { empty: true },
      );
      setSuperDoc = useSetSuperDoc();
      return <span data-testid='empty'>{String(slice.empty)}</span>;
    }

    render(
      <SuperDocUIProvider>
        <Probe />
      </SuperDocUIProvider>,
    );

    // Pre-onReady: hook returns the initial value.
    expect(screen.getByTestId('empty').textContent).toBe('true');
    expect(slice).toEqual({ empty: true });

    act(() => {
      setSuperDoc!(makeSuperdocStub());
    });

    expect(slice).toEqual({ empty: true });
  });
});
