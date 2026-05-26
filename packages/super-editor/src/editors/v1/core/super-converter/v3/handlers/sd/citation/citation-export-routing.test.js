import { describe, expect, it } from 'vitest';
import { exportSchemaToJson } from '../../../../exporter.js';
import { translator as runTranslator } from '../../w/r/r-translator.js';
import { translator as citationTranslator } from './citation-translator.js';

const CITATION_INSTRUCTION = 'CITATION source-123';

function buildCitationNode(overrides = {}) {
  return {
    type: 'citation',
    attrs: {
      instruction: CITATION_INSTRUCTION,
      sourceIds: ['source-123'],
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

function getRunText(node) {
  return (node?.elements ?? [])
    .filter((element) => element?.name === 'w:t')
    .flatMap((element) => element?.elements ?? [])
    .map((child) => child?.text ?? '')
    .join('');
}

describe('citation export routing', () => {
  it('exports citation nodes as Word field-code runs', () => {
    const exported = exportSchemaToJson({
      node: buildCitationNode(),
    });

    expect(Array.isArray(exported)).toBe(true);
    expect(exported.some((node) => hasFieldCharType(node, 'begin'))).toBe(true);
    expect(exported.some((node) => hasFieldCharType(node, 'separate'))).toBe(true);
    expect(exported.some((node) => hasFieldCharType(node, 'end'))).toBe(true);

    const instructionRun = exported.find(
      (node) => node?.name === 'w:r' && node?.elements?.some((element) => element?.name === 'w:instrText'),
    );
    const instructionElement = instructionRun?.elements?.find((element) => element?.name === 'w:instrText');

    expect(instructionElement?.elements?.[0]?.text).toBe(CITATION_INSTRUCTION);
  });

  it('expands run-wrapped citation nodes into field-code runs', () => {
    const decoded = runTranslator.decode({
      node: {
        type: 'run',
        attrs: {},
        content: [buildCitationNode()],
      },
      editor: { extensionService: { extensions: [] } },
    });

    const exportedRuns = Array.isArray(decoded) ? decoded : [decoded];

    expect(exportedRuns.some((node) => hasFieldCharType(node, 'begin'))).toBe(true);
    expect(exportedRuns.some((node) => hasFieldCharType(node, 'separate'))).toBe(true);
    expect(exportedRuns.some((node) => hasFieldCharType(node, 'end'))).toBe(true);
  });

  it('exports resolvedText when collaborative hydration stripped cached content', () => {
    const exported = exportSchemaToJson({
      node: buildCitationNode({
        attrs: { resolvedText: '(Smith, 2024)' },
      }),
    });

    expect(exported.map(getRunText).join('')).toBe('(Smith, 2024)');
  });
});

describe('citation import resolvedText extraction (SD-2975)', () => {
  // Mirrors the crossReference SD-2495 shape: cached citation text lives inside
  // a w:r wrapper. A top-level-only `n.type === 'text'` filter returns empty;
  // the recursive walk must descend through run wrappers to find the display text.
  const buildRun = (innerElements) => ({
    type: 'element',
    name: 'w:r',
    elements: [{ type: 'element', name: 'w:rPr', elements: [] }, ...innerElements],
  });

  const buildSdCitation = (instr, cachedRuns) => ({
    name: 'sd:citation',
    type: 'element',
    attributes: { instruction: instr },
    elements: cachedRuns,
  });

  const runWrappingHandler = {
    handler: ({ nodes }) =>
      nodes
        .map((run) => {
          const textEl = run.elements?.find((el) => el?.name === 'w:t');
          if (!textEl) return null;
          const text = (textEl.elements || [])
            .map((child) => (typeof child?.text === 'string' ? child.text : ''))
            .join('');
          if (!text) return null;
          return { type: 'run', attrs: {}, content: [{ type: 'text', text }] };
        })
        .filter(Boolean),
  };

  it('extracts cached text from a single run-wrapped w:t', () => {
    const xmlNode = buildSdCitation('CITATION Smith2024 \\l 1033', [
      buildRun([{ type: 'element', name: 'w:t', elements: [{ type: 'text', text: '(Smith, 2024)' }] }]),
    ]);
    const encoded = citationTranslator.encode({ nodes: [xmlNode], nodeListHandler: runWrappingHandler });

    expect(encoded.type).toBe('citation');
    expect(encoded.attrs.resolvedText).toBe('(Smith, 2024)');
  });

  it('concatenates cached text across multiple run wrappers', () => {
    const xmlNode = buildSdCitation('CITATION Doe2023 \\l 1033', [
      buildRun([{ type: 'element', name: 'w:t', elements: [{ type: 'text', text: '(Doe, ' }] }]),
      buildRun([{ type: 'element', name: 'w:t', elements: [{ type: 'text', text: '2023)' }] }]),
    ]);
    const encoded = citationTranslator.encode({ nodes: [xmlNode], nodeListHandler: runWrappingHandler });

    expect(encoded.attrs.resolvedText).toBe('(Doe, 2023)');
  });
});
