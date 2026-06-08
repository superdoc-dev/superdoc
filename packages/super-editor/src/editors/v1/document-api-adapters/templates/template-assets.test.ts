/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { xml2js } from 'xml-js';
import { importHeaderFooterAssets } from './template-assets.js';
import { clone, findPageOneSectPr, rewriteSectPrRefs, type XmlElement } from './template-xml.js';

function parseXml(xml: string): XmlElement {
  return xml2js(xml, { compact: false }) as XmlElement;
}

function encode(xml: string): Uint8Array {
  return new TextEncoder().encode(xml);
}

describe('importHeaderFooterAssets', () => {
  it('remaps every source document rel id that points at an adopted header/footer part', () => {
    const byName = new Map<string, Uint8Array>([
      [
        'word/_rels/document.xml.rels',
        encode(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header10.xml"/><Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header10.xml"/></Relationships>`,
        ),
      ],
      [
        'word/header10.xml',
        encode(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>HEADER</w:t></w:r></w:p></w:hdr>`,
        ),
      ],
    ]);
    const converter = {
      convertedXml: {
        '[Content_Types].xml': parseXml(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`,
        ),
      },
      parseXmlToJson: parseXml,
    };

    const result = importHeaderFooterAssets({} as any, converter, byName, false);

    expect(result.relIdRemap.size).toBe(2);
    expect(result.relIdRemap.get('rId10')).toBeDefined();
    expect(result.relIdRemap.get('rId10')).toBe(result.relIdRemap.get('rId11'));
    expect(result.mappings).toEqual(
      expect.arrayContaining([
        { kind: 'relationship', from: 'rId10', to: result.relIdRemap.get('rId10')! },
        { kind: 'relationship', from: 'rId11', to: result.relIdRemap.get('rId11')! },
      ]),
    );

    const sourceDocument = parseXml(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:sectPr><w:headerReference w:type="first" r:id="rId10"/><w:headerReference w:type="default" r:id="rId11"/></w:sectPr></w:pPr></w:p></w:body></w:document>`,
    );
    const sectPr = clone(findPageOneSectPr(sourceDocument)!);

    rewriteSectPrRefs(sectPr, result.relIdRemap);

    const rewrittenIds = (sectPr.elements ?? [])
      .filter((el) => {
        const ln = el.name?.split(':').pop();
        return ln === 'headerReference' || ln === 'footerReference';
      })
      .map((el) => el.attributes?.['r:id']);

    expect(rewrittenIds).toEqual([result.relIdRemap.get('rId10'), result.relIdRemap.get('rId10')]);
  });
});
