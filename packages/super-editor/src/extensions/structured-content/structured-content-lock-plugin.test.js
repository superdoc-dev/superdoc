import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';

/**
 * Test suite for StructuredContentLockPlugin
 *
 * Tests ECMA-376 w:lock behavior for StructuredContent nodes:
 * - unlocked: No restrictions (can delete wrapper, can edit content)
 * - sdtLocked: Cannot delete wrapper, CAN edit content
 * - contentLocked: CAN delete wrapper, cannot edit content
 * - sdtContentLocked: Cannot delete wrapper, cannot edit content
 */

// Helper to find SDT node position in document
function findSDTNode(doc, nodeType = 'structuredContent') {
  let result = null;
  doc.descendants((node, pos) => {
    if (node.type.name === nodeType) {
      result = { node, pos, end: pos + node.nodeSize };
      return false;
    }
  });
  return result;
}

// Helper to check if SDT node exists in document
function sdtNodeExists(doc, nodeType = 'structuredContent') {
  return findSDTNode(doc, nodeType) !== null;
}

describe('StructuredContentLockPlugin', () => {
  let editor;
  let schema;

  beforeEach(() => {
    ({ editor } = initTestEditor());
    ({ schema } = editor);
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
    schema = null;
  });

  // Factory to create document with SDT node
  function createDocWithSDT(lockMode, nodeType = 'structuredContent') {
    const text = schema.text('Test content');

    if (nodeType === 'structuredContent') {
      const sdt = schema.nodes.structuredContent.create({ id: 'test-123', lockMode }, text);
      const paragraph = schema.nodes.paragraph.create(null, [sdt]);
      return schema.nodes.doc.create(null, [paragraph]);
    }

    const innerParagraph = schema.nodes.paragraph.create(null, text);
    const sdt = schema.nodes.structuredContentBlock.create({ id: 'test-123', lockMode }, [innerParagraph]);
    return schema.nodes.doc.create(null, [sdt]);
  }

  // Factory to create doc with text before and after SDT (for boundary tests)
  function createDocWithSDTAndSurroundingText(lockMode, nodeType = 'structuredContent') {
    const beforeText = schema.text('Before ');
    const sdtText = schema.text('SDT content');
    const afterText = schema.text(' After');

    if (nodeType === 'structuredContent') {
      const sdt = schema.nodes.structuredContent.create({ id: 'test-123', lockMode }, sdtText);
      const paragraph = schema.nodes.paragraph.create(null, [beforeText, sdt, afterText]);
      return schema.nodes.doc.create(null, [paragraph]);
    }

    const beforePara = schema.nodes.paragraph.create(null, beforeText);
    const innerPara = schema.nodes.paragraph.create(null, sdtText);
    const sdt = schema.nodes.structuredContentBlock.create({ id: 'test-123', lockMode }, [innerPara]);
    const afterPara = schema.nodes.paragraph.create(null, afterText);
    return schema.nodes.doc.create(null, [beforePara, sdt, afterPara]);
  }

  // Apply document to editor and return state
  function applyDocToEditor(doc) {
    const state = EditorState.create({ schema, doc, plugins: editor.state.plugins });
    editor.setState(state);
    return state;
  }

  describe('wrapper deletion (sdtLocked behavior)', () => {
    const wrapperDeletionCases = [
      // [lockMode, nodeType, shouldBlock, description]
      ['unlocked', 'structuredContent', false, 'allows deletion of unlocked inline SDT'],
      ['unlocked', 'structuredContentBlock', false, 'allows deletion of unlocked block SDT'],
      ['sdtLocked', 'structuredContent', true, 'blocks deletion of sdtLocked inline SDT'],
      ['sdtLocked', 'structuredContentBlock', true, 'blocks deletion of sdtLocked block SDT'],
      ['contentLocked', 'structuredContent', false, 'allows deletion of contentLocked inline SDT'],
      ['contentLocked', 'structuredContentBlock', false, 'allows deletion of contentLocked block SDT'],
      ['sdtContentLocked', 'structuredContent', true, 'blocks deletion of sdtContentLocked inline SDT'],
      ['sdtContentLocked', 'structuredContentBlock', true, 'blocks deletion of sdtContentLocked block SDT'],
    ];

    it.each(wrapperDeletionCases)('%s %s: %s', (lockMode, nodeType, shouldBlock) => {
      // Arrange
      const doc = createDocWithSDT(lockMode, nodeType);
      const state = applyDocToEditor(doc);
      const sdtInfo = findSDTNode(state.doc, nodeType);
      expect(sdtInfo).not.toBeNull();

      // Act: attempt to delete the entire SDT node
      const tr = state.tr.delete(sdtInfo.pos, sdtInfo.end);
      const newState = state.apply(tr);

      // Assert
      const sdtStillExists = sdtNodeExists(newState.doc, nodeType);
      expect(sdtStillExists).toBe(shouldBlock);
    });
  });

  describe('content modification (contentLocked behavior)', () => {
    const contentModificationCases = [
      // [lockMode, nodeType, shouldBlock, description]
      ['unlocked', 'structuredContent', false, 'allows content modification in unlocked inline SDT'],
      ['unlocked', 'structuredContentBlock', false, 'allows content modification in unlocked block SDT'],
      ['sdtLocked', 'structuredContent', false, 'allows content modification in sdtLocked inline SDT'],
      ['sdtLocked', 'structuredContentBlock', false, 'allows content modification in sdtLocked block SDT'],
      ['contentLocked', 'structuredContent', true, 'blocks content modification in contentLocked inline SDT'],
      ['contentLocked', 'structuredContentBlock', true, 'blocks content modification in contentLocked block SDT'],
      ['sdtContentLocked', 'structuredContent', true, 'blocks content modification in sdtContentLocked inline SDT'],
      ['sdtContentLocked', 'structuredContentBlock', true, 'blocks content modification in sdtContentLocked block SDT'],
    ];

    it.each(contentModificationCases)('%s %s: %s', (lockMode, nodeType, shouldBlock) => {
      // Arrange
      const doc = createDocWithSDT(lockMode, nodeType);
      const state = applyDocToEditor(doc);
      const sdtInfo = findSDTNode(state.doc, nodeType);
      expect(sdtInfo).not.toBeNull();

      // Calculate position inside the SDT content
      const contentStart = sdtInfo.pos + 1; // +1 to enter the node
      const contentEnd = sdtInfo.end - 1; // -1 to stay inside

      // Act: attempt to delete content inside SDT
      const tr = state.tr.delete(contentStart, contentEnd);
      const newState = state.apply(tr);

      // Assert: check if content was modified
      const originalContent = state.doc.textContent;
      const newContent = newState.doc.textContent;
      const contentWasModified = originalContent !== newContent;

      expect(contentWasModified).toBe(!shouldBlock);
    });
  });

  describe('boundary crossing (protects SDT structure)', () => {
    const boundaryCrossingCases = [
      // [lockMode, crossType, shouldBlock, description]
      ['sdtLocked', 'crossesStart', true, 'blocks deletion that crosses into sdtLocked SDT from before'],
      ['sdtLocked', 'crossesEnd', true, 'blocks deletion that crosses out of sdtLocked SDT'],
      ['sdtContentLocked', 'crossesStart', true, 'blocks deletion that crosses into sdtContentLocked SDT from before'],
      ['sdtContentLocked', 'crossesEnd', true, 'blocks deletion that crosses out of sdtContentLocked SDT'],
      [
        'contentLocked',
        'crossesStart',
        false,
        'allows deletion that crosses into contentLocked SDT (wrapper deletable)',
      ],
      [
        'contentLocked',
        'crossesEnd',
        false,
        'allows deletion that crosses out of contentLocked SDT (wrapper deletable)',
      ],
      ['unlocked', 'crossesStart', false, 'allows deletion that crosses into unlocked SDT'],
      ['unlocked', 'crossesEnd', false, 'allows deletion that crosses out of unlocked SDT'],
    ];

    it.each(boundaryCrossingCases)('%s %s: %s', (lockMode, crossType, shouldBlock) => {
      // Arrange
      const doc = createDocWithSDTAndSurroundingText(lockMode, 'structuredContent');
      const state = applyDocToEditor(doc);
      const sdtInfo = findSDTNode(state.doc, 'structuredContent');
      expect(sdtInfo).not.toBeNull();

      // Act: create deletion that crosses SDT boundary
      let deleteFrom, deleteTo;
      if (crossType === 'crossesStart') {
        // Delete from before SDT into SDT content
        deleteFrom = Math.max(0, sdtInfo.pos - 3);
        deleteTo = sdtInfo.pos + 3;
      } else {
        // Delete from inside SDT to after SDT
        deleteFrom = sdtInfo.end - 3;
        deleteTo = Math.min(state.doc.content.size, sdtInfo.end + 3);
      }

      const tr = state.tr.delete(deleteFrom, deleteTo);
      const newState = state.apply(tr);

      // Assert: check if SDT still exists (boundary crossing damages wrapper)
      const sdtStillIntact = sdtNodeExists(newState.doc, 'structuredContent');
      const contentUnchanged = state.doc.textContent === newState.doc.textContent;

      if (shouldBlock) {
        // Transaction should be blocked - document unchanged
        expect(contentUnchanged).toBe(true);
      } else {
        // Transaction should proceed - something changed
        expect(contentUnchanged).toBe(false);
      }
    });
  });

  describe('insertion operations', () => {
    it('allows text insertion in unlocked SDT', () => {
      // Arrange
      const doc = createDocWithSDT('unlocked', 'structuredContent');
      const state = applyDocToEditor(doc);
      const sdtInfo = findSDTNode(state.doc, 'structuredContent');
      const insertPos = sdtInfo.pos + 2;

      // Act
      const tr = state.tr.insertText('NEW', insertPos);
      const newState = state.apply(tr);

      // Assert
      expect(newState.doc.textContent).toContain('NEW');
    });

    it('allows text insertion in sdtLocked SDT (content is editable)', () => {
      // Arrange
      const doc = createDocWithSDT('sdtLocked', 'structuredContent');
      const state = applyDocToEditor(doc);
      const sdtInfo = findSDTNode(state.doc, 'structuredContent');
      const insertPos = sdtInfo.pos + 2;

      // Act
      const tr = state.tr.insertText('NEW', insertPos);
      const newState = state.apply(tr);

      // Assert
      expect(newState.doc.textContent).toContain('NEW');
    });

    it('blocks text insertion in contentLocked SDT', () => {
      // Arrange
      const doc = createDocWithSDT('contentLocked', 'structuredContent');
      const state = applyDocToEditor(doc);
      const sdtInfo = findSDTNode(state.doc, 'structuredContent');
      const insertPos = sdtInfo.pos + 2;
      const originalContent = state.doc.textContent;

      // Act
      const tr = state.tr.insertText('NEW', insertPos);
      const newState = state.apply(tr);

      // Assert: content should be unchanged
      expect(newState.doc.textContent).toBe(originalContent);
    });

    it('blocks text insertion in sdtContentLocked SDT', () => {
      // Arrange
      const doc = createDocWithSDT('sdtContentLocked', 'structuredContent');
      const state = applyDocToEditor(doc);
      const sdtInfo = findSDTNode(state.doc, 'structuredContent');
      const insertPos = sdtInfo.pos + 2;
      const originalContent = state.doc.textContent;

      // Act
      const tr = state.tr.insertText('NEW', insertPos);
      const newState = state.apply(tr);

      // Assert: content should be unchanged
      expect(newState.doc.textContent).toBe(originalContent);
    });
  });

  describe('multiple SDT nodes', () => {
    function createDocWithMultipleSDTs() {
      const text1 = schema.text('Unlocked text');
      const text2 = schema.text('Locked text');
      const sdt1 = schema.nodes.structuredContent.create({ id: 'sdt-1', lockMode: 'unlocked' }, text1);
      const sdt2 = schema.nodes.structuredContent.create({ id: 'sdt-2', lockMode: 'sdtLocked' }, text2);
      const space = schema.text(' ');
      const paragraph = schema.nodes.paragraph.create(null, [sdt1, space, sdt2]);
      return schema.nodes.doc.create(null, [paragraph]);
    }

    it('allows deletion of unlocked SDT while preserving locked SDT in same document', () => {
      // Arrange
      const doc = createDocWithMultipleSDTs();
      const state = applyDocToEditor(doc);

      // Find the unlocked SDT (first one)
      let unlockedSDT = null;
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'structuredContent' && node.attrs.lockMode === 'unlocked') {
          unlockedSDT = { pos, end: pos + node.nodeSize };
          return false;
        }
      });
      expect(unlockedSDT).not.toBeNull();

      // Act: delete the unlocked SDT
      const tr = state.tr.delete(unlockedSDT.pos, unlockedSDT.end);
      const newState = state.apply(tr);

      // Assert: unlocked SDT deleted, locked SDT preserved
      expect(newState.doc.textContent).not.toContain('Unlocked text');
      expect(newState.doc.textContent).toContain('Locked text');
    });

    it('blocks deletion that would affect locked SDT even when unlocked SDT is also selected', () => {
      // Arrange
      const doc = createDocWithMultipleSDTs();
      const state = applyDocToEditor(doc);

      // Find both SDTs
      const sdts = [];
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'structuredContent') {
          sdts.push({ pos, end: pos + node.nodeSize, lockMode: node.attrs.lockMode });
        }
      });
      expect(sdts.length).toBe(2);

      // Act: try to delete everything (both SDTs)
      const deleteFrom = sdts[0].pos;
      const deleteTo = sdts[1].end;
      const tr = state.tr.delete(deleteFrom, deleteTo);
      const newState = state.apply(tr);

      // Assert: locked SDT should still exist
      expect(newState.doc.textContent).toContain('Locked text');
    });
  });

  describe('edge cases', () => {
    it('allows transaction when document has no SDT nodes', () => {
      // Arrange: create doc without SDT
      const text = schema.text('Regular paragraph');
      const paragraph = schema.nodes.paragraph.create(null, [text]);
      const doc = schema.nodes.doc.create(null, [paragraph]);
      const state = applyDocToEditor(doc);

      // Act
      const tr = state.tr.delete(2, 5);
      const newState = state.apply(tr);

      // Assert: deletion should proceed
      expect(newState.doc.textContent).not.toBe(state.doc.textContent);
    });

    it('allows non-document-changing transactions', () => {
      // Arrange
      const doc = createDocWithSDT('sdtContentLocked', 'structuredContent');
      const state = applyDocToEditor(doc);

      // Act: create selection-only transaction
      const tr = state.tr.setSelection(TextSelection.create(state.doc, 1));
      const newState = state.apply(tr);

      // Assert: should not throw, selection should change
      expect(newState.selection.from).toBe(1);
    });

    it('handles deletion at document boundaries gracefully', () => {
      // Arrange
      const doc = createDocWithSDT('unlocked', 'structuredContent');
      const state = applyDocToEditor(doc);

      // Act: delete from start of document
      const tr = state.tr.delete(0, 2);
      const newState = state.apply(tr);

      // Assert: should handle gracefully (exact behavior depends on schema)
      expect(newState).toBeDefined();
    });
  });

  describe('lock mode attribute validation', () => {
    it('treats missing lockMode as unlocked', () => {
      // Arrange: create SDT without explicit lockMode (defaults to unlocked)
      const text = schema.text('Default lock');
      const sdt = schema.nodes.structuredContent.create({ id: 'test-123' }, text);
      const paragraph = schema.nodes.paragraph.create(null, [sdt]);
      const doc = schema.nodes.doc.create(null, [paragraph]);
      const state = applyDocToEditor(doc);
      const sdtInfo = findSDTNode(state.doc, 'structuredContent');

      // Act: attempt to delete
      const tr = state.tr.delete(sdtInfo.pos, sdtInfo.end);
      const newState = state.apply(tr);

      // Assert: should be deletable (unlocked behavior)
      expect(sdtNodeExists(newState.doc, 'structuredContent')).toBe(false);
    });

    it('treats invalid lockMode as unlocked', () => {
      // Arrange: create SDT with invalid lockMode
      const text = schema.text('Invalid lock');
      const sdt = schema.nodes.structuredContent.create({ id: 'test-123', lockMode: 'invalidMode' }, text);
      const paragraph = schema.nodes.paragraph.create(null, [sdt]);
      const doc = schema.nodes.doc.create(null, [paragraph]);
      const state = applyDocToEditor(doc);
      const sdtInfo = findSDTNode(state.doc, 'structuredContent');

      // Act: attempt to delete
      const tr = state.tr.delete(sdtInfo.pos, sdtInfo.end);
      const newState = state.apply(tr);

      // Assert: should be deletable (treated as unlocked)
      expect(sdtNodeExists(newState.doc, 'structuredContent')).toBe(false);
    });
  });
});
