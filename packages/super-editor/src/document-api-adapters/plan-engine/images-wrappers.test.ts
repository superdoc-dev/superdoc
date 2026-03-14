import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import { registerBuiltInExecutors } from './register-executors.js';
import { imagesScaleWrapper, imagesReplaceSourceWrapper, imagesSetAltTextWrapper } from './images-wrappers.js';

// Ensure the domain.command executor is registered for executeDomainCommand
registerBuiltInExecutors();

// ---------------------------------------------------------------------------
// Mock node builder
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
    type: { name: typeName },
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
    descendants(callback: (node: ProseMirrorNode, pos: number) => void) {
      function walk(childNodes: ProseMirrorNode[], baseOffset: number) {
        let offset = baseOffset;
        for (const child of childNodes) {
          callback(child, offset);
          const grandchildren = (child as any)._children;
          if (grandchildren?.length) {
            walk(grandchildren, offset + 1);
          }
          offset += child.nodeSize;
        }
      }
      walk(children, 0);
    },
  } as unknown as ProseMirrorNode;

  (node as any)._children = children;
  return node;
}

// ---------------------------------------------------------------------------
// Mock editor builder
// ---------------------------------------------------------------------------

function createImageNode(attrs: Record<string, unknown> = {}): ProseMirrorNode {
  return createNode('image', [], {
    attrs: {
      sdImageId: 'img-1',
      src: 'data:image/png;base64,ABC',
      isAnchor: false,
      size: { width: 200, height: 100 },
      wrap: { type: 'Inline' },
      ...attrs,
    },
    isInline: true,
    isLeaf: true,
  });
}

function makeImageEditor(imageAttrs: Record<string, unknown> = {}): {
  editor: Editor;
  dispatch: ReturnType<typeof vi.fn>;
  setNodeMarkup: ReturnType<typeof vi.fn>;
  capturedAttrs: () => Record<string, unknown> | undefined;
} {
  const imageNode = createImageNode(imageAttrs);
  const paragraph = createNode('paragraph', [imageNode], {
    attrs: { paraId: 'p1', sdBlockId: 'p1' },
    isBlock: true,
    inlineContent: true,
  });
  const doc = createNode('doc', [paragraph], { isBlock: false });

  const setNodeMarkup = vi.fn();
  let lastAttrs: Record<string, unknown> | undefined;

  const dispatch = vi.fn();
  const tr = {
    setNodeMarkup: (...args: unknown[]) => {
      setNodeMarkup(...args);
      lastAttrs = args[2] as Record<string, unknown>;
      (tr as any).docChanged = true;
      return tr;
    },
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    setMeta: vi.fn().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged: false,
  };

  const editor = {
    state: {
      doc,
      get tr() {
        (tr as any).docChanged = false;
        return tr;
      },
    },
    dispatch,
    commands: {},
    helpers: {},
  } as unknown as Editor;

  return {
    editor,
    dispatch,
    setNodeMarkup,
    capturedAttrs: () => lastAttrs,
  };
}

// ---------------------------------------------------------------------------
// Regression: images.scale must not produce zero dimensions
// ---------------------------------------------------------------------------

describe('imagesScaleWrapper', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('floors dimensions to 1px when a very small factor would round to zero', () => {
    const { editor } = makeImageEditor({ size: { width: 3, height: 2 } });
    const result = imagesScaleWrapper(editor, { imageId: 'img-1', factor: 0.001 });

    // Should succeed (not produce 0-dimension) and floor to 1×1
    expect(result.success).toBe(true);
  });

  it('floors a single axis to 1px when only one dimension would round to zero', () => {
    // width=100 * 0.004 = 0.4 → round = 0 → max(1,0) = 1
    // height=200 * 0.004 = 0.8 → round = 1 → 1
    const { editor, capturedAttrs } = makeImageEditor({ size: { width: 100, height: 200 } });
    const result = imagesScaleWrapper(editor, { imageId: 'img-1', factor: 0.004 });

    expect(result.success).toBe(true);
    const newSize = capturedAttrs()?.size as { width: number; height: number };
    expect(newSize.width).toBeGreaterThanOrEqual(1);
    expect(newSize.height).toBeGreaterThanOrEqual(1);
  });

  it('scales normally for reasonable factors', () => {
    const { editor, capturedAttrs } = makeImageEditor({ size: { width: 200, height: 100 } });
    const result = imagesScaleWrapper(editor, { imageId: 'img-1', factor: 2 });

    expect(result.success).toBe(true);
    expect(capturedAttrs()?.size).toEqual({ width: 400, height: 200 });
  });
});

// ---------------------------------------------------------------------------
// Regression: images.replaceSource must clear originalSrc/originalExtension
// ---------------------------------------------------------------------------

describe('imagesReplaceSourceWrapper', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('clears originalSrc and originalExtension so export uses the new source', () => {
    const { editor, capturedAttrs } = makeImageEditor({
      originalSrc: 'word/media/image1.emf',
      originalExtension: '.emf',
    });

    imagesReplaceSourceWrapper(editor, {
      imageId: 'img-1',
      src: 'data:image/png;base64,NEWDATA',
    });

    const attrs = capturedAttrs()!;
    expect(attrs.originalSrc).toBeNull();
    expect(attrs.originalExtension).toBeNull();
    expect(attrs.src).toBe('data:image/png;base64,NEWDATA');
    expect(attrs.rId).toBeNull();
  });

  it('clears originalSrc even when replacing with an internal media path', () => {
    const { editor, capturedAttrs } = makeImageEditor({
      originalSrc: 'word/media/image1.wmf',
      originalExtension: '.wmf',
    });

    imagesReplaceSourceWrapper(editor, {
      imageId: 'img-1',
      src: 'word/media/image2.png',
    });

    const attrs = capturedAttrs()!;
    expect(attrs.originalSrc).toBeNull();
    expect(attrs.originalExtension).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Regression: images.setAltText must not no-op when decorative needs clearing
// ---------------------------------------------------------------------------

describe('imagesSetAltTextWrapper', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('clears decorative flag even when title already matches the description', () => {
    // Image is decorative with title = '' (empty). Setting alt text to '' should
    // still clear decorative, not return NO_OP.
    const { editor, capturedAttrs } = makeImageEditor({
      title: '',
      decorative: true,
    });

    const result = imagesSetAltTextWrapper(editor, { imageId: 'img-1', description: '' });

    expect(result.success).toBe(true);
    const attrs = capturedAttrs()!;
    expect(attrs.decorative).toBe(false);
  });

  it('clears decorative flag when setting non-empty description on a decorative image', () => {
    const { editor, capturedAttrs } = makeImageEditor({
      title: '',
      decorative: true,
    });

    const result = imagesSetAltTextWrapper(editor, { imageId: 'img-1', description: 'A photo of a sunset' });

    expect(result.success).toBe(true);
    const attrs = capturedAttrs()!;
    expect(attrs.title).toBe('A photo of a sunset');
    expect(attrs.decorative).toBe(false);
  });

  it('returns no-op when title matches and image is not decorative', () => {
    const { editor } = makeImageEditor({
      title: 'Already set',
      decorative: false,
    });

    const result = imagesSetAltTextWrapper(editor, { imageId: 'img-1', description: 'Already set' });

    expect(result.success).toBe(false);
    expect((result as any).failure?.code).toBe('NO_OP');
  });
});
