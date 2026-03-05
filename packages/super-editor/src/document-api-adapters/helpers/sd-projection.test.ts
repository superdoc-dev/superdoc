import { beforeAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import type { Editor } from '../../core/Editor.js';
import { projectContentNode, projectInlineNode, projectDocument } from './sd-projection.js';
import { executeStructuralInsert } from '../structural-write-engine/index.js';
import { markdownToPmFragment } from '../../core/helpers/markdown/markdownToPmContent.js';
import type { SDFragment, SDParagraph, SDHeading, SDTable, SDRun, SDHyperlink } from '@superdoc/document-api';

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
