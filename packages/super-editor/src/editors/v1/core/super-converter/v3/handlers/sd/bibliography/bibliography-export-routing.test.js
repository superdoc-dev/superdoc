import { describe, expect, it } from 'vitest';
import { exportSchemaToJson } from '../../../../exporter.js';

const BIBLIOGRAPHY_INSTRUCTION = 'BIBLIOGRAPHY';

function buildBibliographyNode(overrides = {}) {
  return {
    type: 'bibliography',
    attrs: {
      instruction: BIBLIOGRAPHY_INSTRUCTION,
      ...overrides.attrs,
    },
    content: overrides.content ?? [
      {
        type: 'paragraph',
        attrs: {},
        content: [
          {
            type: 'run',
            attrs: {},
            content: [{ type: 'text', text: 'Reference placeholder' }],
          },
        ],
      },
    ],
  };
}

function paragraphContainsFieldCharType(paragraphNode, fieldType) {
  if (paragraphNode?.name !== 'w:p' || !Array.isArray(paragraphNode?.elements)) return false;
  return paragraphNode.elements.some(
    (element) =>
      element?.name === 'w:r' &&
      element?.elements?.some(
        (nested) => nested?.name === 'w:fldChar' && nested?.attributes?.['w:fldCharType'] === fieldType,
      ),
  );
}

describe('bibliography export routing', () => {
  it('exports bibliography nodes as block field-code structure', () => {
    const exported = exportSchemaToJson({
      node: buildBibliographyNode(),
    });

    expect(Array.isArray(exported)).toBe(true);
    expect(exported.length).toBeGreaterThan(0);

    const firstParagraph = exported[0];
    const lastParagraph = exported[exported.length - 1];

    expect(paragraphContainsFieldCharType(firstParagraph, 'begin')).toBe(true);
    expect(paragraphContainsFieldCharType(firstParagraph, 'separate')).toBe(true);
    expect(paragraphContainsFieldCharType(lastParagraph, 'end')).toBe(true);

    const serialized = JSON.stringify(exported);
    expect(serialized).toContain('w:instrText');
    expect(serialized).toContain(BIBLIOGRAPHY_INSTRUCTION);
  });

  it('reproduces a multi-run split instruction verbatim from tokens (SD-3066)', () => {
    // Parity with index/toa: a BIBLIOGRAPHY instruction Word split across runs
    // must export as those same runs, rebuilt from instructionTokens, rather
    // than collapsing to a single instrText run.
    const instructionTokens = [
      { type: 'text', text: 'BIBLIOGRAPHY ' },
      { type: 'text', text: '\\l 1033 ' },
    ];

    const exported = exportSchemaToJson({
      node: buildBibliographyNode({ attrs: { instructionTokens } }),
    });

    const instrTexts = exported
      .flatMap((para) => para.elements || [])
      .filter((el) => el.name === 'w:r')
      .flatMap((run) => run.elements || [])
      .filter((el) => el.name === 'w:instrText')
      .map((el) => el.elements[0].text);

    expect(instrTexts).toEqual(['BIBLIOGRAPHY ', '\\l 1033 ']);
  });
});
