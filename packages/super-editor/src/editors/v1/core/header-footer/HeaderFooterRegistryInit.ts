import { extractIdentifierFromConverter } from '@superdoc/layout-bridge';
import type { HeaderFooterIdentifier } from '@superdoc/layout-bridge';
import type { Editor } from '@core/Editor.js';
import {
  HeaderFooterEditorManager,
  HeaderFooterLayoutAdapter,
  type HeaderFooterDescriptor,
} from './HeaderFooterRegistry.js';
import { EditorOverlayManager } from './EditorOverlayManager.js';

export type InitHeaderFooterRegistryDeps = {
  painterHost: HTMLElement;
  visibleHost: HTMLElement;
  selectionOverlay: HTMLElement | null;
  editor: Editor;
  converter: Parameters<typeof extractIdentifierFromConverter>[0];
  mediaFiles?: Record<string, unknown>;
  isDebug: boolean;
  initBudgetMs: number;
  resetSession: () => void;
  requestRerender: () => void;
  exitHeaderFooterMode: () => void;
  previousCleanups: Array<() => void>;
  previousAdapter: HeaderFooterLayoutAdapter | null;
  previousManager: HeaderFooterEditorManager | null;
  previousOverlayManager: EditorOverlayManager | null;
};

export type InitHeaderFooterRegistryResult = {
  overlayManager: EditorOverlayManager;
  headerFooterIdentifier: HeaderFooterIdentifier | null;
  headerFooterManager: HeaderFooterEditorManager;
  headerFooterAdapter: HeaderFooterLayoutAdapter;
  cleanups: Array<() => void>;
};

export function initHeaderFooterRegistry({
  painterHost,
  visibleHost,
  selectionOverlay,
  editor,
  converter,
  mediaFiles,
  isDebug,
  initBudgetMs,
  resetSession,
  requestRerender,
  exitHeaderFooterMode,
  previousCleanups,
  previousAdapter,
  previousManager,
  previousOverlayManager,
}: InitHeaderFooterRegistryDeps): InitHeaderFooterRegistryResult {
  const startTime = performance.now();

  previousCleanups.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      console.warn('[PresentationEditor] Header/footer cleanup failed:', error);
    }
  });
  previousAdapter?.clear();
  previousManager?.destroy();
  previousOverlayManager?.destroy();

  resetSession();

  // Initialize EditorOverlayManager for in-place editing
  const overlayManager = new EditorOverlayManager(painterHost, visibleHost, selectionOverlay);
  // Set callback for when user clicks on dimming overlay to exit edit mode
  overlayManager.setOnDimmingClick(exitHeaderFooterMode);

  const headerFooterIdentifier = extractIdentifierFromConverter(converter);
  const headerFooterManager = new HeaderFooterEditorManager(editor);
  const headerFooterAdapter = new HeaderFooterLayoutAdapter(
    headerFooterManager,
    mediaFiles as Record<string, string> | undefined,
  );

  const cleanups: Array<() => void> = [];

  const handleContentChange = ({ descriptor }: { descriptor: HeaderFooterDescriptor }) => {
    headerFooterAdapter.invalidate(descriptor.id);
    requestRerender();
  };
  headerFooterManager.on('contentChanged', handleContentChange);
  cleanups.push(() => {
    headerFooterManager.off('contentChanged', handleContentChange);
  });

  const duration = performance.now() - startTime;
  if (isDebug && duration > initBudgetMs) {
    console.warn(
      `[PresentationEditor] Header/footer initialization took ${duration.toFixed(2)}ms (budget: ${initBudgetMs}ms)`,
    );
    // TODO: Consider showing loading spinner if bootstrap exceeds budget in production
    // to provide user feedback during long initialization times
  }

  return {
    overlayManager,
    headerFooterIdentifier,
    headerFooterManager,
    headerFooterAdapter,
    cleanups,
  };
}
