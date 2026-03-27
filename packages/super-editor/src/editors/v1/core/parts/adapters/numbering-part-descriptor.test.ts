import { describe, it, expect } from 'vitest';
import { numberingPartDescriptor, syncNumberingToXmlTree } from './numbering-part-descriptor.js';

describe('numberingPartDescriptor.ensurePart', () => {
  it('declares xmlns:w15 so w15:* attributes in list definitions are namespace-valid (SD-2252)', () => {
    const part = numberingPartDescriptor.ensurePart() as {
      elements: Array<{ attributes: Record<string, string> }>;
    };
    const root = part.elements[0];

    expect(root.attributes['xmlns:w']).toBe('http://schemas.openxmlformats.org/wordprocessingml/2006/main');
    expect(root.attributes['xmlns:w15']).toBe('http://schemas.microsoft.com/office/word/2012/wordml');
    expect(root.attributes['xmlns:mc']).toBe('http://schemas.openxmlformats.org/markup-compatibility/2006');
    expect(root.attributes['mc:Ignorable']).toContain('w15');
  });
});

describe('syncNumberingToXmlTree', () => {
  it('preserves non-abstract/definition children like w:numPicBullet', () => {
    const picBullet = { type: 'element', name: 'w:numPicBullet', attributes: { 'w:numPicBulletId': '0' } };
    const part = {
      elements: [
        {
          type: 'element',
          name: 'w:numbering',
          elements: [
            picBullet,
            { type: 'element', name: 'w:abstractNum', attributes: { 'w:abstractNumId': '0' } },
            { type: 'element', name: 'w:num', attributes: { 'w:numId': '1' } },
          ],
        },
      ],
    };

    const newAbstract = { type: 'element', name: 'w:abstractNum', attributes: { 'w:abstractNumId': '0' } };
    const newDef = { type: 'element', name: 'w:num', attributes: { 'w:numId': '1' } };

    syncNumberingToXmlTree(part, {
      abstracts: { 0: newAbstract },
      definitions: { 1: newDef },
    });

    const elements = part.elements[0].elements;
    expect(elements).toHaveLength(3);
    expect(elements![0]).toBe(picBullet);
    expect(elements![1]).toBe(newAbstract);
    expect(elements![2]).toBe(newDef);
  });

  it('preserves multiple unknown child types', () => {
    const picBullet = { type: 'element', name: 'w:numPicBullet', attributes: { 'w:numPicBulletId': '0' } };
    const macCleanup = { type: 'element', name: 'w:numIdMacAtCleanup', attributes: { 'w:val': '5' } };
    const part = {
      elements: [
        {
          type: 'element',
          name: 'w:numbering',
          elements: [picBullet, macCleanup],
        },
      ],
    };

    const abstract = { type: 'element', name: 'w:abstractNum', attributes: { 'w:abstractNumId': '0' } };
    syncNumberingToXmlTree(part, { abstracts: { 0: abstract }, definitions: {} });

    const elements = part.elements[0].elements;
    expect(elements).toHaveLength(3);
    expect(elements![0]).toBe(picBullet);
    expect(elements![1]).toBe(macCleanup);
    expect(elements![2]).toBe(abstract);
  });

  it('replaces abstracts and definitions from the numbering model', () => {
    const part = {
      elements: [
        {
          type: 'element',
          name: 'w:numbering',
          elements: [
            { type: 'element', name: 'w:abstractNum', attributes: { 'w:abstractNumId': '0' } },
            { type: 'element', name: 'w:num', attributes: { 'w:numId': '1' } },
          ],
        },
      ],
    };

    const newAbstract = { type: 'element', name: 'w:abstractNum', attributes: { 'w:abstractNumId': '99' } };
    const newDef = { type: 'element', name: 'w:num', attributes: { 'w:numId': '99' } };

    syncNumberingToXmlTree(part, { abstracts: { 99: newAbstract }, definitions: { 99: newDef } });

    const elements = part.elements[0].elements;
    expect(elements).toHaveLength(2);
    expect(elements![0]).toBe(newAbstract);
    expect(elements![1]).toBe(newDef);
  });

  it('handles numbering element with no existing children', () => {
    const part = { elements: [{ type: 'element', name: 'w:numbering' }] };
    const abstract = { type: 'element', name: 'w:abstractNum', attributes: { 'w:abstractNumId': '0' } };

    syncNumberingToXmlTree(part, { abstracts: { 0: abstract }, definitions: {} });

    expect((part.elements[0] as any).elements).toEqual([abstract]);
  });

  it('filters by reference identity when elements lack name property', () => {
    // Simulates test mocks where numbering model entries share references
    // with XML elements but don't have a `name` property.
    const abstract = { attributes: { 'w:abstractNumId': '0' }, elements: [] };
    const definition = { attributes: { 'w:numId': '1' }, elements: [] };
    const picBullet = { type: 'element', name: 'w:numPicBullet' };

    const part = {
      elements: [
        {
          type: 'element',
          name: 'w:numbering',
          elements: [picBullet, abstract, definition],
        },
      ],
    };

    syncNumberingToXmlTree(part, { abstracts: { 0: abstract }, definitions: { 1: definition } });

    const elements = part.elements[0].elements;
    expect(elements).toHaveLength(3);
    expect(elements![0]).toBe(picBullet);
    expect(elements![1]).toBe(abstract);
    expect(elements![2]).toBe(definition);
  });

  it('is a no-op when part has no root element', () => {
    const part = {};
    syncNumberingToXmlTree(part, { abstracts: {}, definitions: {} });
    expect(part).toEqual({});
  });

  it('produces empty elements when model is empty and no unknown children exist', () => {
    const part = {
      elements: [
        {
          type: 'element',
          name: 'w:numbering',
          elements: [{ type: 'element', name: 'w:abstractNum', attributes: { 'w:abstractNumId': '0' } }],
        },
      ],
    };

    syncNumberingToXmlTree(part, { abstracts: {}, definitions: {} });

    expect(part.elements[0].elements).toEqual([]);
  });
});
