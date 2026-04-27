import { describe, expect, it } from 'vitest';
import { attachFieldInstanceToFieldNodes, FIELD_BEARING_XML_NAMES } from './attach-field-instance.js';
import { buildFieldInstanceFromImport } from './build-field-instance.js';

const baseFi = () =>
  buildFieldInstanceFromImport({
    representation: 'complex',
    instructionText: 'PAGE',
    resultFragments: [],
    originalXml: { name: 'w:r', elements: [] },
    dirty: false,
    locked: false,
    part: 'body',
    importIndex: 0,
  });

describe('attachFieldInstanceToFieldNodes', () => {
  describe('explicit name list (table-driven)', () => {
    for (const name of FIELD_BEARING_XML_NAMES) {
      it(`attaches to <${name}> at the top level`, () => {
        const fi = baseFi();
        const nodes = [{ name, attributes: { existing: 'attr' }, elements: [] }];
        attachFieldInstanceToFieldNodes(nodes, fi);
        expect(nodes[0].attributes?.fieldInstance).toBeDefined();
        expect(nodes[0].attributes?.existing).toBe('attr');
      });
    }
  });

  it('does not attach to unsupported element names', () => {
    const fi = baseFi();
    const nodes: any[] = [
      { name: 'sd:hyperlink', attributes: {}, elements: [] },
      { name: 'sd:rawField', attributes: {}, elements: [] },
      { name: 'w:r', attributes: {}, elements: [] },
      { name: 'unknown', attributes: {}, elements: [] },
    ];
    attachFieldInstanceToFieldNodes(nodes, fi);
    for (const node of nodes) {
      expect(node.attributes.fieldInstance).toBeUndefined();
    }
  });

  it('descends into elements children to find a wrapped field node', () => {
    const fi = baseFi();
    const paragraph = {
      name: 'w:p',
      attributes: {},
      elements: [
        { name: 'w:r', attributes: {}, elements: [] },
        { name: 'sd:tableOfContents', attributes: {}, elements: [] },
      ],
    };
    attachFieldInstanceToFieldNodes([paragraph], fi);
    expect(paragraph.elements[0].attributes.fieldInstance).toBeUndefined();
    expect(paragraph.elements[1].attributes?.fieldInstance).toBeDefined();
  });

  it('does not recurse into children of an already-attached field node', () => {
    // A field node may legitimately contain its own elements; once attached,
    // we stop descending so we do not over-attach to nested look-alikes.
    const fi = baseFi();
    const node: any = {
      name: 'sd:tableOfContents',
      attributes: {},
      elements: [{ name: 'sd:sequenceField', attributes: {}, elements: [] }],
    };
    attachFieldInstanceToFieldNodes([node], fi);
    expect(node.attributes.fieldInstance).toBeDefined();
    expect(node.elements[0].attributes.fieldInstance).toBeUndefined();
  });

  it('attaches a distinct clone to each matched node so mutations do not alias', () => {
    const fi = baseFi();
    const nodes = [
      { name: 'sd:sequenceField', attributes: {}, elements: [] },
      { name: 'sd:documentStatField', attributes: {}, elements: [] },
    ];
    attachFieldInstanceToFieldNodes(nodes, fi);
    const a = nodes[0].attributes?.fieldInstance as any;
    const b = nodes[1].attributes?.fieldInstance as any;
    expect(a).not.toBe(b);
    expect(a.mutation).not.toBe(b.mutation);
    a.mutation.relocated = true;
    expect(b.mutation.relocated).toBe(false);
  });

  it('initializes attributes when the source node had none', () => {
    const fi = baseFi();
    const node: any = { name: 'sd:sequenceField', elements: [] };
    attachFieldInstanceToFieldNodes([node], fi);
    expect(node.attributes).toBeDefined();
    expect(node.attributes.fieldInstance).toBeDefined();
  });

  it("does not overwrite a child's already-attached FieldInstance (nested-field precedence)", () => {
    const innerFi = baseFi();
    innerFi.family = 'PAGEREF';
    const outerFi = baseFi();
    outerFi.family = 'HYPERLINK';
    const hyperlink: any = {
      name: 'w:hyperlink',
      attributes: {},
      elements: [{ name: 'sd:pageReference', attributes: { fieldInstance: innerFi }, elements: [] }],
    };
    attachFieldInstanceToFieldNodes([hyperlink], outerFi);
    expect(hyperlink.elements[0].attributes.fieldInstance.family).toBe('PAGEREF');
  });

  it('preserves the supplied FieldInstance content on the clone', () => {
    const fi = baseFi();
    const node: any = { name: 'sd:sequenceField', attributes: {}, elements: [] };
    attachFieldInstanceToFieldNodes([node], fi);
    const attached = node.attributes.fieldInstance;
    expect(attached.family).toBe(fi.family);
    expect(attached.rawInstruction).toBe(fi.rawInstruction);
    expect(attached.dirty).toBe(fi.dirty);
    expect(attached.locked).toBe(fi.locked);
  });
});
