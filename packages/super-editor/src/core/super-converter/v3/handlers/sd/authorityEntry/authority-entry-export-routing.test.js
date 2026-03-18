import { describe, expect, it } from 'vitest';
import { exportSchemaToJson } from '../../../../exporter.js';
import { translator as runTranslator } from '../../w/r/r-translator.js';

const AUTHORITY_ENTRY_INSTRUCTION = 'TA \\l "Long Citation" \\s "Short Citation" \\c 1 \\b \\i';

function buildAuthorityEntryNode(overrides = {}) {
  return {
    type: 'authorityEntry',
    attrs: {
      instruction: AUTHORITY_ENTRY_INSTRUCTION,
      longCitation: 'Long Citation',
      shortCitation: 'Short Citation',
      category: 1,
      bold: true,
      italic: true,
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

describe('authorityEntry export routing', () => {
  it('exports authorityEntry nodes as TA field-code runs', () => {
    const exported = exportSchemaToJson({
      node: buildAuthorityEntryNode(),
    });

    expect(Array.isArray(exported)).toBe(true);
    expect(exported.some((node) => hasFieldCharType(node, 'begin'))).toBe(true);
    expect(exported.some((node) => hasFieldCharType(node, 'separate'))).toBe(true);
    expect(exported.some((node) => hasFieldCharType(node, 'end'))).toBe(true);

    const instructionRun = exported.find(
      (node) => node?.name === 'w:r' && node?.elements?.some((element) => element?.name === 'w:instrText'),
    );
    const instructionElement = instructionRun?.elements?.find((element) => element?.name === 'w:instrText');

    expect(instructionElement?.elements?.[0]?.text).toBe(AUTHORITY_ENTRY_INSTRUCTION);
  });

  it('expands run-wrapped authorityEntry nodes into TA field-code runs', () => {
    const decoded = runTranslator.decode({
      node: {
        type: 'run',
        attrs: {},
        content: [buildAuthorityEntryNode()],
      },
      editor: { extensionService: { extensions: [] } },
    });

    const exportedRuns = Array.isArray(decoded) ? decoded : [decoded];

    expect(exportedRuns.some((node) => hasFieldCharType(node, 'begin'))).toBe(true);
    expect(exportedRuns.some((node) => hasFieldCharType(node, 'separate'))).toBe(true);
    expect(exportedRuns.some((node) => hasFieldCharType(node, 'end'))).toBe(true);
  });
});
