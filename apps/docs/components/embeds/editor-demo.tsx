'use client';

import { Bold, Check, Expand, Italic, Minus, Plus, Shrink, Underline, Undo2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DocumentMode } from 'superdoc';
import type { CommandState, SuperDocUI, ZoomSlice } from 'superdoc/ui';
import { loadRuntime, loadUIModule, type SuperDocInstance } from './superdoc-runtime';

const zoomStep = 10;
const initialZoom = { max: 200, min: 10, mode: 'manual', value: 100 } satisfies ZoomSlice;

type EditorDemoPreset = 'document-modes' | 'tracked-review';

type EditorDemoProps = {
  allowLocalFile?: boolean;
  fixture: string;
  preset: EditorDemoPreset;
  title: string;
};

type DemoState = 'idle' | 'loading' | 'ready' | 'error';

type PageMetricsSnapshot = {
  pages: ReadonlyArray<{
    base: { widthPx: number };
  }>;
};

type PageMetricsHandle = {
  getSnapshot(): PageMetricsSnapshot;
  subscribe(listener: (snapshot: PageMetricsSnapshot) => void): () => void;
};

function getPageMetrics(instance: SuperDocInstance): PageMetricsHandle | null {
  const editor = instance.activeEditor as { pageMetrics?: unknown } | null;
  const candidate = editor?.pageMetrics;
  if (!candidate || typeof candidate !== 'object') return null;

  const pageMetrics = candidate as Partial<PageMetricsHandle>;
  if (typeof pageMetrics.getSnapshot !== 'function' || typeof pageMetrics.subscribe !== 'function') return null;
  return pageMetrics as PageMetricsHandle;
}

function initialCommandStates() {
  return {
    bold: { active: false, enabled: false, supported: false },
    italic: { active: false, enabled: false, supported: false },
    underline: { active: false, enabled: false, supported: false },
    undo: { active: false, enabled: false, supported: false },
  } satisfies Record<string, CommandState>;
}

export function EditorDemo({ allowLocalFile = false, fixture, preset, title }: EditorDemoProps) {
  const demoRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadIdRef = useRef(0);
  const mountRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<SuperDocInstance | null>(null);
  const mountedRef = useRef(true);
  const fitActiveRef = useRef(true);
  const fitCleanupRef = useRef<(() => void) | null>(null);
  const fitToWidthRef = useRef<(() => void) | null>(null);
  const uiCleanupRef = useRef<(() => void) | null>(null);
  const uiRef = useRef<SuperDocUI | null>(null);
  const zoomRef = useRef<ZoomSlice>(initialZoom);
  const [activeChangeId, setActiveChangeId] = useState<string | null>(null);
  const [commandStates, setCommandStates] = useState(initialCommandStates);
  const [documentMode, setDocumentMode] = useState<DocumentMode>(
    preset === 'document-modes' ? 'editing' : 'suggesting',
  );
  const [fitActive, setFitActive] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [state, setState] = useState<DemoState>('idle');
  const [trackedChangeCount, setTrackedChangeCount] = useState(0);
  const [zoom, setZoom] = useState<ZoomSlice>(initialZoom);

  function destroyEditor() {
    fitCleanupRef.current?.();
    fitCleanupRef.current = null;
    fitToWidthRef.current = null;
    uiCleanupRef.current?.();
    uiCleanupRef.current = null;
    uiRef.current?.destroy();
    uiRef.current = null;
    instanceRef.current?.destroy();
    instanceRef.current = null;
  }

  function connectFitToWidth(instance: SuperDocInstance) {
    if (fitCleanupRef.current) return;
    const mount = mountRef.current;
    const pageMetrics = getPageMetrics(instance);
    if (!mount || !pageMetrics) return;

    const applyFit = () => {
      if (!fitActiveRef.current) return;

      const widestPage = pageMetrics.getSnapshot().pages.reduce((width, page) => Math.max(width, page.base.widthPx), 0);
      const availableWidth = mount.clientWidth - 32;
      if (!(widestPage > 0) || !(availableWidth > 0)) return;

      const { min, max } = zoomRef.current;
      const nextZoom = Math.max(min, Math.min(max, Math.round((availableWidth / widestPage) * 100)));
      if (nextZoom === Math.round(zoomRef.current.value)) return;
      instance.setZoom(nextZoom);
    };

    const resizeObserver = new ResizeObserver(applyFit);
    resizeObserver.observe(mount);
    const unsubscribe = pageMetrics.subscribe(applyFit);

    fitToWidthRef.current = applyFit;
    fitCleanupRef.current = () => {
      resizeObserver.disconnect();
      unsubscribe();
    };
    applyFit();
  }

  useEffect(() => {
    mountedRef.current = true;

    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === demoRef.current);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      mountedRef.current = false;
      loadIdRef.current += 1;
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      destroyEditor();
    };
  }, []);

  function connectToolbar(ui: SuperDocUI) {
    const cleanup = Object.entries(initialCommandStates()).map(([id]) =>
      ui.commands.get(id).observe((commandState) => {
        if (!mountedRef.current) return;
        setCommandStates((current) => ({ ...current, [id]: commandState }));
      }),
    );

    cleanup.push(
      ui.trackChanges.observe((snapshot) => {
        if (!mountedRef.current) return;
        setTrackedChangeCount(snapshot.total);

        const nextActiveId = snapshot.activeId ?? snapshot.items[0]?.id ?? null;
        if (!snapshot.activeId && nextActiveId) ui.trackChanges.setActive(nextActiveId);
        setActiveChangeId(nextActiveId);
      }),
      ui.zoom.observe((snapshot) => {
        zoomRef.current = snapshot;
        if (mountedRef.current) setZoom(snapshot);
      }),
    );

    uiCleanupRef.current = () => cleanup.forEach((unsubscribe) => unsubscribe());
  }

  async function mountDocument(getFile: () => Promise<File>) {
    if (!mountRef.current || state === 'loading') return;

    const loadId = ++loadIdRef.current;
    destroyEditor();
    setActiveChangeId(null);
    setCommandStates(initialCommandStates());
    const initialDocumentMode = preset === 'document-modes' ? 'editing' : 'suggesting';
    setDocumentMode(initialDocumentMode);
    fitActiveRef.current = true;
    setFitActive(true);
    setReviewBusy(false);
    setTrackedChangeCount(0);
    zoomRef.current = initialZoom;
    setZoom(initialZoom);
    setState('loading');

    const markError = () => {
      if (!mountedRef.current || loadId !== loadIdRef.current) return;
      setState('error');
      window.setTimeout(() => {
        if (loadId !== loadIdRef.current) return;
        destroyEditor();
      });
    };

    try {
      const [file, SuperDoc, uiModule] = await Promise.all([getFile(), loadRuntime(), loadUIModule()]);
      if (!mountedRef.current || !mountRef.current || loadId !== loadIdRef.current) return;

      let instance: SuperDocInstance | null = null;
      instance = new SuperDoc({
        selector: mountRef.current,
        document: file,
        documentMode: initialDocumentMode,
        modules: {
          comments: { displayMode: 'inline' },
        },
        zoom: {
          mode: 'manual',
          fitWidth: { min: initialZoom.min, max: initialZoom.max },
        },
        user: {
          name: 'Docs visitor',
          email: 'docs@example.com',
        },
        onReady: () => {
          if (!mountedRef.current || loadId !== loadIdRef.current) return;
          setState('ready');
          if (instance) connectFitToWidth(instance);
        },
        onContentError: markError,
        onException: markError,
      });
      instanceRef.current = instance;
      connectFitToWidth(instance);

      const ui = uiModule.createSuperDocUI({ superdoc: instance });
      uiRef.current = ui;
      connectToolbar(ui);
    } catch {
      if (loadId !== loadIdRef.current) return;
      destroyEditor();
      if (mountedRef.current) setState('error');
    }
  }

  async function getFixtureFile() {
    const response = await fetch(fixture);
    if (!response.ok) throw new Error(`Fixture request failed with ${response.status}.`);

    const blob = await response.blob();
    const fileName = fixture.split('/').at(-1) ?? 'document.docx';
    return new File([blob], fileName, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  function loadDemo() {
    void mountDocument(getFixtureFile);
  }

  useEffect(() => {
    const demo = demoRef.current;
    if (!demo || state !== 'idle') return;

    if (typeof IntersectionObserver === 'undefined') {
      loadDemo();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        loadDemo();
      },
      { rootMargin: '240px 0px' },
    );
    observer.observe(demo);

    return () => observer.disconnect();
  }, [fixture, state]);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function loadLocalFile(file: File | undefined) {
    if (!file) return;
    void mountDocument(async () => file);
  }

  function runCommand(id: keyof ReturnType<typeof initialCommandStates>) {
    void uiRef.current?.commands.get(id).executeAsync();
  }

  function changeDocumentMode(mode: DocumentMode) {
    if (state !== 'ready') return;
    instanceRef.current?.setDocumentMode(mode);
    setDocumentMode(mode);
  }

  async function decideChange(decision: 'accept' | 'reject') {
    const ui = uiRef.current;
    if (!ui || !activeChangeId || reviewBusy) return;

    setReviewBusy(true);
    try {
      await Promise.resolve(ui.trackChanges[decision](activeChangeId));
    } finally {
      if (mountedRef.current) setReviewBusy(false);
    }
  }

  function changeZoom(direction: -1 | 1) {
    const nextZoom = Math.min(zoom.max, Math.max(zoom.min, zoom.value + direction * zoomStep));
    fitActiveRef.current = false;
    setFitActive(false);
    uiRef.current?.zoom.set(nextZoom);
  }

  function fitToWidth() {
    fitActiveRef.current = true;
    setFitActive(true);
    fitToWidthRef.current?.();
  }

  async function toggleFullscreen() {
    if (!demoRef.current) return;
    if (document.fullscreenElement === demoRef.current) await document.exitFullscreen();
    else await demoRef.current.requestFullscreen();
  }

  const hasActiveChange = Boolean(activeChangeId) && !reviewBusy;
  const countLabel = `${trackedChangeCount} ${trackedChangeCount === 1 ? 'change' : 'changes'}`;

  return (
    <section ref={demoRef} className='sd-editor-demo' aria-label={title} data-preset={preset} data-state={state}>
      <div className='sd-editor-demo-header'>
        <div className='sd-editor-demo-copy'>
          <strong>{title}</strong>
          <span>
            {allowLocalFile
              ? 'Loads the sample automatically. Files stay in this browser.'
              : preset === 'document-modes'
                ? 'Switch modes and try the same DOCX as a viewer, editor, or reviewer.'
                : 'Loads the sample DOCX in suggesting mode.'}
          </span>
        </div>
        <div className='sd-editor-demo-actions'>
          {state === 'error' ? (
            <button type='button' onClick={loadDemo}>
              Try sample again
            </button>
          ) : (
            <span className='sd-editor-demo-status'>{state === 'ready' ? 'Ready' : 'Loading…'}</span>
          )}
          {allowLocalFile ? (
            <>
              <button
                className='sd-editor-demo-file-button'
                type='button'
                onClick={openFilePicker}
                disabled={state === 'loading'}
              >
                Open your DOCX
              </button>
              <input
                ref={fileInputRef}
                className='sd-editor-demo-file-input'
                hidden
                type='file'
                accept='.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                onChange={(event) => {
                  loadLocalFile(event.currentTarget.files?.[0]);
                  event.currentTarget.value = '';
                }}
              />
            </>
          ) : null}
        </div>
      </div>
      {state === 'error' ? (
        <p className='sd-editor-demo-error' role='alert'>
          {allowLocalFile
            ? 'The editor could not load. Try the sample again or choose a local DOCX to continue.'
            : 'The editor could not load. Download the fixture and continue with the local quickstart below.'}
        </p>
      ) : null}
      <div className='sd-editor-demo-toolbar' hidden={state === 'idle'} aria-label='Editor controls'>
        <div className='sd-editor-demo-toolbar-group sd-editor-demo-edit-controls' role='group' aria-label='Edit'>
          <button
            type='button'
            aria-label='Undo'
            disabled={!commandStates.undo.enabled}
            onClick={() => runCommand('undo')}
          >
            <Undo2 aria-hidden='true' />
          </button>
          <span className='sd-editor-demo-toolbar-separator' aria-hidden='true' />
          <button
            type='button'
            aria-label='Bold'
            aria-pressed={commandStates.bold.active}
            disabled={!commandStates.bold.enabled}
            onClick={() => runCommand('bold')}
          >
            <Bold aria-hidden='true' />
          </button>
          <button
            type='button'
            aria-label='Italic'
            aria-pressed={commandStates.italic.active}
            disabled={!commandStates.italic.enabled}
            onClick={() => runCommand('italic')}
          >
            <Italic aria-hidden='true' />
          </button>
          <button
            type='button'
            aria-label='Underline'
            aria-pressed={commandStates.underline.active}
            disabled={!commandStates.underline.enabled}
            onClick={() => runCommand('underline')}
          >
            <Underline aria-hidden='true' />
          </button>
        </div>
        {preset === 'document-modes' ? (
          <div
            className='sd-editor-demo-toolbar-group sd-editor-demo-mode-controls'
            role='group'
            aria-label='Document mode'
          >
            {(['viewing', 'editing', 'suggesting'] as const).map((mode) => (
              <button
                key={mode}
                type='button'
                aria-pressed={documentMode === mode}
                disabled={state !== 'ready'}
                onClick={() => changeDocumentMode(mode)}
              >
                {mode === 'viewing' ? 'View' : mode === 'editing' ? 'Edit' : 'Suggest'}
              </button>
            ))}
          </div>
        ) : (
          <div className='sd-editor-demo-toolbar-group sd-editor-demo-review-controls' role='group' aria-label='Review'>
            <button
              className='sd-editor-demo-accept-button'
              type='button'
              disabled={!hasActiveChange}
              onClick={() => void decideChange('accept')}
            >
              <Check aria-hidden='true' />
              Accept
            </button>
            <button type='button' disabled={!hasActiveChange} onClick={() => void decideChange('reject')}>
              <X aria-hidden='true' />
              Reject
            </button>
            <span className='sd-editor-demo-change-count' aria-live='polite'>
              {countLabel}
            </span>
          </div>
        )}
        <div className='sd-editor-demo-toolbar-group sd-editor-demo-view-controls' role='group' aria-label='View'>
          <div className='sd-editor-demo-zoom-control'>
            <button
              type='button'
              aria-label='Zoom out'
              disabled={zoom.value <= zoom.min}
              onClick={() => changeZoom(-1)}
            >
              <Minus aria-hidden='true' />
            </button>
            <button
              className='sd-editor-demo-fit-button'
              type='button'
              aria-label='Fit document to width'
              aria-pressed={fitActive}
              onClick={fitToWidth}
            >
              {fitActive ? 'Fit' : `${Math.round(zoom.value)}%`}
            </button>
            <button type='button' aria-label='Zoom in' disabled={zoom.value >= zoom.max} onClick={() => changeZoom(1)}>
              <Plus aria-hidden='true' />
            </button>
          </div>
          <button
            type='button'
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? <Shrink aria-hidden='true' /> : <Expand aria-hidden='true' />}
          </button>
        </div>
      </div>
      <div ref={mountRef} className='sd-editor-demo-surface' hidden={state === 'idle'} />
      {state === 'idle' ? (
        <div className='sd-editor-demo-poster'>
          <span aria-hidden='true'>DOCX</span>
          <p>
            {allowLocalFile
              ? 'The sample editor loads as this demo enters view. You can also open your own DOCX.'
              : 'The sample editor loads as this demo enters view. The rest of the article stays lightweight.'}
          </p>
        </div>
      ) : null}
    </section>
  );
}
