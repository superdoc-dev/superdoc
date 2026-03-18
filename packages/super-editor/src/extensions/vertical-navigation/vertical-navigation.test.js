import { afterEach, describe, expect, it, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';

import { Extension } from '@core/Extension.js';
import { DOM_CLASS_NAMES } from '@superdoc/painter-dom';
import { VerticalNavigation, VerticalNavigationPluginKey, resolvePositionAtGoalX } from './vertical-navigation.js';

const createSchema = () => {
  const nodes = {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0], parseDOM: [{ tag: 'p' }] },
    text: { group: 'inline' },
  };
  return new Schema({ nodes, marks: {} });
};

const createDomStructure = () => {
  const page = document.createElement('div');
  page.className = DOM_CLASS_NAMES.PAGE;
  page.dataset.pageIndex = '0';

  const fragment = document.createElement('div');
  fragment.className = DOM_CLASS_NAMES.FRAGMENT;
  page.appendChild(fragment);

  const line1 = document.createElement('div');
  line1.className = DOM_CLASS_NAMES.LINE;
  fragment.appendChild(line1);

  const line2 = document.createElement('div');
  line2.className = DOM_CLASS_NAMES.LINE;
  fragment.appendChild(line2);

  document.body.appendChild(page);

  return { line1, line2 };
};

const createTableLikeDomStructure = () => {
  const page = document.createElement('div');
  page.className = DOM_CLASS_NAMES.PAGE;
  page.dataset.pageIndex = '0';

  const fragment = document.createElement('div');
  fragment.className = DOM_CLASS_NAMES.FRAGMENT;
  page.appendChild(fragment);

  const lines = [
    { text: 'Before', top: 360, left: 120, width: 280, pmStart: 1, pmEnd: 7 },
    { text: 'Here', top: 400, left: 120, width: 90, pmStart: 10, pmEnd: 14 },
    { text: 'Is', top: 400, left: 320, width: 90, pmStart: 20, pmEnd: 22 },
    { text: 'a', top: 400, left: 520, width: 90, pmStart: 30, pmEnd: 31 },
    { text: 'table', top: 430, left: 120, width: 90, pmStart: 40, pmEnd: 45 },
    { text: 'for', top: 430, left: 320, width: 90, pmStart: 50, pmEnd: 53 },
    { text: 'Testing', top: 430, left: 520, width: 90, pmStart: 60, pmEnd: 67 },
    { text: 'After', top: 470, left: 120, width: 280, pmStart: 70, pmEnd: 75 },
  ].map(({ text, top, left, width, pmStart, pmEnd }) => {
    const line = document.createElement('div');
    line.className = DOM_CLASS_NAMES.LINE;
    line.textContent = text;
    line.dataset.pmStart = String(pmStart);
    line.dataset.pmEnd = String(pmEnd);
    vi.spyOn(line, 'getBoundingClientRect').mockReturnValue({
      top,
      bottom: top + 20,
      left,
      right: left + width,
      width,
      height: 20,
      x: left,
      y: top,
      toJSON: () => ({}),
    });
    fragment.appendChild(line);
    return line;
  });

  document.body.appendChild(page);

  return {
    before: lines[0],
    topLeft: lines[1],
    topMiddle: lines[2],
    topRight: lines[3],
    bottomLeft: lines[4],
    bottomMiddle: lines[5],
    bottomRight: lines[6],
    after: lines[7],
  };
};

const createEnvironment = ({ presenting = true, selection = null, overrides = {} } = {}) => {
  const schema = createSchema();
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('x'.repeat(200))])]);
  const initialSelection = selection ?? TextSelection.create(doc, 1, 1);

  const visibleHost = document.createElement('div');
  document.body.appendChild(visibleHost);

  const editor = {
    options: { isHeaderOrFooter: false, isHeadless: false },
    isEditable: true,
    presentationEditor: null,
  };

  const presentationEditor = {
    visibleHost,
    getActiveEditor: vi.fn(() => (presenting ? editor : null)),
    computeCaretLayoutRect: vi.fn(() => ({ x: 75, y: 40, height: 10, pageIndex: 0 })),
    denormalizeClientPoint: vi.fn((x, y) => ({ x: x + 1, y: y + 2 })),
    hitTest: vi.fn(() => ({ pos: 5 })),
  };

  editor.presentationEditor = presentationEditor;

  const extension = Extension.create(VerticalNavigation.config);
  extension.editor = editor;
  extension.addPmPlugins = VerticalNavigation.config.addPmPlugins.bind(extension);

  const plugin = extension.addPmPlugins()[0];
  let state = EditorState.create({ schema, doc, selection: initialSelection, plugins: [plugin] });

  const view = {
    state,
    composing: false,
    dispatch: vi.fn((tr) => {
      state = state.apply(tr);
      view.state = state;
    }),
  };

  Object.defineProperty(editor, 'state', {
    get() {
      return view.state;
    },
  });
  editor.view = view;

  Object.assign(editor, overrides.editor ?? {});
  Object.assign(presentationEditor, overrides.presentationEditor ?? {});
  if (overrides.view) Object.assign(view, overrides.view);

  return { editor, plugin, view, presentationEditor };
};

afterEach(() => {
  vi.restoreAllMocks();
  delete document.elementsFromPoint;
  document.body.innerHTML = '';
});

describe('VerticalNavigation', () => {
  it('returns false when editor is not presenting', () => {
    const { plugin, view } = createEnvironment({ presenting: false });

    const handled = plugin.props.handleKeyDown(view, { key: 'ArrowDown', shiftKey: false });
    expect(handled).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it('moves selection on ArrowDown and sets goalX on first move', () => {
    const { line1, line2 } = createDomStructure();
    vi.spyOn(line2, 'getBoundingClientRect').mockReturnValue({
      top: 200,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    document.elementsFromPoint = vi.fn(() => [line1]);

    const { plugin, view, presentationEditor } = createEnvironment();
    presentationEditor.hitTest.mockReturnValue({ pos: 4 });
    presentationEditor.denormalizeClientPoint.mockReturnValue({ x: 111, y: 0 });

    const handled = plugin.props.handleKeyDown(view, { key: 'ArrowDown', shiftKey: false });

    expect(handled).toBe(true);
    expect(presentationEditor.hitTest).toHaveBeenCalledWith(111, 210);
    expect(view.state.selection.head).toBe(4);

    const pluginState = VerticalNavigationPluginKey.getState(view.state);
    expect(pluginState.goalX).toBe(75);
  });

  it('extends selection when shift is held', () => {
    const { line1, line2 } = createDomStructure();
    vi.spyOn(line2, 'getBoundingClientRect').mockReturnValue({
      top: 300,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    document.elementsFromPoint = vi.fn(() => [line1]);

    const { plugin, view, presentationEditor } = createEnvironment();
    presentationEditor.hitTest.mockReturnValue({ pos: 6 });

    const handled = plugin.props.handleKeyDown(view, { key: 'ArrowDown', shiftKey: true });

    expect(handled).toBe(true);
    expect(view.state.selection.from).toBe(1);
    expect(view.state.selection.to).toBe(6);
  });

  it('uses hit test result when it falls within the adjacent line PM range', () => {
    const { line1, line2 } = createDomStructure();
    // Set PM range on the adjacent line
    line2.dataset.pmStart = '3';
    line2.dataset.pmEnd = '8';
    vi.spyOn(line2, 'getBoundingClientRect').mockReturnValue({
      top: 200,
      left: 0,
      right: 0,
      bottom: 220,
      width: 0,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    document.elementsFromPoint = vi.fn(() => [line1]);

    const { plugin, view, presentationEditor } = createEnvironment();
    // Hit test returns pos 5, which is within [3, 8] — should use it directly
    presentationEditor.hitTest.mockReturnValue({ pos: 5 });

    const handled = plugin.props.handleKeyDown(view, { key: 'ArrowDown', shiftKey: false });

    expect(handled).toBe(true);
    expect(view.state.selection.head).toBe(5);
    // resolvePositionAtGoalX (computeCaretLayoutRect) should NOT have been called
    // for position resolution — only for initial goalX
    expect(presentationEditor.computeCaretLayoutRect).toHaveBeenCalledTimes(1);
  });

  it('falls back to resolvePositionAtGoalX when hit test lands outside PM range', () => {
    const { line1, line2 } = createDomStructure();
    // Set PM range on the adjacent line
    line2.dataset.pmStart = '3';
    line2.dataset.pmEnd = '8';
    vi.spyOn(line2, 'getBoundingClientRect').mockReturnValue({
      top: 200,
      left: 0,
      right: 0,
      bottom: 220,
      width: 0,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    document.elementsFromPoint = vi.fn(() => [line1]);

    const { plugin, view, presentationEditor } = createEnvironment();
    // Hit test returns pos 100, way outside [3, 8] — should trigger fallback
    presentationEditor.hitTest.mockReturnValue({ pos: 100 });
    // computeCaretLayoutRect is called by fallback binary search
    presentationEditor.computeCaretLayoutRect.mockImplementation((pos) => ({
      x: (pos - 3) * 10,
      y: 200,
      height: 10,
      pageIndex: 0,
    }));

    const handled = plugin.props.handleKeyDown(view, { key: 'ArrowDown', shiftKey: false });

    expect(handled).toBe(true);
    // Should have resolved to a position within [3, 8], not 100
    const head = view.state.selection.head;
    expect(head).toBeGreaterThanOrEqual(3);
    expect(head).toBeLessThanOrEqual(8);
    // Binary search should have called computeCaretLayoutRect multiple times
    expect(presentationEditor.computeCaretLayoutRect.mock.calls.length).toBeGreaterThan(1);
  });

  it('resets goalX on pointer-driven selection changes', () => {
    const { plugin, view } = createEnvironment();

    plugin.props.handleDOMEvents.mousedown(view);
    expect(view.dispatch).toHaveBeenCalled();

    const dispatchedTr = view.dispatch.mock.calls[0][0];
    expect(dispatchedTr.getMeta(VerticalNavigationPluginKey)).toMatchObject({ type: 'reset-goal-x' });
  });

  it('moves down within the same visual table column instead of DOM-adjacent cells', () => {
    const { topMiddle, bottomMiddle } = createTableLikeDomStructure();
    document.elementsFromPoint = vi.fn(() => [topMiddle]);

    const { plugin, view, presentationEditor } = createEnvironment();
    presentationEditor.hitTest.mockReturnValue({ pos: 52 });
    presentationEditor.denormalizeClientPoint.mockReturnValue({ x: 350, y: 0 });

    const handled = plugin.props.handleKeyDown(view, { key: 'ArrowDown', shiftKey: false });

    expect(handled).toBe(true);
    expect(presentationEditor.hitTest).toHaveBeenCalledWith(350, 440);
    expect(view.state.selection.head).toBe(52);
    expect(bottomMiddle.dataset.pmStart).toBe('50');
  });

  it('moves up within the same visual table column instead of DOM-adjacent cells', () => {
    const { topMiddle, bottomMiddle } = createTableLikeDomStructure();
    document.elementsFromPoint = vi.fn(() => [bottomMiddle]);

    const { plugin, view, presentationEditor } = createEnvironment();
    presentationEditor.hitTest.mockReturnValue({ pos: 21 });
    presentationEditor.denormalizeClientPoint.mockReturnValue({ x: 350, y: 0 });

    const handled = plugin.props.handleKeyDown(view, { key: 'ArrowUp', shiftKey: false });

    expect(handled).toBe(true);
    expect(presentationEditor.hitTest).toHaveBeenCalledWith(350, 410);
    expect(view.state.selection.head).toBe(21);
    expect(topMiddle.dataset.pmStart).toBe('20');
  });

  it('exits the table upward to the nearest visual line above', () => {
    const { before, topMiddle } = createTableLikeDomStructure();
    document.elementsFromPoint = vi.fn(() => [topMiddle]);

    const { plugin, view, presentationEditor } = createEnvironment();
    presentationEditor.hitTest.mockReturnValue({ pos: 3 });
    presentationEditor.denormalizeClientPoint.mockReturnValue({ x: 180, y: 0 });

    const handled = plugin.props.handleKeyDown(view, { key: 'ArrowUp', shiftKey: false });

    expect(handled).toBe(true);
    expect(presentationEditor.hitTest).toHaveBeenCalledWith(180, 370);
    expect(view.state.selection.head).toBe(3);
    expect(before.dataset.pmStart).toBe('1');
  });

  it('exits the table downward to the nearest visual line below', () => {
    const { after, bottomMiddle } = createTableLikeDomStructure();
    document.elementsFromPoint = vi.fn(() => [bottomMiddle]);

    const { plugin, view, presentationEditor } = createEnvironment();
    presentationEditor.hitTest.mockReturnValue({ pos: 72 });
    presentationEditor.denormalizeClientPoint.mockReturnValue({ x: 180, y: 0 });

    const handled = plugin.props.handleKeyDown(view, { key: 'ArrowDown', shiftKey: false });

    expect(handled).toBe(true);
    expect(presentationEditor.hitTest).toHaveBeenCalledWith(180, 480);
    expect(view.state.selection.head).toBe(72);
    expect(after.dataset.pmStart).toBe('70');
  });
});

describe('resolvePositionAtGoalX', () => {
  const makeEditor = (rectFn) => ({
    presentationEditor: { computeCaretLayoutRect: rectFn },
  });

  it('returns the position whose X is closest to goalX', () => {
    // Simulate 5 positions (10-14) with X values 0, 10, 20, 30, 40
    const editor = makeEditor((pos) => ({ x: (pos - 10) * 10 }));
    const result = resolvePositionAtGoalX(editor, 10, 14, 25);
    // Position 12 has x=20 (dist=5), position 13 has x=30 (dist=5).
    // Binary search encounters 12 first so it becomes bestPos.
    expect(result).toEqual({ pos: 12 });
  });

  it('returns exact match when goalX lands on a position', () => {
    const editor = makeEditor((pos) => ({ x: (pos - 10) * 10 }));
    const result = resolvePositionAtGoalX(editor, 10, 14, 20);
    expect(result).toEqual({ pos: 12 });
  });

  it('returns pmStart when goalX is before all positions', () => {
    const editor = makeEditor((pos) => ({ x: pos * 10 }));
    const result = resolvePositionAtGoalX(editor, 5, 10, -100);
    expect(result).toEqual({ pos: 5 });
  });

  it('returns pmEnd when goalX is past all positions', () => {
    const editor = makeEditor((pos) => ({ x: pos * 10 }));
    const result = resolvePositionAtGoalX(editor, 5, 10, 9999);
    expect(result).toEqual({ pos: 10 });
  });

  it('skips positions where computeCaretLayoutRect returns null', () => {
    // Position 12 returns null (inline node boundary), others are normal
    const editor = makeEditor((pos) => (pos === 12 ? null : { x: (pos - 10) * 10 }));
    const result = resolvePositionAtGoalX(editor, 10, 14, 25);
    // Should still find a valid position, not fall back to pmStart
    expect(result.pos).toBeGreaterThan(10);
  });

  it('handles all-null positions gracefully', () => {
    const editor = makeEditor(() => null);
    const result = resolvePositionAtGoalX(editor, 10, 14, 25);
    // Falls back to pmStart since no positions are measurable
    expect(result).toEqual({ pos: 10 });
  });

  it('handles single-position range', () => {
    const editor = makeEditor((pos) => ({ x: 50 }));
    const result = resolvePositionAtGoalX(editor, 10, 10, 50);
    expect(result).toEqual({ pos: 10 });
  });
});
