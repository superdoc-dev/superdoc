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

  // NOTE: sequenceField has no V2 importer entity registered, so a SEQ
  // integration test through defaultNodeListHandler currently drops the
  // node before reaching the V3 translator. The unit-level forwarding for
  // sequenceField is covered by attach-field-instance.test.ts. Wiring a
  // sequenceFieldEntity (mirroring rawFieldEntity / crossReferenceEntity)
  // is a separate follow-up.

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
