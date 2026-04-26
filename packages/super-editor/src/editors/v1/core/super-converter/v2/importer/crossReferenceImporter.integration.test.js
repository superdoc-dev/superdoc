/**
 * Integration tests for SD-2495 / IT-949.
 *
 * Why this file exists (root cause recap):
 * The `sd:crossReference` v3 translator was registered in `registeredHandlers`
 * but NOT wired into the v2 importer's `defaultNodeListHandler` entity list.
 * The passthrough fallback refused to wrap it (because it was "registered"),
 * and no entity claimed it, so every REF field in every imported DOCX was
 * silently dropped — erasing "Section 15" and every other cross-reference
 * from the viewer.
 *
 * These tests exercise the full v2 body pipeline: preprocessor → dispatcher →
 * entity handler → v3 translator → PM node. If any link in that chain breaks
 * (most likely: the entity gets removed from the entities list during a
 * refactor), the `crossReference` PM node disappears and these tests fail.
 *
 * The unit tests of the translator alone (`crossReference-translator.test.js`)
 * don't catch this class of regression because they bypass the dispatcher.
 */
import { describe, it, expect } from 'vitest';
import { defaultNodeListHandler } from './docxImporter.js';
import { preProcessNodesForFldChar } from '../../field-references/index.js';
import { crossReferenceEntity } from './crossReferenceImporter.js';

const createEditorStub = () => ({
  schema: {
    nodes: {
      run: { isInline: true, spec: { group: 'inline' } },
      crossReference: { isInline: true, spec: { group: 'inline', atom: true } },
    },
  },
});

// Produces the exact XML shape Word emits for a REF field with `\h` — matches
// the Brillio lease fragment that produces the "Section 15" customer bug.
const buildRefField = (target, cachedText) => {
  const run = (inner) => ({
    name: 'w:r',
    elements: [{ name: 'w:rPr', elements: [{ name: 'w:i' }] }, ...inner],
  });
  return [
    run([{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }]),
    run([
      {
        name: 'w:instrText',
        attributes: { 'xml:space': 'preserve' },
        elements: [{ type: 'text', text: ` REF ${target} \\w \\h ` }],
      },
    ]),
    run([]),
    run([{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }]),
    run([{ name: 'w:t', elements: [{ type: 'text', text: cachedText }] }]),
    run([{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }]),
  ];
};

describe('SD-2495 v2 importer wiring (IT-949 regression guard)', () => {
  it('registers crossReferenceEntity in defaultNodeListHandler — guards the miss that produced IT-949', () => {
    // This membership assertion is the cheapest possible regression guard
    // against the exact bug root cause: if a future refactor drops the
    // entity from the entities list, this fails immediately.
    expect(defaultNodeListHandler().handlerEntities).toContain(crossReferenceEntity);
  });

  it('REF field inside a paragraph produces a crossReference PM node with cached text + target', () => {
    const paragraph = {
      name: 'w:p',
      elements: [
        {
          name: 'w:r',
          elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'If terminated under this Section ' }] }],
        },
        ...buildRefField('_Ref506192326', '15'),
        {
          name: 'w:r',
          elements: [{ name: 'w:t', elements: [{ type: 'text', text: ', Landlord...' }] }],
        },
      ],
    };

    // Mirror the real body pipeline: preprocess fldChar runs into
    // sd:crossReference, then dispatch through the v2 entity list.
    const { processedNodes } = preProcessNodesForFldChar([paragraph], {});
    const nodeListHandler = defaultNodeListHandler();
    const pmNodes = nodeListHandler.handler({
      nodes: processedNodes,
      docx: {},
      editor: createEditorStub(),
      path: [],
    });

    const para = pmNodes.find((n) => n.type === 'paragraph');
    expect(para, 'paragraph should be produced').toBeTruthy();

    const crossRefs = collectNodesOfType(para, 'crossReference');
    expect(crossRefs).toHaveLength(1);
    expect(crossRefs[0].attrs.target).toBe('_Ref506192326');
    expect(crossRefs[0].attrs.resolvedText).toBe('15');
    // Instruction preserves the `\h` switch — the render layer reads this to
    // decide whether to attach an internal-link mark (SD-2537 hyperlink vs
    // plain-text variant).
    expect(crossRefs[0].attrs.instruction).toMatch(/\\h/);
  });

  it('REF with \\h switch records the target so the render layer can navigate on click', () => {
    const paragraph = {
      name: 'w:p',
      elements: [...buildRefField('_Ref123', '7')],
    };

    const { processedNodes } = preProcessNodesForFldChar([paragraph], {});
    const nodeListHandler = defaultNodeListHandler();
    const pmNodes = nodeListHandler.handler({
      nodes: processedNodes,
      docx: {},
      editor: createEditorStub(),
      path: [],
    });

    const crossRef = collectNodesOfType(pmNodes[0], 'crossReference')[0];
    expect(crossRef).toBeTruthy();
    // `display` is derived from switches so PM-adapter knows which variant.
    // `\w \h` → numberFullContext. If this regresses, cross-ref visuals change.
    expect(crossRef.attrs.display).toBe('numberFullContext');
  });

  it('plain text surrounding a REF field still reaches PM unchanged (guards against REF dispatch consuming sibling runs)', () => {
    // The `xml:space="preserve"` attribute is what keeps trailing whitespace
    // around. Without it, OOXML parsers strip leading/trailing whitespace from
    // w:t elements. The real customer document (Brillio lease) preserves this
    // attribute on runs adjacent to REF fields so "Section " doesn't collapse
    // to "Section" before the number. Mirror that here.
    const textRun = (text) => ({
      name: 'w:r',
      elements: [{ name: 'w:t', attributes: { 'xml:space': 'preserve' }, elements: [{ type: 'text', text }] }],
    });
    const paragraph = {
      name: 'w:p',
      elements: [textRun('Section '), ...buildRefField('_Ref1', '15'), textRun(', Landlord')],
    };

    const { processedNodes } = preProcessNodesForFldChar([paragraph], {});
    const nodeListHandler = defaultNodeListHandler();
    const [pmPara] = nodeListHandler.handler({
      nodes: processedNodes,
      docx: {},
      editor: createEditorStub(),
      path: [],
    });

    // Children of the paragraph, in order, excluding the crossReference (it's
    // an atom — its cached text contributes to the visual output but lives
    // inside the xref node, not beside it). We care here about the SURROUNDING
    // text surviving unchanged.
    const collectSiblingTextBeforeAndAfterXref = (paraNode) => {
      const parts = { before: '', after: '' };
      let sawXref = false;
      const visitChildren = (nodes) => {
        for (const child of nodes ?? []) {
          if (child?.type === 'crossReference') {
            sawXref = true;
            continue;
          }
          if (Array.isArray(child?.content)) visitChildren(child.content);
          else if (child?.type === 'text' && typeof child.text === 'string') {
            if (sawXref) parts.after += child.text;
            else parts.before += child.text;
          }
        }
      };
      visitChildren(paraNode.content ?? []);
      return parts;
    };

    const { before, after } = collectSiblingTextBeforeAndAfterXref(pmPara);
    expect(before).toBe('Section ');
    expect(after).toBe(', Landlord');
  });
});

/** Collect all descendants of a given type from a nested PM node tree. */
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
