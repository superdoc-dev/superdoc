import { describe, expect, it } from 'vitest';
import { exportSchemaToJson } from '../../../../exporter.js';
import { translator as runTranslator } from '../../w/r/r-translator.js';
import { translator as crossReferenceTranslator } from './crossReference-translator.js';

const CROSS_REFERENCE_INSTRUCTION = 'REF bm-target \\h';

function buildCrossReferenceNode(overrides = {}) {
  return {
    type: 'crossReference',
    attrs: {
      instruction: CROSS_REFERENCE_INSTRUCTION,
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

describe('crossReference export routing', () => {
  it('exports crossReference nodes as Word field-code runs', () => {
    const exported = exportSchemaToJson({
      node: buildCrossReferenceNode(),
    });

    expect(Array.isArray(exported)).toBe(true);
    expect(exported.some((node) => hasFieldCharType(node, 'begin'))).toBe(true);
    expect(exported.some((node) => hasFieldCharType(node, 'separate'))).toBe(true);
    expect(exported.some((node) => hasFieldCharType(node, 'end'))).toBe(true);

    const instructionRun = exported.find(
      (node) => node?.name === 'w:r' && node?.elements?.some((element) => element?.name === 'w:instrText'),
    );
    const instructionElement = instructionRun?.elements?.find((element) => element?.name === 'w:instrText');

    expect(instructionElement?.elements?.[0]?.text).toBe(CROSS_REFERENCE_INSTRUCTION);
  });

  it('expands run-wrapped crossReference nodes into field-code runs', () => {
    const decoded = runTranslator.decode({
      node: {
        type: 'run',
        attrs: {},
        content: [buildCrossReferenceNode()],
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
      node: buildCrossReferenceNode({
        attrs: { resolvedText: '\u200e1' },
      }),
    });

    expect(exported.map(getRunText).join('')).toBe('\u200e1');
  });
});

describe('crossReference import resolvedText extraction (SD-2495)', () => {
  // Mirrors the Brillio-style REF cached payload: cached text lives inside a w:r
  // wrapper, so a top-level-only `n.type === 'text'` filter returns empty. The
  // recursive walk must descend through run wrappers to find the display text.
  const buildRun = (innerElements) => ({
    type: 'element',
    name: 'w:r',
    elements: [{ type: 'element', name: 'w:rPr', elements: [{ type: 'element', name: 'w:i' }] }, ...innerElements],
  });

  const buildSdCrossReference = (instr, cachedRuns) => ({
    name: 'sd:crossReference',
    type: 'element',
    attributes: { instruction: instr, fieldType: 'REF' },
    elements: cachedRuns,
  });

  it('extracts cached text from runs wrapped around a w:t (Brillio shape)', () => {
    const xmlNode = buildSdCrossReference('REF _Ref506192326 \\w \\h', [
      buildRun([]), // empty formatting-carrier run
      buildRun([{ type: 'element', name: 'w:t', elements: [{ type: 'text', text: '15' }] }]),
    ]);
    const encoded = crossReferenceTranslator.encode({
      nodes: [xmlNode],
      nodeListHandler: {
        handler: ({ nodes }) => {
          // Simulate w:r translator wrapping content in SuperDoc run nodes
          return nodes
            .map((run) => {
              const textEl = run.elements?.find((el) => el?.name === 'w:t');
              if (!textEl) return null;
              const text = (textEl.elements || [])
                .map((child) => (typeof child?.text === 'string' ? child.text : ''))
                .join('');
              if (!text) return null;
              return { type: 'run', attrs: {}, content: [{ type: 'text', text }] };
            })
            .filter(Boolean);
        },
      },
    });

    expect(encoded.type).toBe('crossReference');
    expect(encoded.attrs.target).toBe('_Ref506192326');
    expect(encoded.attrs.resolvedText).toBe('15');
    expect(encoded.attrs.display).toBe('numberFullContext');
  });

  it('concatenates cached text across multiple run wrappers', () => {
    const xmlNode = buildSdCrossReference('REF _RefABC \\h', [
      buildRun([{ type: 'element', name: 'w:t', elements: [{ type: 'text', text: '4(b' }] }]),
      buildRun([{ type: 'element', name: 'w:t', elements: [{ type: 'text', text: ')(2)' }] }]),
    ]);
    const encoded = crossReferenceTranslator.encode({
      nodes: [xmlNode],
      nodeListHandler: {
        handler: ({ nodes }) =>
          nodes.map((run) => ({
            type: 'run',
            attrs: {},
            content: [
              {
                type: 'text',
                text: (run.elements?.find((el) => el?.name === 'w:t')?.elements ?? [])
                  .map((c) => c.text || '')
                  .join(''),
              },
            ],
          })),
      },
    });

    expect(encoded.attrs.resolvedText).toBe('4(b)(2)');
  });
});
