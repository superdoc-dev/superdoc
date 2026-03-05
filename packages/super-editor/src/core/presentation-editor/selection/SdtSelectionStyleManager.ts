import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { NodeSelection, type Selection } from 'prosemirror-state';

interface ElementIdState {
  id: string | null;
  elements: HTMLElement[];
}

interface FieldAnnotationState {
  element: HTMLElement;
  pmStart: number;
}

export interface SdtSelectionStyleDeps {
  painterHost: HTMLElement;
  getElementAtPos: (pos: number, options?: { fallbackToCoords?: boolean }) => HTMLElement | null;
}

/**
 * Manages CSS class toggling for selected/hovered SDT (Structured Document Tag)
 * elements in the DomPainter layer. Handles three element types:
 *
 * - Field annotations: `.annotation[data-pm-start]` → `ProseMirror-selectednode`
 * - SDT blocks: `.superdoc-structured-content-block[data-sdt-id]` → `ProseMirror-selectednode`
 * - SDT inline: `.superdoc-structured-content-inline[data-sdt-id]` → `ProseMirror-selectednode`
 * - SDT block hover: `.superdoc-structured-content-block[data-sdt-id]` → `sdt-group-hover`
 */
export class SdtSelectionStyleManager {
  #deps: SdtSelectionStyleDeps;
  #lastSelectedFieldAnnotation: FieldAnnotationState | null = null;
  #lastSelectedBlock: ElementIdState | null = null;
  #lastSelectedInline: ElementIdState | null = null;
  #lastHoveredBlock: ElementIdState | null = null;

  constructor(deps: SdtSelectionStyleDeps) {
    this.#deps = deps;
  }

  // ── Field Annotation ──

  clearFieldAnnotation(): void {
    if (this.#lastSelectedFieldAnnotation?.element?.classList?.contains('ProseMirror-selectednode')) {
      this.#lastSelectedFieldAnnotation.element.classList.remove('ProseMirror-selectednode');
    }
    this.#lastSelectedFieldAnnotation = null;
  }

  syncFieldAnnotation(selection: Selection | null | undefined): void {
    if (!selection || !(selection instanceof NodeSelection)) {
      this.clearFieldAnnotation();
      return;
    }

    const node = selection.node;
    if (!node || node.type?.name !== 'fieldAnnotation') {
      this.clearFieldAnnotation();
      return;
    }

    if (!this.#deps.painterHost) {
      this.clearFieldAnnotation();
      return;
    }

    const pmStart = selection.from;
    if (this.#lastSelectedFieldAnnotation?.pmStart === pmStart && this.#lastSelectedFieldAnnotation.element) {
      return;
    }

    const selector = `.annotation[data-pm-start="${pmStart}"]`;
    const element = this.#deps.painterHost.querySelector(selector) as HTMLElement | null;
    if (!element) {
      this.clearFieldAnnotation();
      return;
    }

    if (this.#lastSelectedFieldAnnotation?.element && this.#lastSelectedFieldAnnotation.element !== element) {
      this.#lastSelectedFieldAnnotation.element.classList.remove('ProseMirror-selectednode');
    }
    element.classList.add('ProseMirror-selectednode');
    this.#lastSelectedFieldAnnotation = { element, pmStart };
  }

  // ── SDT Block Selection ──

  clearBlock(): void {
    if (!this.#lastSelectedBlock) return;
    this.#lastSelectedBlock.elements.forEach((el) => el.classList.remove('ProseMirror-selectednode'));
    this.#lastSelectedBlock = null;
  }

  syncBlock(selection: Selection | null | undefined): void {
    if (!selection) {
      this.clearBlock();
      return;
    }

    let node: ProseMirrorNode | null = null;

    if (selection instanceof NodeSelection) {
      if (selection.node?.type?.name !== 'structuredContentBlock') {
        this.clearBlock();
        return;
      }
      node = selection.node;
    } else {
      const $pos = (selection as Selection & { $from?: { depth?: number; node?: (depth: number) => ProseMirrorNode } })
        .$from;
      if (!$pos || typeof $pos.depth !== 'number' || typeof $pos.node !== 'function') {
        this.clearBlock();
        return;
      }
      for (let depth = $pos.depth; depth > 0; depth--) {
        const candidate = $pos.node(depth);
        if (candidate.type?.name === 'structuredContentBlock') {
          node = candidate;
          break;
        }
      }
      if (!node) {
        this.clearBlock();
        return;
      }
    }

    if (!this.#deps.painterHost) {
      this.clearBlock();
      return;
    }

    const rawId = (node.attrs as { id?: unknown } | null | undefined)?.id;
    const id = rawId != null ? String(rawId) : null;
    let elements: HTMLElement[] = [];

    if (id) {
      const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
      elements = Array.from(
        this.#deps.painterHost.querySelectorAll(`.superdoc-structured-content-block[data-sdt-id="${escapedId}"]`),
      ) as HTMLElement[];
    }

    if (elements.length === 0) {
      const elementAtPos = this.#deps.getElementAtPos(selection.from, { fallbackToCoords: true });
      const container = elementAtPos?.closest?.('.superdoc-structured-content-block') as HTMLElement | null;
      if (container) {
        elements = [container];
      }
    }

    if (elements.length === 0) {
      this.clearBlock();
      return;
    }

    this.#setBlock(elements, id);
  }

  #setBlock(elements: HTMLElement[], id: string | null): void {
    if (
      this.#lastSelectedBlock &&
      this.#lastSelectedBlock.id === id &&
      this.#lastSelectedBlock.elements.length === elements.length &&
      this.#lastSelectedBlock.elements.every((el) => elements.includes(el))
    ) {
      return;
    }

    this.clearBlock();
    elements.forEach((el) => el.classList.add('ProseMirror-selectednode'));
    this.#lastSelectedBlock = { id, elements };
  }

  // ── SDT Block Hover ──

  handleMouseEnter = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const block = target.closest('.superdoc-structured-content-block');

    if (!block || !(block instanceof HTMLElement)) return;
    if (block.classList.contains('ProseMirror-selectednode')) return;

    const rawId = block.dataset.sdtId;
    if (!rawId) return;

    this.#setHoveredBlock(rawId);
  };

  handleMouseLeave = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const block = target.closest('.superdoc-structured-content-block') as HTMLElement | null;

    if (!block) return;

    const relatedTarget = event.relatedTarget as HTMLElement | null;
    if (
      relatedTarget &&
      block.dataset.sdtId &&
      relatedTarget.closest(`.superdoc-structured-content-block[data-sdt-id="${block.dataset.sdtId}"]`)
    ) {
      return;
    }

    this.clearHoveredBlock();
  };

  clearHoveredBlock(): void {
    if (!this.#lastHoveredBlock) return;
    this.#lastHoveredBlock.elements.forEach((el) => el.classList.remove('sdt-group-hover'));
    this.#lastHoveredBlock = null;
  }

  #setHoveredBlock(id: string): void {
    if (this.#lastHoveredBlock?.id === id) return;

    this.clearHoveredBlock();

    if (!this.#deps.painterHost) return;

    const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
    const elements = Array.from(
      this.#deps.painterHost.querySelectorAll(`.superdoc-structured-content-block[data-sdt-id="${escapedId}"]`),
    ) as HTMLElement[];

    if (elements.length === 0) return;

    elements.forEach((el) => {
      if (!el.classList.contains('ProseMirror-selectednode')) {
        el.classList.add('sdt-group-hover');
      }
    });

    this.#lastHoveredBlock = { id, elements };
  }

  // ── SDT Inline Selection ──

  clearInline(): void {
    if (!this.#lastSelectedInline) return;
    this.#lastSelectedInline.elements.forEach((el) => el.classList.remove('ProseMirror-selectednode'));
    this.#lastSelectedInline = null;
  }

  syncInline(selection: Selection | null | undefined): void {
    if (!selection) {
      this.clearInline();
      return;
    }

    let node: ProseMirrorNode | null = null;
    let pos: number | null = null;

    if (selection instanceof NodeSelection) {
      if (selection.node?.type?.name !== 'structuredContent') {
        this.clearInline();
        return;
      }
      node = selection.node;
      pos = selection.from;
    } else {
      const $pos = (
        selection as Selection & {
          $from?: { depth?: number; node?: (depth: number) => ProseMirrorNode; before?: (depth: number) => number };
        }
      ).$from;
      if (!$pos || typeof $pos.depth !== 'number' || typeof $pos.node !== 'function') {
        this.clearInline();
        return;
      }
      for (let depth = $pos.depth; depth > 0; depth--) {
        const candidate = $pos.node(depth);
        if (candidate.type?.name === 'structuredContent') {
          if (typeof $pos.before !== 'function') {
            this.clearInline();
            return;
          }
          node = candidate;
          pos = $pos.before(depth);
          break;
        }
      }
      if (!node || pos == null) {
        this.clearInline();
        return;
      }
    }

    if (!this.#deps.painterHost) {
      this.clearInline();
      return;
    }

    const rawId = (node.attrs as { id?: unknown } | null | undefined)?.id;
    const id = rawId != null ? String(rawId) : null;
    let elements: HTMLElement[] = [];

    if (id) {
      const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
      elements = Array.from(
        this.#deps.painterHost.querySelectorAll(`.superdoc-structured-content-inline[data-sdt-id="${escapedId}"]`),
      ) as HTMLElement[];
    }

    if (elements.length === 0) {
      const elementAtPos = this.#deps.getElementAtPos(pos, { fallbackToCoords: true });
      const container = elementAtPos?.closest?.('.superdoc-structured-content-inline') as HTMLElement | null;
      if (container) {
        elements = [container];
      }
    }

    if (elements.length === 0) {
      this.clearInline();
      return;
    }

    this.#setInline(elements, id);
  }

  #setInline(elements: HTMLElement[], id: string | null): void {
    if (
      this.#lastSelectedInline &&
      this.#lastSelectedInline.id === id &&
      this.#lastSelectedInline.elements.length === elements.length &&
      this.#lastSelectedInline.elements.every((el) => elements.includes(el))
    ) {
      return;
    }

    this.clearInline();
    elements.forEach((el) => el.classList.add('ProseMirror-selectednode'));
    this.#lastSelectedInline = { id, elements };
  }

  // ── Bulk Operations ──

  clearAll(): void {
    this.clearFieldAnnotation();
    this.clearBlock();
    this.clearInline();
  }

  syncAll(selection: Selection | null | undefined): void {
    this.syncFieldAnnotation(selection);
    this.syncBlock(selection);
    this.syncInline(selection);
  }

  destroy(): void {
    this.clearAll();
    this.clearHoveredBlock();
  }
}
