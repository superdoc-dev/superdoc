import { describe, it, expect, beforeEach, vi } from 'vitest';

const readFileMock = vi.fn();
const loadXmlDataMock = vi.fn();
const exportSchemaToJsonMock = vi.fn();
const exportToDocxMock = vi.fn();
const getCommentDefinitionMock = vi.fn();
const getStarterExtensionsMock = vi.fn(() => ['starter-extension']);
const getRichTextExtensionsMock = vi.fn(() => ['rich-extension']);

const editorInstances = [];

vi.mock('fs/promises', () => ({
  readFile: readFileMock,
  default: { readFile: readFileMock },
}));

vi.mock('@core/Editor.js', () => {
  class EditorMock {
    static loadXmlData = loadXmlDataMock;

    constructor(options) {
      editorInstances.push({ instance: this, options });
      this.options = options;
      this.schema = { type: 'schema' };
      this.converter = {
        getSchema: vi.fn(() => ({ type: 'doc', content: [] })),
        savedTagsToRestore: [{ name: 'w:body' }],
        pageStyles: { margins: true },
        exportToDocx: exportToDocxMock,
        addedMedia: { items: ['media1.png'] },
      };
      this.storage = { image: { media: { existing: true } } };
      this.getUpdatedJson = vi.fn(() => ({ updated: true }));
      this.getJSON = vi.fn(() => ({ content: [{ type: 'paragraph', text: 'converted text' }] }));
      this.destroy = vi.fn();
    }
  }

  return { Editor: EditorMock };
});

vi.mock('../../../index.js', () => ({
  getRichTextExtensions: getRichTextExtensionsMock,
}));

vi.mock('@extensions/index.js', () => ({
  getStarterExtensions: getStarterExtensionsMock,
}));

vi.mock('@converter/exporter', () => ({
  exportSchemaToJson: exportSchemaToJsonMock,
}));

vi.mock('@converter/v2/exporter/commentsExporter.js', () => ({
  getCommentDefinition: getCommentDefinitionMock,
}));

// The module uses Annotion data; no need to mock

const {
  getTextFromNode,
  getExportedResult,
  getExportMediaFiles,
  getExportedResultForAnnotations,
  getExportedResultWithDocContent,
} = await import('./export-helpers.js');

describe('export-helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editorInstances.length = 0;
  });

  describe('getTextFromNode', () => {
    it('returns empty string when node has no elements', () => {
      expect(getTextFromNode(undefined)).toBe('');
      expect(getTextFromNode({})).toBe('');
    });

    it('concatenates text from multiple w:r/w:t elements', () => {
      const node = {
        elements: [
          {
            name: 'w:r',
            elements: [
              { name: 'w:t', elements: [{ type: 'text', text: 'Hello' }] },
              { name: 'w:t', elements: [{ type: 'text', text: ' ' }] },
            ],
          },
          { name: 'w:bookmarkStart' },
          {
            name: 'w:r',
            elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'World' }] }],
          },
        ],
      };

      expect(getTextFromNode(node)).toBe('Hello World');
    });
  });

  describe('getExportedResult', () => {
    it('loads docx data, processes comments, and exports schema', async () => {
      readFileMock.mockResolvedValueOnce('buffer');
      const docx = { type: 'docx' };
      loadXmlDataMock.mockResolvedValueOnce([docx, 'media', 'mediaFiles', 'fonts']);
      exportSchemaToJsonMock.mockReturnValueOnce([{ result: 'ok' }, { meta: true }]);
      getCommentDefinitionMock.mockImplementation((comment) => ({
        id: comment.id,
        commentJSON: comment.commentJSON,
      }));

      const comments = [{ id: 'c1', commentText: '<p>Hi</p>' }];
      const result = await getExportedResult('sample.docx', comments);

      expect(readFileMock).toHaveBeenCalledWith(expect.stringContaining('sample.docx'));
      expect(loadXmlDataMock).toHaveBeenCalledWith('buffer', true);

      const editorCall = editorInstances.find(({ options }) => options.mode === 'docx');
      expect(editorCall).toBeTruthy();
      expect(editorCall.options.content).toBe(docx);

      expect(getCommentDefinitionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'c1',
          commentJSON: [{ type: 'paragraph', text: 'converted text' }],
        }),
        0,
        comments,
        expect.any(Object),
      );

      expect(exportSchemaToJsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          node: expect.any(Object),
          bodyNode: { name: 'w:body' },
          comments,
          pageStyles: { margins: true },
          lists: {},
        }),
      );

      expect(result).toEqual({ result: 'ok' });
    });
  });

  describe('getExportMediaFiles', () => {
    it('exports docx and returns added media', async () => {
      readFileMock.mockResolvedValueOnce('buffer');
      loadXmlDataMock.mockResolvedValueOnce(['docx', 'media', 'mediaFiles', 'fonts']);
      exportToDocxMock.mockResolvedValueOnce(void 0);

      const media = await getExportMediaFiles('media.docx');

      expect(readFileMock).toHaveBeenCalledWith(expect.stringContaining('media.docx'));
      expect(loadXmlDataMock).toHaveBeenCalledWith('buffer', true);

      const editorCall = editorInstances.find(({ options }) => options.mode === 'docx');
      expect(editorCall).toBeTruthy();
      const editor = editorCall.instance;

      expect(editor.getUpdatedJson).toHaveBeenCalled();
      expect(exportToDocxMock).toHaveBeenCalledWith(
        { updated: true },
        editor.schema,
        editor.storage.image.media,
        true,
        'external',
        [],
        editor,
        false,
        null,
      );

      expect(media).toEqual({ items: ['media1.png'] });
    });
  });

  describe('getExportedResultForAnnotations', () => {
    it('exports annotations content using predefined data', async () => {
      readFileMock.mockResolvedValueOnce('buffer');
      loadXmlDataMock.mockResolvedValueOnce(['docx', 'media', 'mediaFiles', 'fonts']);
      exportSchemaToJsonMock.mockReturnValueOnce([{ annotations: true }, { meta: true }]);

      const { result } = await getExportedResultForAnnotations(false);

      expect(readFileMock).toHaveBeenCalledWith(expect.stringContaining('annotations_import.docx'));
      expect(loadXmlDataMock).toHaveBeenCalledWith('buffer', true);
      expect(exportSchemaToJsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          node: expect.any(Object),
          isFinalDoc: false,
        }),
      );
      expect(result).toEqual({ annotations: true });
    });
  });

  describe('getExportedResultWithDocContent', () => {
    it('builds a document using provided content array', async () => {
      readFileMock.mockResolvedValueOnce('buffer');
      loadXmlDataMock.mockResolvedValueOnce(['docx', 'media', 'mediaFiles', 'fonts']);
      exportSchemaToJsonMock.mockReturnValueOnce([{ custom: true }, { meta: true }]);

      const customContent = [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }];
      const result = await getExportedResultWithDocContent(customContent, 'blank-doc.docx');

      expect(readFileMock).toHaveBeenCalledWith(expect.stringContaining('blank-doc.docx'));
      expect(loadXmlDataMock).toHaveBeenCalledWith('buffer', true);

      const [[params]] = exportSchemaToJsonMock.mock.calls;
      expect(params.node.content).toBe(customContent);
      expect(result).toEqual({ custom: true });
    });
  });
});
