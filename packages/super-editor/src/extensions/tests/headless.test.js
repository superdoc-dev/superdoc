/**
 * Headless Mode Node View Tests
 *
 * Focused test suite verifying node views are properly disabled in headless mode
 * while maintaining full document functionality.
 */

import { describe, it, expect, vi } from 'vitest';
import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { getTestDataAsFileBuffer } from '@tests/helpers/helpers.js';
import { EditorState } from 'prosemirror-state';

const HEADLESS_OPEN_FIXTURE_CANDIDATES = [
  'doc-with-headings.docx',
  'contract-acc.docx',
  'table-width-issue.docx',
  'advanced-text.docx',
];

const INVALID_PARAGRAPH_RANGE_ERROR = 'Invalid content for node paragraph';

const loadHeadlessOpenFixtureBuffer = async () => {
  let lastError = null;
  for (const filename of HEADLESS_OPEN_FIXTURE_CANDIDATES) {
    try {
      const buffer = await getTestDataAsFileBuffer(filename);
      return { buffer, filename };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('Failed to load any headless open fixture');
};

const hasInvalidParagraphRangeError = (calls) =>
  calls.some((args) =>
    args.some(
      (value) =>
        (value instanceof RangeError &&
          typeof value.message === 'string' &&
          value.message.includes(INVALID_PARAGRAPH_RANGE_ERROR)) ||
        (typeof value === 'string' && value.includes(INVALID_PARAGRAPH_RANGE_ERROR)),
    ),
  );

describe('Headless Mode Optimization', () => {
  it('opens real DOCX fixtures headlessly without paragraph RangeErrors', async () => {
    const { buffer } = await loadHeadlessOpenFixtureBuffer();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const onException = vi.fn();

    let editor;
    try {
      editor = await Editor.open(buffer, {
        extensions: getStarterExtensions(),
        suppressDefaultDocxStyles: true,
        onException,
      });

      expect(editor.options.isHeadless).toBe(true);
      expect(editor.lifecycleState).toBe('ready');
      expect(onException).not.toHaveBeenCalled();
      expect(hasInvalidParagraphRangeError(logSpy.mock.calls)).toBe(false);
    } finally {
      logSpy.mockRestore();
      editor?.destroy();
    }
  });

  it('should filter optimized node views in headless mode', async () => {
    const buffer = await getTestDataAsFileBuffer('complex2.docx');
    const [content, , mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    const editor = new Editor({
      isHeadless: true,
      mode: 'docx',
      documentId: 'headless-test',
      extensions: getStarterExtensions(),
      content,
      mediaFiles,
      fonts,
    });

    const nodeViews = editor.extensionService.nodeViews;
    const activeNodeViewNames = Object.keys(nodeViews);

    // Optimized node views that shouldn't be present in headless mode
    const optimizedNodeViews = ['paragraph'];

    optimizedNodeViews.forEach((name) => {
      expect(activeNodeViewNames).not.toContain(name);
    });

    editor.destroy();
  });

  it('should maintain full document functionality without node views', async () => {
    const buffer = await getTestDataAsFileBuffer('simple-ordered-list.docx');
    const [content, , mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    const editor = new Editor({
      isHeadless: true,
      mode: 'docx',
      documentId: 'headless-functionality',
      extensions: getStarterExtensions(),
      content,
      mediaFiles,
      fonts,
    });

    // Check for document import
    const json = editor.getJSON();
    expect(json.type).toBe('doc');
    expect(json.content.length).toBeGreaterThan(0);

    // Check for document edit
    expect(editor.commands.toggleOrderedList).toBeDefined();
    editor.commands.insertContent({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Test' }],
    });
    expect(editor.state.doc.textContent).toContain('Test');

    // Check export still works
    const exported = await editor.exportDocx();
    expect(Buffer.isBuffer(exported)).toBe(true);
    expect(exported.length).toBeGreaterThan(0);

    editor.destroy();
  });

  it('updates paragraph runProperties for first runs nested in inline wrappers in headless mode', async () => {
    const buffer = await getTestDataAsFileBuffer('blank-doc.docx');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    let editor;
    try {
      editor = await Editor.open(buffer, {
        extensions: getStarterExtensions(),
        suppressDefaultDocxStyles: true,
      });

      const { doc, paragraph, pageReference, run } = editor.schema.nodes;
      expect(pageReference).toBeDefined();
      expect(run).toBeDefined();

      const testDoc = doc.create(null, [
        paragraph.create(null, [
          pageReference.create({ instruction: 'PAGEREF _Toc123456789 h' }, [
            run.create(null, [editor.schema.text('Ref')]),
          ]),
          run.create(null, [editor.schema.text(' tail')]),
        ]),
      ]);
      const baseState = EditorState.create({
        schema: editor.schema,
        doc: testDoc,
        plugins: editor.state.plugins,
      });
      editor.setState(baseState);

      const runPositions = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type === run) runPositions.push(pos);
        return true;
      });
      const [nestedRunPos] = runPositions;
      const tr = editor.state.tr.addMark(nestedRunPos + 1, nestedRunPos + 4, editor.schema.marks.bold.create());
      editor.dispatch(tr);

      const updatedParagraph = editor.state.doc.firstChild;
      expect(updatedParagraph?.attrs?.paragraphProperties).toEqual({ runProperties: { bold: true } });
      expect(hasInvalidParagraphRangeError(logSpy.mock.calls)).toBe(false);
    } finally {
      logSpy.mockRestore();
      editor?.destroy();
    }
  });

  it('preserves list attributes in headless mode even without node views', async () => {
    const buffer = await getTestDataAsFileBuffer('simple-ordered-list.docx');
    const [content, , mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    const editor = new Editor({
      isHeadless: true,
      mode: 'docx',
      documentId: 'headless-list-attrs',
      extensions: getStarterExtensions(),
      content,
      mediaFiles,
      fonts,
    });

    const json = editor.getJSON();
    const stack = [...(json.content || [])];
    let listItemNode = null;

    while (stack.length && !listItemNode) {
      const node = stack.shift();
      if (node.type === 'paragraph' && node.attrs?.paragraphProperties?.numberingProperties != null) {
        listItemNode = node;
        break;
      }
      if (Array.isArray(node?.content)) {
        stack.push(...node.content);
      }
    }

    expect(listItemNode).toBeTruthy();
    expect(listItemNode.attrs.listRendering.path.length).toBeGreaterThan(0);
    expect(listItemNode?.attrs.paragraphProperties?.numberingProperties?.numId).toBe(1);
    expect(listItemNode?.attrs.paragraphProperties?.numberingProperties?.ilvl).toBe(0);

    editor.destroy();
  });
});
