import { describe, expect, it } from 'vitest';
import { defaultNodeListHandler } from './docxImporter.js';
import { sequenceFieldEntity } from './sequenceFieldImporter.js';
import { preProcessNodesForFldChar } from '../../field-references/preProcessNodesForFldChar.js';

describe('sequenceField v2 importer wiring (regression guard)', () => {
  it('registers sequenceFieldEntity in defaultNodeListHandler', () => {
    // Without this entry sd:sequenceField is silently dropped on import:
    // passthroughNodeImporter defers (a V3 translator is registered for the
    // node name) and no other entity claims the node, so the reduce loop
    // appends nothing. Mirrors the IT-949 guard for crossReference and the
    // chunk-(b) guard for rawField.
    expect(defaultNodeListHandler().handlerEntities).toContain(sequenceFieldEntity);
  });

  it('a SEQ field round-trips into a sequenceField PM node carrying its FieldInstance', () => {
    const paragraph = {
      name: 'w:p',
      elements: [
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
        {
          name: 'w:r',
          elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'SEQ Figure \\* ARABIC' }] }],
        },
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
        { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '1' }] }] },
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

    const stack = [...result];
    let seq = null;
    while (stack.length) {
      const n = stack.pop();
      if (!n) continue;
      if (n.type === 'sequenceField') {
        seq = n;
        break;
      }
      if (Array.isArray(n.content)) stack.push(...n.content);
    }

    expect(seq).toBeTruthy();
    expect(seq.attrs.identifier).toBe('Figure');
    expect(seq.attrs.format).toBe('ARABIC');
    expect(seq.attrs.fieldInstance).toBeDefined();
    expect(seq.attrs.fieldInstance.family).toBe('SEQ');
  });
});
