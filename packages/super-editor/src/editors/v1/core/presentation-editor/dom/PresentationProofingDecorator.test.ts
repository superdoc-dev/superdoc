import { describe, expect, it, vi } from 'vitest';

import { PresentationProofingDecorator } from './PresentationProofingDecorator.js';

const { mockApplyProofingDecorations, mockClearProofingDecorations } = vi.hoisted(() => ({
  mockApplyProofingDecorations: vi.fn(() => true),
  mockClearProofingDecorations: vi.fn(() => false),
}));

vi.mock('@superdoc/painter-dom', () => ({
  applyProofingDecorations: mockApplyProofingDecorations,
  clearProofingDecorations: mockClearProofingDecorations,
}));

describe('PresentationProofingDecorator', () => {
  it('returns false when no container is set', () => {
    const decorator = new PresentationProofingDecorator();

    expect(decorator.applyAnnotations([{ pmFrom: 0, pmTo: 5, kind: 'spelling' }])).toBe(false);
    expect(decorator.clear()).toBe(false);
  });

  it('clears proofing decorations when annotations are null', () => {
    const decorator = new PresentationProofingDecorator();
    const container = document.createElement('div');
    decorator.setContainer(container);

    decorator.applyAnnotations(null);

    expect(mockClearProofingDecorations).toHaveBeenCalledWith(container);
  });

  it('clears proofing decorations when annotations are empty', () => {
    const decorator = new PresentationProofingDecorator();
    const container = document.createElement('div');
    decorator.setContainer(container);

    decorator.applyAnnotations([]);

    expect(mockClearProofingDecorations).toHaveBeenCalledWith(container);
  });

  it('applies proofing decorations when annotations are provided', () => {
    const decorator = new PresentationProofingDecorator();
    const container = document.createElement('div');
    decorator.setContainer(container);
    const annotations = [{ pmFrom: 0, pmTo: 5, kind: 'spelling' as const }];

    const result = decorator.applyAnnotations(annotations);

    expect(mockApplyProofingDecorations).toHaveBeenCalledWith(container, annotations);
    expect(result).toBe(true);
  });

  it('delegates clear to clearProofingDecorations', () => {
    const decorator = new PresentationProofingDecorator();
    const container = document.createElement('div');
    decorator.setContainer(container);

    decorator.clear();

    expect(mockClearProofingDecorations).toHaveBeenCalledWith(container);
  });
});
