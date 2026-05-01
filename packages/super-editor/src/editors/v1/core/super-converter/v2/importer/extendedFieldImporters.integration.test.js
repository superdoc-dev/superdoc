import { describe, expect, it } from 'vitest';
import { defaultNodeListHandler } from './docxImporter.js';
import { citationEntity } from './citationImporter.js';
import { authorityEntryEntity } from './authorityEntryImporter.js';
import { tableOfAuthoritiesEntity } from './tableOfAuthoritiesImporter.js';
import { tableOfContentsEntryEntity } from './tableOfContentsEntryImporter.js';
import { preProcessNodesForFldChar } from '../../field-codes/preProcessNodesForFldChar.js';

/**
 * Regression guards for the four V2 importer entities added alongside
 * chunk (c)'s FieldInstance forwarding work. Each of these fields was
 * previously dropped silently on import: the V3 translator was
 * registered (so passthroughNodeImporter deferred) but no V2 entity
 * claimed the node. Mirrors the SEQ guard in sequenceFieldImporter.
 */

function findFirstByType(nodes, type) {
  const stack = [...(nodes ?? [])];
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    if (n.type === type) return n;
    if (Array.isArray(n.content)) stack.push(...n.content);
  }
  return null;
}

const fldChar = (kind) => ({
  name: 'w:r',
  elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': kind } }],
});
const instrText = (text) => ({
  name: 'w:r',
  elements: [{ name: 'w:instrText', elements: [{ type: 'text', text }] }],
});
const resultText = (text) => ({
  name: 'w:r',
  elements: [{ name: 'w:t', elements: [{ type: 'text', text }] }],
});
const complexField = (instruction, result) => ({
  name: 'w:p',
  elements: [fldChar('begin'), instrText(instruction), fldChar('separate'), resultText(result), fldChar('end')],
});

function importBody(body) {
  const { processedNodes } = preProcessNodesForFldChar(body, {});
  const nodeListHandler = defaultNodeListHandler();
  return nodeListHandler.handler({
    nodes: processedNodes,
    docx: {},
    nodeListHandler,
    converter: {},
    path: [],
  });
}

describe('extended field V2 importer wiring (regression guards)', () => {
  it('registers all four new entities in defaultNodeListHandler', () => {
    const entities = defaultNodeListHandler().handlerEntities;
    expect(entities).toContain(citationEntity);
    expect(entities).toContain(authorityEntryEntity);
    expect(entities).toContain(tableOfAuthoritiesEntity);
    expect(entities).toContain(tableOfContentsEntryEntity);
  });

  it('CITATION → citation PM node carrying its FieldInstance', () => {
    const result = importBody([complexField('CITATION src1', '(Smith, 2020)')]);
    const node = findFirstByType(result, 'citation');
    expect(node).toBeTruthy();
    expect(node.attrs.fieldInstance).toBeDefined();
    expect(node.attrs.fieldInstance.family).toBe('CITATION');
  });

  it('TA → authorityEntry PM node carrying its FieldInstance', () => {
    const result = importBody([complexField('TA \\l "Smith v. Jones" \\s "Smith"', '')]);
    const node = findFirstByType(result, 'authorityEntry');
    expect(node).toBeTruthy();
    expect(node.attrs.fieldInstance).toBeDefined();
    expect(node.attrs.fieldInstance.family).toBe('TA');
  });

  it('TOA → tableOfAuthorities PM node carrying its FieldInstance', () => {
    const result = importBody([complexField('TOA \\h \\c "1"', 'Cases')]);
    const node = findFirstByType(result, 'tableOfAuthorities');
    expect(node).toBeTruthy();
    expect(node.attrs.fieldInstance).toBeDefined();
    expect(node.attrs.fieldInstance.family).toBe('TOA');
  });

  it('TC → tableOfContentsEntry PM node carrying its FieldInstance', () => {
    const result = importBody([complexField('TC "Chapter One" \\l 1', '')]);
    const node = findFirstByType(result, 'tableOfContentsEntry');
    expect(node).toBeTruthy();
    expect(node.attrs.fieldInstance).toBeDefined();
    expect(node.attrs.fieldInstance.family).toBe('TC');
  });
});
