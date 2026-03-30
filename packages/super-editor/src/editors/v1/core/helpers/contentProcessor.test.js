import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processContent } from './contentProcessor.js';
import * as importHtml from './importHtml.js';
import * as importMarkdown from './importMarkdown.js';
import { DOMParser } from 'prosemirror-model';

vi.mock('./importHtml.js');
vi.mock('./importMarkdown.js');
vi.mock('prosemirror-model', () => ({
  DOMParser: {
    fromSchema: vi.fn(),
  },
}));

describe('contentProcessor', () => {
  let mockSchema, mockEditor, mockDoc;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDoc = {
      toJSON: vi.fn(() => ({ type: 'doc', content: [] })),
    };

    mockSchema = {
      text: vi.fn((content) => ({ type: 'text', text: content })),
      nodeFromJSON: vi.fn((json) => mockDoc),
    };

    mockEditor = {
      schema: mockSchema,
      converter: { numbering: {} },
    };

    // Mock DOMParser for text processing
    DOMParser.fromSchema.mockReturnValue({
      parse: vi.fn(() => mockDoc),
    });
  });

  describe('HTML processing', () => {
    it('processes HTML content and strips styles', () => {
      importHtml.createDocFromHTML.mockReturnValue(mockDoc);

      const result = processContent({
        content: '<p style="color: red;">Test</p>',
        type: 'html',
        schema: mockSchema,
        editor: mockEditor,
      });

      expect(importHtml.createDocFromHTML).toHaveBeenCalledWith(
        '<p style="color: red;">Test</p>',
        mockEditor,
        expect.objectContaining({
          isImport: true,
          document: expect.anything(),
        }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('Markdown processing', () => {
    it('processes markdown content', () => {
      importMarkdown.createDocFromMarkdown.mockReturnValue(mockDoc);

      const result = processContent({
        content: '# Heading\n\nParagraph',
        type: 'markdown',
        schema: mockSchema,
        editor: mockEditor,
      });

      expect(importMarkdown.createDocFromMarkdown).toHaveBeenCalledWith(
        '# Heading\n\nParagraph',
        mockEditor,
        expect.objectContaining({
          isImport: true,
          document: expect.anything(),
        }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('Text processing', () => {
    it('processes plain text content', () => {
      const result = processContent({
        content: 'Plain text',
        type: 'text',
        schema: mockSchema,
        editor: mockEditor,
      });

      // Now it creates a proper paragraph element with import marker
      expect(DOMParser.fromSchema).toHaveBeenCalledWith(mockSchema);
      expect(result).toBe(mockDoc);

      // Verify that parse was called with a wrapper element
      const parser = DOMParser.fromSchema();
      expect(parser.parse).toHaveBeenCalled();
      const callArg = parser.parse.mock.calls[0][0];
      expect(callArg.dataset.superdocImport).toBe('true');
      expect(callArg.querySelector('p').textContent).toBe('Plain text');
    });
  });

  describe('Schema processing', () => {
    it('processes schema JSON content', () => {
      const schemaContent = { type: 'doc', content: [] };

      const result = processContent({
        content: schemaContent,
        type: 'schema',
        schema: mockSchema,
        editor: mockEditor,
      });

      expect(mockSchema.nodeFromJSON).toHaveBeenCalledWith(schemaContent);
      expect(result).toBe(mockDoc);
    });
  });

  describe('Error handling', () => {
    it('throws error for unknown content type', () => {
      expect(() => {
        processContent({
          content: 'test',
          type: 'invalid',
          schema: mockSchema,
          editor: mockEditor,
        });
      }).toThrow('Unknown content type: invalid');
    });
  });

  // Note: list attribute generation/migration is now handled outside of processContent
  // (e.g., by editor.migrateListsToV2 after insertion). Tests for that behavior live elsewhere.
});
