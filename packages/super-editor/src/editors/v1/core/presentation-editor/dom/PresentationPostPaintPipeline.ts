import type { EditorState, Transaction } from 'prosemirror-state';

import type { DomPositionIndex } from '../../../dom-observer/DomPositionIndex.js';
import type { ProofingAnnotation } from '../proofing/types.js';
import { CommentHighlightDecorator } from './CommentHighlightDecorator.js';
import { DecorationBridge } from './DecorationBridge.js';
import { FieldAnnotationInteractionLayer } from './FieldAnnotationInteractionLayer.js';
import { ImageInteractionLayer } from './ImageInteractionLayer.js';
import { StructuredContentInteractionLayer } from './StructuredContentInteractionLayer.js';
import { PresentationProofingDecorator } from './PresentationProofingDecorator.js';

type DecorationRange = {
  from: number;
  to: number;
  classes: string[];
  style: string | null;
  dataAttrs: Record<string, string>;
};

type FieldAnnotationLayerLike = Pick<FieldAnnotationInteractionLayer, 'setContainer' | 'apply' | 'clear'>;
type ImageLayerLike = Pick<ImageInteractionLayer, 'setContainer' | 'apply' | 'clear'>;
type StructuredContentLayerLike = Pick<StructuredContentInteractionLayer, 'setContainer' | 'apply' | 'clear'>;
type CommentHighlightDecoratorLike = Pick<
  CommentHighlightDecorator,
  'setContainer' | 'setActiveComment' | 'apply' | 'destroy'
>;
type DecorationBridgeLike = Pick<
  DecorationBridge,
  'recordTransaction' | 'hasChanges' | 'hasCurrentRanges' | 'collectDecorationRanges' | 'sync' | 'destroy'
>;
type ProofingDecoratorLike = Pick<PresentationProofingDecorator, 'setContainer' | 'applyAnnotations' | 'clear'>;

type PresentationPostPaintPipelineDeps = {
  fieldAnnotationLayer?: FieldAnnotationLayerLike;
  imageLayer?: ImageLayerLike;
  structuredContentLayer?: StructuredContentLayerLike;
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
  #imageLayer: ImageLayerLike;
  #structuredContentLayer: StructuredContentLayerLike;
  #commentHighlightDecorator: CommentHighlightDecoratorLike;
  #decorationBridge: DecorationBridgeLike;
  #proofingDecorator: ProofingDecoratorLike;

  constructor(deps: PresentationPostPaintPipelineDeps = {}) {
    this.#fieldAnnotationLayer = deps.fieldAnnotationLayer ?? new FieldAnnotationInteractionLayer();
    this.#imageLayer = deps.imageLayer ?? new ImageInteractionLayer();
    this.#structuredContentLayer = deps.structuredContentLayer ?? new StructuredContentInteractionLayer();
    this.#commentHighlightDecorator = deps.commentHighlightDecorator ?? new CommentHighlightDecorator();
    this.#decorationBridge = deps.decorationBridge ?? new DecorationBridge();
    this.#proofingDecorator = deps.proofingDecorator ?? new PresentationProofingDecorator();
  }

  setContainer(container: HTMLElement | null): void {
    this.#fieldAnnotationLayer.setContainer(container);
    this.#imageLayer.setContainer(container);
    this.#structuredContentLayer.setContainer(container);
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

  hasCurrentDecorationRanges(editorState: EditorState): boolean {
    return this.#decorationBridge.hasCurrentRanges(editorState);
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
    this.#imageLayer.apply(options.layoutEpoch);
    this.#structuredContentLayer.apply(options.layoutEpoch);
    this.syncInlineStyleLayers(options.editorState, options.domPositionIndex);
    this.applyProofingAnnotations(options.proofingAnnotations, options.rebuildDomPositionIndex);
    options.reapplyStructuredContentHover?.();
  }

  destroy(): void {
    this.#proofingDecorator.clear();
    this.#fieldAnnotationLayer.clear();
    this.#imageLayer.clear();
    this.#structuredContentLayer.clear();
    this.#commentHighlightDecorator.destroy();
    this.#decorationBridge.destroy();
  }
}
