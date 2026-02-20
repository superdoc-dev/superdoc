import { describe, it, expect, vi, beforeEach } from 'vitest';
import { insertContent } from './insertContent.js';
import * as contentProcessor from '../helpers/contentProcessor.js';

vi.mock('../helpers/contentProcessor.js');

describe('insertContent', () => {
  let mockCommands, mockState, mockEditor, mockTr;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTr = {
      selection: { from: 0, to: 10 },
    };

    mockCommands = {
      insertContentAt: vi.fn(() => true),
    };

    mockState = {
      schema: { nodes: {} },
    };

    mockEditor = {
      schema: mockState.schema,
      migrateListsToV2: vi.fn(),
    };
  });

  it('uses original behavior when contentType is not specified', () => {
    const command = insertContent('test content', {});

    command({ tr: mockTr, state: mockState, commands: mockCommands, editor: mockEditor });

    expect(mockCommands.insertContentAt).toHaveBeenCalledWith({ from: 0, to: 10 }, 'test content', {});
    expect(contentProcessor.processContent).not.toHaveBeenCalled();
  });

  it('uses content processor when contentType is specified', async () => {
    const mockDoc = {
      toJSON: vi.fn(() => ({ type: 'doc', content: [] })),
    };

    contentProcessor.processContent.mockReturnValue(mockDoc);

    const command = insertContent('<p>HTML</p>', { contentType: 'html' });

    command({ tr: mockTr, state: mockState, commands: mockCommands, editor: mockEditor });
    await Promise.resolve(); // flush microtasks

    expect(contentProcessor.processContent).toHaveBeenCalledWith({
      content: '<p>HTML</p>',
      type: 'html',
      editor: mockEditor,
    });

    expect(mockCommands.insertContentAt).toHaveBeenCalledWith(
      { from: 0, to: 10 },
      { type: 'doc', content: [] },
      { contentType: 'html' },
    );

    // Should trigger list migration for HTML (microtask)
    expect(mockEditor.migrateListsToV2).toHaveBeenCalledTimes(1);
  });

  it('validates contentType and returns false for invalid types', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const command = insertContent('test', { contentType: 'invalid' });
    const result = command({ tr: mockTr, state: mockState, commands: mockCommands, editor: mockEditor });

    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid contentType'));
    expect(mockCommands.insertContentAt).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('handles processing errors gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    contentProcessor.processContent.mockImplementation(() => {
      throw new Error('Processing failed');
    });

    const command = insertContent('test', { contentType: 'html' });
    const result = command({ tr: mockTr, state: mockState, commands: mockCommands, editor: mockEditor });

    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to process html'), expect.any(Error));

    consoleSpy.mockRestore();
  });

  it('processes all valid content types', () => {
    const mockDoc = { toJSON: () => ({}) };
    contentProcessor.processContent.mockReturnValue(mockDoc);

    const validTypes = ['html', 'markdown', 'text', 'schema'];

    validTypes.forEach((type) => {
      const command = insertContent('content', { contentType: type });
      command({ tr: mockTr, state: mockState, commands: mockCommands, editor: mockEditor });

      expect(contentProcessor.processContent).toHaveBeenCalledWith(expect.objectContaining({ type }));
    });

    expect(contentProcessor.processContent).toHaveBeenCalledTimes(4);
  });

  it('calls migrateListsToV2 only for html/markdown when insert succeeds', async () => {
    const mockDoc = { toJSON: () => ({}) };
    contentProcessor.processContent.mockReturnValue(mockDoc);

    // html
    insertContent('c', { contentType: 'html' })({
      tr: mockTr,
      state: mockState,
      commands: mockCommands,
      editor: mockEditor,
    });
    // markdown
    insertContent('c', { contentType: 'markdown' })({
      tr: mockTr,
      state: mockState,
      commands: mockCommands,
      editor: mockEditor,
    });
    // text
    insertContent('c', { contentType: 'text' })({
      tr: mockTr,
      state: mockState,
      commands: mockCommands,
      editor: mockEditor,
    });
    // schema
    insertContent('c', { contentType: 'schema' })({
      tr: mockTr,
      state: mockState,
      commands: mockCommands,
      editor: mockEditor,
    });

    await Promise.resolve(); // flush microtasks
    expect(mockEditor.migrateListsToV2).toHaveBeenCalledTimes(2);
  });

  it('does not call migrateListsToV2 when insert fails', async () => {
    mockCommands.insertContentAt.mockReturnValueOnce(false);
    const mockDoc = { toJSON: () => ({}) };
    contentProcessor.processContent.mockReturnValue(mockDoc);

    insertContent('c', { contentType: 'html' })({
      tr: mockTr,
      state: mockState,
      commands: mockCommands,
      editor: mockEditor,
    });
    await Promise.resolve();
    expect(mockEditor.migrateListsToV2).not.toHaveBeenCalled();
  });
});

// Integration-style tests that use a real Editor instance to
// insert markdown/HTML lists and verify exported OOXML has list numbering.
describe('insertContent (integration) list export', () => {
  // Cache loaded DOCX data and helpers to avoid repeated file loading
  let cachedDocxData = null;
  let helpers = null;
  let exportHelpers = null;

  const getListParagraphs = (result) => {
    const body = result.elements?.find((el) => el.name === 'w:body');
    const paragraphs = (body?.elements || []).filter((el) => el.name === 'w:p');
    return paragraphs.filter((p) => {
      const pPr = p.elements?.find((e) => e.name === 'w:pPr');
      const numPr = pPr?.elements?.find((e) => e.name === 'w:numPr');
      return Boolean(numPr);
    });
  };

  const getNumPrVals = (p) => {
    const pPr = p.elements?.find((e) => e.name === 'w:pPr');
    const numPr = pPr?.elements?.find((e) => e.name === 'w:numPr');
    const numId = numPr?.elements?.find((e) => e.name === 'w:numId')?.attributes?.['w:val'];
    const ilvl = numPr?.elements?.find((e) => e.name === 'w:ilvl')?.attributes?.['w:val'];
    return { numId, ilvl };
  };

  const setupEditor = async () => {
    // Use real content processor for these tests
    vi.resetModules();
    vi.doUnmock('../helpers/contentProcessor.js');

    // Cache helpers and DOCX data on first call
    if (!helpers) {
      helpers = await import('../../tests/helpers/helpers.js');
    }
    if (!cachedDocxData) {
      cachedDocxData = await helpers.loadTestDataForEditorTests('blank-doc.docx');
    }
    if (!exportHelpers) {
      exportHelpers = await import('../../tests/export/export-helpers/index.js');
    }

    const { docx, media, mediaFiles, fonts } = cachedDocxData;
    const { editor } = helpers.initTestEditor({ content: docx, media, mediaFiles, fonts, mode: 'docx' });
    return editor;
  };

  const exportFromEditorContent = async (editor) => {
    const content = editor.getJSON().content || [];
    return await exportHelpers.getExportedResultWithDocContent(content);
  };

  it('exports ordered list from markdown with numId/ilvl', async () => {
    const editor = await setupEditor();
    editor.commands.insertContent('1. One\n2. Two', { contentType: 'markdown' });
    await Promise.resolve();

    const result = await exportFromEditorContent(editor);
    const listParas = getListParagraphs(result);
    expect(listParas.length).toBeGreaterThanOrEqual(2);

    const first = getNumPrVals(listParas[0]);
    expect(first.numId).toBeDefined();
    expect(first.ilvl).toBe('0');

    const second = getNumPrVals(listParas[1]);
    expect(second.numId).toBe(first.numId); // same list
    expect(second.ilvl).toBe('0');
  });

  it('exports unordered list from markdown with numId/ilvl', async () => {
    const editor = await setupEditor();
    editor.commands.insertContent('- Alpha\n- Beta', { contentType: 'markdown' });
    await Promise.resolve();

    const result = await exportFromEditorContent(editor);
    const listParas = getListParagraphs(result);
    expect(listParas.length).toBeGreaterThanOrEqual(2);

    const first = getNumPrVals(listParas[0]);
    expect(first.numId).toBeDefined();
    expect(first.ilvl).toBe('0');

    const second = getNumPrVals(listParas[1]);
    expect(second.numId).toBe(first.numId);
    expect(second.ilvl).toBe('0');
  });

  it('exports ordered list from HTML with numId/ilvl', async () => {
    const editor = await setupEditor();
    editor.commands.insertContent('<ol><li>First</li><li>Second</li></ol>', { contentType: 'html' });
    await Promise.resolve();

    const result = await exportFromEditorContent(editor);
    const listParas = getListParagraphs(result);
    expect(listParas.length).toBeGreaterThanOrEqual(2);

    const first = getNumPrVals(listParas[0]);
    expect(first.numId).toBeDefined();
    expect(first.ilvl).toBe('0');
  });

  it('exports unordered list from HTML with numId/ilvl', async () => {
    const editor = await setupEditor();
    editor.commands.insertContent('<ul><li>Apple</li><li>Banana</li></ul>', { contentType: 'html' });
    await Promise.resolve();

    const result = await exportFromEditorContent(editor);
    const listParas = getListParagraphs(result);
    expect(listParas.length).toBeGreaterThanOrEqual(2);

    const first = getNumPrVals(listParas[0]);
    expect(first.numId).toBeDefined();
    expect(first.ilvl).toBe('0');
  });

  it('defaults imported HTML tables to 100% width', async () => {
    const editor = await setupEditor();
    editor.commands.insertContent(
      '<table><tbody><tr><td>Query</td><td>Assessment</td></tr><tr><td>A</td><td>B</td></tr></tbody></table>',
      { contentType: 'html' },
    );
    await Promise.resolve();

    const tableNode = (editor.getJSON().content || []).find((node) => node.type === 'table');
    expect(tableNode).toBeTruthy();
    expect(tableNode.attrs?.tableProperties?.tableWidth).toEqual({
      value: 5000,
      type: 'pct',
    });
  });

  it('normalizes imported HTML table header borders for render and export parity', async () => {
    const editor = await setupEditor();
    editor.commands.insertContent(
      '<table><thead><tr><th>Search Query</th><th>Findings / Assessment</th></tr></thead><tbody><tr><td>A</td><td>B</td></tr></tbody></table>',
      { contentType: 'html' },
    );
    await Promise.resolve();

    const tableNode = (editor.getJSON().content || []).find((node) => node.type === 'table');
    expect(tableNode).toBeTruthy();
    const headerCell = tableNode?.content?.[0]?.content?.[0];
    expect(headerCell?.type).toBe('tableHeader');
    const borders = headerCell?.attrs?.borders;
    expect(borders?.top).toBeDefined();
    expect(borders?.right).toBeDefined();
    expect(borders?.bottom).toBeDefined();
    expect(borders?.left).toBeDefined();

    const result = await exportFromEditorContent(editor);
    const body = result.elements?.find((el) => el.name === 'w:body');
    const table = body?.elements?.find((el) => el.name === 'w:tbl');
    const firstRow = table?.elements?.find((el) => el.name === 'w:tr');
    const firstCell = firstRow?.elements?.find((el) => el.name === 'w:tc');
    const firstCellProperties = firstCell?.elements?.find((el) => el.name === 'w:tcPr');
    const firstCellBorders = firstCellProperties?.elements?.find((el) => el.name === 'w:tcBorders');
    const topBorder = firstCellBorders?.elements?.find((el) => el.name === 'w:top');

    expect(firstCellBorders).toBeDefined();
    expect(topBorder?.attributes?.['w:val']).toBe('single');
    expect(Number(topBorder?.attributes?.['w:sz'])).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// CI-only: horizontal rule insertion (requires real Editor which depends on
// @superdoc/document-api — unresolvable in local workspace, works in CI).
// ---------------------------------------------------------------------------
describe.skipIf(!process.env.CI)('insertContent (integration) horizontal rule', () => {
  let helpers = null;
  let cachedDocxData = null;

  const setupEditor = async () => {
    vi.resetModules();
    vi.doUnmock('../helpers/contentProcessor.js');

    if (!helpers) {
      helpers = await import('../../tests/helpers/helpers.js');
    }
    if (!cachedDocxData) {
      cachedDocxData = await helpers.loadTestDataForEditorTests('blank-doc.docx');
    }

    const { docx, media, mediaFiles, fonts } = cachedDocxData;
    const { editor } = helpers.initTestEditor({ content: docx, media, mediaFiles, fonts, mode: 'docx' });
    return editor;
  };

  const countHorizontalRules = (editor) => {
    let count = 0;
    const content = editor.getJSON().content || [];
    for (const block of content) {
      if (block.type === 'contentBlock' && block.attrs?.horizontalRule) count++;
      // contentBlock is inline — check inside paragraph > run or paragraph directly
      for (const inline of block.content || []) {
        if (inline.type === 'contentBlock' && inline.attrs?.horizontalRule) count++;
        for (const child of inline.content || []) {
          if (child.type === 'contentBlock' && child.attrs?.horizontalRule) count++;
        }
      }
    }
    return count;
  };

  it('insertContent with contentType html creates a horizontal rule', async () => {
    const editor = await setupEditor();
    expect(countHorizontalRules(editor)).toBe(0);

    editor.commands.insertContent('<hr>', { contentType: 'html' });

    expect(countHorizontalRules(editor)).toBe(1);
  });

  it('insertContent with contentType markdown creates a horizontal rule', async () => {
    const editor = await setupEditor();
    expect(countHorizontalRules(editor)).toBe(0);

    editor.commands.insertContent('---', { contentType: 'markdown' });

    expect(countHorizontalRules(editor)).toBe(1);
  });

  it('insertContent with bare <hr> (no contentType) creates a horizontal rule', async () => {
    const editor = await setupEditor();
    expect(countHorizontalRules(editor)).toBe(0);

    editor.commands.insertContent('<hr>');

    expect(countHorizontalRules(editor)).toBe(1);
  });
});
