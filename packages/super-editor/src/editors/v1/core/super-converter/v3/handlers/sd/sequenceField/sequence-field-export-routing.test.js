import { describe, expect, it } from 'vitest';
import { exportSchemaToJson } from '../../../../exporter.js';
import { translator as runTranslator } from '../../w/r/r-translator.js';

const SEQUENCE_FIELD_INSTRUCTION = 'SEQ Figure \\* ARABIC';

function buildSequenceFieldNode(overrides = {}) {
  return {
    type: 'sequenceField',
    attrs: {
      instruction: SEQUENCE_FIELD_INSTRUCTION,
      identifier: 'Figure',
      format: 'ARABIC',
      restartLevel: null,
      resolvedNumber: '',
      marksAsAttrs: [],
      ...overrides.attrs,
    },
    content: overrides.content ?? [],
  };
}

function hasFieldCharType(node, fieldType) {
  return (
    node?.name === 'w:r' &&
    node?.elements?.some(
      (element) => element?.name === 'w:fldChar' && element?.attributes?.['w:fldCharType'] === fieldType,
    )
  );
}

describe('sequenceField export routing', () => {
  it('exports sequenceField nodes as fldChar + instrText runs', () => {
    const exported = exportSchemaToJson({
      node: buildSequenceFieldNode(),
    });

    expect(Array.isArray(exported)).toBe(true);
    expect(exported.some((node) => hasFieldCharType(node, 'begin'))).toBe(true);
    expect(exported.some((node) => hasFieldCharType(node, 'separate'))).toBe(true);
    expect(exported.some((node) => hasFieldCharType(node, 'end'))).toBe(true);

    const instructionRun = exported.find(
      (node) => node?.name === 'w:r' && node?.elements?.some((element) => element?.name === 'w:instrText'),
    );
    const instructionElement = instructionRun?.elements?.find((element) => element?.name === 'w:instrText');

    expect(instructionElement?.elements?.[0]?.text).toBe(SEQUENCE_FIELD_INSTRUCTION);
  });

  it('expands run-wrapped sequenceField nodes into field-code runs', () => {
    const decoded = runTranslator.decode({
      node: {
        type: 'run',
        attrs: {},
        content: [buildSequenceFieldNode()],
      },
      editor: { extensionService: { extensions: [] } },
    });

    const exportedRuns = Array.isArray(decoded) ? decoded : [decoded];

    expect(exportedRuns.some((node) => hasFieldCharType(node, 'begin'))).toBe(true);
    expect(exportedRuns.some((node) => hasFieldCharType(node, 'separate'))).toBe(true);
    expect(exportedRuns.some((node) => hasFieldCharType(node, 'end'))).toBe(true);
  });
});
