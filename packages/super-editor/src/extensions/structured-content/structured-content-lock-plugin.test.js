import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';

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

  const createDocWithStructuredContent = (lockMode, type = 'structuredContent') => {
    const text = schema.text('Locked content');
    let node;
    let doc;

    if (type === 'structuredContent') {
      node = schema.nodes.structuredContent.create({ id: '123', lockMode }, text);
      const paragraph = schema.nodes.paragraph.create(null, [node]);
      doc = schema.nodes.doc.create(null, [paragraph]);
    } else {
      const innerParagraph = schema.nodes.paragraph.create(null, text);
      node = schema.nodes.structuredContentBlock.create({ id: '123', lockMode }, [innerParagraph]);
      doc = schema.nodes.doc.create(null, [node]);
    }

    const nextState = EditorState.create({ schema, doc, plugins: editor.state.plugins });
    editor.setState(nextState);
    return node;
  };

  describe('sdtLocked mode', () => {
    it('prevents deletion of sdtLocked inline structured content', () => {
      createDocWithStructuredContent('sdtLocked', 'structuredContent');

      // Find the structured content node position
      let nodePos = null;
      let nodeSize = null;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'structuredContent') {
          nodePos = pos;
          nodeSize = node.nodeSize;
          return false;
        }
      });

      expect(nodePos).not.toBeNull();

      // Try to delete the node
      const tr = editor.state.tr.delete(nodePos, nodePos + nodeSize);
      const newState = editor.state.apply(tr);

      // The document should remain unchanged (deletion blocked)
      expect(newState.doc.textContent).toBe('Locked content');
    });

    it('prevents deletion of sdtLocked block structured content', () => {
      createDocWithStructuredContent('sdtLocked', 'structuredContentBlock');

      // Find the structured content block position
      let nodePos = null;
      let nodeSize = null;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'structuredContentBlock') {
          nodePos = pos;
          nodeSize = node.nodeSize;
          return false;
        }
      });

      expect(nodePos).not.toBeNull();

      // Try to delete the node
      const tr = editor.state.tr.delete(nodePos, nodePos + nodeSize);
      const newState = editor.state.apply(tr);

      // The document should remain unchanged (deletion blocked)
      expect(newState.doc.textContent).toBe('Locked content');
    });
  });

  describe('sdtContentLocked mode', () => {
    it('prevents deletion of sdtContentLocked inline structured content', () => {
      createDocWithStructuredContent('sdtContentLocked', 'structuredContent');

      // Find the structured content node position
      let nodePos = null;
      let nodeSize = null;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'structuredContent') {
          nodePos = pos;
          nodeSize = node.nodeSize;
          return false;
        }
      });

      expect(nodePos).not.toBeNull();

      // Try to delete the node
      const tr = editor.state.tr.delete(nodePos, nodePos + nodeSize);
      const newState = editor.state.apply(tr);

      // The document should remain unchanged (deletion blocked)
      expect(newState.doc.textContent).toBe('Locked content');
    });

    it('prevents deletion of sdtContentLocked block structured content', () => {
      createDocWithStructuredContent('sdtContentLocked', 'structuredContentBlock');

      // Find the structured content block position
      let nodePos = null;
      let nodeSize = null;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'structuredContentBlock') {
          nodePos = pos;
          nodeSize = node.nodeSize;
          return false;
        }
      });

      expect(nodePos).not.toBeNull();

      // Try to delete the node
      const tr = editor.state.tr.delete(nodePos, nodePos + nodeSize);
      const newState = editor.state.apply(tr);

      // The document should remain unchanged (deletion blocked)
      expect(newState.doc.textContent).toBe('Locked content');
    });
  });

  describe('contentLocked mode', () => {
    it('allows deletion of contentLocked inline structured content', () => {
      createDocWithStructuredContent('contentLocked', 'structuredContent');

      // Find the structured content node position
      let nodePos = null;
      let nodeSize = null;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'structuredContent') {
          nodePos = pos;
          nodeSize = node.nodeSize;
          return false;
        }
      });

      expect(nodePos).not.toBeNull();

      // Try to delete the node
      const tr = editor.state.tr.delete(nodePos, nodePos + nodeSize);
      const newState = editor.state.apply(tr);

      // The node should be deleted
      let foundNode = false;
      newState.doc.descendants((node) => {
        if (node.type.name === 'structuredContent') {
          foundNode = true;
          return false;
        }
      });

      expect(foundNode).toBe(false);
    });

    it('allows deletion of contentLocked block structured content', () => {
      createDocWithStructuredContent('contentLocked', 'structuredContentBlock');

      // Find the structured content block position
      let nodePos = null;
      let nodeSize = null;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'structuredContentBlock') {
          nodePos = pos;
          nodeSize = node.nodeSize;
          return false;
        }
      });

      expect(nodePos).not.toBeNull();

      // Try to delete the node
      const tr = editor.state.tr.delete(nodePos, nodePos + nodeSize);
      const newState = editor.state.apply(tr);

      // The node should be deleted
      let foundNode = false;
      newState.doc.descendants((node) => {
        if (node.type.name === 'structuredContentBlock') {
          foundNode = true;
          return false;
        }
      });

      expect(foundNode).toBe(false);
    });
  });

  describe('unlocked mode', () => {
    it('allows deletion of unlocked inline structured content', () => {
      createDocWithStructuredContent('unlocked', 'structuredContent');

      // Find the structured content node position
      let nodePos = null;
      let nodeSize = null;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'structuredContent') {
          nodePos = pos;
          nodeSize = node.nodeSize;
          return false;
        }
      });

      expect(nodePos).not.toBeNull();

      // Try to delete the node
      const tr = editor.state.tr.delete(nodePos, nodePos + nodeSize);
      const newState = editor.state.apply(tr);

      // The node should be deleted
      let foundNode = false;
      newState.doc.descendants((node) => {
        if (node.type.name === 'structuredContent') {
          foundNode = true;
          return false;
        }
      });

      expect(foundNode).toBe(false);
    });

    it('allows deletion of unlocked block structured content', () => {
      createDocWithStructuredContent('unlocked', 'structuredContentBlock');

      // Find the structured content block position
      let nodePos = null;
      let nodeSize = null;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'structuredContentBlock') {
          nodePos = pos;
          nodeSize = node.nodeSize;
          return false;
        }
      });

      expect(nodePos).not.toBeNull();

      // Try to delete the node
      const tr = editor.state.tr.delete(nodePos, nodePos + nodeSize);
      const newState = editor.state.apply(tr);

      // The node should be deleted
      let foundNode = false;
      newState.doc.descendants((node) => {
        if (node.type.name === 'structuredContentBlock') {
          foundNode = true;
          return false;
        }
      });

      expect(foundNode).toBe(false);
    });
  });
});
