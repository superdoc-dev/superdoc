import path from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import * as xmljs from 'xml-js';

import { Editor } from '@core/Editor.js';
import { getTestDataAsFileBuffer, initTestEditor } from '../helpers/helpers.js';

const FOOTER_RELATIONSHIP_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const getDirectChild = (node, name) => {
  return (node?.elements ?? []).find((child) => child.name === name);
};

const collectRelationshipTargets = (relationshipsXml) => {
  const parsed = xmljs.xml2js(relationshipsXml, { compact: false });
  const relationshipsRoot = parsed.elements?.find((element) => element.name === 'Relationships');
  return (relationshipsRoot?.elements ?? [])
    .filter((element) => element.name === 'Relationship')
    .map((element) => ({
      target: element.attributes?.Target ?? '',
      targetMode: element.attributes?.TargetMode ?? '',
      type: element.attributes?.Type ?? '',
    }));
};

const collectContentTypeOverrides = (contentTypesXml) => {
  const parsed = xmljs.xml2js(contentTypesXml, { compact: false });
  const typesRoot = parsed.elements?.find((element) => element.name === 'Types');
  return (typesRoot?.elements ?? [])
    .filter((element) => element.name === 'Override')
    .map((element) => ({
      partName: element.attributes?.PartName ?? '',
      contentType: element.attributes?.ContentType ?? '',
    }));
};

const partContainsInstrTextInsideDeletion = (xml) => {
  const parsed = xmljs.xml2js(xml, { compact: false });
  let invalid = false;

  const visit = (node, insideDeletion = false) => {
    if (!node || typeof node !== 'object' || invalid) return;

    if (node.name === 'w:instrText' && insideDeletion) {
      invalid = true;
      return;
    }

    const nextInsideDeletion = insideDeletion || node.name === 'w:del';
    for (const child of node.elements ?? []) {
      visit(child, nextInsideDeletion);
      if (invalid) return;
    }
  };

  for (const element of parsed.elements ?? []) {
    visit(element, false);
    if (invalid) break;
  }

  return invalid;
};

const collectInvalidDelInstrParts = async (zip) => {
  const invalidParts = [];

  for (const xmlPath of Object.keys(zip.files).filter((name) => name.endsWith('.xml'))) {
    const xml = await zip.file(xmlPath)?.async('string');
    if (!xml) continue;
    if (partContainsInstrTextInsideDeletion(xml)) invalidParts.push(xmlPath);
  }

  return invalidParts;
};

const collectMissingRelationshipTargets = async (zip) => {
  const missingTargets = [];

  for (const relPath of Object.keys(zip.files).filter((name) => name.endsWith('.rels'))) {
    const relXml = await zip.file(relPath)?.async('string');
    if (!relXml) continue;

    const relDir = path.posix.dirname(relPath);
    const sourceDir = relDir.endsWith('_rels') ? path.posix.dirname(relDir) : relDir;

    for (const { target, targetMode } of collectRelationshipTargets(relXml)) {
      if (
        !target ||
        targetMode === 'External' ||
        target.startsWith('http:') ||
        target.startsWith('https:') ||
        target.startsWith('mailto:') ||
        target.startsWith('#')
      ) {
        continue;
      }

      const resolvedTarget = path.posix.normalize(path.posix.join(sourceDir, target));
      if (!zip.file(resolvedTarget)) missingTargets.push(`${relPath} -> ${target}`);
    }
  }

  return missingTargets;
};

async function buildDeletedFieldInstructionFooterDocx() {
  // Start from a public fixture that already has valid footer refs/content types.
  const baseBuffer = await getTestDataAsFileBuffer('basic-page-nums.docx');
  const zip = await JSZip.loadAsync(baseBuffer);
  const footerXml = await zip.file('word/footer1.xml')?.async('string');

  if (!footerXml) {
    throw new Error('basic-page-nums.docx is missing word/footer1.xml');
  }

  const footerJson = xmljs.xml2js(footerXml, { compact: false });
  const footerRoot = footerJson.elements?.find((element) => element.name === 'w:ftr');
  if (!footerRoot) {
    throw new Error('word/footer1.xml is missing the w:ftr root');
  }

  const sdt = getDirectChild(footerRoot, 'w:sdt');
  const sdtContent = getDirectChild(sdt, 'w:sdtContent');
  const footerParagraph = (sdtContent?.elements ?? []).find((element) => element.name === 'w:p');
  if (!footerParagraph?.elements) {
    throw new Error('word/footer1.xml is missing the page-number paragraph');
  }

  const instrRunIndex = footerParagraph.elements.findIndex(
    (element) => element.name === 'w:r' && getDirectChild(element, 'w:instrText'),
  );

  if (instrRunIndex === -1) {
    throw new Error('word/footer1.xml is missing the PAGE field instruction run');
  }

  const instrRun = footerParagraph.elements[instrRunIndex];
  const instrText = getDirectChild(instrRun, 'w:instrText');
  const instrRunProperties = getDirectChild(instrRun, 'w:rPr');

  footerParagraph.elements.splice(instrRunIndex, 1, {
    type: 'element',
    name: 'w:del',
    attributes: {
      'w:id': '1544',
      'w:author': 'Regression Test',
      'w:date': '2024-01-01T00:00:00Z',
    },
    elements: [
      {
        type: 'element',
        name: 'w:r',
        elements: [
          ...(instrRunProperties ? [deepClone(instrRunProperties)] : []),
          {
            type: 'element',
            name: 'w:delInstrText',
            attributes: {
              'xml:space': instrText?.attributes?.['xml:space'] ?? 'preserve',
            },
            elements: [{ type: 'text', text: ' PAGE   \\* MERGEFORMAT ' }],
          },
        ],
      },
    ],
  });

  zip.file('word/footer1.xml', xmljs.js2xml(footerJson, { compact: false, spaces: 0 }));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('tracked-change normalization deleted field-instruction regression', () => {
  it('does not emit w:instrText inside surviving w:del wrappers during final-doc export', async () => {
    const source = await buildDeletedFieldInstructionFooterDocx();
    const sourceZip = await JSZip.loadAsync(source);
    const sourceFooter = await sourceZip.file('word/footer1.xml')?.async('string');

    expect(sourceFooter).toContain('<w:delInstrText');
    expect(partContainsInstrTextInsideDeletion(sourceFooter)).toBe(false);

    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(source, true);
    const { editor } = initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      isHeadless: true,
    });

    try {
      const exported = await editor.exportDocx({ isFinalDoc: true });
      const zip = await JSZip.loadAsync(exported);
      const footer1 = await zip.file('word/footer1.xml')?.async('string');
      const contentTypes = await zip.file('[Content_Types].xml')?.async('string');
      const documentRels = await zip.file('word/_rels/document.xml.rels')?.async('string');

      expect(footer1).toBeTruthy();
      expect(contentTypes).toBeTruthy();
      expect(documentRels).toBeTruthy();

      const invalidDelInstrParts = await collectInvalidDelInstrParts(zip);
      const missingTargets = await collectMissingRelationshipTargets(zip);
      const footerOverrides = collectContentTypeOverrides(contentTypes).filter(
        (entry) => entry.partName === '/word/footer1.xml',
      );
      const footerRelationships = collectRelationshipTargets(documentRels).filter(
        (entry) => entry.type === FOOTER_RELATIONSHIP_TYPE,
      );

      expect(invalidDelInstrParts).toEqual([]);
      expect(missingTargets).toEqual([]);
      expect(footerOverrides).toHaveLength(1);
      expect(footerRelationships.map((entry) => entry.target)).toContain('footer1.xml');
    } finally {
      editor.destroy();
    }
  });
});
