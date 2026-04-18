import type { ProofingAnnotation } from '../proofing/types.js';
import { applyProofingDecorations, clearProofingDecorations } from '../proofing/dom/decoration-pass.js';

/**
 * Thin DOM-surface wrapper around the editor-owned proofing decoration pass.
 *
 * Proofing marks are still a post-paint compatibility layer today, but this
 * wrapper keeps the mutation boundary inside super-editor and explicit.
 */
export class PresentationProofingDecorator {
  #container: HTMLElement | null = null;

  setContainer(container: HTMLElement | null): void {
    this.#container = container;
  }

  applyAnnotations(annotations: ProofingAnnotation[] | null | undefined): boolean {
    const container = this.#container;
    if (!container) return false;

    if (!annotations || annotations.length === 0) {
      return clearProofingDecorations(container);
    }

    return applyProofingDecorations(container, annotations);
  }

  clear(): boolean {
    const container = this.#container;
    if (!container) return false;
    return clearProofingDecorations(container);
  }
}
