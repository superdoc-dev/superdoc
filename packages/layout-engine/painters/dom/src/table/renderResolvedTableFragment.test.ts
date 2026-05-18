import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DrawingBlock,
  Line,
  ParagraphBlock,
  ResolvedTableItem,
  TableBlock,
  TableFragment,
  TableMeasure,
} from '@superdoc/contracts';
import type { FragmentRenderContext } from '../renderer.js';
import { renderDrawingContent } from '../drawings/renderDrawingContent.js';
import { renderResolvedTableFragment } from './renderResolvedTableFragment.js';
import { renderTableFragment } from './renderTableFragment.js';

vi.mock('./renderTableFragment.js', () => ({
  renderTableFragment: vi.fn(),
}));

vi.mock('../drawings/renderDrawingContent.js', () => ({
  renderDrawingContent: vi.fn(),
}));

const context: FragmentRenderContext = {
  pageNumber: 2,
  totalPages: 4,
  section: 'body',
  pageIndex: 1,
};

const fragment: TableFragment = {
  kind: 'table',
  blockId: 'table-1',
  fromRow: 0,
  toRow: 1,
  x: 10,
  y: 20,
  width: 120,
  height: 30,
};

const block: TableBlock = {
  kind: 'table',
  id: 'table-1',
  rows: [{ id: 'row-1', cells: [{ id: 'cell-1', blocks: [], attrs: {} }], attrs: {} }],
};

const measure: TableMeasure = {
  kind: 'table',
  rows: [{ height: 30, cells: [{ width: 120, height: 30, gridColumnStart: 0, blocks: [] }] }],
  columnWidths: [120],
  totalWidth: 120,
  totalHeight: 30,
};

const resolvedItem: ResolvedTableItem = {
  kind: 'fragment',
  fragmentKind: 'table',
  id: 'table:table-1:0:1',
  pageIndex: 1,
  x: 11,
  y: 22,
  width: 130,
  height: 31,
  blockId: 'table-1',
  fragment,
  fragmentIndex: 0,
  block,
  measure,
  cellSpacingPx: 0,
  effectiveColumnWidths: [120],
};

const line: Line = {
  fromRun: 0,
  fromChar: 0,
  toRun: 0,
  toChar: 5,
  width: 30,
  ascent: 10,
  descent: 4,
  lineHeight: 16,
};

function createDeps(overrides: Partial<Parameters<typeof renderResolvedTableFragment>[0]> = {}) {
  const doc = document.implementation.createHTMLDocument();
  return {
    doc,
    fragment,
    context,
    resolvedItem,
    renderLine: vi.fn(() => doc.createElement('span')),
    capturePaintSnapshotLine: vi.fn(),
    applyFragmentFrame: vi.fn(),
    applyResolvedFragmentFrame: vi.fn(),
    createErrorPlaceholder: vi.fn((blockId: string, error: unknown) => {
      const el = doc.createElement('div');
      el.className = 'render-error-placeholder';
      el.textContent = `[Render Error: ${blockId}]`;
      if (error instanceof Error) el.title = error.message;
      return el;
    }),
    ...overrides,
  };
}

describe('renderResolvedTableFragment', () => {
  beforeEach(() => {
    vi.mocked(renderTableFragment).mockReset();
    vi.mocked(renderDrawingContent).mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the renderer error placeholder when resolved table data is missing', () => {
    const deps = createDeps({ resolvedItem: undefined });
    const el = renderResolvedTableFragment(deps);

    expect(renderTableFragment).not.toHaveBeenCalled();
    expect(deps.createErrorPlaceholder).toHaveBeenCalledTimes(1);
    expect(el.textContent).toBe('[Render Error: table-1]');
    expect(el.title).toContain('missing resolved table item');
  });

  it('skips table-cell final-line justification unless the paragraph ends with a line break', () => {
    vi.mocked(renderTableFragment).mockImplementation((deps) => {
      const paragraph: ParagraphBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: 'value' }],
      };
      deps.renderLine(paragraph, line, context, 0, true);

      const paragraphWithBreak: ParagraphBlock = {
        kind: 'paragraph',
        id: 'p2',
        runs: [{ text: 'value' }, { kind: 'lineBreak' } as ParagraphBlock['runs'][number]],
      };
      deps.renderLine(paragraphWithBreak, line, context, 0, true);
      return deps.doc.createElement('div');
    });
    const deps = createDeps();

    renderResolvedTableFragment(deps);

    expect(deps.renderLine).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      line,
      context,
      undefined,
      0,
      true,
      expect.any(Array),
      undefined,
    );
    expect(deps.renderLine).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      line,
      context,
      undefined,
      0,
      false,
      expect.any(Array),
      undefined,
    );
  });

  it('reuses expanded runs for repeated lines from the same paragraph block', () => {
    vi.mocked(renderTableFragment).mockImplementation((deps) => {
      const paragraph: ParagraphBlock = {
        kind: 'paragraph',
        id: 'p-cache',
        runs: [{ text: 'first\nsecond' }],
      };
      deps.renderLine(paragraph, line, context, 0, false);
      deps.renderLine(paragraph, line, context, 1, true);
      return deps.doc.createElement('div');
    });
    const deps = createDeps();

    renderResolvedTableFragment(deps);

    expect(deps.renderLine.mock.calls[0]![6]).toBe(deps.renderLine.mock.calls[1]![6]);
  });

  it('passes table-cell drawing content the current context and keeps image hyperlink wrapping', () => {
    vi.mocked(renderTableFragment).mockImplementation((deps) => {
      const drawingBlock: DrawingBlock = {
        kind: 'drawing',
        id: 'drawing-1',
        drawingKind: 'image',
        src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
        hyperlink: { url: 'https://example.com' },
      } as DrawingBlock;
      return deps.renderDrawingContent!(drawingBlock);
    });
    vi.mocked(renderDrawingContent).mockImplementation((params) => {
      const img = params.doc.createElement('img');
      return params.buildImageHyperlinkAnchor(img, { url: 'https://example.com' }, 'block');
    });

    const el = renderResolvedTableFragment(createDeps());

    expect(renderDrawingContent).toHaveBeenCalledWith(expect.objectContaining({ context }));
    expect(el.tagName).toBe('A');
    expect(el.getAttribute('href')).toBe('https://example.com');
    expect(el.classList.contains('superdoc-link')).toBe(true);
  });

  it('re-applies SDT width override after resolved frame positioning', () => {
    vi.mocked(renderTableFragment).mockImplementation((deps) => deps.doc.createElement('div'));
    const deps = createDeps({
      sdtBoundary: { widthOverride: 555 },
      applyResolvedFragmentFrame: vi.fn((el) => {
        el.style.width = '130px';
      }),
    });

    const el = renderResolvedTableFragment(deps);

    expect(deps.applyResolvedFragmentFrame).toHaveBeenCalledTimes(1);
    expect(el.style.width).toBe('555px');
  });
});
