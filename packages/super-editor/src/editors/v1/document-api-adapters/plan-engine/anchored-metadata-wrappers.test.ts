import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import {
  metadataAttachWrapper,
  metadataGetWrapper,
  metadataListWrapper,
  metadataRemoveWrapper,
  metadataResolveWrapper,
  metadataUpdateWrapper,
} from './anchored-metadata-wrappers.js';
import { registerBuiltInExecutors } from './register-executors.js';

registerBuiltInExecutors();

type NodeOptions = {
  attrs?: Record<string, unknown>;
  text?: string;
  isInline?: boolean;
  isBlock?: boolean;
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
  const contentSize = children.reduce((sum, child) => sum + child.nodeSize, 0);
  const nodeSize = isText ? text.length : (options.nodeSize ?? contentSize + (isInline ? 2 : 2));

  const node = {
    type: {
      name: typeName,
      create(newAttrs?: Record<string, unknown>, content?: unknown) {
        return createNode(typeName, Array.isArray(content) ? (content as ProseMirrorNode[]) : [], {
          attrs: newAttrs,
          isInline,
          isBlock,
          inlineContent,
        });
      },
    },
    attrs,
    text: isText ? text : undefined,
    content: {
      size: contentSize,
      cut: vi.fn(() => []),
    },
    marks: [],
    nodeSize,
    isText,
    isInline,
    isBlock,
    inlineContent,
    isTextblock: inlineContent,
    isLeaf: isInline && !isText && children.length === 0,
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
    get textContent(): string {
      if (isText) return text;
      return children.map((child) => child.textContent).join('');
    },
    descendants(callback: (node: ProseMirrorNode, pos: number, parent?: ProseMirrorNode, index?: number) => void) {
      function walk(kids: ProseMirrorNode[], startPos: number, parent?: ProseMirrorNode) {
        let offset = startPos;
        kids.forEach((child, index) => {
          callback(child, offset, parent, index);
          const nested = (child as unknown as { _children?: ProseMirrorNode[] })._children ?? [];
          if (nested.length > 0) walk(nested, offset + 1, child);
          offset += child.nodeSize;
        });
      }
      walk(children, 0, node as unknown as ProseMirrorNode);
    },
    _children: children,
  };

  return node as unknown as ProseMirrorNode;
}

const TARGET = {
  kind: 'selection' as const,
  start: { kind: 'text' as const, blockId: 'p1', offset: 0 },
  end: { kind: 'text' as const, blockId: 'p1', offset: 5 },
};

function makeEditor(docOverride?: ProseMirrorNode): Editor {
  const text = createNode('text', [], { text: 'Hello' });
  const paragraph = createNode('paragraph', [text], {
    attrs: { sdBlockId: 'p1' },
    isBlock: true,
    inlineContent: true,
  });
  const doc = (docOverride ?? createNode('doc', [paragraph], { isBlock: false })) as ProseMirrorNode & {
    textBetween: (from: number, to: number) => string;
    slice: () => { content: ProseMirrorNode[] };
    resolve: (pos: number) => {
      parent: ProseMirrorNode;
      depth: number;
      parentOffset: number;
      before: () => number;
      after: () => number;
    };
  };

  const firstParagraph =
    (doc as unknown as { _children?: ProseMirrorNode[] })._children?.find((child) => child.type.name === 'paragraph') ??
    paragraph;
  doc.textBetween = (from: number, to: number) => 'Hello'.slice(Math.max(0, from - 1), Math.max(0, to - 1));
  doc.slice = () => ({ content: [] });
  doc.resolve = (pos: number) => ({
    parent: firstParagraph,
    depth: 1,
    parentOffset: Math.max(0, pos - 1),
    before: () => 0,
    after: () => firstParagraph.nodeSize,
  });

  const tr = {
    replaceWith: vi.fn().mockReturnThis(),
    setMeta: vi.fn().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged: true,
    steps: [{}],
    doc,
  };

  return {
    state: {
      doc,
      tr,
      schema: {
        nodes: {
          structuredContent: {
            create: vi.fn((attrs?: Record<string, unknown>) =>
              createNode('structuredContent', [], {
                attrs,
                isInline: true,
                isBlock: false,
                inlineContent: true,
                nodeSize: 2,
              }),
            ),
          },
        },
        marks: {},
      },
    },
    schema: {
      nodes: {
        structuredContent: {
          create: vi.fn((attrs?: Record<string, unknown>) =>
            createNode('structuredContent', [], {
              attrs,
              isInline: true,
              isBlock: false,
              inlineContent: true,
              nodeSize: 2,
            }),
          ),
        },
      },
      marks: {},
    },
    view: { dispatch: vi.fn() },
    dispatch: vi.fn(),
    converter: { convertedXml: {} },
    options: {},
    on: vi.fn(),
  } as unknown as Editor;
}

describe('anchored metadata wrappers', () => {
  it('attaches, lists, gets, updates, and removes a JSON payload', () => {
    const editor = makeEditor();

    const attached = metadataAttachWrapper(
      editor,
      { id: 'meta-1', target: TARGET, namespace: 'urn:test:metadata', payload: { label: 'Alpha' } },
      { changeMode: 'direct' },
    );

    expect(attached).toMatchObject({ success: true, id: 'meta-1', namespace: 'urn:test:metadata' });
    expect(
      metadataListWrapper(editor).items.map(({ id, namespace, partName }) => ({ id, namespace, partName })),
    ).toEqual([{ id: 'meta-1', namespace: 'urn:test:metadata', partName: 'customXml/item1.xml' }]);
    expect(metadataGetWrapper(editor, { id: 'meta-1' })?.payload).toEqual({ label: 'Alpha' });

    expect(metadataUpdateWrapper(editor, { id: 'meta-1', payload: { label: 'Beta' } })).toEqual({
      success: true,
      id: 'meta-1',
    });
    expect(metadataGetWrapper(editor, { id: 'meta-1' })?.payload).toEqual({ label: 'Beta' });

    expect(metadataRemoveWrapper(editor, { id: 'meta-1' })).toEqual({ success: true, id: 'meta-1' });
    expect(metadataGetWrapper(editor, { id: 'meta-1' })).toBeNull();
    expect(metadataListWrapper(editor).total).toBe(0);
  });

  it('filters list entries by namespace', () => {
    const editor = makeEditor();

    metadataAttachWrapper(editor, { id: 'a', target: TARGET, namespace: 'urn:a', payload: { n: 1 } });
    metadataAttachWrapper(editor, { id: 'b', target: TARGET, namespace: 'urn:b', payload: { n: 2 } });

    expect(metadataListWrapper(editor, { namespace: 'urn:b' }).items.map((item) => item.id)).toEqual(['b']);
  });

  it('does not mutate storage during attach dry-run', () => {
    const editor = makeEditor();

    const result = metadataAttachWrapper(
      editor,
      { id: 'dry', target: TARGET, namespace: 'urn:test:metadata', payload: { label: 'Preview' } },
      { changeMode: 'direct', dryRun: true },
    );

    expect(result).toMatchObject({ success: true, id: 'dry', partName: 'customXml/item1.xml' });
    expect(metadataListWrapper(editor).total).toBe(0);
  });

  it('attach dry-run throws REVISION_MISMATCH when expectedRevision is stale', () => {
    const editor = makeEditor();

    // Live attach throws via executeDomainCommand -> checkRevision; dry-run
    // must match that shape so consumers can use one try/catch path.
    expect(() =>
      metadataAttachWrapper(
        editor,
        { id: 'stale-attach', target: TARGET, namespace: 'urn:test:metadata', payload: { label: 'Preview' } },
        { changeMode: 'direct', dryRun: true, expectedRevision: 'stale-1' },
      ),
    ).toThrow(/REVISION_MISMATCH/);
    expect(metadataListWrapper(editor).total).toBe(0);
  });

  it('remove dry-run throws REVISION_MISMATCH when expectedRevision is stale', () => {
    const editor = makeEditor();

    // Seed an entry so remove finds something to act on; without this it
    // would short-circuit with TARGET_NOT_FOUND before the revision check.
    metadataAttachWrapper(
      editor,
      { id: 'seed', target: TARGET, namespace: 'urn:test:metadata', payload: { v: 1 } },
      { changeMode: 'direct' },
    );

    expect(() =>
      metadataRemoveWrapper(
        editor,
        { id: 'seed' },
        { changeMode: 'direct', dryRun: true, expectedRevision: 'stale-1' },
      ),
    ).toThrow(/REVISION_MISMATCH/);
    // The seeded entry remains intact: dry-run with stale revision must not mutate.
    expect(metadataGetWrapper(editor, { id: 'seed' })?.payload).toEqual({ v: 1 });
  });

  it('resolves an existing anchor tag to its text range', () => {
    const sdt = createNode('structuredContent', [createNode('text', [], { text: 'Hello' })], {
      attrs: { id: '100', tag: 'meta-1' },
      isInline: true,
      isBlock: false,
      inlineContent: true,
    });
    const paragraph = createNode('paragraph', [sdt], {
      attrs: { sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = makeEditor(doc);
    seedPayload(editor, 'customXml/item1.xml', 'urn:test:metadata', [{ id: 'meta-1', json: '{"label":"Alpha"}' }]);

    expect(metadataResolveWrapper(editor, { id: 'meta-1' })).toEqual({
      id: 'meta-1',
      target: {
        kind: 'selection',
        start: { kind: 'text', blockId: 'p1', offset: 0 },
        end: { kind: 'text', blockId: 'p1', offset: 5 },
      },
    });
  });

  it('returns null when the SDT tag has no matching payload entry (foreign content control with same w:tag)', () => {
    // Imported DOCX with an inline SDT whose `w:tag === 'meta-1'` but no
    // customXml payload entry — could be a Word-authored content control
    // that happens to share an id with what a consumer would `attach`.
    // Both halves of the anchor must agree before `resolve` reports the
    // id resolves, otherwise UIs that trust `resolve` could be steered
    // at an unrelated control.
    const sdt = createNode('structuredContent', [createNode('text', [], { text: 'Hello' })], {
      attrs: { id: '100', tag: 'meta-1' },
      isInline: true,
      isBlock: false,
      inlineContent: true,
    });
    const paragraph = createNode('paragraph', [sdt], {
      attrs: { sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = makeEditor(doc);
    // Intentionally no seedPayload call — convertedXml stays empty.

    expect(metadataResolveWrapper(editor, { id: 'meta-1' })).toBeNull();
  });
});

/**
 * Seed a metadata customXml part directly on the editor's converter.
 * Lets tests that pre-seed an SDT in the doc (without going through
 * `metadataAttachWrapper`) also wire up the payload side so the
 * `metadata.resolve` / `metadata.get` payload gate can find an entry.
 */
function seedPayload(
  editor: Editor,
  partName: string,
  namespace: string,
  entries: Array<{ id: string; json: string }>,
): void {
  const convertedXml = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter
    .convertedXml;
  convertedXml[partName] = {
    elements: [
      {
        type: 'element',
        name: 'refs',
        attributes: { xmlns: namespace },
        elements: entries.map((entry) => ({
          type: 'element',
          name: 'ref',
          attributes: { id: entry.id, encoding: 'json' },
          elements: [{ type: 'text', text: entry.json }],
        })),
      },
    ],
  };
}
