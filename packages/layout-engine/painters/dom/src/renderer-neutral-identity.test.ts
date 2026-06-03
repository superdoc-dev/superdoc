/**
 * Painter-side coverage for the editor-neutral layout identity dataset
 * (prep-001).
 *
 * Asserts that the painter stamps:
 *  - `data-layout-boundary-schema` on each page
 *  - `data-layout-fragment-id`, `data-layout-block-ref`, `data-layout-story`
 *    on each rendered fragment wrapper
 *
 * And that the legacy `data-pm-start` / `data-pm-end` / `data-block-id`
 * attributes remain available alongside the new ones (additive only).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  LAYOUT_BOUNDARY_SCHEMA,
  type FlowBlock,
  type HeaderFooterLayout,
  type Layout,
  type Measure,
  type ResolvedLayout,
} from '@superdoc/contracts';
import { resolveHeaderFooterLayout, resolveLayout } from '@superdoc/layout-resolved';
import { createDomPainter, type DomPainterInput, type PaintSnapshot } from './index.js';

const block: FlowBlock = {
  kind: 'paragraph',
  id: 'block-1',
  runs: [
    { text: 'Hello ', fontFamily: 'Arial', fontSize: 16, pmStart: 1, pmEnd: 7 },
    { text: 'world', fontFamily: 'Arial', fontSize: 16, pmStart: 7, pmEnd: 12 },
  ],
};

const measure: Measure = {
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 1,
      toChar: 5,
      width: 120,
      ascent: 12,
      descent: 4,
      lineHeight: 20,
    },
  ],
  totalHeight: 20,
};

const layout: Layout = {
  pageSize: { w: 400, h: 500 },
  layoutEpoch: 42,
  pages: [
    {
      number: 1,
      fragments: [
        {
          kind: 'para',
          blockId: 'block-1',
          fromLine: 0,
          toLine: 1,
          x: 30,
          y: 40,
          width: 300,
          pmStart: 1,
          pmEnd: 12,
        },
      ],
    },
  ],
};

const paintLayout = (mount: HTMLElement, layoutInput: Layout = layout): void => {
  const resolved: ResolvedLayout = resolveLayout({
    layout: layoutInput,
    flowMode: 'paginated',
    blocks: [block],
    measures: [measure],
  });
  const painter = createDomPainter({});
  const input: DomPainterInput = { resolvedLayout: resolved };
  painter.paint(input, mount);
};

describe('DomPainter — editor-neutral layout identity (prep-001)', () => {
  let mount: HTMLElement;

  beforeEach(() => {
    mount = document.createElement('div');
  });

  it('stamps the layout boundary schema on each page', () => {
    paintLayout(mount);
    const page = mount.querySelector('.superdoc-page') as HTMLElement;
    expect(page).toBeTruthy();
    expect(page.dataset.layoutBoundarySchema).toBe(LAYOUT_BOUNDARY_SCHEMA);
  });

  it('stamps neutral identity attributes on each rendered fragment', () => {
    paintLayout(mount);
    const fragment = mount.querySelector('.superdoc-fragment') as HTMLElement;
    expect(fragment).toBeTruthy();

    // Neutral identity (additive).
    expect(fragment.dataset.layoutFragmentId).toBeTruthy();
    expect(fragment.dataset.layoutBlockRef).toBe('block-1');
    expect(fragment.dataset.layoutStory).toBe('body');

    // Legacy PM-shaped surface remains.
    expect(fragment.dataset.blockId).toBe('block-1');
    expect(fragment.dataset.pmStart).toBe('1');
    expect(fragment.dataset.pmEnd).toBe('12');
  });

  it('emits the same fragment id across repaints when the producer state is unchanged', () => {
    paintLayout(mount);
    const firstId = (mount.querySelector('.superdoc-fragment') as HTMLElement).dataset.layoutFragmentId;
    // Repaint into a fresh mount with the same layout and expect a stable id.
    const mount2 = document.createElement('div');
    paintLayout(mount2);
    const secondId = (mount2.querySelector('.superdoc-fragment') as HTMLElement).dataset.layoutFragmentId;
    expect(secondId).toBe(firstId);
  });

  it('carries neutral fragment identity into paint snapshots', () => {
    let snapshot: PaintSnapshot | null = null;
    const resolved: ResolvedLayout = resolveLayout({
      layout,
      flowMode: 'paginated',
      blocks: [block],
      measures: [measure],
    });
    const painter = createDomPainter({
      onPaintSnapshot: (nextSnapshot) => {
        snapshot = nextSnapshot;
      },
    });

    painter.paint({ resolvedLayout: resolved }, mount);

    expect(snapshot?.pages[0]?.lines[0]?.layoutSourceIdentity?.blockRef).toBe('block-1');
    expect(snapshot?.pages[0]?.lines[0]?.layoutSourceIdentity?.fragmentId).toBe(
      (mount.querySelector('.superdoc-fragment') as HTMLElement).dataset.layoutFragmentId,
    );
  });

  it('uses the decoration story when stamping header/footer fragment identity', () => {
    const headerLayout: HeaderFooterLayout = {
      height: 80,
      pages: [{ number: 1, fragments: layout.pages[0].fragments }],
    };
    const resolvedHeader = resolveHeaderFooterLayout(headerLayout, [block], [measure]);
    const resolvedBody = resolveLayout({
      layout: { pageSize: { w: 400, h: 500 }, pages: [{ number: 1, fragments: [] }] },
      flowMode: 'paginated',
      blocks: [],
      measures: [],
    });
    const painter = createDomPainter({
      headerProvider: () => ({
        fragments: headerLayout.pages[0].fragments,
        items: resolvedHeader.pages[0].items,
        height: 80,
        offset: 0,
        headerFooterRefId: 'rIdHeader1',
        sectionType: 'default',
      }),
    });

    painter.paint({ resolvedLayout: resolvedBody }, mount);

    const headerFragment = mount.querySelector('.superdoc-page-header .superdoc-fragment') as HTMLElement;
    expect(headerFragment.dataset.layoutStory).toBe('header:rIdHeader1');
    expect(headerFragment.dataset.layoutFragmentId).toContain('header:rIdHeader1');
  });
});
