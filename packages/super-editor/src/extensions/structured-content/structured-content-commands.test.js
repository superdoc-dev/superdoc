import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { createTable } from '../table/tableHelpers/createTable.js';

const BLOCK_ID = 'structured-block-1';

/**
 * Locate the first table node within the provided document.
 * @param {import('prosemirror-model').Node} doc
 * @returns {import('prosemirror-model').Node|null}
 */
function findFirstTable(doc) {
  let found = null;
  doc.descendants((node) => {
    if (node.type.name === 'table') {
      found = node;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * Locate the first text node within the provided node's descendants.
 * Needed because some plugins (e.g., run wrapping) add inline wrappers.
 * @param {import('prosemirror-model').Node} node
 * @returns {import('prosemirror-model').Node | null}
 */
function findFirstTextNode(node) {
  let found = null;
  node.descendants((child) => {
    if (child.type.name === 'text') {
      found = child;
      return false;
    }
    return true;
  });
  return found;
}

describe('StructuredContentTableCommands', () => {
  let editor;
  let schema;
  let templateMarkType;
  let templateBlockType;
  let templateBlockAttrs;

  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    ({ schema } = editor);

    templateMarkType = schema.marks.bold || schema.marks.strong || null;
    templateBlockType = schema.nodes.heading || schema.nodes.paragraph;
    templateBlockAttrs = templateBlockType === schema.nodes.heading ? { level: 3 } : null;

    let table = createTable(schema, 2, 2, false);
    const rows = [];
    table.forEach((row, _offset, index) => {
      if (index === table.childCount - 1) {
        const cellType = schema.nodes.tableCell;
        const mark = templateMarkType ? templateMarkType.create() : null;
        const styledText = schema.text('Styled Template', mark ? [mark] : undefined);
        const styledBlock = templateBlockType.create(templateBlockAttrs, styledText);
        const baselineBlock = schema.nodes.paragraph.create(null, schema.text('Baseline'));
        const firstCell = cellType.create(row.firstChild.attrs, styledBlock);
        const secondCell = cellType.create(row.lastChild.attrs, baselineBlock);
        rows.push(row.type.create(row.attrs, [firstCell, secondCell]));
      } else {
        rows.push(row);
      }
    });
    table = table.type.create(table.attrs, rows);

    const block = schema.nodes.structuredContentBlock.create({ id: BLOCK_ID }, table ? [table] : undefined);
    const doc = schema.nodes.doc.create(null, [block]);

    const nextState = EditorState.create({ schema, doc, plugins: editor.state.plugins });
    editor.setState(nextState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    editor?.destroy();
    editor = null;
    schema = null;
    templateMarkType = null;
    templateBlockType = null;
    templateBlockAttrs = null;
  });

  it('appends rows to the structured content table', () => {
    const initialTable = findFirstTable(editor.state.doc);
    expect(initialTable).not.toBeNull();
    const initialRowCount = initialTable.childCount;

    const didAppend = editor.commands.appendRowsToStructuredContentTable({
      id: BLOCK_ID,
      rows: [['Alpha', 'Beta']],
    });

    expect(didAppend).toBe(true);

    const updatedTable = findFirstTable(editor.state.doc);
    expect(updatedTable.childCount).toBe(initialRowCount + 1);

    const lastRow = updatedTable.lastChild;
    const cellTexts = lastRow.content.content.map((cell) => cell.textContent);
    expect(cellTexts).toEqual(['Alpha', 'Beta']);
  });

  it('copies template styling when copyRowStyle is true', () => {
    const didAppend = editor.commands.appendRowsToStructuredContentTable({
      id: BLOCK_ID,
      rows: [['Styled Copy', 'Value']],
      copyRowStyle: true,
    });

    expect(didAppend).toBe(true);

    const updatedTable = findFirstTable(editor.state.doc);
    const newLastRow = updatedTable.lastChild;
    const firstCell = newLastRow.firstChild;
    const blockNode = firstCell.firstChild;
    const textNode = blockNode.firstChild.firstChild;

    expect(blockNode.type).toBe(templateBlockType);
    if (templateBlockAttrs) {
      expect(blockNode.attrs).toMatchObject(templateBlockAttrs);
    }

    if (templateMarkType) {
      const hasMark = textNode.marks.some((mark) => mark.type === templateMarkType);
      expect(hasMark).toBe(true);
    }
  });
});

describe('updateStructuredContentById', () => {
  let editor;
  let schema;
  const INLINE_ID = 'structured-inline-1';

  beforeEach(() => {
    // Use default mode (docx) to ensure structured content extensions are available
    ({ editor } = initTestEditor());
    ({ schema } = editor);

    // Create a structured content inline with styled text (bold)
    const boldMark = schema.marks.bold || schema.marks.strong;
    const styledText = schema.text('Styled Content', boldMark ? [boldMark.create()] : []);
    const inlineNode = schema.nodes.structuredContent.create({ id: INLINE_ID }, styledText);
    const paragraph = schema.nodes.paragraph.create(null, [inlineNode]);
    const doc = schema.nodes.doc.create(null, [paragraph]);

    const nextState = EditorState.create({ schema, doc, plugins: editor.state.plugins });
    editor.setState(nextState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    editor?.destroy();
    editor = null;
    schema = null;
  });

  it('throws error when updating ID with a non-integer value', () => {
    expect(() => {
      editor.commands.updateStructuredContentById(INLINE_ID, {
        attrs: { id: 'abc-123' },
      });
    }).toThrow('Invalid structured content id - must be an integer, got: abc-123');
  });

  describe('keepTextNodeStyles option', () => {
    it('preserves marks from the first text node when keepTextNodeStyles is true', () => {
      const didUpdate = editor.commands.updateStructuredContentById(INLINE_ID, {
        text: 'New Content',
        keepTextNodeStyles: true,
      });

      expect(didUpdate).toBe(true);

      // Find the updated structured content
      let updatedNode = null;
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'structuredContent' && node.attrs.id === INLINE_ID) {
          updatedNode = node;
          return false;
        }
      });

      expect(updatedNode).not.toBeNull();
      expect(updatedNode.textContent).toBe('New Content');

      // Check that the bold mark was preserved
      const firstTextNode = findFirstTextNode(updatedNode);
      expect(firstTextNode).not.toBeNull();
      expect(firstTextNode.type.name).toBe('text');
      const boldMark = schema.marks.bold || schema.marks.strong;
      if (boldMark) {
        const hasBoldMark = firstTextNode.marks.some((mark) => mark.type === boldMark);
        expect(hasBoldMark).toBe(true);
      }
    });

    it('does not preserve marks when keepTextNodeStyles is false or not provided', () => {
      const didUpdate = editor.commands.updateStructuredContentById(INLINE_ID, {
        text: 'New Content',
        keepTextNodeStyles: false,
      });

      expect(didUpdate).toBe(true);

      // Find the updated structured content
      let updatedNode = null;
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'structuredContent' && node.attrs.id === INLINE_ID) {
          updatedNode = node;
          return false;
        }
      });

      expect(updatedNode).not.toBeNull();
      expect(updatedNode.textContent).toBe('New Content');

      // Check that no marks are present
      const firstTextNode = findFirstTextNode(updatedNode);
      expect(firstTextNode).not.toBeNull();
      expect(firstTextNode.type.name).toBe('text');
      expect(firstTextNode.marks.length).toBe(0);
    });

    it('handles structured content with no text nodes gracefully', () => {
      // Create a structured content with no text nodes (empty content)
      const emptyInlineId = 'empty-inline';
      const emptyInline = schema.nodes.structuredContent.create({ id: emptyInlineId });
      const paragraph = schema.nodes.paragraph.create(null, [emptyInline]);
      const doc = schema.nodes.doc.create(null, [paragraph]);

      const nextState = EditorState.create({ schema, doc, plugins: editor.state.plugins });
      editor.setState(nextState);

      const didUpdate = editor.commands.updateStructuredContentById(emptyInlineId, {
        text: 'New Content',
        keepTextNodeStyles: true,
      });

      expect(didUpdate).toBe(true);

      // Find the updated structured content
      let updatedNode = null;
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'structuredContent' && node.attrs.id === emptyInlineId) {
          updatedNode = node;
          return false;
        }
      });

      expect(updatedNode).not.toBeNull();
      expect(updatedNode.textContent).toBe('New Content');

      // Should have no marks since there was no text node to copy from
      const firstTextNode = findFirstTextNode(updatedNode);
      expect(firstTextNode).not.toBeNull();
      expect(firstTextNode.type.name).toBe('text');
      expect(firstTextNode.marks.length).toBe(0);
    });
  });

  describe('validation before transaction', () => {
    it('validates the updated node before applying the transaction', () => {
      // Spy on console.error to verify validation error is logged
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Try to update with invalid JSON that will fail validation
      // Creating an invalid node structure that violates schema rules
      const invalidJSON = {
        type: 'paragraph', // structuredContent inline should contain inline content, not a paragraph
        content: [{ type: 'text', text: 'Invalid' }],
      };

      const didUpdate = editor.commands.updateStructuredContentById(INLINE_ID, {
        json: invalidJSON,
      });

      // The command should return false due to validation failure
      expect(didUpdate).toBe(false);

      // Verify that console.error was called with validation error
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toBe('Invalid content.');

      // Verify the original node was NOT modified
      let originalNode = null;
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'structuredContent' && node.attrs.id === INLINE_ID) {
          originalNode = node;
          return false;
        }
      });

      expect(originalNode).not.toBeNull();
      expect(originalNode.textContent).toBe('Styled Content'); // Original text unchanged

      consoleErrorSpy.mockRestore();
    });

    it('allows valid updates to proceed through validation', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Update with valid content
      const didUpdate = editor.commands.updateStructuredContentById(INLINE_ID, {
        text: 'Valid Update',
      });

      // Should succeed
      expect(didUpdate).toBe(true);

      // Verify no validation errors were logged
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      // Verify the node was updated
      let updatedNode = null;
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'structuredContent' && node.attrs.id === INLINE_ID) {
          updatedNode = node;
          return false;
        }
      });

      expect(updatedNode).not.toBeNull();
      expect(updatedNode.textContent).toBe('Valid Update');

      consoleErrorSpy.mockRestore();
    });

    it('prevents transaction when validation throws an error', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock validateJSON to throw an error during validation
      const originalValidateJSON = editor.validateJSON;
      editor.validateJSON = vi.fn().mockImplementation(() => {
        return {
          check: () => {
            throw new Error('Validation failed: invalid content structure');
          },
        };
      });

      const didUpdate = editor.commands.updateStructuredContentById(INLINE_ID, {
        text: 'This will fail validation',
      });

      // Should fail validation and return false
      expect(didUpdate).toBe(false);

      // Verify validation error was logged
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toBe('Invalid content.');

      // Verify the original node was NOT modified
      let originalNode = null;
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'structuredContent' && node.attrs.id === INLINE_ID) {
          originalNode = node;
          return false;
        }
      });

      expect(originalNode).not.toBeNull();
      expect(originalNode.textContent).toBe('Styled Content'); // Original text unchanged

      // Restore mocks
      editor.validateJSON = originalValidateJSON;
      consoleErrorSpy.mockRestore();
    });
  });
});

describe('updateStructuredContentByGroup', () => {
  let editor;
  let schema;
  const GROUP_NAME = 'test-group';

  beforeEach(() => {
    // Use default mode (docx) to ensure structured content extensions are available
    ({ editor } = initTestEditor());
    ({ schema } = editor);

    // Create multiple structured content nodes with the same group
    const boldMark = schema.marks.bold || schema.marks.strong;
    const styledText1 = schema.text('Styled Content 1', boldMark ? [boldMark.create()] : []);
    const styledText2 = schema.text('Styled Content 2', boldMark ? [boldMark.create()] : []);

    // Create tag object for group
    const tagObject = { group: GROUP_NAME };
    const tagString = JSON.stringify(tagObject);

    const inlineNode1 = schema.nodes.structuredContent.create({ id: 'inline-1', tag: tagString }, styledText1);
    const inlineNode2 = schema.nodes.structuredContent.create({ id: 'inline-2', tag: tagString }, styledText2);

    const paragraph = schema.nodes.paragraph.create(null, [inlineNode1, schema.text(' '), inlineNode2]);
    const doc = schema.nodes.doc.create(null, [paragraph]);

    const nextState = EditorState.create({ schema, doc, plugins: editor.state.plugins });
    editor.setState(nextState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    editor?.destroy();
    editor = null;
    schema = null;
  });

  it('throws error when updating ID with a non-integer value', () => {
    expect(() => {
      editor.commands.updateStructuredContentByGroup(GROUP_NAME, {
        attrs: { id: 'abc-123' },
      });
    }).toThrow('Invalid structured content id - must be an integer, got: abc-123');
  });

  describe('keepTextNodeStyles option', () => {
    it('preserves marks from the first text node for all nodes in group when keepTextNodeStyles is true', () => {
      const didUpdate = editor.commands.updateStructuredContentByGroup(GROUP_NAME, {
        text: 'Updated Content',
        keepTextNodeStyles: true,
      });

      expect(didUpdate).toBe(true);

      // Find all updated structured content nodes in the group
      const updatedNodes = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'structuredContent') {
          updatedNodes.push(node);
        }
      });

      expect(updatedNodes.length).toBe(2);

      // Check that both nodes have the updated text with preserved marks
      updatedNodes.forEach((node) => {
        expect(node.textContent).toBe('Updated Content');

        const firstTextNode = findFirstTextNode(node);
        expect(firstTextNode).not.toBeNull();
        expect(firstTextNode.type.name).toBe('text');

        const boldMark = schema.marks.bold || schema.marks.strong;
        if (boldMark) {
          const hasBoldMark = firstTextNode.marks.some((mark) => mark.type === boldMark);
          expect(hasBoldMark).toBe(true);
        }
      });
    });

    it('does not preserve marks when keepTextNodeStyles is false or not provided', () => {
      const didUpdate = editor.commands.updateStructuredContentByGroup(GROUP_NAME, {
        text: 'Updated Content',
        keepTextNodeStyles: false,
      });

      expect(didUpdate).toBe(true);

      // Find all updated structured content nodes in the group
      const updatedNodes = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'structuredContent') {
          updatedNodes.push(node);
        }
      });

      expect(updatedNodes.length).toBe(2);

      // Check that both nodes have the updated text without marks
      updatedNodes.forEach((node) => {
        expect(node.textContent).toBe('Updated Content');

        const firstTextNode = findFirstTextNode(node);
        expect(firstTextNode).not.toBeNull();
        expect(firstTextNode.type.name).toBe('text');
        expect(firstTextNode.marks.length).toBe(0);
      });
    });
  });

  describe('validation before transaction', () => {
    it('validates each updated node before applying the transaction', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Try to update with invalid JSON that will fail validation
      const invalidJSON = {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Invalid' }],
      };

      const didUpdate = editor.commands.updateStructuredContentByGroup(GROUP_NAME, {
        json: invalidJSON,
      });

      // The command should return false due to validation failure (all-or-nothing behavior)
      expect(didUpdate).toBe(false);

      // Verify that console.error was called with validation error
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toBe('Invalid content.');

      // Verify the original nodes were NOT modified
      const originalNodes = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'structuredContent') {
          originalNodes.push(node);
        }
      });

      expect(originalNodes.length).toBe(2);
      expect(originalNodes[0].textContent).toBe('Styled Content 1'); // Original text unchanged
      expect(originalNodes[1].textContent).toBe('Styled Content 2'); // Original text unchanged

      consoleErrorSpy.mockRestore();
    });

    it('allows valid updates to proceed through validation for all nodes in group', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Update with valid content
      const didUpdate = editor.commands.updateStructuredContentByGroup(GROUP_NAME, {
        text: 'Valid Update',
      });

      // Should succeed
      expect(didUpdate).toBe(true);

      // Verify no validation errors were logged
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      // Verify all nodes were updated
      const updatedNodes = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'structuredContent') {
          updatedNodes.push(node);
        }
      });

      expect(updatedNodes.length).toBe(2);
      updatedNodes.forEach((node) => {
        expect(node.textContent).toBe('Valid Update');
      });

      consoleErrorSpy.mockRestore();
    });
  });
});

describe('StructuredContent ID Validation', () => {
  let editor;

  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  describe('insertStructuredContentInline', () => {
    it('accepts valid integer string IDs', () => {
      expect(() => {
        editor.commands.insertStructuredContentInline({
          attrs: { id: '123' },
          text: 'Test content',
        });
      }).not.toThrow();
    });

    it('accepts valid negative integer string IDs', () => {
      expect(() => {
        editor.commands.insertStructuredContentInline({
          attrs: { id: '-456' },
          text: 'Test content',
        });
      }).not.toThrow();
    });

    it('accepts numeric integer IDs', () => {
      expect(() => {
        editor.commands.insertStructuredContentInline({
          attrs: { id: 789 },
          text: 'Test content',
        });
      }).not.toThrow();
    });

    it('auto-generates ID when not provided', () => {
      expect(() => {
        editor.commands.insertStructuredContentInline({
          text: 'Test content',
        });
      }).not.toThrow();
    });

    it('throws error for non-integer string IDs', () => {
      expect(() => {
        editor.commands.insertStructuredContentInline({
          attrs: { id: 'abc-123' },
          text: 'Test content',
        });
      }).toThrow('Invalid structured content id - must be an integer, got: abc-123');
    });

    it('throws error for float IDs', () => {
      expect(() => {
        editor.commands.insertStructuredContentInline({
          attrs: { id: '123.45' },
          text: 'Test content',
        });
      }).toThrow('Invalid structured content id - must be an integer, got: 123.45');
    });

    it('throws error for UUID-style IDs', () => {
      expect(() => {
        editor.commands.insertStructuredContentInline({
          attrs: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
          text: 'Test content',
        });
      }).toThrow('Invalid structured content id - must be an integer, got: a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });
  });

  describe('insertStructuredContentBlock', () => {
    it('accepts valid integer string IDs', () => {
      expect(() => {
        editor.commands.insertStructuredContentBlock({
          attrs: { id: '123' },
          html: '<p>Test content</p>',
        });
      }).not.toThrow();
    });

    it('accepts valid negative integer string IDs', () => {
      expect(() => {
        editor.commands.insertStructuredContentBlock({
          attrs: { id: '-456' },
          html: '<p>Test content</p>',
        });
      }).not.toThrow();
    });

    it('auto-generates ID when not provided', () => {
      expect(() => {
        editor.commands.insertStructuredContentBlock({
          html: '<p>Test content</p>',
        });
      }).not.toThrow();
    });

    it('throws error for non-integer string IDs', () => {
      expect(() => {
        editor.commands.insertStructuredContentBlock({
          attrs: { id: 'my-block-id' },
          html: '<p>Test content</p>',
        });
      }).toThrow('Invalid structured content id - must be an integer, got: my-block-id');
    });

    it('throws error for float IDs', () => {
      expect(() => {
        editor.commands.insertStructuredContentBlock({
          attrs: { id: '99.99' },
          html: '<p>Test content</p>',
        });
      }).toThrow('Invalid structured content id - must be an integer, got: 99.99');
    });
  });
});
