import type { Page } from '@playwright/test';

/** Insert a block SDT with a paragraph of text via the editor command. */
export async function insertBlockSdt(page: Page, alias: string, text: string): Promise<void> {
  await page.evaluate(
    ({ alias, text }) => {
      (window as any).editor.commands.insertStructuredContentBlock({
        attrs: { alias },
        html: `<p>${text}</p>`,
      });
    },
    { alias, text },
  );
}

/** Insert an inline SDT with text via the editor command. */
export async function insertInlineSdt(page: Page, alias: string, text: string): Promise<void> {
  await page.evaluate(
    ({ alias, text }) => {
      (window as any).editor.commands.insertStructuredContentInline({
        attrs: { alias },
        text,
      });
    },
    { alias, text },
  );
}

/** Get the bounding box center of an element. */
export async function getCenter(page: Page, selector: string): Promise<{ x: number; y: number }> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Element not found: ${sel}`);
    const rect = el.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, selector);
}

/** Check whether an element has a given CSS class. */
export async function hasClass(page: Page, selector: string, className: string): Promise<boolean> {
  return page.evaluate(
    ({ sel, cls }) => {
      const el = document.querySelector(sel);
      return el ? el.classList.contains(cls) : false;
    },
    { sel: selector, cls: className },
  );
}

/** Check whether the PM selection targets or is inside a structuredContentBlock node. */
export async function isSelectionOnBlockSdt(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const { state } = (window as any).editor;
    const { selection } = state;
    if (selection.node?.type.name === 'structuredContentBlock') return true;
    const $pos = selection.$from;
    for (let d = $pos.depth; d > 0; d--) {
      if ($pos.node(d).type.name === 'structuredContentBlock') return true;
    }
    return false;
  });
}

/**
 * Deselect the SDT by placing the cursor inside the first text node
 * that contains `anchorText`. Falls back to position 1 if not found.
 */
export async function deselectSdt(page: Page, anchorText = 'Before SDT'): Promise<void> {
  await page.evaluate((text) => {
    const editor = (window as any).editor;
    const doc = editor.state.doc;
    let pos = 1; // safe fallback: start of first text node

    doc.descendants((node: any, nodePos: number) => {
      if (pos > 1) return false;
      if (node.isText && node.text?.includes(text)) {
        pos = nodePos + 1;
        return false;
      }
      return true;
    });

    editor.commands.setTextSelection({ from: pos, to: pos });
  }, anchorText);
}

// ---------------------------------------------------------------------------
// CRUD helpers for structured content tests
// ---------------------------------------------------------------------------

interface SdtAttrs {
  id?: string;
  alias?: string;
  group?: string;
  tag?: string;
  lockMode?: string;
  [key: string]: unknown;
}

/** Insert a block SDT with full attrs + HTML content. */
export async function insertBlockSdtWithHtml(page: Page, attrs: SdtAttrs, html: string): Promise<void> {
  await page.evaluate(
    ({ attrs, html }) => {
      (window as any).editor.commands.insertStructuredContentBlock({ attrs, html });
    },
    { attrs, html },
  );
}

/** Insert an inline SDT with full attrs (id, alias, group) and optional text. */
export async function insertInlineSdtWithId(page: Page, attrs: SdtAttrs, text?: string): Promise<void> {
  await page.evaluate(
    ({ attrs, text }) => {
      (window as any).editor.commands.insertStructuredContentInline({ attrs, text });
    },
    { attrs, text },
  );
}

/** Update a structured content field by its unique ID. */
export async function updateSdtById(page: Page, id: string, options: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    ({ id, options }) => {
      (window as any).editor.commands.updateStructuredContentById(id, options);
    },
    { id, options },
  );
}

/** Update all structured content fields that share a group identifier. */
export async function updateSdtByGroup(page: Page, group: string, options: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    ({ group, options }) => {
      (window as any).editor.commands.updateStructuredContentByGroup(group, options);
    },
    { group, options },
  );
}

/** Delete structured content by ID (single or array). */
export async function deleteSdtById(page: Page, idOrIds: string | string[]): Promise<void> {
  await page.evaluate((ids) => {
    (window as any).editor.commands.deleteStructuredContentById(ids);
  }, idOrIds);
}

/** Delete the structured content at the current selection, preserving its content. */
export async function deleteSdtAtSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).editor.commands.deleteStructuredContentAtSelection();
  });
}

/** Read the data-id attribute from the first DOM element matching [data-alias="<alias>"]. */
export async function getSdtIdByAlias(page: Page, alias: string): Promise<string> {
  return page.evaluate((alias) => {
    const el = document.querySelector(`[data-alias="${alias}"]`);
    if (!el) throw new Error(`No SDT element found with alias "${alias}"`);
    return (el as HTMLElement).dataset.id ?? '';
  }, alias);
}

/** Get the data-id by reading ProseMirror state (more reliable than DOM). */
export async function getSdtIdFromState(page: Page, alias: string): Promise<string> {
  return page.evaluate((alias) => {
    const editor = (window as any).editor;
    let foundId: string | null = null;
    editor.state.doc.descendants((node: any) => {
      if (foundId) return false;
      if (
        (node.type.name === 'structuredContent' || node.type.name === 'structuredContentBlock') &&
        node.attrs.alias === alias
      ) {
        foundId = String(node.attrs.id);
        return false;
      }
      return true;
    });
    if (!foundId) throw new Error(`No SDT node found with alias "${alias}"`);
    return foundId;
  }, alias);
}

// ---------------------------------------------------------------------------
// Inline SDT state helpers used by keyboard/parity behavior tests. Locate an
// inline SDT and snapshot selection/control state so specs don't each
// reimplement the PM scan.
// ---------------------------------------------------------------------------

export interface InlineSdtRange {
  id: string;
  pos: number;
  start: number;
  end: number;
  nodeEnd: number;
  content: string;
}

/** Return the first inline `structuredContent` node (or the one with `sdtId`) and its PM range. */
export async function getInlineSdtRange(page: Page, sdtId?: string): Promise<InlineSdtRange | null> {
  return page.evaluate((sdtId) => {
    const { state } = (window as any).editor;
    let r: InlineSdtRange | null = null;
    state.doc.descendants((node: any, pos: number) => {
      if (r) return false;
      if (node.type.name === 'structuredContent' && (sdtId == null || String(node.attrs?.id) === sdtId)) {
        r = {
          id: String(node.attrs?.id),
          pos,
          start: pos + 1,
          end: pos + node.nodeSize - 1,
          nodeEnd: pos + node.nodeSize,
          content: node.textContent,
        };
        return false;
      }
      return true;
    });
    return r;
  }, sdtId);
}

export interface InlineSdtSnapshot {
  from: number;
  to: number;
  empty: boolean;
  nodeType: string | null;
  sdtExists: boolean;
  sdtContent: string | null;
  sdtPos: number;
  docText: string;
  docSize: number;
  paragraphCount: number;
}

/** Snapshot the current selection plus the existence/content/position of inline SDT `sdtId`. */
export async function getInlineSdtSnapshot(page: Page, sdtId: string): Promise<InlineSdtSnapshot> {
  return page.evaluate((sdtId) => {
    const { state } = (window as any).editor;
    const sel = state.selection;
    let sdtExists = false;
    let sdtContent: string | null = null;
    let sdtPos = -1;
    state.doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'structuredContent' && String(node.attrs?.id) === sdtId) {
        sdtExists = true;
        sdtContent = node.textContent;
        sdtPos = pos;
        return false;
      }
      return true;
    });
    return {
      from: sel.from,
      to: sel.to,
      empty: sel.empty,
      nodeType: sel.node?.type?.name ?? null,
      sdtExists,
      sdtContent,
      sdtPos,
      docText: state.doc.textContent,
      docSize: state.doc.content.size,
      paragraphCount: state.doc.content.childCount,
    };
  }, sdtId);
}

// ---------------------------------------------------------------------------
// Parity axis helpers. Pure functions that derive a Word-parity-contract axis
// value from a snapshot (+ the SDT range), using the same vocabulary as the
// word-api contracts (see parity-contracts/TRANSLATION.md). Keeping them as
// pure compute functions makes them unit-testable without a browser and makes
// each parity spec a one-liner: expect(selectionScope(snap, sdt)).toBe(...).
// ---------------------------------------------------------------------------

export type SelectionScope =
  | 'collapsed'
  | 'cc-content'
  | 'whole-content-control'
  | 'within-cc'
  | 'cc-and-beyond'
  | 'whole-document'
  | 'outside-cc';

/** Classify the current selection relative to the SDT range (current, post-edit). */
export function selectionScope(snap: InlineSdtSnapshot, range: InlineSdtRange): SelectionScope {
  if (snap.empty) return 'collapsed';
  if (snap.from <= 1 && snap.to >= snap.docSize - 1) return 'whole-document';
  if (snap.from === range.start && snap.to === range.end) return 'cc-content';
  if (snap.from === range.pos && snap.to === range.nodeEnd) return 'whole-content-control';
  if (snap.from >= range.start && snap.to <= range.end) return 'within-cc';
  if (snap.from < range.end && snap.to > range.start) return 'cc-and-beyond';
  return 'outside-cc';
}

export type ContentControlLifecycle = 'preserved' | 'emptied' | 'deleted' | 'created' | 'none';

/** Classify what happened to the SDT wrapper between two snapshots. */
export function contentControlLifecycle(before: InlineSdtSnapshot, after: InlineSdtSnapshot): ContentControlLifecycle {
  if (before.sdtExists && !after.sdtExists) return 'deleted';
  if (!before.sdtExists && after.sdtExists) return 'created';
  if (before.sdtExists && after.sdtExists) {
    const wasNonEmpty = !!before.sdtContent;
    const nowEmpty = !after.sdtContent;
    if (wasNonEmpty && nowEmpty) return 'emptied';
    return 'preserved';
  }
  return 'none';
}

export type CaretLocation = 'inside-cc' | 'before-cc' | 'after-cc' | 'outside-cc';

/** Collapsed-caret position relative to the SDT range; null when the selection is a range. */
export function caretLocation(snap: InlineSdtSnapshot, range: InlineSdtRange): CaretLocation | null {
  if (!snap.empty) return null;
  if (snap.from >= range.start && snap.from <= range.end) return 'inside-cc';
  if (snap.from <= range.pos) return 'before-cc';
  if (snap.from >= range.nodeEnd) return 'after-cc';
  return 'outside-cc';
}

export type BodyMutation = 'none' | 'text-changed' | 'structure-changed';

/**
 * Whole-document body text / paragraph change between two snapshots. Compares
 * the whole `doc.textContent`, so it INCLUDES changes to the SDT's own content
 * (e.g. emptying it reads as text-changed). It excludes only wrapper lifecycle
 * (existence / empty-state) - that is the contentControlLifecycle axis.
 */
export function bodyMutation(before: InlineSdtSnapshot, after: InlineSdtSnapshot): BodyMutation {
  if (before.paragraphCount !== after.paragraphCount) return 'structure-changed';
  if (before.docText !== after.docText) return 'text-changed';
  return 'none';
}
