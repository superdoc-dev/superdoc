import { describe, expect, it } from 'vitest';
import { defaultNodeListHandler } from './docxImporter.js';
import { rawFieldEntity } from './rawFieldImporter.js';
import { preProcessNodesForFldChar } from '../../field-codes/preProcessNodesForFldChar.js';

describe('rawField v2 importer wiring (regression guard)', () => {
  it('registers rawFieldEntity in defaultNodeListHandler', () => {
    // Mirrors the IT-949 guard for crossReferenceEntity. Without this entry
    // the V2 importer drops `<sd:rawField>` because passthroughNodeImporter
    // defers when a V3 translator is registered for the node name.
    expect(defaultNodeListHandler().handlerEntities).toContain(rawFieldEntity);
  });

  it('an unknown complex field round-trips into a rawField PM node carrying its FieldInstance', () => {
    const paragraph = {
      name: 'w:p',
      elements: [
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
        {
          name: 'w:r',
          elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'CUSTOMFIELD foo' }] }],
        },
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
        { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'value' }] }] },
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
      ],
    };

    const { processedNodes } = preProcessNodesForFldChar([paragraph], {});
    const nodeListHandler = defaultNodeListHandler();
    const result = nodeListHandler.handler({
      nodes: processedNodes,
      docx: {},
      nodeListHandler,
      converter: {},
      path: [],
    });

    expect(Array.isArray(result)).toBe(true);
    // The paragraph wraps a rawField PM node; find it anywhere in the tree.
    const stack = [...result];
    let rawField = null;
    while (stack.length) {
      const n = stack.pop();
      if (!n) continue;
      if (n.type === 'rawField') {
        rawField = n;
        break;
      }
      if (Array.isArray(n.content)) stack.push(...n.content);
    }

    expect(rawField).toBeTruthy();
    expect(rawField.attrs.fieldInstance).toBeDefined();
    expect(rawField.attrs.fieldInstance.family).toBe('CUSTOMFIELD');
    expect(rawField.attrs.fieldInstance.rawInstruction).toBe('CUSTOMFIELD foo');
  });

  it('an unknown fldSimple round-trips into a rawField PM node', () => {
    const paragraph = {
      name: 'w:p',
      elements: [
        {
          name: 'w:fldSimple',
          attributes: { 'w:instr': 'CUSTOMFIELD foo' },
          elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'value' }] }] }],
        },
      ],
    };

    const { processedNodes } = preProcessNodesForFldChar([paragraph], {});
    const nodeListHandler = defaultNodeListHandler();
    const result = nodeListHandler.handler({
      nodes: processedNodes,
      docx: {},
      nodeListHandler,
      converter: {},
      path: [],
    });

    const stack = [...result];
    let rawField = null;
    while (stack.length) {
      const n = stack.pop();
      if (!n) continue;
      if (n.type === 'rawField') {
        rawField = n;
        break;
      }
      if (Array.isArray(n.content)) stack.push(...n.content);
    }

    expect(rawField).toBeTruthy();
    expect(rawField.attrs.fieldInstance.representation).toBe('simple');
    expect(rawField.attrs.fieldInstance.family).toBe('CUSTOMFIELD');
  });
});
