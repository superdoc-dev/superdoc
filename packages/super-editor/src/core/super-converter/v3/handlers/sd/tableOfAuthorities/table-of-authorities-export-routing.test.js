import { describe, expect, it } from 'vitest';
import { exportSchemaToJson } from '../../../../exporter.js';

const TABLE_OF_AUTHORITIES_INSTRUCTION = 'TOA \\c 1 \\e ", " \\p \\h \\l "." \\g "-"';

function buildTableOfAuthoritiesNode(overrides = {}) {
  return {
    type: 'tableOfAuthorities',
    attrs: {
      instruction: TABLE_OF_AUTHORITIES_INSTRUCTION,
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
            content: [{ type: 'text', text: 'Authority table placeholder' }],
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

describe('tableOfAuthorities export routing', () => {
  it('exports tableOfAuthorities nodes as TOA block field-code structure', () => {
    const exported = exportSchemaToJson({
      node: buildTableOfAuthoritiesNode(),
    });

    expect(Array.isArray(exported)).toBe(true);
    expect(exported.length).toBeGreaterThan(0);

    const firstParagraph = exported[0];
    const lastParagraph = exported[exported.length - 1];

    expect(paragraphContainsFieldCharType(firstParagraph, 'begin')).toBe(true);
    expect(paragraphContainsFieldCharType(firstParagraph, 'separate')).toBe(true);
    expect(paragraphContainsFieldCharType(lastParagraph, 'end')).toBe(true);

    const instructionParagraph = exported.find(
      (paragraph) =>
        paragraph?.name === 'w:p' &&
        paragraph?.elements?.some(
          (element) => element?.name === 'w:r' && element?.elements?.some((n) => n?.name === 'w:instrText'),
        ),
    );

    const instructionRun = instructionParagraph?.elements?.find(
      (element) => element?.name === 'w:r' && element?.elements?.some((n) => n?.name === 'w:instrText'),
    );

    const instructionElement = instructionRun?.elements?.find((element) => element?.name === 'w:instrText');
    expect(instructionElement?.elements?.[0]?.text).toBe(TABLE_OF_AUTHORITIES_INSTRUCTION);
  });
});
