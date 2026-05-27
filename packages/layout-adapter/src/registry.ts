import type { LayoutDocumentAdapter } from './document-adapter.js';

let activeAdapter: LayoutDocumentAdapter | null = null;

export function registerLayoutDocumentAdapter(adapter: LayoutDocumentAdapter): void {
  activeAdapter = adapter;
}

export function getLayoutDocumentAdapter(): LayoutDocumentAdapter {
  if (!activeAdapter) {
    throw new Error(
      'No layout document adapter registered. Register one via registerLayoutDocumentAdapter(...) before using the layout pipeline.',
    );
  }
  return activeAdapter;
}

export function resetLayoutDocumentAdapterForTests(): void {
  activeAdapter = null;
}
