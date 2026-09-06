'use client';

import { LocateFixed, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import type { UIConfig } from 'superdoc';
import type { SelectionCapture, SelectionSlice, ZoomSlice } from 'superdoc/ui';
import { CollapsibleEditorPreview } from './collapsible-editor-preview';
import { EditorDemoViewControls } from './editor-demo-view-controls';
import { EDITOR_DEMO_FIT_WIDTH_PADDING, fitRuntimeEditorToWidth } from './editor-demo-zoom';
import { createRuntimeEditor, loadRuntime, type SuperDocInstance } from './superdoc-runtime';

const DEMO_DOCUMENT = '/fixtures/custom-selection-workflow.docx';
const NARROW_DEMO_WIDTH = 520;
const INITIAL_ZOOM = { max: 200, min: 10, mode: 'manual', value: 80 } satisfies ZoomSlice;
const PROMPT_GAP = 12;
const PROMPT_EDGE = 8;
const ESTIMATED_ACTION_BAR_WIDTH = 104;
const ESTIMATED_ACTION_BAR_HEIGHT = 40;
const ESTIMATED_COMPOSER_WIDTH = 304;
const ESTIMATED_COMPOSER_HEIGHT = 300;

type DemoState = 'idle' | 'loading' | 'ready' | 'error';
type PromptPosition = { left: number; top: number };

// Restoration must not outrank a deliberate focus move. Hiding the card unmounts the focused
// control, so the browser parks focus on <body>; anything else holding it means the reader
// moved on, and keeping their place matters more than returning to the prompt.
function focusIsUnclaimed() {
  const active = document.activeElement;
  return active === null || active === document.body;
}

// The card remounts on scroll-back with fresh elements, so the reader's position is recorded
// as a control name rather than a node. Returning them to the textarea when they were on
// Close or Ask would make them navigate back to what they had already reached.
function promptControlName(card: HTMLElement | null): string | null {
  if (!card || !(document.activeElement instanceof HTMLElement)) return null;
  if (!card.contains(document.activeElement)) return null;
  return document.activeElement.closest('[data-prompt-control]')?.getAttribute('data-prompt-control') ?? '';
}

function focusPromptControl(card: HTMLElement | null, name: string | null): boolean {
  if (!card || !name) return false;
  const control = card.querySelector(`[data-prompt-control="${name}"]`);
  if (!(control instanceof HTMLElement)) return false;
  control.focus();
  return true;
}

function captureKey(capture: SelectionCapture) {
  return JSON.stringify([capture.selectionTarget ?? capture.target, capture.quotedText]);
}

function createDemoAnswer(selectedText: string) {
  if (selectedText.toLowerCase().includes('twelve months')) {
    return 'This clause caps aggregate liability at the fees the customer paid during the 12 months before the claim.';
  }
  if (selectedText.toLowerCase().includes('sixty days')) {
    return 'Either party must give 60 days\u2019 written notice to prevent automatic renewal.';
  }
  return `The selected text says: ${selectedText}`;
}

export function CustomSelectionDemo() {
  const rootRef = useRef<HTMLElement>(null);
  const builtInToolbarRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLElement>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const instanceRef = useRef<SuperDocInstance | null>(null);
  const observerCleanupRef = useRef<(() => void) | null>(null);
  const captureRef = useRef<SelectionCapture | null>(null);
  const captureKeyRef = useRef('');
  const loadIdRef = useRef(0);
  const mountedRef = useRef(true);
  const composerOpenRef = useRef(false);
  const restoreActionFocusRef = useRef(false);
  // The composer keeps `isComposerOpen` true across a scroll-away, so visibility alone must
  // not refocus it: only opening it, or having owned focus when it was hidden, may.
  const restoreComposerFocusRef = useRef<string | null>(null);
  const wasComposerOpenRef = useRef(false);
  const zoomRef = useRef<ZoomSlice>(INITIAL_ZOOM);

  const [state, setState] = useState<DemoState>('idle');
  const [capture, setCapture] = useState<SelectionCapture | null>(null);
  const [promptPosition, setPromptPosition] = useState<PromptPosition | null>(null);
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [interactionMessage, setInteractionMessage] = useState('Select text in the document to ask AI about it.');
  const [geometryMessage, setGeometryMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState<ZoomSlice>(INITIAL_ZOOM);

  const positionPrompt = useCallback((nextCapture = captureRef.current) => {
    const instance = instanceRef.current;
    const documentElement = documentRef.current;
    const editorElement = mountRef.current;
    const target = nextCapture?.selectionTarget ?? nextCapture?.target;
    if (!instance || !documentElement || !editorElement || !target) {
      setPromptPosition(null);
      return;
    }

    const geometry = instance.ui.viewport.getRect({ target, relativeTo: documentElement });
    if (!geometry.found || !geometry.rect) {
      setPromptPosition(null);
      setGeometryMessage('The captured text is not currently painted. Scroll it into view.');
      return;
    }

    const documentBounds = documentElement.getBoundingClientRect();
    const editorBounds = editorElement.getBoundingClientRect();
    const visibleTop = editorBounds.top - documentBounds.top;
    const visibleBottom = editorBounds.bottom - documentBounds.top;
    const visibleLeft = editorBounds.left - documentBounds.left;
    const visibleRight = editorBounds.right - documentBounds.left;
    const anchorRect = geometry.rects.find(
      (rect) =>
        rect.bottom >= visibleTop &&
        rect.top <= visibleBottom &&
        rect.right >= visibleLeft &&
        rect.left <= visibleRight,
    );
    if (!anchorRect) {
      setPromptPosition(null);
      setGeometryMessage('The captured text is outside the visible area. Scroll back to show its prompt.');
      return;
    }

    setGeometryMessage(null);

    const composerOpen = composerOpenRef.current;
    const promptWidth =
      promptRef.current?.offsetWidth ?? (composerOpen ? ESTIMATED_COMPOSER_WIDTH : ESTIMATED_ACTION_BAR_WIDTH);
    const promptHeight =
      promptRef.current?.offsetHeight ?? (composerOpen ? ESTIMATED_COMPOSER_HEIGHT : ESTIMATED_ACTION_BAR_HEIGHT);
    const preferredLeft = anchorRect.left + anchorRect.width / 2 - promptWidth / 2;
    const maxLeft = Math.max(PROMPT_EDGE, documentElement.clientWidth - promptWidth - PROMPT_EDGE);
    const minTop = visibleTop + PROMPT_EDGE;
    const maxTop = Math.max(minTop, visibleBottom - promptHeight - PROMPT_EDGE);
    const above = anchorRect.top - promptHeight - PROMPT_GAP;
    const below = anchorRect.bottom + PROMPT_GAP;
    const belowFits = below + promptHeight <= visibleBottom - PROMPT_EDGE;
    const preferredTop = composerOpen && belowFits ? below : above >= minTop ? above : below;

    setPromptPosition({
      left: Math.max(PROMPT_EDGE, Math.min(preferredLeft, maxLeft)),
      top: Math.max(minTop, Math.min(preferredTop, maxTop)),
    });
  }, []);

  const teardown = useCallback(() => {
    observerCleanupRef.current?.();
    observerCleanupRef.current = null;
    instanceRef.current?.destroy();
    instanceRef.current = null;
    captureRef.current = null;
    captureKeyRef.current = '';
  }, []);

  const start = useCallback(async () => {
    const loadId = (loadIdRef.current += 1);
    const isCurrent = () => mountedRef.current && loadId === loadIdRef.current;
    const toolbarContainer = builtInToolbarRef.current;

    teardown();
    setState('loading');
    setCapture(null);
    setPromptPosition(null);
    setPrompt('');
    setAnswer('');
    composerOpenRef.current = false;
    setIsComposerOpen(false);
    setInteractionMessage('Select text in the document to ask AI about it.');
    setGeometryMessage(null);
    setLoadError('');
    zoomRef.current = INITIAL_ZOOM;
    setZoom(INITIAL_ZOOM);

    if (!toolbarContainer || !mountRef.current) {
      setState('error');
      setLoadError('The selection example could not be mounted.');
      return;
    }

    try {
      const SuperDocCtor = await loadRuntime();
      if (!isCurrent() || !mountRef.current) return;

      const editorUi = {
        comments: false,
        loading: false,
        toolbar: { container: toolbarContainer, responsiveTo: 'container' },
      } satisfies UIConfig;

      const instance = createRuntimeEditor(SuperDocCtor, {
        selector: mountRef.current,
        document: DEMO_DOCUMENT,
        documentMode: 'editing',
        ui: editorUi,
        zoom: {
          mode: 'manual',
          fitWidth: {
            min: INITIAL_ZOOM.min,
            max: INITIAL_ZOOM.max,
            padding: EDITOR_DEMO_FIT_WIDTH_PADDING,
          },
        },
        onReady: ({ superdoc }) => {
          if (!isCurrent()) return;
          if ((rootRef.current?.clientWidth ?? NARROW_DEMO_WIDTH) < NARROW_DEMO_WIDTH) {
            const fitWhenMeasured = (attempt: number) => {
              if (!isCurrent() || fitRuntimeEditorToWidth(superdoc) || attempt >= 10) return;
              requestAnimationFrame(() => fitWhenMeasured(attempt + 1));
            };
            fitWhenMeasured(0);
          } else {
            superdoc.ui.zoom.set(INITIAL_ZOOM.value);
          }
          setState('ready');
        },
        onContentError: () => {
          if (!isCurrent()) return;
          teardown();
          setState('error');
          setLoadError('The selection document could not be read.');
        },
        onException: () => {
          if (!isCurrent()) return;
          setInteractionMessage('The editor reported a runtime error.');
        },
      });
      instanceRef.current = instance;

      const handleSelection = (selection: SelectionSlice) => {
        if (!isCurrent() || selection.status !== 'ready' || selection.empty) return;
        const nextCapture = instance.ui.selection.capture();
        if (!nextCapture) return;

        const nextKey = captureKey(nextCapture);
        const targetChanged = nextKey !== captureKeyRef.current;
        captureRef.current = nextCapture;
        captureKeyRef.current = nextKey;
        setCapture(nextCapture);
        if (targetChanged) {
          composerOpenRef.current = false;
          setIsComposerOpen(false);
          setPrompt('');
          setAnswer('');
          setInteractionMessage('Selection captured. Choose Ask AI.');
        }
        positionPrompt(nextCapture);
      };

      const stopSelection = instance.ui.selection.observe(handleSelection);
      const stopViewport = instance.ui.viewport.observe(() => positionPrompt());
      const stopZoom = instance.ui.zoom.observe((snapshot) => {
        zoomRef.current = snapshot;
        if (isCurrent()) setZoom(snapshot);
      });
      observerCleanupRef.current = () => {
        stopSelection();
        stopViewport();
        stopZoom();
      };

      if (!isCurrent()) teardown();
    } catch (cause) {
      if (!isCurrent()) return;
      teardown();
      setState('error');
      setLoadError(cause instanceof Error ? cause.message : 'The selection example could not start.');
    }
  }, [positionPrompt, teardown]);

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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadIdRef.current += 1;
      teardown();
    };
  }, [teardown]);

  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const isPromptVisible = promptPosition !== null;
  useEffect(() => {
    if (!capture) return;
    const frame = requestAnimationFrame(() => positionPrompt(capture));
    return () => cancelAnimationFrame(frame);
  }, [answer, capture, isComposerOpen, isPromptVisible, positionPrompt]);

  // Record whether any prompt control — textarea, Close, Ask, Show selection — owned focus
  // just before the card unmounts, so a scroll-back restores it to the reader who had it
  // rather than pulling it from wherever it moved.
  useLayoutEffect(() => {
    if (!isPromptVisible) return undefined;
    return () => {
      restoreComposerFocusRef.current = promptControlName(promptRef.current);
    };
  }, [isPromptVisible]);

  useEffect(() => {
    // Same unmount-on-scroll shape as the documented snippet.
    const composerJustOpened = isComposerOpen && !wasComposerOpenRef.current;
    wasComposerOpenRef.current = isComposerOpen;
    if (!isPromptVisible) return;
    const restoreTarget = restoreComposerFocusRef.current;
    if (isComposerOpen) {
      if (!composerJustOpened && restoreTarget === null) return;
      restoreComposerFocusRef.current = null;
      if (composerJustOpened) {
        promptInputRef.current?.focus();
        return;
      }
      if (focusIsUnclaimed() && !focusPromptControl(promptRef.current, restoreTarget)) {
        promptInputRef.current?.focus();
      }
      return;
    }
    // The capture is card-wide, so the compact action button's ownership lands in the same
    // record; either signal restores this branch. Closing the composer is deliberate and always
    // lands focus; a scroll-back only reclaims focus that nobody else took.
    const closedComposer = restoreActionFocusRef.current;
    if (!closedComposer && restoreTarget === null) return;
    restoreActionFocusRef.current = false;
    restoreComposerFocusRef.current = null;
    if (closedComposer) {
      actionButtonRef.current?.focus();
      return;
    }
    if (focusIsUnclaimed() && !focusPromptControl(promptRef.current, restoreTarget)) {
      actionButtonRef.current?.focus();
    }
  }, [isComposerOpen, isPromptVisible]);

  function changeZoom(direction: -1 | 1) {
    const currentZoom = zoomRef.current;
    const nextZoom = Math.min(currentZoom.max, Math.max(currentZoom.min, currentZoom.value + direction * 10));
    instanceRef.current?.ui.zoom.set(nextZoom);
  }

  function fitToWidth() {
    if (instanceRef.current) fitRuntimeEditorToWidth(instanceRef.current);
  }

  function restoreSelection() {
    const currentCapture = captureRef.current;
    const ui = instanceRef.current?.ui;
    if (!currentCapture || !ui) return;

    const result = ui.selection.restore(currentCapture);
    setInteractionMessage(
      result.success
        ? 'Selection shown in the document.'
        : `Could not show the selection: ${result.reason ?? 'unknown'}.`,
    );
  }

  function openComposer() {
    if (!captureRef.current) return;
    restoreActionFocusRef.current = false;
    composerOpenRef.current = true;
    setIsComposerOpen(true);
    setInteractionMessage('The composer kept the captured text as context.');
  }

  function closeComposer() {
    restoreActionFocusRef.current = true;
    composerOpenRef.current = false;
    setIsComposerOpen(false);
    setPrompt('');
    setAnswer('');
    setInteractionMessage('Selection captured. Choose Ask AI.');
  }

  function askAboutSelection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentCapture = captureRef.current;
    const question = prompt.trim();
    if (!currentCapture || !question) return;

    setAnswer(createDemoAnswer(currentCapture.quotedText));
    setInteractionMessage('The local demo used the captured text as context.');
  }

  async function toggleFullscreen() {
    const node = rootRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement === node) await document.exitFullscreen();
      else await node.requestFullscreen();
    } catch {
      // The inline demo remains usable when the browser refuses fullscreen.
    }
  }

  const controlsReady = state === 'ready';

  return (
    <figure
      className='sd-custom-bold-demo sd-custom-selection-demo'
      data-custom-selection-demo
      data-state={state}
      ref={rootRef}
    >
      <div className='sd-custom-bold-demo-built-in sd-custom-selection-demo-built-in'>
        <div className='sd-custom-selection-demo-built-in-header'>
          <span aria-hidden='true' className='sd-custom-bold-demo-owner'>
            SuperDoc UI
          </span>
          <EditorDemoViewControls
            disabled={!controlsReady}
            fitActive={zoom.mode === 'fit-width'}
            isFullscreen={isFullscreen}
            onFit={fitToWidth}
            onFullscreen={() => void toggleFullscreen()}
            onZoom={changeZoom}
            zoom={zoom}
          />
        </div>
        <div className='sd-custom-bold-demo-built-in-toolbar' ref={builtInToolbarRef} />
      </div>

      <CollapsibleEditorPreview
        className='sd-custom-selection-demo-preview'
        defaultExpanded
        expandedMaxHeight='72rem'
        onCollapse={() => mountRef.current?.scrollTo({ top: 0 })}
      >
        <div className='sd-custom-selection-demo-instruction'>
          <span aria-hidden='true' className='sd-custom-bold-demo-owner'>
            Your application
          </span>
          <output aria-live='polite'>{geometryMessage ?? interactionMessage}</output>
        </div>

        <div className='sd-custom-selection-demo-document' ref={documentRef}>
          {loadError ? (
            <div className='sd-custom-bold-demo-error' role='alert'>
              <p>{loadError}</p>
              <button onClick={() => void start()} type='button'>
                Try again
              </button>
            </div>
          ) : null}
          <div className='sd-custom-bold-demo-canvas sd-custom-selection-demo-canvas' ref={mountRef} />

          {capture && promptPosition ? (
            <aside
              aria-label={isComposerOpen ? 'Ask AI about selected text' : 'Actions for selected text'}
              className='sd-custom-selection-demo-card'
              data-mode={isComposerOpen ? 'composer' : 'actions'}
              ref={promptRef}
              role={isComposerOpen ? 'dialog' : undefined}
              style={{ left: promptPosition.left, top: promptPosition.top }}
            >
              {isComposerOpen ? (
                <>
                  <div className='sd-custom-selection-demo-card-heading'>
                    <strong>
                      <Sparkles aria-hidden='true' size={14} />
                      Ask about this
                    </strong>
                    <button
                      aria-label='Close AI prompt'
                      className='sd-custom-selection-demo-close'
                      data-prompt-control='close'
                      onClick={closeComposer}
                      type='button'
                    >
                      <X aria-hidden='true' size={14} />
                    </button>
                  </div>
                  <p>“{capture.quotedText}”</p>
                  <form onSubmit={askAboutSelection}>
                    <label htmlFor='custom-selection-demo-prompt'>Ask about this selection</label>
                    <textarea
                      data-prompt-control='question'
                      id='custom-selection-demo-prompt'
                      onChange={(event) => {
                        setPrompt(event.target.value);
                        setAnswer('');
                        setInteractionMessage('The prompt kept its captured document context.');
                      }}
                      placeholder='What does this limit?'
                      ref={promptInputRef}
                      rows={2}
                      value={prompt}
                    />
                    <div className='sd-custom-selection-demo-actions'>
                      <button
                        className='sd-custom-selection-demo-secondary'
                        data-prompt-control='show'
                        onClick={restoreSelection}
                        type='button'
                      >
                        <LocateFixed aria-hidden='true' size={14} />
                        Show selection
                      </button>
                      <button data-prompt-control='ask' disabled={!prompt.trim()} type='submit'>
                        Ask
                      </button>
                    </div>
                  </form>
                  {answer ? (
                    <div className='sd-custom-selection-demo-answer'>
                      <strong>Simulated response</strong>
                      <span>{answer}</span>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className='sd-custom-selection-demo-action-bar'>
                  <button
                    aria-haspopup='dialog'
                    data-prompt-control='action'
                    onClick={openComposer}
                    ref={actionButtonRef}
                    type='button'
                  >
                    <Sparkles aria-hidden='true' size={14} />
                    Ask AI
                  </button>
                </div>
              )}
            </aside>
          ) : null}
        </div>
      </CollapsibleEditorPreview>
    </figure>
  );
}
