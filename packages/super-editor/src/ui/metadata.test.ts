/**
 * Focused tests for the `ui.metadata` handle (SD-3204).
 *
 * The handle's job is to hide the metadata-id → SDT node-id bridge
 * that custom UI would otherwise compose from `useSuperDocContentControls`
 * + a tag→nodeId map + `ui.contentControls.getRect`. These tests
 * exercise that bridge directly:
 *
 *  - getRect({ id }) maps metadata id (= w:tag) to the SDT's content-
 *    control id and delegates to ui.viewport.getRect.
 *  - getRect with empty id returns invalid-target.
 *  - getRect with an id that has no matching cc.items entry returns
 *    unresolved (the bridge boundary the bot review on SD-3208
 *    explicitly called out).
 *  - scrollIntoView({ id }) resolves metadata id → SelectionTarget,
 *    converts to TextTarget, and delegates to ui.viewport.scrollIntoView.
 *  - scrollIntoView with unknown id / nodeEdge endpoint returns
 *    { success: false } rather than scrolling to an approximation.
 */
import { describe, expect, it, vi } from 'vitest';

import { createSuperDocUI } from './create-super-doc-ui.js';
import type { SuperDocLike } from './types.js';

type ContentControlItem = {
  nodeType: 'sdt';
  kind: 'inline' | 'block';
  id: string;
  controlType: string;
  lockMode: string;
  properties: Record<string, unknown>;
  target: { kind: 'inline' | 'block'; nodeType: 'sdt'; nodeId: string };
};

function makeItem(ccId: string, metadataTag: string): ContentControlItem {
  return {
    nodeType: 'sdt',
    kind: 'inline',
    id: ccId,
    controlType: 'richText',
    lockMode: 'unlocked',
    properties: { tag: metadataTag },
    target: { kind: 'inline', nodeType: 'sdt', nodeId: ccId },
  };
}

function makeStub(opts: {
  items?: ContentControlItem[];
  /**
   * Per-id metadata payloads. `null` means "no payload entry" (returned
   * by `metadata.get` for ids that aren't anchored metadata, e.g. foreign
   * inline SDTs imported from Word). Defaults to a present payload for
   * every id mentioned in `resolveByMetadataId`, so existing scrollIntoView
   * tests don't need to spell it out.
   */
  payloadByMetadataId?: Record<string, unknown | null>;
  resolveByMetadataId?: Record<
    string,
    {
      id: string;
      target: {
        kind: 'selection';
        start: { kind: 'text' | 'nodeEdge'; blockId?: string; offset?: number; [k: string]: unknown };
        end: { kind: 'text' | 'nodeEdge'; blockId?: string; offset?: number; [k: string]: unknown };
      };
    } | null
  >;
}) {
  const items = opts.items ?? [];
  const resolveByMetadataId = opts.resolveByMetadataId ?? {};
  // Default payload map: every `properties.tag` in cc.items is treated as
  // a real metadata anchor (i.e. `metadata.get` returns a non-null payload).
  // The foreign-SDT test opts out by passing `payloadByMetadataId` with the
  // id mapped to `null`, simulating an imported DOCX whose SDT carries that
  // tag but has no customXml payload entry.
  const payloadByMetadataId =
    opts.payloadByMetadataId ??
    Object.fromEntries(
      items
        .map((item) => item.properties.tag)
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => [tag, { __seeded: true }]),
    );

  const editor = {
    on: vi.fn(),
    off: vi.fn(),
    state: {
      selection: { $anchor: { depth: 0, node: () => ({ type: { name: 'doc' } }) } },
    },
    doc: {
      selection: { current: vi.fn(() => ({ empty: true, target: null })) },
      contentControls: { list: vi.fn(() => ({ items, total: items.length })) },
      metadata: {
        get: vi.fn((input: { id: string }) => (input.id in payloadByMetadataId ? payloadByMetadataId[input.id] : null)),
        resolve: vi.fn((input: { id: string }) => resolveByMetadataId[input.id] ?? null),
      },
    },
  };

  const superdoc: SuperDocLike = {
    activeEditor: editor,
    config: { documentMode: 'editing' },
    on: vi.fn(),
    off: vi.fn(),
  };

  return { superdoc, editor };
}

describe('ui.metadata.getRect (SD-3204)', () => {
  it('maps metadata id (= w:tag) to cc node id and delegates to ui.viewport.getRect', () => {
    const { superdoc } = makeStub({
      items: [makeItem('sdt-7', 'meta-A')],
    });
    const ui = createSuperDocUI({ superdoc });

    const spy = vi.spyOn(ui.viewport, 'getRect');
    ui.metadata.getRect({ id: 'meta-A' });

    expect(spy).toHaveBeenCalledWith({
      target: { kind: 'entity', entityType: 'contentControl', entityId: 'sdt-7' },
    });

    ui.destroy();
  });

  it('returns invalid-target on empty id', () => {
    const { superdoc } = makeStub({ items: [] });
    const ui = createSuperDocUI({ superdoc });

    const spy = vi.spyOn(ui.viewport, 'getRect');
    const result = ui.metadata.getRect({ id: '' });

    expect(result).toEqual({ success: false, reason: 'invalid-target' });
    expect(spy).not.toHaveBeenCalled();

    ui.destroy();
  });

  it('returns unresolved when no cc.items entry has a matching properties.tag (bridge boundary)', () => {
    const { superdoc } = makeStub({
      items: [makeItem('sdt-7', 'meta-A')],
    });
    const ui = createSuperDocUI({ superdoc });

    const spy = vi.spyOn(ui.viewport, 'getRect');
    const result = ui.metadata.getRect({ id: 'meta-Z' });

    expect(result).toEqual({ success: false, reason: 'unresolved' });
    expect(spy).not.toHaveBeenCalled();

    ui.destroy();
  });

  it('returns unresolved when an SDT has the matching tag but no metadata payload entry (foreign control)', () => {
    // Imported DOCX with an inline SDT whose `w:tag === 'meta-A'` but no
    // customXml payload — could be a Word-authored content control that
    // happens to share an id with a metadata anchor. The UI handle must
    // not delegate to viewport.getRect for that control; if it did,
    // citation highlights / popovers would land on an unrelated form
    // field. The source-side fix to `editor.doc.metadata.resolve` plus
    // this UI-layer payload gate keep both surfaces consistent.
    const { superdoc } = makeStub({
      items: [makeItem('sdt-7', 'meta-A')],
      payloadByMetadataId: { 'meta-A': null },
    });
    const ui = createSuperDocUI({ superdoc });

    const spy = vi.spyOn(ui.viewport, 'getRect');
    const result = ui.metadata.getRect({ id: 'meta-A' });

    expect(result).toEqual({ success: false, reason: 'unresolved' });
    expect(spy).not.toHaveBeenCalled();

    ui.destroy();
  });
});

describe('ui.metadata.scrollIntoView (SD-3204)', () => {
  it('resolves metadata id and delegates to ui.viewport.scrollIntoView with a same-block TextTarget', async () => {
    const { superdoc, editor } = makeStub({
      items: [makeItem('sdt-7', 'meta-A')],
      resolveByMetadataId: {
        'meta-A': {
          id: 'meta-A',
          target: {
            kind: 'selection',
            start: { kind: 'text', blockId: 'p1', offset: 3 },
            end: { kind: 'text', blockId: 'p1', offset: 12 },
          },
        },
      },
    });
    const ui = createSuperDocUI({ superdoc });

    const spy = vi.spyOn(ui.viewport, 'scrollIntoView').mockResolvedValue({ success: true });
    const out = await ui.metadata.scrollIntoView({ id: 'meta-A', block: 'center', behavior: 'smooth' });

    expect(editor.doc.metadata.resolve).toHaveBeenCalledWith({ id: 'meta-A' });
    expect(spy).toHaveBeenCalledWith({
      target: {
        kind: 'text',
        segments: [{ blockId: 'p1', range: { start: 3, end: 12 } }],
      },
      block: 'center',
      behavior: 'smooth',
    });
    expect(out).toEqual({ success: true });

    ui.destroy();
  });

  it('returns { success: false } on unknown id without calling viewport.scrollIntoView', async () => {
    const { superdoc } = makeStub({
      items: [makeItem('sdt-7', 'meta-A')],
      resolveByMetadataId: { 'meta-A': null },
    });
    const ui = createSuperDocUI({ superdoc });

    const spy = vi.spyOn(ui.viewport, 'scrollIntoView');
    const out = await ui.metadata.scrollIntoView({ id: 'meta-A' });

    expect(out).toEqual({ success: false });
    expect(spy).not.toHaveBeenCalled();

    ui.destroy();
  });

  it('returns { success: false } when the SDT tag has no metadata payload (foreign control, same bridge as getRect)', async () => {
    const { superdoc } = makeStub({
      items: [makeItem('sdt-7', 'meta-A')],
      payloadByMetadataId: { 'meta-A': null },
      resolveByMetadataId: {
        'meta-A': {
          id: 'meta-A',
          target: {
            kind: 'selection',
            start: { kind: 'text', blockId: 'p1', offset: 0 },
            end: { kind: 'text', blockId: 'p1', offset: 5 },
          },
        },
      },
    });
    const ui = createSuperDocUI({ superdoc });

    const spy = vi.spyOn(ui.viewport, 'scrollIntoView');
    const out = await ui.metadata.scrollIntoView({ id: 'meta-A' });

    expect(out).toEqual({ success: false });
    expect(spy).not.toHaveBeenCalled();

    ui.destroy();
  });

  it('returns { success: false } when the SelectionTarget endpoint is a nodeEdge (no clean TextTarget shape)', async () => {
    const { superdoc } = makeStub({
      items: [makeItem('sdt-7', 'meta-A')],
      resolveByMetadataId: {
        'meta-A': {
          id: 'meta-A',
          target: {
            kind: 'selection',
            start: { kind: 'text', blockId: 'p1', offset: 0 },
            end: { kind: 'nodeEdge' },
          },
        },
      },
    });
    const ui = createSuperDocUI({ superdoc });

    const spy = vi.spyOn(ui.viewport, 'scrollIntoView');
    const out = await ui.metadata.scrollIntoView({ id: 'meta-A' });

    expect(out).toEqual({ success: false });
    expect(spy).not.toHaveBeenCalled();

    ui.destroy();
  });
});
