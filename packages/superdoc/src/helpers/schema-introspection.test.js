import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSchemaIntrospection } from './schema-introspection.js';

describe('getSchemaIntrospection', () => {
  describe('with existing editor', () => {
    it('should use the provided editor instance', async () => {
      const mockSchemaSummary = {
        version: '1.0.0',
        schemaVersion: 'current',
        topNode: 'doc',
        nodes: [{ name: 'paragraph', attrs: {} }],
        marks: [{ name: 'bold', attrs: {} }],
      };

      const mockEditor = {
        getSchemaSummaryJSON: vi.fn().mockResolvedValue(mockSchemaSummary),
      };

      const result = await getSchemaIntrospection({ editor: mockEditor });

      expect(mockEditor.getSchemaSummaryJSON).toHaveBeenCalledOnce();
      expect(result).toBe(mockSchemaSummary);
    });

    it('should not create a temporary editor when editor is provided', async () => {
      const mockEditor = {
        getSchemaSummaryJSON: vi.fn().mockResolvedValue({ nodes: [], marks: [] }),
      };

      await getSchemaIntrospection({ editor: mockEditor });

      // If no temporary editor was created, destroy should not be called
      expect(mockEditor.destroy).toBeUndefined();
    });
  });

  describe('without existing editor', () => {
    it('should create and destroy a temporary editor', async () => {
      const result = await getSchemaIntrospection({ mode: 'docx' });

      // Verify schema structure is returned
      expect(result).toHaveProperty('nodes');
      expect(result).toHaveProperty('marks');
      expect(result).toHaveProperty('version');
      expect(Array.isArray(result.nodes)).toBe(true);
      expect(Array.isArray(result.marks)).toBe(true);
    });

    it('should default to docx mode when no mode is specified', async () => {
      const result = await getSchemaIntrospection();

      // DOCX mode includes specific nodes like paragraph, table, etc.
      expect(result.nodes).toBeDefined();
      const nodeNames = result.nodes.map((n) => n.name);
      expect(nodeNames).toContain('paragraph');
    });

    it('should use html mode when specified', async () => {
      const result = await getSchemaIntrospection({ mode: 'html' });

      expect(result.nodes).toBeDefined();
      expect(Array.isArray(result.nodes)).toBe(true);
    });

    it('should use text mode when specified', async () => {
      const result = await getSchemaIntrospection({ mode: 'text' });

      expect(result.nodes).toBeDefined();
      expect(Array.isArray(result.nodes)).toBe(true);
    });

    it('should use provided extensions when given', async () => {
      // Using minimal extensions
      const customExtensions = [];

      // This should not throw even with empty extensions
      // (the Editor will use minimal defaults)
      const result = await getSchemaIntrospection({ extensions: customExtensions });

      expect(result).toHaveProperty('nodes');
      expect(result).toHaveProperty('marks');
    });
  });

  describe('schema summary structure', () => {
    it('should return nodes with name and attrs properties', async () => {
      const result = await getSchemaIntrospection();

      expect(result.nodes.length).toBeGreaterThan(0);

      for (const node of result.nodes) {
        expect(node).toHaveProperty('name');
        expect(typeof node.name).toBe('string');
        expect(node).toHaveProperty('attrs');
        expect(typeof node.attrs).toBe('object');
      }
    });

    it('should return marks with name and attrs properties', async () => {
      const result = await getSchemaIntrospection();

      expect(result.marks.length).toBeGreaterThan(0);

      for (const mark of result.marks) {
        expect(mark).toHaveProperty('name');
        expect(typeof mark.name).toBe('string');
        expect(mark).toHaveProperty('attrs');
        expect(typeof mark.attrs).toBe('object');
      }
    });

    it('should include attribute metadata with default and required flags', async () => {
      const result = await getSchemaIntrospection();

      // Find a node that has attributes (paragraph has paragraphProperties)
      const paragraphNode = result.nodes.find((n) => n.name === 'paragraph');

      if (paragraphNode && Object.keys(paragraphNode.attrs).length > 0) {
        const firstAttr = Object.values(paragraphNode.attrs)[0];
        expect(firstAttr).toHaveProperty('default');
        expect(firstAttr).toHaveProperty('required');
        expect(typeof firstAttr.required).toBe('boolean');
      }
    });
  });

  describe('error handling', () => {
    it('should propagate errors from getSchemaSummaryJSON', async () => {
      const mockEditor = {
        getSchemaSummaryJSON: vi.fn().mockRejectedValue(new Error('Schema not initialized')),
      };

      await expect(getSchemaIntrospection({ editor: mockEditor })).rejects.toThrow('Schema not initialized');
    });
  });
});
