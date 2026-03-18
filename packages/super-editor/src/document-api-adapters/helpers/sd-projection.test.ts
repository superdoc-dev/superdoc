import { beforeAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import type { Editor } from '../../core/Editor.js';
import { projectContentNode, projectInlineNode, projectDocument } from './sd-projection.js';
import { executeStructuralInsert, materializeFragment } from '../structural-write-engine/index.js';
import { sdFindAdapter } from '../find-adapter.js';
import { markdownToPmFragment } from '../../core/helpers/markdown/markdownToPmContent.js';
import type { SDFragment, SDParagraph, SDHeading, SDTable, SDRun, SDHyperlink, SDSdt } from '@superdoc/document-api';

let docData: Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

beforeAll(async () => {
  docData = await loadTestDataForEditorTests('blank-doc.docx');
});

let editor: Editor;

beforeEach(() => {
  ({ editor } = initTestEditor({
    content: docData.docx,
    media: docData.media,
    mediaFiles: docData.mediaFiles,
    fonts: docData.fonts,
  }));
});

afterEach(() => {
  editor?.destroy();
  // @ts-expect-error cleanup
  editor = null;
});

// ---------------------------------------------------------------------------
// projectContentNode
// ---------------------------------------------------------------------------

describe('projectContentNode', () => {
  it('projects a paragraph node', () => {
    // Insert a paragraph and project the first child back
    executeStructuralInsert(editor, {
      content: {
        kind: 'paragraph',
        paragraph: {
          inlines: [{ kind: 'run', run: { text: 'hello projection' } }],
        },
      } as any,
    });

    // Find the inserted paragraph
    let targetNode: import('prosemirror-model').Node | undefined;
    editor.state.doc.forEach((child) => {
      if (child.textContent.includes('hello projection')) {
        targetNode = child;
      }
    });

    expect(targetNode).toBeDefined();
    const projected = projectContentNode(targetNode!);

    expect(projected.kind).toBe('paragraph');
    const p = projected as SDParagraph;
    expect(p.paragraph.inlines.length).toBeGreaterThan(0);

    const firstInline = p.paragraph.inlines[0] as SDRun;
    expect(firstInline.kind).toBe('run');
    expect(firstInline.run.text).toBe('hello projection');
  });

  it('projects a paragraph with bold text when schema supports bold marks', () => {
    const hasBoldMark = !!editor.state.schema.marks.bold;

    executeStructuralInsert(editor, {
      content: {
        kind: 'paragraph',
        paragraph: {
          inlines: [{ kind: 'run', run: { text: 'bold text', props: { bold: true } } }],
        },
      } as any,
    });

    let targetNode: import('prosemirror-model').Node | undefined;
    editor.state.doc.forEach((child) => {
      if (child.textContent.includes('bold text')) {
        targetNode = child;
      }
    });

    expect(targetNode).toBeDefined();

    // Verify PM paragraph has text content
    expect(targetNode!.childCount).toBeGreaterThan(0);
    expect(targetNode!.textContent).toBe('bold text');

    // SuperDoc schema uses 'run' nodes inside paragraphs, not bare text nodes
    const child = targetNode!.child(0);
    expect(child.type.name).toBe('run');

    const projected = projectContentNode(targetNode!) as SDParagraph;
    expect(projected.paragraph.inlines.length).toBeGreaterThan(0);
    const firstInline = projected.paragraph.inlines[0] as SDRun;
    expect(firstInline.kind).toBe('run');
    expect(firstInline.run.text).toBe('bold text');

    if (hasBoldMark) {
      // Bold mark should be projected back as props.bold
      expect(firstInline.run.props?.bold).toBe(true);
    }
  });

  it('projects a table node', () => {
    executeStructuralInsert(editor, {
      content: {
        type: 'table',
        rows: [
          {
            type: 'tableRow',
            cells: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cell 1' }] }],
              },
            ],
          },
        ],
      },
    });

    let tableNode: import('prosemirror-model').Node | undefined;
    editor.state.doc.forEach((child) => {
      if (child.type.name === 'table') {
        tableNode = child;
      }
    });

    expect(tableNode).toBeDefined();
    const projected = projectContentNode(tableNode!) as SDTable;
    expect(projected.kind).toBe('table');
    expect(projected.table.rows.length).toBe(1);
    expect(projected.table.rows[0].cells.length).toBe(1);
    expect(projected.table.rows[0].cells[0].content.length).toBeGreaterThan(0);
  });

  it('projects markdown table width and normalization marker', () => {
    const { fragment } = markdownToPmFragment('| Col A | Col B |\n| --- | --- |\n| foo | bar |', editor);
    expect(fragment.childCount).toBeGreaterThan(0);

    const projected = projectContentNode(fragment.child(0)) as SDTable;
    expect(projected.kind).toBe('table');
    expect(projected.table.props?.width).toEqual({ kind: 'percent', value: 5000 });
    expect((projected.ext as any)?.superdoc?.needsTableStyleNormalization).toBe(true);
  });

  it('preserves sdBlockId as id', () => {
    executeStructuralInsert(editor, {
      content: {
        kind: 'paragraph',
        id: 'my-projected-id',
        paragraph: { inlines: [{ kind: 'run', run: { text: 'id test' } }] },
      } as any,
    });

    let targetNode: import('prosemirror-model').Node | undefined;
    editor.state.doc.forEach((child) => {
      if (child.textContent.includes('id test')) {
        targetNode = child;
      }
    });

    expect(targetNode).toBeDefined();
    const projected = projectContentNode(targetNode!);
    expect(projected.id).toBe('my-projected-id');
  });
});

// ---------------------------------------------------------------------------
// projectInlineNode
// ---------------------------------------------------------------------------

describe('projectInlineNode', () => {
  it('projects a text node as SDRun', () => {
    executeStructuralInsert(editor, {
      content: {
        kind: 'paragraph',
        paragraph: {
          inlines: [{ kind: 'run', run: { text: 'inline text' } }],
        },
      } as any,
    });

    // Walk the doc to find a text node
    let textNode: import('prosemirror-model').Node | undefined;
    editor.state.doc.descendants((node) => {
      if (node.isText && node.text?.includes('inline text')) {
        textNode = node;
        return false;
      }
      return true;
    });

    expect(textNode).toBeDefined();
    const projected = projectInlineNode(textNode!) as SDRun;
    expect(projected.kind).toBe('run');
    expect(projected.run.text).toBe('inline text');
  });

  it('projects a structuredContent node as SDSdt with inlines', () => {
    // Build a PM structuredContent node directly via schema
    const schema = editor.state.schema;
    const scType = schema.nodes.structuredContent;
    if (!scType) return; // skip if schema doesn't have the extension

    const runType = schema.nodes.run;
    const textNode = schema.text('sdt text');
    const runNode = runType ? runType.create({}, textNode) : textNode;

    const sdtNode = scType.create(
      {
        id: 42,
        tag: 'my-tag',
        alias: 'My Alias',
        controlType: 'text',
        lockMode: 'contentLocked',
        appearance: 'boundingBox',
        placeholder: 'Enter text',
      },
      [runNode],
    );

    const projected = projectInlineNode(sdtNode) as SDSdt;
    expect(projected.kind).toBe('sdt');
    expect(projected.id).toBe('42');
    expect(projected.sdt.tag).toBe('my-tag');
    expect(projected.sdt.alias).toBe('My Alias');
    expect(projected.sdt.type).toBe('text');
    expect(projected.sdt.lock).toBe('content');
    expect(projected.sdt.appearance).toBe('boundingBox');
    expect(projected.sdt.placeholder).toBe('Enter text');
    expect(projected.sdt.scope).toBe('inline');
    expect(projected.sdt.inlines).toBeDefined();
    expect(projected.sdt.inlines!.length).toBeGreaterThan(0);
    expect(projected.sdt.content).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// projectContentNode — block SDT metadata
// ---------------------------------------------------------------------------

describe('projectContentNode — block SDT', () => {
  it('projects a structuredContentBlock with full metadata', () => {
    const schema = editor.state.schema;
    const scbType = schema.nodes.structuredContentBlock;
    if (!scbType) return;

    const paraType = schema.nodes.paragraph;
    const textNode = schema.text('block sdt');
    const para = paraType.create({}, [textNode]);
    const sdtBlock = scbType.create(
      { id: 99, tag: 'block-tag', alias: 'Block Alias', controlType: 'group', lockMode: 'sdtContentLocked' },
      [para],
    );

    const projected = projectContentNode(sdtBlock) as SDSdt;
    expect(projected.kind).toBe('sdt');
    expect(projected.id).toBe('99');
    expect(projected.sdt.tag).toBe('block-tag');
    expect(projected.sdt.type).toBe('group');
    expect(projected.sdt.lock).toBe('both');
    expect(projected.sdt.scope).toBe('block');
    expect(projected.sdt.content).toBeDefined();
    expect(projected.sdt.inlines).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// projectDocument
// ---------------------------------------------------------------------------

describe('projectDocument', () => {
  it('projects a full document with body', () => {
    executeStructuralInsert(editor, {
      content: {
        kind: 'paragraph',
        paragraph: {
          inlines: [{ kind: 'run', run: { text: 'doc content' } }],
        },
      } as any,
    });

    const sdDoc = projectDocument(editor);

    expect(sdDoc.modelVersion).toBe('sdm/1');
    expect(sdDoc.body.length).toBeGreaterThan(0);

    // At least one paragraph should contain our text
    const hasContent = sdDoc.body.some((node) => {
      if (node.kind !== 'paragraph') return false;
      return (node as SDParagraph).paragraph.inlines.some(
        (inline) => inline.kind === 'run' && (inline as SDRun).run.text.includes('doc content'),
      );
    });
    expect(hasContent).toBe(true);
  });

  it('produces round-trip compatible shapes for insert → get', () => {
    const originalFragment: SDFragment = {
      kind: 'paragraph',
      id: 'round-trip-test',
      paragraph: {
        inlines: [{ kind: 'run', run: { text: 'round trip' } }],
      },
    } as any;

    executeStructuralInsert(editor, { content: originalFragment });
    const sdDoc = projectDocument(editor);

    const found = sdDoc.body.find((n) => n.id === 'round-trip-test') as SDParagraph | undefined;
    expect(found).toBeDefined();
    expect(found!.kind).toBe('paragraph');
    expect(found!.paragraph.inlines.length).toBe(1);

    const run = found!.paragraph.inlines[0] as SDRun;
    expect(run.kind).toBe('run');
    expect(run.run.text).toBe('round trip');
  });

  it('round-trips bold/italic when schema supports those marks', () => {
    const hasBold = !!editor.state.schema.marks.bold;

    executeStructuralInsert(editor, {
      content: {
        kind: 'paragraph',
        id: 'mark-round-trip',
        paragraph: {
          inlines: [{ kind: 'run', run: { text: 'styled', props: { bold: true } } }],
        },
      } as any,
    });

    // Debug: verify the PM text node structure
    let foundTextNode: import('prosemirror-model').Node | undefined;
    let foundTextMarks: import('prosemirror-model').Mark[] = [];
    editor.state.doc.descendants((node) => {
      if (node.isText && node.text === 'styled') {
        foundTextNode = node;
        foundTextMarks = Array.from(node.marks);
        return false;
      }
      return true;
    });

    expect(foundTextNode).toBeDefined();
    if (hasBold) {
      // The materializer should have applied the bold mark
      const boldMarkPresent = foundTextMarks.some((m) => m.type.name === 'bold');
      expect(boldMarkPresent).toBe(true);
    }

    const sdDoc = projectDocument(editor);
    const found = sdDoc.body.find((n) => n.id === 'mark-round-trip') as SDParagraph | undefined;
    expect(found).toBeDefined();

    const run = found!.paragraph.inlines[0] as SDRun;
    expect(run.run.text).toBe('styled');

    if (hasBold) {
      expect(run.run.props?.bold).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// sdFindAdapter — inline SDT projection
// ---------------------------------------------------------------------------

describe('sdFindAdapter — inline SDT node.kind', () => {
  it('returns kind "sdt" for inline structuredContent nodes', () => {
    const schema = editor.state.schema;
    if (!schema.nodes.structuredContent) return;

    // Insert a paragraph containing an inline SDT via the structural write engine
    executeStructuralInsert(editor, {
      content: {
        kind: 'paragraph',
        id: 'p-find-sdt',
        paragraph: {
          inlines: [
            {
              kind: 'sdt',
              id: '777',
              sdt: {
                tag: 'find-test',
                type: 'text',
                scope: 'inline',
                inlines: [{ kind: 'run', run: { text: 'inside sdt' } }],
              },
            } as any,
          ],
        },
      } as any,
    });

    const result = sdFindAdapter(editor, {
      select: { type: 'node', nodeType: 'sdt' },
    });

    const inlineItem = result.items.find((item) => item.address.kind === 'inline');
    expect(inlineItem).toBeDefined();
    expect(inlineItem!.node.kind).toBe('sdt');

    const sdt = inlineItem!.node as SDSdt;
    expect(sdt.sdt.tag).toBe('find-test');
    expect(sdt.sdt.type).toBe('text');
    expect(sdt.sdt.scope).toBe('inline');
  });
});

// ---------------------------------------------------------------------------
// Inline SDT round-trip: project → materialize → project
// ---------------------------------------------------------------------------

describe('inline SDT round-trip', () => {
  it('materializes a projected inline SDSdt back to structuredContent PM node', () => {
    const schema = editor.state.schema;
    if (!schema.nodes.structuredContent) return;

    const sdtFragment: SDFragment = {
      kind: 'paragraph',
      id: 'sdt-rt-para',
      paragraph: {
        inlines: [
          {
            kind: 'sdt',
            id: '888',
            sdt: {
              tag: 'rt-tag',
              type: 'text',
              lock: 'content',
              scope: 'inline',
              inlines: [{ kind: 'run', run: { text: 'round trip' } }],
            },
          } as any,
        ],
      },
    } as any;

    const pmFragment = materializeFragment(schema, sdtFragment);
    const para = pmFragment.child(0);
    expect(para.type.name).toBe('paragraph');

    // Find the structuredContent child
    let scNode: import('prosemirror-model').Node | undefined;
    para.forEach((child) => {
      if (child.type.name === 'structuredContent') scNode = child;
    });

    expect(scNode).toBeDefined();
    expect(scNode!.attrs.tag).toBe('rt-tag');
    expect(scNode!.attrs.controlType).toBe('text');
    expect(scNode!.attrs.lockMode).toBe('contentLocked');

    // Project back and verify shape is preserved
    const projected = projectInlineNode(scNode!) as SDSdt;
    expect(projected.kind).toBe('sdt');
    expect(projected.sdt.tag).toBe('rt-tag');
    expect(projected.sdt.type).toBe('text');
    expect(projected.sdt.lock).toBe('content');
    expect(projected.sdt.scope).toBe('inline');
  });
});
