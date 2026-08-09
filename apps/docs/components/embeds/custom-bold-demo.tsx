'use client';

import { Bold, Expand, Shrink } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommandState, SuperDocUI } from 'superdoc/ui';
import { loadRuntime, loadUIModule, type SuperDocInstance } from './superdoc-runtime';

/**
 * The smallest complete custom control, running against a real Editor.
 *
 * The overview also carries a simulated state model, which is better at showing
 * the enabled/active/disabled combinations on demand. What it cannot do is prove
 * the integration: that a control reading `ui.commands` is wired to the same
 * document the reader is editing. This embed exists for that, and stays
 * deliberately small — one command, one receipt, no panels or lifecycle.
 */

// Purpose-built for this page: three short paragraphs, no tracked changes or
// comments. The shared NDA fixtures are full contracts, so the sentence the
// page asks the reader to select would be several screens down.
const DEMO_DOCUMENT = '/fixtures/formatting-sample.docx';
const DISABLED_BEFORE_SELECTION = 'Select text in the document to enable Bold.';

type DemoState = 'idle' | 'loading' | 'ready' | 'error';

const INITIAL_BOLD: CommandState = { active: false, enabled: false, supported: false };
const ZOOM = { max: 200, min: 10 } as const;

export function CustomBoldDemo() {
  const rootRef = useRef<HTMLElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<SuperDocInstance | null>(null);
  const uiRef = useRef<SuperDocUI | null>(null);
  // Every startup is stamped with an id, and the component tracks whether it is
  // still mounted. Both guards exist because the async work below outlives the
  // attempt that began it: a retry, or an unmount, must not have its state
  // clobbered by a callback from a superseded load. `EditorDemo` uses the same
  // pair for the same reason.
  const loadIdRef = useRef(0);
  const mountedRef = useRef(true);

  const [state, setState] = useState<DemoState>('idle');
  const [bold, setBold] = useState<CommandState>(INITIAL_BOLD);
  const [result, setResult] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');

  const fitCleanupRef = useRef<(() => void) | null>(null);

  /**
   * Fit the page to the mount's own width.
   *
   * The runtime's `fit-width` policy measures the whole editor container, which
   * includes chrome the document does not get. Measuring the mount here keeps
   * the page filling the frame instead of collapsing into it.
   */
  const connectFitToWidth = useCallback((instance: SuperDocInstance) => {
    const mount = mountRef.current;
    const editor = instance.activeEditor as { pageMetrics?: unknown } | null;
    const metrics = editor?.pageMetrics as
      | {
          getSnapshot(): { pages: ReadonlyArray<{ base: { widthPx: number } }> };
          subscribe(fn: () => void): () => void;
        }
      | undefined;
    if (!mount || typeof metrics?.getSnapshot !== 'function' || fitCleanupRef.current) return;

    const applyFit = () => {
      const widest = metrics.getSnapshot().pages.reduce((w, page) => Math.max(w, page.base.widthPx), 0);
      // `clientWidth` already excludes the mount's own padding, so the page gets
      // the full measured width. Subtracting a guessed margin here is what left
      // the page narrower than its frame, with the leftover showing as a gutter.
      const available = mount.clientWidth;
      if (!(widest > 0) || !(available > 0)) return;
      instance.setZoom(Math.max(ZOOM.min, Math.min(ZOOM.max, Math.round((available / widest) * 100))));
    };

    const resize = new ResizeObserver(applyFit);
    resize.observe(mount);
    const unsubscribe = metrics.subscribe(applyFit);
    fitCleanupRef.current = () => {
      resize.disconnect();
      unsubscribe();
    };
    applyFit();
  }, []);

  const teardown = useCallback(() => {
    fitCleanupRef.current?.();
    fitCleanupRef.current = null;
    uiRef.current?.destroy();
    uiRef.current = null;
    instanceRef.current?.destroy();
    instanceRef.current = null;
  }, []);

  const start = useCallback(async () => {
    // Supersede any in-flight attempt before starting this one.
    const loadId = (loadIdRef.current += 1);
    const isCurrent = () => mountedRef.current && loadId === loadIdRef.current;

    teardown();
    setState('loading');
    setError('');
    setResult(null);
    // A command superseded by this reset will not clear its own pending flag,
    // because its load id no longer matches. Clearing here is what keeps the
    // fresh document from starting out with the old one's button disabled.
    setPending(false);

    try {
      const [SuperDocCtor, { createSuperDocUI }] = await Promise.all([loadRuntime(), loadUIModule()]);
      // Re-check after the await. Without this, a component unmounted during
      // the load would construct an instance nothing ever destroys — the
      // effect cleanup already ran, against still-null refs.
      if (!isCurrent() || !mountRef.current) return;

      // The fixture request, DOCX parsing, and engine startup all fail
      // asynchronously, after the constructor has returned. Those never reach
      // the try/catch below, so without these the demo would sit in `loading`
      // forever and the retry affordance would be unreachable.
      const markError = (payload?: { error?: unknown }) => {
        // A late failure from a superseded attempt must not tear down the
        // instance a retry has since put in these refs.
        if (!isCurrent()) return;
        teardown();
        setState('error');
        const cause = payload?.error;
        setError(cause instanceof Error ? cause.message : 'The sample document could not be loaded.');
      };

      const instance = new SuperDocCtor({
        selector: mountRef.current,
        document: DEMO_DOCUMENT,
        documentMode: 'editing',
        // This page replaces exactly one surface — the toolbar above — so the
        // built-in comments sidebar is switched off. It also reserves container
        // width, which `fit-width` counts as available and then shrinks the
        // page to a fraction of the frame to compensate.
        ui: { comments: false },
        // Manual, measured against the mount rather than the runtime's own
        // fit policy, for the same reason: the measurement has to be of the
        // space the document actually gets.
        zoom: { mode: 'manual', fitWidth: { min: ZOOM.min, max: ZOOM.max } },
        // This embed owns one button. Every other surface stays built in,
        // which is the hybrid arrangement the page is describing.
        onReady: () => {
          if (!isCurrent()) return;
          setState('ready');
          connectFitToWidth(instance);
        },
        onContentError: markError,
        onException: markError,
      });
      instanceRef.current = instance;

      // The factory rather than `instance.ui`, because this component owns the
      // controller's lifetime and tears it down with the embed.
      const ui = createSuperDocUI({ superdoc: instance as never });
      uiRef.current = ui;

      // `commands.get(id)` returns a handle that observes just this command,
      // which is all a single control needs.
      ui.commands.get('bold').observe((next) => {
        if (isCurrent()) setBold(next);
      });
      ui.selection.observe(() => {
        // A new selection makes the previous outcome stale, so the line falls
        // back to the hint rather than reporting an edit that already happened.
        if (isCurrent()) setResult(null);
      });

      // The component can unmount while the constructor is still wiring up.
      // Tear down here rather than leaking the instance the cleanup missed.
      if (!isCurrent()) teardown();
    } catch (cause) {
      if (!isCurrent()) return;
      teardown();
      setState('error');
      setError(cause instanceof Error ? cause.message : 'The demo could not start.');
    }
  }, [teardown]);

  // Load when the demo scrolls into view rather than asking the reader to press
  // a button first. The runtime is a CDN fetch, so deferring it until the embed
  // is near the viewport keeps the page cheap without adding a decision.
  useEffect(() => {
    const node = rootRef.current;
    if (!node || state !== 'idle') return;

    if (typeof IntersectionObserver === 'undefined') {
      void start();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void start();
      },
      { rootMargin: '240px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [start, state]);

  // Track the browser's own fullscreen state rather than assuming the button is
  // the only way out: Esc and the system control both exit without telling us.
  useEffect(() => {
    const sync = () => setExpanded(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleExpanded = useCallback(async () => {
    const node = rootRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement === node) await document.exitFullscreen();
      else await node.requestFullscreen();
    } catch {
      // Fullscreen can be refused by policy or an unsupported browser. The
      // embed is fully usable inline, so a refusal is not worth an error state.
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      // Bumping the id invalidates any in-flight attempt, so a continuation
      // that resolves after unmount sees `isCurrent()` false and tears itself
      // down instead of assigning into refs nothing will clean up.
      mountedRef.current = false;
      loadIdRef.current += 1;
      teardown();
    };
  }, [connectFitToWidth, teardown]);

  const runBold = useCallback(async () => {
    const ui = uiRef.current;
    if (!ui) return;

    // The command outlives the click, so it carries the load id it started
    // under. Reset destroys this controller and loads a fresh document; without
    // this, the old command's completion would clear `pending` and report an
    // edit belonging to the document that was just thrown away.
    const loadId = loadIdRef.current;
    const isCurrent = () => mountedRef.current && loadId === loadIdRef.current;

    const handle = ui.commands.get('bold');
    // Bold is a toggle, so the direction has to be read before executing.
    // Reporting "Applied bold." unconditionally would contradict the
    // `active: false` the state readout shows right beside it.
    const wasActive = handle.getState().active;
    const applied = wasActive ? 'Removed bold.' : 'Applied bold.';

    setPending(true);
    try {
      // Await the result rather than assuming the absence of a throw means the
      // document changed. This is the habit the page is teaching.
      //
      // `CommandExecutionResult` is `boolean | receipt`: a plain `true` means
      // the command ran without a receipt, so both shapes have to be read.
      const outcome = await handle.executeAsync();
      if (!isCurrent()) return;
      if (typeof outcome === 'boolean') {
        setResult(outcome ? applied : 'The command was refused.');
        return;
      }
      setResult(outcome.success ? applied : outcome.failure.message);
    } catch (cause) {
      // `executeAsync` resolves refusals rather than throwing, so reaching here
      // means the runtime itself failed. Say so instead of leaving the status
      // line on a stale hint.
      if (isCurrent()) setResult(cause instanceof Error ? cause.message : 'The command could not run.');
    } finally {
      // Unconditionally, or a rejection strands the button in its pending state
      // and the anatomy strip on step 3 until the page is reloaded.
      if (isCurrent()) setPending(false);
    }
  }, []);

  // Which habit the reader is currently exercising, so the anatomy strip below
  // can highlight it. Derived from the same state the button reads rather than
  // tracked separately, so it cannot disagree with what the control is doing.
  const step: 1 | 2 | 3 | 4 = result !== null ? 4 : pending ? 3 : bold.enabled ? 2 : 1;

  // One status line for the whole embed: the last command outcome when there is
  // one, otherwise a hint derived from the same command state the button reads.
  const plainState =
    state === 'loading'
      ? 'Loading the document…'
      : (result ??
        (!bold.enabled ? 'Select text in the document to enable Bold.' : 'Press Bold to format the selection.'));

  return (
    <figure className='sd-custom-bold-demo' ref={rootRef} data-custom-bold-demo data-state={state}>
      {state === 'error' ? (
        <div className='sd-custom-bold-demo-error' role='alert'>
          <p>{error}</p>
          <button onClick={() => void start()} type='button'>
            Try again
          </button>
        </div>
      ) : null}

      {state !== 'idle' && state !== 'error' ? (
        <div className='sd-custom-bold-demo-toolbar' role='toolbar' aria-label='Custom controls'>
          <button
            aria-pressed={bold.active}
            data-testid='custom-bold'
            // `pending` as well as `enabled`: Bold is a toggle whose direction is
            // read before executing, so a second click landing mid-flight would
            // compute its direction from state the first has not finished
            // changing, and the earlier completion would publish a result for
            // the later one.
            disabled={!bold.enabled || pending}
            onClick={() => void runBold()}
            title={bold.enabled ? 'Bold' : (bold.reason ?? DISABLED_BEFORE_SELECTION)}
            type='button'
          >
            <Bold aria-hidden='true' size={16} />
            Bold
          </button>

          {/* One quiet line. The raw controller values belong in the prose and
              the simulated model below, not competing with the document. */}
          <output className='sd-custom-bold-demo-state' data-testid='custom-bold-state'>
            {plainState}
          </output>

          <button
            className='sd-custom-bold-demo-reset'
            data-testid='custom-bold-reset'
            onClick={() => void start()}
            type='button'
          >
            Reset
          </button>

          <button
            aria-label={expanded ? 'Exit fullscreen' : 'Expand the editor'}
            className='sd-custom-bold-demo-expand'
            data-testid='custom-bold-expand'
            onClick={() => void toggleExpanded()}
            type='button'
          >
            {expanded ? <Shrink aria-hidden='true' size={15} /> : <Expand aria-hidden='true' size={15} />}
          </button>
        </div>
      ) : null}

      <div className='sd-custom-bold-demo-canvas' ref={mountRef} />

      <ol aria-label='Anatomy of a command control' className='sd-anatomy'>
        <li className='sd-anatomy-step' data-active={step === 1}>
          <b>1 Observe</b>
          <code>enabled · active</code>
        </li>
        <li className='sd-anatomy-step' data-active={step === 2}>
          <b>2 Render</b>
          <code>disabled · aria-pressed</code>
        </li>
        <li className='sd-anatomy-step' data-active={step === 3}>
          <b>3 Execute</b>
          <code>executeAsync()</code>
        </li>
        <li className='sd-anatomy-step' data-active={step === 4}>
          <b>4 Read outcome</b>
          <code>boolean or receipt</code>
        </li>
      </ol>
    </figure>
  );
}
