import type { EditorState, Transaction } from 'prosemirror-state';

import type { ProofingAnnotation } from '@superdoc/painter-dom';

import type { DomPositionIndex } from '../../../dom-observer/DomPositionIndex.js';
import { CommentHighlightDecorator } from './CommentHighlightDecorator.js';
import { DecorationBridge } from './DecorationBridge.js';
import { FieldAnnotationInteractionLayer } from './FieldAnnotationInteractionLayer.js';
import { PresentationProofingDecorator } from './PresentationProofingDecorator.js';

type DecorationRange = {
  from: number;
  to: number;
  classes: string[];
  style: string | null;
  dataAttrs: Record<string, string>;
};

type FieldAnnotationLayerLike = Pick<FieldAnnotationInteractionLayer, 'setContainer' | 'apply' | 'clear'>;
type CommentHighlightDecoratorLike = Pick<
  CommentHighlightDecorator,
  'setContainer' | 'setActiveComment' | 'apply' | 'destroy'
>;
type DecorationBridgeLike = Pick<
  DecorationBridge,
  'recordTransaction' | 'hasChanges' | 'collectDecorationRanges' | 'sync' | 'destroy'
>;
type ProofingDecoratorLike = Pick<PresentationProofingDecorator, 'setContainer' | 'applyAnnotations' | 'clear'>;

type PresentationPostPaintPipelineDeps = {
  fieldAnnotationLayer?: FieldAnnotationLayerLike;
  commentHighlightDecorator?: CommentHighlightDecoratorLike;
  decorationBridge?: DecorationBridgeLike;
  proofingDecorator?: ProofingDecoratorLike;
};

type RefreshAfterPaintOptions = {
  layoutEpoch: number;
  editorState: EditorState | null | undefined;
  domPositionIndex: DomPositionIndex;
  proofingAnnotations: ProofingAnnotation[] | null | undefined;
  rebuildDomPositionIndex: () => void;
  reapplyStructuredContentHover?: () => void;
};

/**
 * Owns every editor-side post-paint DOM mutation layer that still sits on top
 * of painter output.
 *
 * The key invariant is that PresentationEditor never hand-orders these layers
 * ad hoc. The pipeline is the single owner of:
 * - field annotation interaction upgrades
 * - comment highlight inline styles
 * - bridged plugin decorations
 * - proofing decorations
 */
export class PresentationPostPaintPipeline {
  #fieldAnnotationLayer: FieldAnnotationLayerLike;
  #commentHighlightDecorator: CommentHighlightDecoratorLike;
  #decorationBridge: DecorationBridgeLike;
  #proofingDecorator: ProofingDecoratorLike;

  constructor(deps: PresentationPostPaintPipelineDeps = {}) {
    this.#fieldAnnotationLayer = deps.fieldAnnotationLayer ?? new FieldAnnotationInteractionLayer();
    this.#commentHighlightDecorator = deps.commentHighlightDecorator ?? new CommentHighlightDecorator();
    this.#decorationBridge = deps.decorationBridge ?? new DecorationBridge();
    this.#proofingDecorator = deps.proofingDecorator ?? new PresentationProofingDecorator();
  }

  setContainer(container: HTMLElement | null): void {
    this.#fieldAnnotationLayer.setContainer(container);
    this.#commentHighlightDecorator.setContainer(container);
    this.#proofingDecorator.setContainer(container);
  }

  setActiveComment(commentId: string | null): boolean {
    return this.#commentHighlightDecorator.setActiveComment(commentId);
  }

  recordDecorationTransaction(transaction?: Transaction): void {
    this.#decorationBridge.recordTransaction(transaction);
  }

  hasDecorationChanges(editorState: EditorState): boolean {
    return this.#decorationBridge.hasChanges(editorState);
  }

  collectDecorationRanges(editorState: EditorState): DecorationRange[] {
    return this.#decorationBridge.collectDecorationRanges(editorState);
  }

  syncDecorations(
    editorState: EditorState | null | undefined,
    domPositionIndex: DomPositionIndex,
    options?: { restoreEmptyDecorations?: boolean },
  ): boolean {
    if (!editorState) return false;
    return this.#decorationBridge.sync(editorState, domPositionIndex, options);
  }

  applyCommentHighlights(): void {
    this.#commentHighlightDecorator.apply();
  }

  syncInlineStyleLayers(editorState: EditorState | null | undefined, domPositionIndex: DomPositionIndex): boolean {
    this.applyCommentHighlights();
    return this.syncDecorations(editorState, domPositionIndex);
  }

  applyProofingAnnotations(
    annotations: ProofingAnnotation[] | null | undefined,
    rebuildDomPositionIndex: () => void,
  ): boolean {
    const mutated = this.#proofingDecorator.applyAnnotations(annotations);
    if (mutated) {
      rebuildDomPositionIndex();
    }
    return mutated;
  }

  refreshAfterPaint(options: RefreshAfterPaintOptions): void {
    this.#fieldAnnotationLayer.apply(options.layoutEpoch);
    options.rebuildDomPositionIndex();
    this.syncInlineStyleLayers(options.editorState, options.domPositionIndex);
    this.applyProofingAnnotations(options.proofingAnnotations, options.rebuildDomPositionIndex);
    options.reapplyStructuredContentHover?.();
  }

  destroy(): void {
    this.#proofingDecorator.clear();
    this.#fieldAnnotationLayer.clear();
    this.#commentHighlightDecorator.destroy();
    this.#decorationBridge.destroy();
  }
}
