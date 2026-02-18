/**
 * Grouped hover for multi-fragment SDT blocks.
 *
 * When a block SDT spans multiple paragraphs, each renders as a separate DOM element.
 * This class uses event delegation to highlight ALL fragments of the same SDT
 * simultaneously via the `.sdt-hover` CSS class.
 */

import { DOM_CLASS_NAMES } from '../constants.js';

const SDT_BLOCK_SELECTOR = `.${DOM_CLASS_NAMES.BLOCK_SDT}[data-sdt-id]`;
const HOVER_CLASS = DOM_CLASS_NAMES.SDT_HOVER;

function sdtElementsById(root: HTMLElement, sdtId: string): NodeListOf<Element> {
  return root.querySelectorAll(`.${DOM_CLASS_NAMES.BLOCK_SDT}[data-sdt-id="${sdtId}"]`);
}

export class SdtGroupedHover {
  private hoveredSdtId: string | null = null;
  private mount: HTMLElement | null = null;
  private onMouseOver: ((e: Event) => void) | null = null;
  private onMouseLeave: (() => void) | null = null;

  /** Attach hover listeners to the mount element. Safe to call again on remount. */
  bind(mount: HTMLElement): void {
    this.destroy();
    this.mount = mount;

    this.onMouseOver = (e: Event) => {
      const target = (e.target as HTMLElement).closest?.(SDT_BLOCK_SELECTOR) as HTMLElement | null;
      const sdtId = target?.dataset.sdtId ?? null;

      if (sdtId === this.hoveredSdtId) return;

      if (this.hoveredSdtId) {
        sdtElementsById(mount, this.hoveredSdtId).forEach((el) => el.classList.remove(HOVER_CLASS));
      }

      this.hoveredSdtId = sdtId;

      if (sdtId) {
        sdtElementsById(mount, sdtId).forEach((el) => {
          // Suppress hover styling when the node is selected (SD-1584).
          if (!el.classList.contains('ProseMirror-selectednode')) {
            el.classList.add(HOVER_CLASS);
          }
        });
      }
    };

    this.onMouseLeave = () => {
      if (this.hoveredSdtId) {
        sdtElementsById(mount, this.hoveredSdtId).forEach((el) => el.classList.remove(HOVER_CLASS));
        this.hoveredSdtId = null;
      }
    };

    mount.addEventListener('mouseover', this.onMouseOver);
    mount.addEventListener('mouseleave', this.onMouseLeave);
  }

  /** Re-apply hover class after render. New/rebuilt elements lose the class. */
  reapply(): void {
    if (this.hoveredSdtId && this.mount) {
      sdtElementsById(this.mount, this.hoveredSdtId).forEach((el) => {
        if (!el.classList.contains('ProseMirror-selectednode')) {
          el.classList.add(HOVER_CLASS);
        }
      });
    }
  }

  /** Remove listeners and reset state. */
  destroy(): void {
    if (this.mount) {
      if (this.onMouseOver) {
        this.mount.removeEventListener('mouseover', this.onMouseOver);
      }
      if (this.onMouseLeave) {
        this.mount.removeEventListener('mouseleave', this.onMouseLeave);
      }
    }
    this.mount = null;
    this.onMouseOver = null;
    this.onMouseLeave = null;
    this.hoveredSdtId = null;
  }
}
