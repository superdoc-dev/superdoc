import { describe, expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';

import { buildPositionMapFromPmDoc } from '../PositionMapFromPm.js';

const testSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
    },
    text: { group: 'inline' },
  },
});

function createTestState(content: string): EditorState {
  const doc = testSchema.node('doc', null, [testSchema.node('paragraph', null, testSchema.text(content))]);
  return EditorState.create({ schema: testSchema, doc });
}

describe('PositionMapFromPm', () => {
  describe('buildPositionMapFromPmDoc', () => {
    it('returns null when pmDoc is null', () => {
      const result = buildPositionMapFromPmDoc(null as unknown as ReturnType<typeof createTestState>['doc'], {});
      expect(result).toBe(null);
    });

    it('returns null when jsonDoc is null', () => {
      const state = createTestState('Hello');
      const result = buildPositionMapFromPmDoc(state.doc, null);
      expect(result).toBe(null);
    });

    it('returns null when jsonDoc is not an object', () => {
      const state = createTestState('Hello');
      const result = buildPositionMapFromPmDoc(state.doc, 'not an object');
      expect(result).toBe(null);
    });

    it('builds position map for valid document', () => {
      const state = createTestState('Hello');
      const jsonDoc = state.doc.toJSON();

      const result = buildPositionMapFromPmDoc(state.doc, jsonDoc);
      expect(result).not.toBe(null);
      expect(result).toBeInstanceOf(WeakMap);
    });

    it('maps document node to correct positions', () => {
      const state = createTestState('Hello');
      const jsonDoc = state.doc.toJSON();

      const map = buildPositionMapFromPmDoc(state.doc, jsonDoc);
      expect(map).not.toBe(null);

      const docPos = map!.get(jsonDoc);
      expect(docPos).toBeDefined();
      expect(docPos?.start).toBe(0);
      expect(docPos?.end).toBe(state.doc.content.size);
    });

    it('maps paragraph node to correct positions', () => {
      const state = createTestState('Hello');
      const jsonDoc = state.doc.toJSON();

      const map = buildPositionMapFromPmDoc(state.doc, jsonDoc);
      expect(map).not.toBe(null);

      const jsonPara = jsonDoc.content?.[0];
      expect(jsonPara).toBeDefined();

      const paraPos = map!.get(jsonPara!);
      expect(paraPos).toBeDefined();
      expect(paraPos?.start).toBe(0);
      // Paragraph size includes opening/closing tokens
      expect(typeof paraPos?.end).toBe('number');
    });

    it('maps text nodes to correct positions', () => {
      const state = createTestState('Hello');
      const jsonDoc = state.doc.toJSON();

      const map = buildPositionMapFromPmDoc(state.doc, jsonDoc);
      expect(map).not.toBe(null);

      const jsonText = jsonDoc.content?.[0]?.content?.[0];
      if (jsonText) {
        const textPos = map!.get(jsonText);
        expect(textPos).toBeDefined();
      }
    });

    it('returns null when JSON structure does not match PM structure (type mismatch)', () => {
      const state = createTestState('Hello');
      const jsonDoc = state.doc.toJSON();

      // Corrupt JSON by changing type
      (jsonDoc.content![0] as Record<string, unknown>).type = 'wrong_type';

      const result = buildPositionMapFromPmDoc(state.doc, jsonDoc);
      expect(result).toBe(null);
    });

    it('returns null when child count mismatch', () => {
      const state = createTestState('Hello');
      const jsonDoc = state.doc.toJSON();

      // Corrupt JSON by removing a child
      if (jsonDoc.content) {
        jsonDoc.content.pop();
      }

      const result = buildPositionMapFromPmDoc(state.doc, jsonDoc);
      expect(result).toBe(null);
    });

    it('handles empty paragraphs', () => {
      const doc = testSchema.node('doc', null, [testSchema.node('paragraph', null)]);
      const state = EditorState.create({ schema: testSchema, doc });
      const jsonDoc = state.doc.toJSON();

      const map = buildPositionMapFromPmDoc(state.doc, jsonDoc);
      expect(map).not.toBe(null);
    });

    it('handles multiple paragraphs', () => {
      const doc = testSchema.node('doc', null, [
        testSchema.node('paragraph', null, testSchema.text('First')),
        testSchema.node('paragraph', null, testSchema.text('Second')),
      ]);
      const state = EditorState.create({ schema: testSchema, doc });
      const jsonDoc = state.doc.toJSON();

      const map = buildPositionMapFromPmDoc(state.doc, jsonDoc);
      expect(map).not.toBe(null);

      // Verify both paragraphs are mapped
      const firstPara = jsonDoc.content?.[0];
      const secondPara = jsonDoc.content?.[1];

      if (firstPara && secondPara) {
        expect(map!.get(firstPara)).toBeDefined();
        expect(map!.get(secondPara)).toBeDefined();
      }
    });

    it('correctly handles node positions with content', () => {
      const doc = testSchema.node('doc', null, [
        testSchema.node('paragraph', null, testSchema.text('First')),
        testSchema.node('paragraph', null, testSchema.text('Second')),
      ]);
      const state = EditorState.create({ schema: testSchema, doc });
      const jsonDoc = state.doc.toJSON();

      const map = buildPositionMapFromPmDoc(state.doc, jsonDoc);
      expect(map).not.toBe(null);

      const firstPara = jsonDoc.content?.[0];
      const secondPara = jsonDoc.content?.[1];

      if (firstPara && secondPara) {
        const firstPos = map!.get(firstPara);
        const secondPos = map!.get(secondPara);

        // Second paragraph should start after first paragraph
        expect(secondPos!.start).toBeGreaterThan(firstPos!.start);
      }
    });

    it('handles non-object JSON children gracefully', () => {
      const state = createTestState('Hello');
      const jsonDoc = state.doc.toJSON();

      // Corrupt JSON by making child non-object
      if (jsonDoc.content && jsonDoc.content[0]) {
        (jsonDoc.content[0] as { content?: unknown }).content = ['not an object'];
      }

      const result = buildPositionMapFromPmDoc(state.doc, jsonDoc);
      expect(result).toBe(null);
    });

    it('validates text node types correctly', () => {
      const state = createTestState('Hello');
      const jsonDoc = state.doc.toJSON();

      const map = buildPositionMapFromPmDoc(state.doc, jsonDoc);
      expect(map).not.toBe(null);

      // Text nodes should have type: 'text'
      const jsonText = jsonDoc.content?.[0]?.content?.[0];
      if (jsonText && jsonText.type === 'text') {
        expect(map!.get(jsonText)).toBeDefined();
      }
    });
  });
});
