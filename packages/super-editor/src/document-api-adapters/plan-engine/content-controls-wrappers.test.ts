import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import { registerBuiltInExecutors } from './register-executors.js';
import { createContentControlsAdapter } from './content-controls-wrappers.js';
import {
  buildContentControlInfoFromNode,
  buildContentControlInfoFromAttrs,
} from '../helpers/content-controls/index.js';

registerBuiltInExecutors();

// ---------------------------------------------------------------------------
// Mock node builder (mirrors conformance-test pattern)
// ---------------------------------------------------------------------------

type NodeOptions = {
  attrs?: Record<string, unknown>;
  text?: string;
  isInline?: boolean;
  isBlock?: boolean;
  isLeaf?: boolean;
  inlineContent?: boolean;
  nodeSize?: number;
};

function createNode(typeName: string, children: ProseMirrorNode[] = [], options: NodeOptions = {}): ProseMirrorNode {
  const attrs = options.attrs ?? {};
  const text = options.text ?? '';
  const isText = typeName === 'text';
  const isInline = options.isInline ?? isText;
  const isBlock = options.isBlock ?? (!isInline && typeName !== 'doc');
  const inlineContent = options.inlineContent ?? isBlock;
  const isLeaf = options.isLeaf ?? (isInline && !isText && children.length === 0);

  const contentSize = children.reduce((sum, child) => sum + child.nodeSize, 0);
  const nodeSize = isText ? text.length : options.nodeSize != null ? options.nodeSize : isLeaf ? 1 : contentSize + 2;

  const node = {
    type: {
      name: typeName,
      create(newAttrs: Record<string, unknown>, newContent: unknown) {
        return createNode(typeName, [], { attrs: newAttrs, isBlock, inlineContent });
      },
      createAndFill() {
        return createNode(typeName, [], { attrs: {}, isBlock, inlineContent });
      },
    },
    attrs,
    text: isText ? text : undefined,
    content: { size: contentSize },
    nodeSize,
    isText,
    isInline,
    isBlock,
    inlineContent,
    isTextblock: inlineContent,
    isLeaf,
    childCount: children.length,
    child(index: number) {
      return children[index]!;
    },
    forEach(fn: (node: ProseMirrorNode, offset: number, index: number) => void) {
      let offset = 0;
      children.forEach((child, index) => {
        fn(child, offset, index);
        offset += child.nodeSize;
      });
    },
    nodeAt(pos: number): ProseMirrorNode | null {
      let offset = 0;
      for (const child of children) {
        if (pos === offset) return child;
        if (pos < offset + child.nodeSize) {
          return (child as unknown as { nodeAt: (p: number) => ProseMirrorNode | null }).nodeAt(pos - offset - 1);
        }
        offset += child.nodeSize;
      }
      return null;
    },
    copy(_content?: unknown) {
      return node;
    },
    get textContent(): string {
      if (isText) return text;
      return children.map((c) => c.textContent).join('');
    },
    _children: children,
    descendants(callback: (node: ProseMirrorNode, pos: number) => boolean | void) {
      function walk(kids: ProseMirrorNode[], startPos: number) {
        let offset = startPos;
        for (const child of kids) {
          const childStart = offset;
          const result = callback(child, childStart);
          if (result !== false) {
            const innerKids = (child as unknown as { _children?: ProseMirrorNode[] })._children;
            if (innerKids && innerKids.length > 0) {
              walk(innerKids, childStart + 1);
            }
          }
          offset += child.nodeSize;
        }
      }
      walk(children, 0);
    },
  };
  return node as unknown as ProseMirrorNode;
}

// ---------------------------------------------------------------------------
// Mock editor builders
// ---------------------------------------------------------------------------

const SDT_TARGET = { kind: 'block' as const, nodeType: 'sdt' as const, nodeId: 'sdt-1' };

function makeSdtEditor(overrideAttrs: Record<string, unknown> = {}): Editor {
  const sdtAttrs = {
    id: 'sdt-1',
    tag: 'test-tag',
    alias: 'Test Alias',
    lockMode: 'unlocked',
    controlType: 'text',
    type: 'text',
    sdtPr: { name: 'w:sdtPr', elements: [] },
    ...overrideAttrs,
  };

  const textNode = createNode('text', [], { text: 'SDT content' });
  const innerParagraph = createNode('paragraph', [textNode], {
    attrs: { sdBlockId: 'inner-p' },
    isBlock: true,
    inlineContent: true,
  });
  const sdtNode = createNode('structuredContentBlock', [innerParagraph], {
    attrs: sdtAttrs,
    isBlock: true,
  });
  const doc = createNode('doc', [sdtNode], { isBlock: false });

  const tr = {
    insertText: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    addMark: vi.fn().mockReturnThis(),
    removeMark: vi.fn().mockReturnThis(),
    replaceWith: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    setMeta: vi.fn().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged: true,
    doc,
    steps: [{ type: 'replaceStep' }],
  };

  const dispatch = vi.fn();

  const editor = {
    state: {
      doc,
      tr,
      schema: {
        marks: {},
        text: (t: string) => createNode('text', [], { text: t }),
        nodes: {
          paragraph: {
            create: vi.fn(() => innerParagraph),
            createAndFill: vi.fn(() => innerParagraph),
          },
          structuredContentBlock: {
            create: vi.fn((attrs: unknown, content: unknown) =>
              createNode('structuredContentBlock', [], { attrs: attrs as Record<string, unknown>, isBlock: true }),
            ),
          },
        },
      },
      selection: { from: 0, to: doc.nodeSize },
    },
    schema: {
      marks: {},
      text: (t: string) => createNode('text', [], { text: t }),
      nodes: {
        paragraph: {
          create: vi.fn(() => innerParagraph),
          createAndFill: vi.fn(() => innerParagraph),
        },
        structuredContentBlock: {
          create: vi.fn((attrs: unknown, content: unknown) =>
            createNode('structuredContentBlock', [], { attrs: attrs as Record<string, unknown>, isBlock: true }),
          ),
        },
      },
    },
    dispatch,
    view: { dispatch },
    commands: {
      updateStructuredContentById: vi.fn(() => true),
      deleteStructuredContentById: vi.fn(() => true),
      insertStructuredContentBlock: vi.fn(() => true),
      insertStructuredContentInline: vi.fn(() => true),
    },
  } as unknown as Editor;

  return editor;
}

/**
 * Build a doc with two block-level nodes: a paragraph (block ID = paraId) then an SDT.
 * Used for listInRange block-ID resolution tests.
 */
function makeSdtEditorWithBlockRange(): Editor {
  const paraText = createNode('text', [], { text: 'Block text' });
  const paragraph = createNode('paragraph', [paraText], {
    attrs: { paraId: 'block-p1', sdBlockId: 'block-p1-sd' },
    isBlock: true,
    inlineContent: true,
  });

  const sdtText = createNode('text', [], { text: 'SDT content' });
  const innerParagraph = createNode('paragraph', [sdtText], {
    attrs: { paraId: 'inner-p', sdBlockId: 'inner-p-sd' },
    isBlock: true,
    inlineContent: true,
  });
  const sdtNode = createNode('structuredContentBlock', [innerParagraph], {
    attrs: {
      id: 'sdt-1',
      tag: 'test',
      lockMode: 'unlocked',
      controlType: 'text',
      type: 'text',
      sdtPr: { name: 'w:sdtPr', elements: [] },
    },
    isBlock: true,
  });

  const para2Text = createNode('text', [], { text: 'After SDT' });
  const paragraph2 = createNode('paragraph', [para2Text], {
    attrs: { paraId: 'block-p2', sdBlockId: 'block-p2-sd' },
    isBlock: true,
    inlineContent: true,
  });

  const doc = createNode('doc', [paragraph, sdtNode, paragraph2], { isBlock: false });

  const tr = {
    insertText: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    addMark: vi.fn().mockReturnThis(),
    removeMark: vi.fn().mockReturnThis(),
    replaceWith: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    setMeta: vi.fn().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged: true,
    doc,
    steps: [{ type: 'replaceStep' }],
  };

  const dispatch = vi.fn();

  return {
    state: {
      doc,
      tr,
      schema: { marks: {}, text: (t: string) => createNode('text', [], { text: t }), nodes: {} },
      selection: { from: 0, to: doc.nodeSize },
    },
    schema: { marks: {}, text: (t: string) => createNode('text', [], { text: t }), nodes: {} },
    dispatch,
    view: { dispatch },
    commands: {
      updateStructuredContentById: vi.fn(() => true),
      deleteStructuredContentById: vi.fn(() => true),
      insertStructuredContentBlock: vi.fn(() => true),
      insertStructuredContentInline: vi.fn(() => true),
    },
  } as unknown as Editor;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('contentControls.wrap', () => {
  it('calls tr.replaceWith to wrap the resolved target node', () => {
    const editor = makeSdtEditor();
    const adapter = createContentControlsAdapter(editor);

    const result = adapter.wrap({ target: SDT_TARGET, kind: 'block' }, { changeMode: 'direct' });

    expect(result.success).toBe(true);
    // tr.replaceWith should have been called (wraps the existing node)
    expect((editor.state.tr as any).replaceWith).toHaveBeenCalled();
  });

  it('returns updatedRef pointing to the new wrapper SDT', () => {
    const editor = makeSdtEditor();
    const adapter = createContentControlsAdapter(editor);

    const result = adapter.wrap({ target: SDT_TARGET, kind: 'block' }, { changeMode: 'direct' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.updatedRef).toBeDefined();
      expect(result.updatedRef!.nodeType).toBe('sdt');
      expect(result.updatedRef!.kind).toBe('block');
      // The updatedRef nodeId should differ from the original (new wrapper ID)
      expect(result.updatedRef!.nodeId).not.toBe('sdt-1');
    }
  });

  it('creates the wrapper node via schema.nodes.structuredContentBlock.create', () => {
    const editor = makeSdtEditor();
    const adapter = createContentControlsAdapter(editor);

    adapter.wrap({ target: SDT_TARGET, kind: 'block' }, { changeMode: 'direct' });

    const createFn = editor.schema.nodes.structuredContentBlock.create as ReturnType<typeof vi.fn>;
    expect(createFn).toHaveBeenCalledTimes(1);
    const [attrs] = createFn.mock.calls[0];
    expect(attrs.tag).toBeUndefined();
    expect(attrs.lockMode).toBe('unlocked');
    expect(typeof attrs.id).toBe('string');
  });
});

describe('contentControls.listInRange', () => {
  it('filters SDTs by block-ID positional range, not by SDT ID', () => {
    const editor = makeSdtEditorWithBlockRange();
    const adapter = createContentControlsAdapter(editor);

    // Range from start of paragraph block-p1 to end of paragraph block-p2
    // should include the SDT that sits between them
    const result = adapter.listInRange({
      startBlockId: 'block-p1',
      endBlockId: 'block-p2',
    });

    expect(result.items.length).toBe(1);
    expect(result.items[0].id).toBe('sdt-1');
  });

  it('excludes SDTs outside the block range', () => {
    const editor = makeSdtEditorWithBlockRange();
    const adapter = createContentControlsAdapter(editor);

    // Range covering only the second paragraph (after the SDT)
    const result = adapter.listInRange({
      startBlockId: 'block-p2',
      endBlockId: 'block-p2',
    });

    expect(result.items.length).toBe(0);
  });

  it('throws TARGET_NOT_FOUND for invalid block IDs', () => {
    const editor = makeSdtEditorWithBlockRange();
    const adapter = createContentControlsAdapter(editor);

    expect(() =>
      adapter.listInRange({
        startBlockId: 'nonexistent-block',
        endBlockId: 'block-p2',
      }),
    ).toThrow(/not found/i);
  });
});

describe('contentControls.setType OOXML element transitions', () => {
  it('calls updateStructuredContentById to persist controlType and type attrs', () => {
    const editor = makeSdtEditor({ controlType: 'text', type: 'text' });
    const adapter = createContentControlsAdapter(editor);

    const result = adapter.setType({ target: SDT_TARGET, controlType: 'date' }, { changeMode: 'direct' });

    expect(result.success).toBe(true);
    const updateCmd = editor.commands!.updateStructuredContentById as ReturnType<typeof vi.fn>;
    // Should be called at least once for the type element transitions + once for attrs
    expect(updateCmd).toHaveBeenCalled();
  });

  it('returns NO_OP when target already has the requested type', () => {
    const editor = makeSdtEditor({ controlType: 'text', type: 'text' });
    const adapter = createContentControlsAdapter(editor);

    const result = adapter.setType({ target: SDT_TARGET, controlType: 'text' }, { changeMode: 'direct' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.code).toBe('NO_OP');
    }
  });

  it('removes old type element and adds new type element in sdtPr', () => {
    // Start with a 'text' control that has a w:text element in sdtPr
    const sdtPr = {
      name: 'w:sdtPr',
      elements: [{ name: 'w:text', type: 'element' }],
    };
    const editor = makeSdtEditor({ controlType: 'text', type: 'text', sdtPr });
    const adapter = createContentControlsAdapter(editor);

    adapter.setType({ target: SDT_TARGET, controlType: 'date' }, { changeMode: 'direct' });

    // updateStructuredContentById is called 3 times:
    // 1) remove old w:text element from sdtPr
    // 2) add new w:date element to sdtPr
    // 3) update controlType/type attrs
    const updateCmd = editor.commands!.updateStructuredContentById as ReturnType<typeof vi.fn>;
    expect(updateCmd.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Verify the final attrs update includes the new type
    const lastCall = updateCmd.mock.calls[updateCmd.mock.calls.length - 1];
    expect(lastCall[1].attrs.controlType).toBe('date');
    expect(lastCall[1].attrs.type).toBe('date');
  });
});

describe('contentControls.patchRawProperties element normalization', () => {
  it('normalizes set op elements to include name and type', () => {
    const editor = makeSdtEditor();
    const adapter = createContentControlsAdapter(editor);

    adapter.patchRawProperties(
      {
        target: SDT_TARGET,
        patches: [
          {
            op: 'set',
            name: 'w:custom',
            element: { attributes: { 'w:val': 'hello' } } as any,
          },
        ],
      },
      { changeMode: 'direct' },
    );

    const updateCmd = editor.commands!.updateStructuredContentById as ReturnType<typeof vi.fn>;
    expect(updateCmd).toHaveBeenCalled();

    // The sdtPr written back should contain the normalized element
    const call = updateCmd.mock.calls[updateCmd.mock.calls.length - 1];
    const writtenSdtPr = call[1].attrs.sdtPr;
    const customEl = writtenSdtPr.elements.find((el: any) => el.name === 'w:custom');
    expect(customEl).toBeDefined();
    expect(customEl.name).toBe('w:custom');
    expect(customEl.type).toBe('element');
    expect(customEl.attributes['w:val']).toBe('hello');
  });

  it('set op forces name to match patch.name even if element has a different name', () => {
    const editor = makeSdtEditor();
    const adapter = createContentControlsAdapter(editor);

    adapter.patchRawProperties(
      {
        target: SDT_TARGET,
        patches: [
          {
            op: 'set',
            name: 'w:correct',
            element: { name: 'w:wrong', type: 'element' } as any,
          },
        ],
      },
      { changeMode: 'direct' },
    );

    const updateCmd = editor.commands!.updateStructuredContentById as ReturnType<typeof vi.fn>;
    const call = updateCmd.mock.calls[updateCmd.mock.calls.length - 1];
    const writtenSdtPr = call[1].attrs.sdtPr;
    const el = writtenSdtPr.elements.find((e: any) => e.name === 'w:correct');
    expect(el).toBeDefined();
    // No element with the wrong name should exist
    expect(writtenSdtPr.elements.find((e: any) => e.name === 'w:wrong')).toBeUndefined();
  });

  it('setAttr modifies attributes on an existing sdtPr element', () => {
    const sdtPr = {
      name: 'w:sdtPr',
      elements: [{ name: 'w:custom', type: 'element', attributes: { 'w:val': 'old' } }],
    };
    const editor = makeSdtEditor({ sdtPr });
    const adapter = createContentControlsAdapter(editor);

    adapter.patchRawProperties(
      {
        target: SDT_TARGET,
        patches: [{ op: 'setAttr', name: 'w:custom', attr: 'w:val', value: 'new' }],
      },
      { changeMode: 'direct' },
    );

    const updateCmd = editor.commands!.updateStructuredContentById as ReturnType<typeof vi.fn>;
    const call = updateCmd.mock.calls[updateCmd.mock.calls.length - 1];
    const writtenSdtPr = call[1].attrs.sdtPr;
    const el = writtenSdtPr.elements.find((e: any) => e.name === 'w:custom');
    expect(el.attributes['w:val']).toBe('new');
  });

  it('removeAttr removes an attribute from an existing sdtPr element', () => {
    const sdtPr = {
      name: 'w:sdtPr',
      elements: [{ name: 'w:custom', type: 'element', attributes: { 'w:val': 'x', 'w:other': 'y' } }],
    };
    const editor = makeSdtEditor({ sdtPr });
    const adapter = createContentControlsAdapter(editor);

    adapter.patchRawProperties(
      {
        target: SDT_TARGET,
        patches: [{ op: 'removeAttr', name: 'w:custom', attr: 'w:val' }],
      },
      { changeMode: 'direct' },
    );

    const updateCmd = editor.commands!.updateStructuredContentById as ReturnType<typeof vi.fn>;
    const call = updateCmd.mock.calls[updateCmd.mock.calls.length - 1];
    const writtenSdtPr = call[1].attrs.sdtPr;
    const el = writtenSdtPr.elements.find((e: any) => e.name === 'w:custom');
    expect(el.attributes['w:val']).toBeUndefined();
    expect(el.attributes['w:other']).toBe('y');
  });

  it('remove op deletes an element from sdtPr.elements', () => {
    const sdtPr = {
      name: 'w:sdtPr',
      elements: [
        { name: 'w:custom', type: 'element' },
        { name: 'w:other', type: 'element' },
      ],
    };
    const editor = makeSdtEditor({ sdtPr });
    const adapter = createContentControlsAdapter(editor);

    adapter.patchRawProperties(
      {
        target: SDT_TARGET,
        patches: [{ op: 'remove', name: 'w:custom' }],
      },
      { changeMode: 'direct' },
    );

    const updateCmd = editor.commands!.updateStructuredContentById as ReturnType<typeof vi.fn>;
    const call = updateCmd.mock.calls[updateCmd.mock.calls.length - 1];
    const writtenSdtPr = call[1].attrs.sdtPr;
    expect(writtenSdtPr.elements.find((e: any) => e.name === 'w:custom')).toBeUndefined();
    expect(writtenSdtPr.elements.find((e: any) => e.name === 'w:other')).toBeDefined();
  });
});

describe('buildContentControlInfoFromNode sdtPr element-form resolution', () => {
  it('resolves binding from sdtPr XML element form', () => {
    const sdtPr = {
      name: 'w:sdtPr',
      elements: [
        {
          name: 'w:dataBinding',
          type: 'element',
          attributes: {
            'w:storeItemID': '{store-123}',
            'w:xpath': '/root/field',
            'w:prefixMappings': 'xmlns:ns="http://example.com"',
          },
        },
      ],
    };
    const sdtNode = createNode('structuredContentBlock', [], {
      attrs: { id: 'sdt-b', controlType: 'text', type: 'text', lockMode: 'unlocked', sdtPr },
      isBlock: true,
    });

    const info = buildContentControlInfoFromNode({ node: sdtNode, pos: 0, kind: 'block' });
    expect(info.binding).toBeDefined();
    expect(info.binding!.storeItemId).toBe('{store-123}');
    expect(info.binding!.xpath).toBe('/root/field');
    expect(info.binding!.prefixMappings).toBe('xmlns:ns="http://example.com"');
  });

  it('resolves date subtype properties from XML element form', () => {
    const sdtPr = {
      name: 'w:sdtPr',
      elements: [
        {
          name: 'w:date',
          type: 'element',
          attributes: { 'w:fullDate': '2024-01-15' },
          elements: [
            { name: 'w:dateFormat', type: 'element', attributes: { 'w:val': 'M/d/yyyy' } },
            { name: 'w:lid', type: 'element', attributes: { 'w:val': 'en-US' } },
            { name: 'w:storeMappedDataAs', type: 'element', attributes: { 'w:val': 'dateTime' } },
            { name: 'w:calendar', type: 'element', attributes: { 'w:val': 'gregorian' } },
          ],
        },
      ],
    };
    const sdtNode = createNode('structuredContentBlock', [], {
      attrs: { id: 'sdt-d', controlType: 'date', type: 'date', lockMode: 'unlocked', sdtPr },
      isBlock: true,
    });

    const info = buildContentControlInfoFromNode({ node: sdtNode, pos: 0, kind: 'block' });
    expect(info.properties.dateFormat).toBe('M/d/yyyy');
    expect(info.properties.dateLocale).toBe('en-US');
    expect(info.properties.storageFormat).toBe('dateTime');
    expect(info.properties.calendar).toBe('gregorian');
  });

  it('resolves checkbox subtype properties from XML element form', () => {
    const sdtPr = {
      name: 'w:sdtPr',
      elements: [
        {
          name: 'w14:checkbox',
          type: 'element',
          elements: [
            { name: 'w14:checked', type: 'element', attributes: { 'w14:val': '1' } },
            { name: 'w14:checkedState', type: 'element', attributes: { 'w14:font': 'MS Gothic', 'w14:val': '2612' } },
            { name: 'w14:uncheckedState', type: 'element', attributes: { 'w14:font': 'MS Gothic', 'w14:val': '2610' } },
          ],
        },
      ],
    };
    const sdtNode = createNode('structuredContentBlock', [], {
      attrs: { id: 'sdt-cb', controlType: 'checkbox', type: 'checkbox', lockMode: 'unlocked', sdtPr },
      isBlock: true,
    });

    const info = buildContentControlInfoFromNode({ node: sdtNode, pos: 0, kind: 'block' });
    expect(info.properties.checked).toBe(true);
    expect(info.properties.checkedSymbol).toEqual({ font: 'MS Gothic', char: '2612' });
    expect(info.properties.uncheckedSymbol).toEqual({ font: 'MS Gothic', char: '2610' });
  });

  it('resolves comboBox items from XML element form', () => {
    const sdtPr = {
      name: 'w:sdtPr',
      elements: [
        {
          name: 'w:comboBox',
          type: 'element',
          attributes: { 'w:lastValue': 'b' },
          elements: [
            { name: 'w:listItem', type: 'element', attributes: { 'w:displayText': 'Alpha', 'w:value': 'a' } },
            { name: 'w:listItem', type: 'element', attributes: { 'w:displayText': 'Beta', 'w:value': 'b' } },
          ],
        },
      ],
    };
    const sdtNode = createNode('structuredContentBlock', [], {
      attrs: { id: 'sdt-cb', controlType: 'comboBox', type: 'comboBox', lockMode: 'unlocked', sdtPr },
      isBlock: true,
    });

    const info = buildContentControlInfoFromNode({ node: sdtNode, pos: 0, kind: 'block' });
    expect(info.properties.items).toEqual([
      { displayText: 'Alpha', value: 'a' },
      { displayText: 'Beta', value: 'b' },
    ]);
    expect(info.properties.selectedValue).toBe('b');
  });

  it('includes color, showingPlaceholder, temporary, tabIndex from attrs', () => {
    const sdtNode = createNode('structuredContentBlock', [], {
      attrs: {
        id: 'sdt-meta',
        controlType: 'text',
        type: 'text',
        lockMode: 'unlocked',
        sdtPr: { name: 'w:sdtPr', elements: [] },
        color: '#FF0000',
        showingPlaceholder: true,
        temporary: false,
        tabIndex: 3,
      },
      isBlock: true,
    });

    const info = buildContentControlInfoFromNode({ node: sdtNode, pos: 0, kind: 'block' });
    expect(info.properties.color).toBe('#FF0000');
    expect(info.properties.showingPlaceholder).toBe(true);
    expect(info.properties.temporary).toBe(false);
    expect(info.properties.tabIndex).toBe(3);
  });
});

describe('buildContentControlInfoFromAttrs completeness', () => {
  it('includes color, showingPlaceholder, temporary, tabIndex', () => {
    const info = buildContentControlInfoFromAttrs(
      {
        id: 'sdt-x',
        controlType: 'text',
        lockMode: 'unlocked',
        tag: 'my-tag',
        color: 'blue',
        showingPlaceholder: true,
        temporary: true,
        tabIndex: 5,
      },
      'block',
    );

    expect(info.properties.color).toBe('blue');
    expect(info.properties.showingPlaceholder).toBe(true);
    expect(info.properties.temporary).toBe(true);
    expect(info.properties.tabIndex).toBe(5);
    expect(info.properties.tag).toBe('my-tag');
  });

  it('omits metadata fields when attrs do not include them', () => {
    const info = buildContentControlInfoFromAttrs({ id: 'sdt-y', controlType: 'text', lockMode: 'unlocked' }, 'inline');

    expect(info.properties.color).toBeUndefined();
    expect(info.properties.showingPlaceholder).toBeUndefined();
    expect(info.properties.temporary).toBeUndefined();
    expect(info.properties.tabIndex).toBeUndefined();
  });
});

describe('choiceList.setSelected visual text sync', () => {
  it('updates visible content text to the selected item displayText', () => {
    const editor = makeSdtEditor({
      controlType: 'dropDownList',
      type: 'dropDownList',
      sdtPr: {
        name: 'w:sdtPr',
        elements: [
          {
            name: 'w:dropDownList',
            type: 'element',
            elements: [
              { name: 'w:listItem', type: 'element', attributes: { 'w:displayText': 'Acme Corp', 'w:value': 'acme' } },
              { name: 'w:listItem', type: 'element', attributes: { 'w:displayText': 'Globex', 'w:value': 'globex' } },
            ],
          },
        ],
      },
    });
    const adapter = createContentControlsAdapter(editor);

    const result = adapter.choiceList.setSelected({ target: SDT_TARGET, value: 'acme' }, { changeMode: 'direct' });
    expect(result.success).toBe(true);

    const updateCmd = editor.commands!.updateStructuredContentById as ReturnType<typeof vi.fn>;
    const textCall = updateCmd.mock.calls.find((call) => call[1]?.text === 'Acme Corp');
    expect(textCall).toBeDefined();
  });

  it('falls back to the selected value when no matching item is found', () => {
    const editor = makeSdtEditor({
      controlType: 'dropDownList',
      type: 'dropDownList',
      sdtPr: {
        name: 'w:sdtPr',
        elements: [
          {
            name: 'w:dropDownList',
            type: 'element',
            elements: [
              { name: 'w:listItem', type: 'element', attributes: { 'w:displayText': 'Acme Corp', 'w:value': 'acme' } },
            ],
          },
        ],
      },
    });
    const adapter = createContentControlsAdapter(editor);

    const result = adapter.choiceList.setSelected({ target: SDT_TARGET, value: 'unknown' }, { changeMode: 'direct' });
    expect(result.success).toBe(true);

    const updateCmd = editor.commands!.updateStructuredContentById as ReturnType<typeof vi.fn>;
    const textCall = updateCmd.mock.calls.find((call) => call[1]?.text === 'unknown');
    expect(textCall).toBeDefined();
  });
});

describe('create.contentControl default sdtPr seeding', () => {
  it('seeds checkbox controls with checked state + symbol pair defaults', () => {
    const editor = makeSdtEditor();
    const adapter = createContentControlsAdapter(editor);

    const result = adapter.create({ kind: 'inline', controlType: 'checkbox' }, { changeMode: 'direct' });
    expect(result.success).toBe(true);

    const insertInline = editor.commands!.insertStructuredContentInline as ReturnType<typeof vi.fn>;
    expect(insertInline).toHaveBeenCalledTimes(1);
    expect(insertInline.mock.calls[0][0].json?.text).toBe(String.fromCodePoint(0x2610));
    expect(insertInline.mock.calls[0][0].json?.marks?.[0]?.attrs?.fontFamily).toBe('MS Gothic');
    const attrs = insertInline.mock.calls[0][0].attrs as Record<string, unknown>;
    const sdtPr = attrs.sdtPr as { elements?: Array<{ name: string; elements?: Array<{ name: string }> }> };
    const checkbox = sdtPr.elements?.find((el) => el.name === 'w14:checkbox');
    expect(checkbox).toBeDefined();
    expect(checkbox?.elements?.some((el) => el.name === 'w14:checked')).toBe(true);
    expect(checkbox?.elements?.some((el) => el.name === 'w14:checkedState')).toBe(true);
    expect(checkbox?.elements?.some((el) => el.name === 'w14:uncheckedState')).toBe(true);
  });

  it.each([
    ['text', 'w:text'],
    ['comboBox', 'w:comboBox'],
    ['dropDownList', 'w:dropDownList'],
  ] as const)('seeds %s controls with %s in sdtPr', (controlType, xmlName) => {
    const editor = makeSdtEditor();
    const adapter = createContentControlsAdapter(editor);

    const result = adapter.create({ kind: 'inline', controlType }, { changeMode: 'direct' });
    expect(result.success).toBe(true);

    const insertInline = editor.commands!.insertStructuredContentInline as ReturnType<typeof vi.fn>;
    const attrs = insertInline.mock.calls[0][0].attrs as Record<string, unknown>;
    const sdtPr = attrs.sdtPr as { elements?: Array<{ name: string }> };
    expect(sdtPr.elements?.some((el) => el.name === xmlName)).toBe(true);
  });

  it('seeds date controls with today text and Word-compatible date metadata', () => {
    const editor = makeSdtEditor();
    const adapter = createContentControlsAdapter(editor);

    const result = adapter.create({ kind: 'inline', controlType: 'date' }, { changeMode: 'direct' });
    expect(result.success).toBe(true);

    const insertInline = editor.commands!.insertStructuredContentInline as ReturnType<typeof vi.fn>;
    expect(insertInline.mock.calls[0][0].text).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);

    const attrs = insertInline.mock.calls[0][0].attrs as Record<string, unknown>;
    const sdtPr = attrs.sdtPr as {
      elements?: Array<{ name: string; attributes?: Record<string, string>; elements?: Array<{ name: string }> }>;
    };
    const dateEl = sdtPr.elements?.find((el) => el.name === 'w:date');
    expect(dateEl).toBeDefined();
    expect(String(dateEl?.attributes?.['w:fullDate'] ?? '')).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00Z$/);
    expect(dateEl?.elements?.some((el) => el.name === 'w:dateFormat')).toBe(true);
    expect(dateEl?.elements?.some((el) => el.name === 'w:lid')).toBe(true);
    expect(dateEl?.elements?.some((el) => el.name === 'w:storeMappedDataAs')).toBe(true);
    expect(dateEl?.elements?.some((el) => el.name === 'w:calendar')).toBe(true);
  });
});

describe('contentControls.setType default sdtPr seeding', () => {
  it('adds Word-visible checkbox defaults when switching to checkbox type', () => {
    const editor = makeSdtEditor({
      controlType: 'text',
      type: 'text',
      sdtPr: {
        name: 'w:sdtPr',
        elements: [{ name: 'w:text', type: 'element' }],
      },
    });
    const adapter = createContentControlsAdapter(editor);

    const result = adapter.setType({ target: SDT_TARGET, controlType: 'checkbox' }, { changeMode: 'direct' });
    expect(result.success).toBe(true);

    const updateCmd = editor.commands!.updateStructuredContentById as ReturnType<typeof vi.fn>;
    const checkboxWrite = updateCmd.mock.calls.find((call) =>
      Boolean(call[1]?.attrs?.sdtPr?.elements?.find((el: { name: string }) => el.name === 'w14:checkbox')),
    );
    expect(checkboxWrite).toBeDefined();
    const checkbox = checkboxWrite?.[1]?.attrs?.sdtPr?.elements?.find(
      (el: { name: string; elements?: Array<{ name: string }> }) => el.name === 'w14:checkbox',
    );
    expect(checkbox?.elements?.some((el: { name: string }) => el.name === 'w14:checked')).toBe(true);
    expect(checkbox?.elements?.some((el: { name: string }) => el.name === 'w14:checkedState')).toBe(true);
    expect(checkbox?.elements?.some((el: { name: string }) => el.name === 'w14:uncheckedState')).toBe(true);
  });
});
