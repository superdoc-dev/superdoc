import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NodeSelection } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { FieldAnnotationView } from './FieldAnnotationView.js';

let schema;

beforeAll(() => {
  const { editor } = initTestEditor({ mode: 'text', content: '<p></p>' });
  schema = editor.schema;
  editor.destroy();
});

describe('FieldAnnotationView', () => {
  let editorStub;
  let baseAttrs;

  beforeEach(() => {
    editorStub = {
      options: { isHeadless: true, pagination: false },
      isEditable: true,
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      commands: {
        command: vi.fn((callback) => {
          const tr = { setNodeMarkup: vi.fn() };
          callback({ tr });
          return true;
        }),
      },
      view: { state: {}, dispatch: vi.fn(), focus: vi.fn() },
      createChildEditor: vi.fn(() => ({ view: { dom: document.createElement('div') } })),
    };

    baseAttrs = {
      editor: editorStub,
      decorations: [],
      getPos: vi.fn().mockReturnValue(1),
      htmlAttributes: {},
      annotationClass: 'annotation',
      annotationContentClass: 'annotation-content',
      borderColor: '#ff0000',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createNode = (attrs = {}) =>
    schema.nodes.fieldAnnotation.create({ fieldId: 'a', displayLabel: 'Label', type: 'text', ...attrs });

  it('builds text annotations with highlight styling', () => {
    const view = new FieldAnnotationView({ ...baseAttrs, node: createNode({ displayLabel: 'Text' }) });
    const content = view.dom.querySelector('.annotation-content');
    expect(content.textContent).toBe('Text');
    expect(view.dom.classList.contains('annotation')).toBe(true);
    view.destroy();
  });

  it('renders image annotations with inline images', () => {
    const view = new FieldAnnotationView({
      ...baseAttrs,
      node: createNode({ type: 'image', imageSrc: 'https://example.com/image.png', displayLabel: 'Image' }),
    });
    const img = view.dom.querySelector('img');
    expect(img).toBeTruthy();
    expect(img.src).toContain('https://example.com/image.png');
    view.destroy();
  });

  it('renders link annotations with anchors', () => {
    const view = new FieldAnnotationView({
      ...baseAttrs,
      node: createNode({ type: 'link', linkUrl: 'https://example.com' }),
    });
    const anchor = view.dom.querySelector('a');
    expect(anchor).toBeTruthy();
    expect(anchor.href).toContain('https://example.com');
    view.destroy();
  });

  it('emits events on click and double click when editable', () => {
    const view = new FieldAnnotationView({ ...baseAttrs, node: createNode() });
    const clickEvent = new MouseEvent('click');
    view.handleAnnotationClick(clickEvent);
    expect(editorStub.emit).toHaveBeenCalledWith(
      'fieldAnnotationClicked',
      expect.objectContaining({ node: view.node }),
    );

    const dblEvent = new MouseEvent('dblclick');
    view.handleAnnotationDoubleClick(dblEvent);
    expect(editorStub.emit).toHaveBeenCalledWith('fieldAnnotationDoubleClicked', expect.any(Object));

    view.destroy();
  });

  it('emits selection events when the node is selected', () => {
    const node = createNode();
    const paragraph = schema.nodes.paragraph.create(null, [node]);
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const selection = NodeSelection.create(doc, 1);

    editorStub.state = { selection };
    const view = new FieldAnnotationView({ ...baseAttrs, node, getPos: vi.fn().mockReturnValue(1) });
    editorStub.emit.mockClear();

    view.handleSelectionUpdate({ editor: editorStub });
    expect(editorStub.emit).toHaveBeenCalledWith('fieldAnnotationSelected', expect.objectContaining({ node }));
    view.destroy();
  });

  it('prevents events when editor is not editable', () => {
    const view = new FieldAnnotationView({ ...baseAttrs, node: createNode() });
    editorStub.isEditable = false;
    const event = { preventDefault: vi.fn() };
    const result = view.stopEvent(event);
    expect(result).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    view.destroy();
  });

  it('updates annotation attributes through command helper', () => {
    const view = new FieldAnnotationView({ ...baseAttrs, node: createNode() });
    view.updateAttributes({ displayLabel: 'Updated' });
    expect(editorStub.commands.command).toHaveBeenCalled();
    view.destroy();
  });

  it('removes listeners on destroy', () => {
    const view = new FieldAnnotationView({ ...baseAttrs, node: createNode() });
    const removeSpy = vi.spyOn(view.dom, 'removeEventListener');
    view.destroy();
    expect(removeSpy).toHaveBeenCalled();
    expect(editorStub.off).toHaveBeenCalledWith('selectionUpdate', view.handleSelectionUpdate);
  });
});
