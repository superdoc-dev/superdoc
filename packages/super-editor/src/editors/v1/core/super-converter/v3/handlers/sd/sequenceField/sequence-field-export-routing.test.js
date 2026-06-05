import { describe, expect, it } from 'vitest';
import { exportSchemaToJson } from '../../../../exporter.js';
import { translator as runTranslator } from '../../w/r/r-translator.js';
import { translator as sequenceFieldTranslator } from './sequenceField-translator.js';

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

function resultTexts(exported) {
  const separateIndex = exported.findIndex((node) => hasFieldCharType(node, 'separate'));
  const endIndex = exported.findIndex((node) => hasFieldCharType(node, 'end'));
  return exported
    .slice(separateIndex + 1, endIndex)
    .flatMap((node) => node?.elements ?? [])
    .filter((element) => element?.name === 'w:t')
    .map((element) => element?.elements?.[0]?.text);
}

describe('sequenceField export routing', () => {
  it('extracts cached result text from run-wrapped field content', () => {
    const encoded = sequenceFieldTranslator.encode({
      nodes: [
        {
          name: 'sd:sequenceField',
          attributes: { instruction: 'seq level2 \\*arabic' },
          elements: [
            {
              type: 'run',
              content: [{ type: 'text', text: '1', marks: [] }],
            },
          ],
        },
      ],
      nodeListHandler: {
        handler: () => [{ type: 'run', content: [{ type: 'text', text: '1', marks: [] }] }],
      },
    });

    expect(encoded.attrs.resolvedNumber).toBe('1');
    expect(encoded.attrs.resolvedNumberIsCurrent).toBe(false);
    expect(encoded.attrs.identifier).toBe('level2');
    expect(encoded.attrs.format).toBe('arabic');
  });

  it('round-trips lowercase SEQ cached result text before recompute', () => {
    const encoded = sequenceFieldTranslator.encode({
      nodes: [
        {
          name: 'sd:sequenceField',
          attributes: { instruction: 'seq Figure \\* arabic' },
          elements: [
            {
              type: 'run',
              content: [{ type: 'text', text: '42', marks: [] }],
            },
          ],
        },
      ],
      nodeListHandler: {
        handler: () => [{ type: 'run', content: [{ type: 'text', text: '42', marks: [] }] }],
      },
    });

    const exported = exportSchemaToJson({ node: encoded });
    const resultRun = exported.find(
      (node) =>
        node?.name === 'w:r' &&
        node?.elements?.some((element) => element?.name === 'w:t' && element?.elements?.[0]?.text === '42'),
    );

    expect(encoded.attrs.resolvedNumberIsCurrent).toBe(false);
    expect(resultRun).toBeTruthy();
  });

  it('exports current resolvedNumber instead of stale cached child content', () => {
    const exported = exportSchemaToJson({
      node: buildSequenceFieldNode({
        attrs: { resolvedNumber: '12', resolvedNumberIsCurrent: true },
        content: [{ type: 'run', attrs: {}, content: [{ type: 'text', text: '3' }] }],
      }),
    });

    expect(resultTexts(exported)).toEqual(['12']);
  });

  it('exports no result runs for current hidden or empty output', () => {
    const exported = exportSchemaToJson({
      node: buildSequenceFieldNode({
        attrs: { resolvedNumber: '', resolvedNumberIsCurrent: true },
        content: [{ type: 'run', attrs: {}, content: [{ type: 'text', text: '3' }] }],
      }),
    });

    expect(resultTexts(exported)).toEqual([]);
  });

  it('preserves imported cached child content when resolvedNumber is not current', () => {
    const exported = exportSchemaToJson({
      node: buildSequenceFieldNode({
        attrs: { resolvedNumber: '12', resolvedNumberIsCurrent: false },
        content: [{ type: 'run', attrs: {}, content: [{ type: 'text', text: '3' }] }],
      }),
    });

    expect(resultTexts(exported)).toEqual(['3']);
  });

  it('falls back to non-current resolvedNumber when no cached child content exists', () => {
    const exported = exportSchemaToJson({
      node: buildSequenceFieldNode({
        attrs: { resolvedNumber: '12', resolvedNumberIsCurrent: false },
        content: [],
      }),
    });

    expect(resultTexts(exported)).toEqual(['12']);
  });

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

  it('preserves raw split instructionTokens during export', () => {
    const instructionTokens = [
      { type: 'text', text: 'SEQ Figure ' },
      { type: 'text', text: '\\* roman' },
    ];
    const exported = exportSchemaToJson({
      node: buildSequenceFieldNode({
        attrs: {
          instruction: 'SEQ Figure \\* roman',
          instructionTokens,
          resolvedNumber: '1',
          resolvedNumberIsCurrent: true,
        },
      }),
    });

    const instructionRun = exported.find(
      (node) => node?.name === 'w:r' && node?.elements?.some((element) => element?.name === 'w:instrText'),
    );
    const instructionTexts = instructionRun?.elements
      ?.filter((element) => element?.name === 'w:instrText')
      .map((element) => element?.elements?.[0]?.text);

    expect(instructionTexts).toEqual(['SEQ Figure ', '\\* roman']);
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
