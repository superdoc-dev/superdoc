import { describe, expect, it } from 'vitest';
import { defaultNodeListHandler } from '../v2/importer/docxImporter.js';
import { preProcessNodesForFldChar } from './preProcessNodesForFldChar.js';

/**
 * Integration tests for the typed-node FieldInstance attachment.
 *
 * Each typed family preprocessor emits its own sd:* element shape; the
 * centralized attachment in preProcessNodesForFldChar must reach the field
 * node regardless of whether the preprocessor returns a single node, a
 * paragraph wrapper, or a block. These tests cover one example per
 * structural shape rather than every family.
 */

function findByType(node, type, found = []) {
  if (!node) return found;
  if (node.type === type) found.push(node);
  if (Array.isArray(node.content)) for (const c of node.content) findByType(c, type, found);
  return found;
}

describe('typed-node FieldInstance attachment', () => {
  it('attaches FieldInstance to a documentStatField (simple-field path, NUMWORDS)', () => {
    const paragraph = {
      name: 'w:p',
      elements: [
        {
          name: 'w:fldSimple',
          attributes: { 'w:instr': 'NUMWORDS' },
          elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '42' }] }] }],
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

    const stat = findByType(result[0], 'documentStatField');
    expect(stat).toHaveLength(1);
    const fi = stat[0].attrs.fieldInstance;
    expect(fi).toBeTruthy();
    expect(fi.representation).toBe('simple');
    expect(fi.family).toBe('NUMWORDS');
    expect(fi.rawInstruction).toBe('NUMWORDS');
    expect(fi.mutation.imported).toBe(true);
  });

  it('attaches FieldInstance to a page-number node (complex-field path, single-node emission)', () => {
    const paragraph = {
      name: 'w:p',
      elements: [
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
        { name: 'w:r', elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'PAGE' }] }] },
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
        { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '5' }] }] },
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

    const pn = findByType(result[0], 'page-number');
    expect(pn).toHaveLength(1);
    const fi = pn[0].attrs.fieldInstance;
    expect(fi).toBeTruthy();
    expect(fi.representation).toBe('complex');
    expect(fi.family).toBe('PAGE');
    expect(fi.rawInstruction).toBe('PAGE');
  });

  it('attaches FieldInstance to a tableOfContents node (block-level emission with paragraph wrapper)', () => {
    const paragraph = {
      name: 'w:p',
      elements: [
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
        { name: 'w:r', elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'TOC \\o "1-3"' }] }] },
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
        { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Chapter 1' }] }] },
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

    const toc = result.flatMap((n) => findByType(n, 'tableOfContents'));
    expect(toc).toHaveLength(1);
    const fi = toc[0].attrs.fieldInstance;
    expect(fi).toBeTruthy();
    expect(fi.representation).toBe('complex');
    expect(fi.family).toBe('TOC');
    expect(fi.rawInstruction).toBe('TOC \\o "1-3"');
  });

  it('attaches FieldInstance to a sequenceField (SEQ) on the complex-field path', () => {
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
    const seq = findByType(result[0], 'sequenceField');
    expect(seq).toHaveLength(1);
    expect(seq[0].attrs.fieldInstance.family).toBe('SEQ');
  });

  it('attaches FieldInstance to a totalPageNumber (NUMPAGES) on the complex-field path', () => {
    const paragraph = {
      name: 'w:p',
      elements: [
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
        { name: 'w:r', elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'NUMPAGES' }] }] },
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
        { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '10' }] }] },
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
    const total = findByType(result[0], 'total-page-number');
    expect(total).toHaveLength(1);
    expect(total[0].attrs.fieldInstance.family).toBe('NUMPAGES');
  });

  it("does not leak fieldInstance into the outer rawField's source.originalXml capture", () => {
    // Outer unknown CUSTOMFIELD wraps an inner PAGE field. The inner PAGE
    // emits sd:autoPageNumber with a fieldInstance attribute attached. The
    // outer rawField captures the inner runs as its source.originalXml so
    // passthrough export can re-emit the original subtree verbatim. The
    // fieldInstance attribute is a JS object — if it leaks into that
    // capture, the XML serializer writes an invalid attribute on
    // passthrough. Verify the capture is strip-cloned.
    const paragraph = {
      name: 'w:p',
      elements: [
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
        { name: 'w:r', elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'CUSTOMFIELD outer' }] }] },
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
        // Nested handled field (PAGE) inside the unhandled outer.
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
        { name: 'w:r', elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'PAGE' }] }] },
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
        { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '5' }] }] },
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
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

    const raws = findByType(result[0], 'rawField');
    expect(raws).toHaveLength(1);
    const rawFi = raws[0].attrs.fieldInstance;
    expect(rawFi.family).toBe('CUSTOMFIELD');

    // Walk the captured originalXml and assert no element carries a
    // fieldInstance attribute. originalXml is a flat array of runs for
    // complex fields.
    const stack = Array.isArray(rawFi.source.originalXml) ? [...rawFi.source.originalXml] : [rawFi.source.originalXml];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      if (node.attributes && Object.prototype.hasOwnProperty.call(node.attributes, 'fieldInstance')) {
        throw new Error(`fieldInstance leaked into source.originalXml on element ${node.name}`);
      }
      if (Array.isArray(node.elements)) stack.push(...node.elements);
    }

    // Sanity: the inner PAGE still surfaces on the PM tree with its FI.
    const pn = findByType(result[0], 'page-number');
    expect(pn).toHaveLength(1);
    expect(pn[0].attrs.fieldInstance.family).toBe('PAGE');
  });

  it('preserves dirty / locked flags on the FieldInstance attached to a typed node', () => {
    const paragraph = {
      name: 'w:p',
      elements: [
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin', 'w:dirty': '1', 'w:fldLock': '1' } }],
        },
        { name: 'w:r', elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'PAGE' }] }] },
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

    const pn = findByType(result[0], 'page-number');
    expect(pn[0].attrs.fieldInstance.dirty).toBe(true);
    expect(pn[0].attrs.fieldInstance.locked).toBe(true);
  });
});
