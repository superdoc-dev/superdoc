import { extractIdentifierFromConverter } from '@superdoc/layout-bridge';
import type { HeaderFooterIdentifier } from '@superdoc/layout-bridge';
import type { Editor } from '@core/Editor.js';
import {
  HeaderFooterEditorManager,
  HeaderFooterLayoutAdapter,
  type HeaderFooterDescriptor,
} from './HeaderFooterRegistry.js';

export type InitHeaderFooterRegistryDeps = {
  editor: Editor;
  converter: Parameters<typeof extractIdentifierFromConverter>[0];
  mediaFiles?: Record<string, unknown>;
  isDebug: boolean;
  initBudgetMs: number;
  resetSession: () => void;
  requestRerender: () => void;
  previousCleanups: Array<() => void>;
  previousAdapter: HeaderFooterLayoutAdapter | null;
  previousManager: HeaderFooterEditorManager | null;
};

export type InitHeaderFooterRegistryResult = {
  headerFooterIdentifier: HeaderFooterIdentifier | null;
  headerFooterManager: HeaderFooterEditorManager;
  headerFooterAdapter: HeaderFooterLayoutAdapter;
  cleanups: Array<() => void>;
};

export function initHeaderFooterRegistry({
  editor,
  converter,
  mediaFiles,
  isDebug,
  initBudgetMs,
  resetSession,
  requestRerender,
  previousCleanups,
  previousAdapter,
  previousManager,
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

  resetSession();

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
    headerFooterIdentifier,
    headerFooterManager,
    headerFooterAdapter,
    cleanups,
  };
}
