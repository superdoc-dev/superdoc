import { describe, expect, it, vi } from 'vitest';

import { PresentationPostPaintPipeline } from './PresentationPostPaintPipeline.js';

describe('PresentationPostPaintPipeline', () => {
  it('applies post-paint mutation layers in the documented order', () => {
    const calls: string[] = [];

    const pipeline = new PresentationPostPaintPipeline({
      fieldAnnotationLayer: {
        setContainer: vi.fn(),
        apply: vi.fn((layoutEpoch: number) => calls.push(`field:${layoutEpoch}`)),
        clear: vi.fn(),
      },
      commentHighlightDecorator: {
        setContainer: vi.fn(),
        setActiveComment: vi.fn(() => false),
        apply: vi.fn(() => calls.push('comments')),
        destroy: vi.fn(),
      },
      decorationBridge: {
        recordTransaction: vi.fn(),
        hasChanges: vi.fn(() => false),
        collectDecorationRanges: vi.fn(() => []),
        sync: vi.fn(() => {
          calls.push('decorations');
          return false;
        }),
        destroy: vi.fn(),
      },
      proofingDecorator: {
        setContainer: vi.fn(),
        applyAnnotations: vi.fn(() => {
          calls.push('proofing');
          return true;
        }),
        clear: vi.fn(() => false),
      },
    });

    pipeline.refreshAfterPaint({
      layoutEpoch: 42,
      editorState: {} as never,
      domPositionIndex: {} as never,
      proofingAnnotations: [{ pmFrom: 1, pmTo: 2, kind: 'spelling' }],
      rebuildDomPositionIndex: () => calls.push('rebuild'),
      reapplyStructuredContentHover: () => calls.push('hover'),
    });

    expect(calls).toEqual(['field:42', 'rebuild', 'comments', 'decorations', 'proofing', 'rebuild', 'hover']);
  });

  it('applies comment highlights before bridged decorations during inline style sync', () => {
    const calls: string[] = [];

    const pipeline = new PresentationPostPaintPipeline({
      fieldAnnotationLayer: {
        setContainer: vi.fn(),
        apply: vi.fn(),
        clear: vi.fn(),
      },
      commentHighlightDecorator: {
        setContainer: vi.fn(),
        setActiveComment: vi.fn(() => false),
        apply: vi.fn(() => calls.push('comments')),
        destroy: vi.fn(),
      },
      decorationBridge: {
        recordTransaction: vi.fn(),
        hasChanges: vi.fn(() => false),
        collectDecorationRanges: vi.fn(() => []),
        sync: vi.fn(() => {
          calls.push('decorations');
          return true;
        }),
        destroy: vi.fn(),
      },
      proofingDecorator: {
        setContainer: vi.fn(),
        applyAnnotations: vi.fn(() => false),
        clear: vi.fn(() => false),
      },
    });

    pipeline.syncInlineStyleLayers({} as never, {} as never);

    expect(calls).toEqual(['comments', 'decorations']);
  });

  it('rebuilds the DOM position index only when proofing mutated the DOM', () => {
    const rebuildDomPositionIndex = vi.fn();
    const pipeline = new PresentationPostPaintPipeline({
      fieldAnnotationLayer: {
        setContainer: vi.fn(),
        apply: vi.fn(),
        clear: vi.fn(),
      },
      commentHighlightDecorator: {
        setContainer: vi.fn(),
        setActiveComment: vi.fn(() => false),
        apply: vi.fn(),
        destroy: vi.fn(),
      },
      decorationBridge: {
        recordTransaction: vi.fn(),
        hasChanges: vi.fn(() => false),
        collectDecorationRanges: vi.fn(() => []),
        sync: vi.fn(() => false),
        destroy: vi.fn(),
      },
      proofingDecorator: {
        setContainer: vi.fn(),
        applyAnnotations: vi.fn(() => false),
        clear: vi.fn(() => false),
      },
    });

    const mutated = pipeline.applyProofingAnnotations(
      [{ pmFrom: 10, pmTo: 12, kind: 'spelling' }],
      rebuildDomPositionIndex,
    );

    expect(mutated).toBe(false);
    expect(rebuildDomPositionIndex).not.toHaveBeenCalled();
  });
});
