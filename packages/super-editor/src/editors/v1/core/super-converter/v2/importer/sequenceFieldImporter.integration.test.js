import { describe, expect, it } from 'vitest';
import { defaultNodeListHandler } from './docxImporter.js';
import { sequenceFieldEntity } from './sequenceFieldImporter.js';
import { preProcessNodesForFldChar } from '../../field-references/index.js';

const createEditorStub = () => ({
  schema: {
    nodes: {
      run: { isInline: true, spec: { group: 'inline' } },
      sequenceField: { isInline: true, spec: { group: 'inline', atom: true } },
    },
  },
});

describe('sequenceField v2 importer wiring', () => {
  it('registers sequenceFieldEntity before passthrough in defaultNodeListHandler', () => {
    const entities = defaultNodeListHandler().handlerEntities;
    expect(entities).toContain(sequenceFieldEntity);
    expect(entities.indexOf(sequenceFieldEntity)).toBeLessThan(
      entities.findIndex((entity) => entity.handlerName === 'passthroughNodeHandler'),
    );
  });

  it.each([
    ['uppercase complex', 'SEQ Figure \\n \\r 10 \\s 2 \\h \\* roman', '10', 'next', 'roman'],
    ['lowercase complex', 'seq Figure \\c \\r 10 \\s 2 \\h \\* arabic', '11', 'current', 'arabic'],
    ['uppercase fldSimple', 'SEQ Figure \\n \\r 10 \\s 2 \\h \\* roman', '12', 'next', 'roman'],
    ['lowercase fldSimple', 'seq Figure \\c \\r 10 \\s 2 \\h \\* arabic', '13', 'current', 'arabic'],
  ])(
    'imports %s SEQ fields through the real preprocessor and v2 route',
    (_name, instruction, cachedText, sequenceMode, format) => {
      const paragraph = _name.includes('fldSimple')
        ? buildFldSimpleSeqParagraph(instruction, cachedText)
        : buildComplexSeqParagraph(instruction, cachedText);

      const { processedNodes } = preProcessNodesForFldChar([paragraph], {});
      const nodeListHandler = defaultNodeListHandler();
      const pmNodes = nodeListHandler.handler({
        nodes: processedNodes,
        docx: {},
        editor: createEditorStub(),
        path: [],
      });

      const sequenceField = collectNodesOfType(pmNodes[0], 'sequenceField')[0];
      expect(sequenceField).toBeTruthy();
      expect(sequenceField.attrs).toMatchObject({
        instruction,
        identifier: 'Figure',
        format,
        sequenceMode,
        restartLevel: 2,
        restartNumber: 10,
        hideResult: true,
        resolvedNumber: cachedText,
        resolvedNumberIsCurrent: false,
      });
    },
  );

  it('imports sequence field arguments and numeric formats onto PM attrs', () => {
    const instruction = 'SEQ Figure bookmark \\# "00"';
    const paragraph = buildComplexSeqParagraph(instruction, '07');

    const { processedNodes } = preProcessNodesForFldChar([paragraph], {});
    const nodeListHandler = defaultNodeListHandler();
    const pmNodes = nodeListHandler.handler({
      nodes: processedNodes,
      docx: {},
      editor: createEditorStub(),
      path: [],
    });

    const sequenceField = collectNodesOfType(pmNodes[0], 'sequenceField')[0];
    expect(sequenceField.attrs).toMatchObject({
      instruction,
      identifier: 'Figure',
      fieldArgument: 'bookmark',
      numericPictureFormat: { picture: '00' },
      hasGeneralFormat: false,
      pageNumberFieldFormat: null,
      resolvedNumber: '07',
      resolvedNumberIsCurrent: false,
    });
  });
});

function buildComplexSeqParagraph(instruction, cachedText) {
  const run = (inner) => ({ name: 'w:r', elements: inner });
  return {
    name: 'w:p',
    elements: [
      run([{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }]),
      run([{ name: 'w:instrText', elements: [{ type: 'text', text: instruction }] }]),
      run([{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }]),
      run([{ name: 'w:t', elements: [{ type: 'text', text: cachedText }] }]),
      run([{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }]),
    ],
  };
}

function buildFldSimpleSeqParagraph(instruction, cachedText) {
  return {
    name: 'w:p',
    elements: [
      {
        name: 'w:fldSimple',
        attributes: { 'w:instr': instruction },
        elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: cachedText }] }] }],
      },
    ],
  };
}

function collectNodesOfType(root, type) {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    if (node.type === type) out.push(node);
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(root);
  return out;
}
