import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowBlock, HeaderFooterLayout, Layout, Measure, ParaFragment } from '@superdoc/contracts';
import type { HeaderFooterLayoutResult } from '@superdoc/layout-bridge';

import type { Editor } from '../../Editor.js';
import {
  HeaderFooterSessionManager,
  type SessionManagerDependencies,
} from '../header-footer/HeaderFooterSessionManager.js';

/*
 * These tests exercise the alignment contract between the painter's
 * decoration fragments and their resolved items.
 *
 * Contract: payload.items[i] corresponds to payload.fragments[i]. The producer
 * guarantees this by construction (both come from the same HeaderFooterLayoutResult).
 * When the contract is violated, a runtime guard warns and drops items.
 *
 * Covered paths:
 *   1. rId-based (multi-section) — sister path to the variant-based one already
 *      covered in HeaderFooterSessionManager.test.ts.
 *   2. Length-mismatch guard — proves that the last-line safety net fires when
 *      resolved/fragment counts diverge.
 */

type LayoutPerRIdFn = (
  input: unknown,
  layout: unknown,
  sections: unknown,
  handles: { headerLayoutsByRId: Map<string, HeaderFooterLayoutResult> },
) => Promise<void>;

const { mockInitHeaderFooterRegistry, mockLayoutPerRIdHeaderFooters } = vi.hoisted(() => ({
  mockInitHeaderFooterRegistry: vi.fn(),
  mockLayoutPerRIdHeaderFooters: vi.fn<LayoutPerRIdFn>(),
}));

vi.mock('../../header-footer/HeaderFooterRegistryInit.js', () => ({
  initHeaderFooterRegistry: mockInitHeaderFooterRegistry,
}));

vi.mock('../../header-footer/HeaderFooterPerRidLayout.js', () => ({
  layoutPerRIdHeaderFooters: mockLayoutPerRIdHeaderFooters,
}));

// Import AFTER mocks so the module resolves to our mocked versions.
import * as layoutResolved from '@superdoc/layout-resolved';

function createMainEditorStub(): Editor {
  return { isEditable: true, view: { focus: vi.fn() } } as unknown as Editor;
}

function buildHeaderResult(blockId: string): HeaderFooterLayoutResult {
  const paraFragment: ParaFragment = {
    kind: 'para',
    blockId,
    fromLine: 0,
    toLine: 1,
    x: 72,
    y: 10,
    width: 468,
  };
  const layout: HeaderFooterLayout = {
    height: 50,
    pages: [{ number: 1, fragments: [paraFragment] }],
  };
  const blocks: FlowBlock[] = [{ kind: 'paragraph', id: blockId, runs: [] }];
  const measures: Measure[] = [
    {
      kind: 'paragraph',
      lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 5, width: 100, ascent: 10, descent: 3, lineHeight: 18 }],
      totalHeight: 18,
    },
  ];
  return { kind: 'header', type: 'default', layout, blocks, measures };
}

function buildDeps(): SessionManagerDependencies {
  return {
    getLayoutOptions: vi.fn(() => ({})),
    getPageElement: vi.fn(() => null),
    scrollPageIntoView: vi.fn(),
    waitForPageMount: vi.fn(async () => true),
    convertPageLocalToOverlayCoords: vi.fn(() => ({ x: 0, y: 0 })),
    isViewLocked: vi.fn(() => false),
    getBodyPageHeight: vi.fn(() => 800),
    notifyInputBridgeTargetChanged: vi.fn(),
    scheduleRerender: vi.fn(),
    setPendingDocChange: vi.fn(),
    getBodyPageCount: vi.fn(() => 1),
  };
}

function buildLayoutWithRId(rId: string): Layout {
  return {
    version: 1,
    flowMode: 'paginated',
    pageGap: 0,
    pageSize: { w: 612, h: 792 },
    pages: [
      {
        number: 1,
        margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
        sectionIndex: 0,
        sectionRefs: { headerRefs: { default: rId } },
      } as never,
    ],
  } as unknown as Layout;
}

function buildLayoutForVariant(): Layout {
  return {
    version: 1,
    flowMode: 'paginated',
    pageGap: 0,
    pageSize: { w: 612, h: 792 },
    pages: [{ number: 1, margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 } } as never],
  } as unknown as Layout;
}

describe('HeaderFooterSessionManager — decoration item alignment', () => {
  let manager: HeaderFooterSessionManager;
  let painterHost: HTMLElement;
  let visibleHost: HTMLElement;
  let selectionOverlay: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLayoutPerRIdHeaderFooters.mockImplementation(async () => {
      /* default no-op; specific tests override via mockImplementationOnce */
    });

    painterHost = document.createElement('div');
    visibleHost = document.createElement('div');
    selectionOverlay = document.createElement('div');
    document.body.appendChild(painterHost);
    document.body.appendChild(visibleHost);
    document.body.appendChild(selectionOverlay);
  });

  afterEach(() => {
    manager?.destroy();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function createManager(): HeaderFooterSessionManager {
    const m = new HeaderFooterSessionManager({
      painterHost,
      visibleHost,
      selectionOverlay,
      editor: createMainEditorStub(),
      defaultPageSize: { w: 612, h: 792 },
      defaultMargins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
    });
    m.setDependencies(buildDeps());
    m.headerFooterIdentifier = {
      headerIds: { default: 'rId-header-default', first: null, even: null, odd: null },
      footerIds: { default: null, first: null, even: null, odd: null },
      titlePg: false,
      alternateHeaders: false,
    };
    return m;
  }

  it('rId-based path: delivers items aligned 1:1 with fragments', async () => {
    // Arrange — seed headerLayoutsByRId via the mocked layoutPerRIdHeaderFooters;
    // the real resolveHeaderFooterLayout runs downstream and populates the resolved map.
    const rId = 'rId-header-default';
    mockLayoutPerRIdHeaderFooters.mockImplementationOnce(async (_input, _layout, _sections, handles) => {
      (handles as { headerLayoutsByRId: Map<string, HeaderFooterLayoutResult> }).headerLayoutsByRId.set(
        rId,
        buildHeaderResult('p1'),
      );
    });
    manager = createManager();
    const layout = buildLayoutWithRId(rId);
    await manager.layoutPerRId({} as never, layout, [] as never);

    // Act
    const provider = manager.createDecorationProvider('header', layout);
    const payload = provider!(1, layout.pages[0]!.margins, layout.pages[0]);

    // Assert — resolved items arrive, same length as fragments, same blockId
    expect(payload).not.toBeNull();
    expect(payload!.fragments).toHaveLength(1);
    expect(payload!.items).toBeDefined();
    expect(payload!.items!.length).toBe(payload!.fragments.length);
    const firstItem = payload!.items![0]!;
    // All non-group resolved paint items carry blockId; narrow by kind.
    if (firstItem.kind !== 'fragment') throw new Error(`expected fragment item, got ${firstItem.kind}`);
    expect(firstItem.blockId).toBe('p1');
  });

  it('length-mismatch guard: drops items and warns when resolved length diverges', () => {
    // Arrange — stub the resolver to produce TWO items for ONE fragment (a divergence
    // that can only happen if the resolver itself is buggy or the upstream data drifts).
    const divergentLayout = {
      height: 50,
      pages: [
        {
          number: 1,
          items: [
            { kind: 'fragment', fragmentKind: 'para', blockId: 'p1', id: 'a', pageIndex: 0 } as never,
            { kind: 'fragment', fragmentKind: 'para', blockId: 'p1', id: 'b', pageIndex: 0 } as never,
          ],
        },
      ],
    };
    const resolverSpy = vi.spyOn(layoutResolved, 'resolveHeaderFooterLayout').mockReturnValue(divergentLayout as never);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    manager = createManager();
    manager.setLayoutResults([buildHeaderResult('p1')], null);

    // Act
    const layout = buildLayoutForVariant();
    const payload = manager.createDecorationProvider('header', layout)!(1, layout.pages[0]!.margins, layout.pages[0]);

    // Assert — items dropped, fragments unchanged, guard warning emitted once
    expect(payload).not.toBeNull();
    expect(payload!.fragments).toHaveLength(1);
    expect(payload!.items).toBeUndefined();
    const guardCalls = warnSpy.mock.calls.filter((args) => String(args[0]).includes('Resolved items length'));
    expect(guardCalls).toHaveLength(1);
    expect(String(guardCalls[0][0])).toContain('does not match fragments length');

    resolverSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
