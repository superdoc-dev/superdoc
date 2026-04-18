import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PageNumber, TotalPageCount, AutoPageNumberNodeView } from './page-number.js';

describe('PageNumber commands', () => {
  it('addAutoPageNumber aborts when not in header/footer', () => {
    const commands = PageNumber.config.addCommands();
    const result = commands.addAutoPageNumber()({
      editor: { options: { isHeaderOrFooter: false } },
      state: { schema: {} },
    });

    expect(result).toBe(false);
  });

  it('addAutoPageNumber inserts node', () => {
    const commands = PageNumber.config.addCommands();
    const replaceSelectionWith = vi.fn();
    const setMeta = vi.fn();
    const pageNode = { type: 'page-number' };
    const schema = {
      nodes: { 'page-number': {} },
      nodeFromJSON: vi.fn().mockReturnValue(pageNode),
    };

    const tr = { replaceSelectionWith, setMeta };
    // setMeta returns tr for chaining
    setMeta.mockReturnValue(tr);

    const result = commands.addAutoPageNumber()({
      editor: { options: { isHeaderOrFooter: true } },
      tr,
      dispatch: vi.fn(),
      state: { schema },
    });

    expect(result).toBe(true);
    expect(schema.nodeFromJSON).toHaveBeenCalledWith({ type: 'page-number' });
    expect(replaceSelectionWith).toHaveBeenCalledWith(pageNode, false);
    expect(setMeta).toHaveBeenCalledWith('forceUpdatePagination', true);
  });

  it('addTotalPageCount inserts total pages when enabled', () => {
    const commands = TotalPageCount.config.addCommands();
    const replaceSelectionWith = vi.fn();
    const schema = {
      nodes: { 'total-page-number': {} },
      nodeFromJSON: vi.fn().mockImplementation((json) => json),
    };
    const editor = { options: { isHeaderOrFooter: true, totalPageCount: 7, parentEditor: { currentTotalPages: 7 } } };
    const dispatch = vi.fn();

    const result = commands.addTotalPageCount()({
      editor,
      tr: { replaceSelectionWith },
      dispatch,
      state: { schema },
    });

    expect(result).toBe(true);
    expect(schema.nodeFromJSON).toHaveBeenCalledWith({
      type: 'total-page-number',
      content: [{ type: 'text', text: '7' }],
    });
    expect(replaceSelectionWith).toHaveBeenCalledWith(
      {
        type: 'total-page-number',
        content: [{ type: 'text', text: '7' }],
      },
      false,
    );
  });
});

describe('AutoPageNumberNodeView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders page number node and syncs marks from neighbors', () => {
    const marksBefore = [
      { type: { name: 'bold' }, attrs: {} },
      { type: { name: 'textStyle' }, attrs: { fontFamily: 'Inter', fontSize: '16px', color: '#111' } },
    ];
    const marksAfter = [{ type: { name: 'underline' }, attrs: {} }];
    const state = {};
    const doc = {
      resolve: vi.fn().mockReturnValue({ nodeBefore: { marks: marksBefore }, nodeAfter: { marks: marksAfter } }),
      nodeAt: vi.fn().mockReturnValue({ isText: false, attrs: { marksAsAttrs: [] } }),
    };
    const tr = { setNodeMarkup: vi.fn() };
    tr.setNodeMarkup.mockImplementation(() => tr);

    const dispatch = vi.fn();
    state.doc = doc;
    state.tr = tr;
    const editor = {
      options: { currentPageNumber: 3 },
      state,
      view: { state, dispatch },
    };

    const node = { type: { name: 'page-number' }, attrs: { marksAsAttrs: [] } };
    const nodeView = new AutoPageNumberNodeView(node, () => 5, [], editor, { 'data-test': 'value' });

    expect(nodeView.dom.textContent).toBe('3');
    expect(nodeView.dom.className).toBe('sd-editor-auto-page-number');
    expect(nodeView.dom.getAttribute('data-id')).toBe('auto-page-number');
    expect(nodeView.dom.getAttribute('data-test')).toBe('value');
    expect(nodeView.dom.style['font-weight']).toBe('bold');
    expect(nodeView.dom.style['font-family']).toBe('Inter');
    expect(nodeView.dom.style['font-size']).toBe('16px');
    expect(nodeView.dom.style['text-decoration']).toContain('underline');

    vi.runAllTimers();

    expect(doc.nodeAt).toHaveBeenCalledWith(5);
    expect(tr.setNodeMarkup).toHaveBeenCalledWith(5, undefined, {
      marksAsAttrs: [
        { type: 'bold', attrs: {} },
        { type: 'textStyle', attrs: { fontFamily: 'Inter', fontSize: '16px', color: '#111' } },
        { type: 'underline', attrs: {} },
      ],
    });
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  it('avoids redundant mark updates', () => {
    const marks = [{ type: { name: 'bold' }, attrs: {} }];
    const existingMarks = [{ type: 'bold', attrs: {} }];
    const doc = {
      resolve: vi.fn().mockReturnValue({ nodeBefore: { marks }, nodeAfter: null }),
      nodeAt: vi.fn().mockReturnValue({ isText: false, attrs: { marksAsAttrs: existingMarks } }),
    };
    const tr = { setNodeMarkup: vi.fn().mockReturnValue({ setMeta: vi.fn() }) };
    const state = { doc, tr };
    const dispatch = vi.fn();
    const editor = {
      options: { currentPageNumber: 4 },
      state,
      view: { state, dispatch },
    };

    new AutoPageNumberNodeView(
      { type: { name: 'page-number' }, attrs: { marksAsAttrs: existingMarks } },
      () => 6,
      [],
      editor,
    );

    vi.runAllTimers();

    expect(tr.setNodeMarkup).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('updates node reference through update()', () => {
    const doc = {
      resolve: vi.fn().mockReturnValue({ nodeBefore: null, nodeAfter: null }),
      nodeAt: vi.fn().mockReturnValue({ isText: false, attrs: { marksAsAttrs: [] } }),
    };
    const tr = { setNodeMarkup: vi.fn().mockReturnValue({}) };
    const state = { doc, tr };
    const editor = {
      options: { currentPageNumber: 1 },
      state,
      view: { state, dispatch: vi.fn() },
    };

    const nodeView = new AutoPageNumberNodeView({ type: { name: 'page-number' }, attrs: {} }, () => 1, [], editor);

    expect(nodeView.update({ type: { name: 'page-number' } })).toBe(true);
    expect(nodeView.update({ type: { name: 'total-page-number' } })).toBe(false);
  });

  it('renders total page count node with parent editor value', () => {
    const doc = {
      resolve: vi.fn().mockReturnValue({ nodeBefore: null, nodeAfter: null }),
      nodeAt: vi.fn().mockReturnValue({ isText: false, attrs: { marksAsAttrs: [] } }),
    };
    const tr = { setNodeMarkup: vi.fn().mockReturnValue({}) };
    const state = { doc, tr };
    const editor = {
      options: { totalPageCount: 12, parentEditor: { currentTotalPages: 12 } },
      state,
      view: { state, dispatch: vi.fn() },
    };

    const node = { type: { name: 'total-page-number' }, attrs: {} };
    const nodeView = new AutoPageNumberNodeView(node, () => 7, [], editor);

    expect(nodeView.dom.textContent).toBe('12');
    expect(nodeView.dom.className).toBe('sd-editor-auto-total-pages');
    expect(nodeView.dom.getAttribute('data-id')).toBe('auto-total-pages');
  });
});
