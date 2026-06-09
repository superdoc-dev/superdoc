/**
 * Group hover state shared between SDT block hover and TOC entry hover.
 *
 * Both features watch mouseover/mouseout on the painter host, look up every
 * fragment that shares an id, and toggle a hover class across the whole group
 * so the rendered control greys out as a unit. Without a coordinator the two
 * paths drift apart: independent caches, two near-identical
 * enter/leave/set/clear/reapply pairs, and inlined CSS.escape ladders.
 */

export interface HoverGroupSpec {
  /** Selector that matches a single group member (e.g. `.superdoc-toc-entry`). */
  entrySelector: string;
  /** Read the group id off a matched entry element. */
  getId: (entry: HTMLElement) => string | undefined;
  /** Find every group member for an id (typically a painter-host query). */
  queryGroup: (id: string) => HTMLElement[];
  /** Class applied to each group member while the group is hovered. */
  hoverClass: string;
  /**
   * Filter applied before classing a member. SDT hover skips selected nodes
   * so the selection style stays visible; TOC hover passes everything.
   */
  shouldApplyTo?: (element: HTMLElement) => boolean;
  /**
   * Side effect to run once after the group is classed. TOC uses this to
   * write the `--toc-gap-below` custom property; SDT has nothing to add.
   */
  onApply?: (elements: HTMLElement[]) => void;
  /**
   * Inverse of {@link onApply}. Called once per element while clearing so
   * the side effect (e.g. inline style) can be undone.
   */
  onClear?: (element: HTMLElement) => void;
}

/**
 * Coordinator for "hover an entry, highlight every sibling that shares an id"
 * behavior. One instance per group concept (SDT, TOC, ...).
 *
 * The coordinator owns the cached {id, elements} pair and exposes mouseover/
 * mouseout listeners plus a {@link reapply} hook for after-paint restoration
 * — the painter rebuilds DOM and any hover class added at mouseover time is
 * lost otherwise.
 */
export class HoverGroupCoordinator {
  #spec: HoverGroupSpec;
  #current: { id: string; elements: HTMLElement[] } | null = null;

  constructor(spec: HoverGroupSpec) {
    this.#spec = spec;
  }

  readonly handleMouseEnter = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    const entry = target?.closest?.(this.#spec.entrySelector) as HTMLElement | null;
    if (!entry) return;

    const id = this.#spec.getId(entry);
    if (!id) return;

    this.#set(id);
  };

  readonly handleMouseLeave = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    const entry = target?.closest?.(this.#spec.entrySelector) as HTMLElement | null;
    if (!entry) return;

    const id = this.#spec.getId(entry);
    if (!id) return;

    // Crossing between two fragments of the same group should not flicker the
    // hover state — the pointer is still effectively inside the group.
    const relatedTarget = event.relatedTarget as HTMLElement | null;
    if (relatedTarget) {
      const nextEntry = relatedTarget.closest?.(this.#spec.entrySelector) as HTMLElement | null;
      if (nextEntry && this.#spec.getId(nextEntry) === id) return;
    }

    this.clear();
  };

  /** Re-apply the current group's hover state after a paint cycle. */
  reapply(): void {
    if (!this.#current) return;
    const { id } = this.#current;
    const elements = this.#spec.queryGroup(id);
    if (elements.length === 0) {
      this.#current = null;
      return;
    }
    this.#applyClass(elements);
    this.#spec.onApply?.(elements);
    this.#current = { id, elements };
  }

  /** Remove the hover class (and any side effects) from the current group. */
  clear(): void {
    if (!this.#current) return;
    for (const element of this.#current.elements) {
      element.classList.remove(this.#spec.hoverClass);
      this.#spec.onClear?.(element);
    }
    this.#current = null;
  }

  #set(id: string): void {
    if (this.#current?.id === id) return;
    this.clear();

    const elements = this.#spec.queryGroup(id);
    if (elements.length === 0) return;

    this.#applyClass(elements);
    this.#spec.onApply?.(elements);
    this.#current = { id, elements };
  }

  #applyClass(elements: HTMLElement[]): void {
    const filter = this.#spec.shouldApplyTo;
    for (const element of elements) {
      if (filter && !filter(element)) continue;
      element.classList.add(this.#spec.hoverClass);
    }
  }
}
