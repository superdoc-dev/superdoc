import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import JSZip from 'jszip';

test.use({ config: { toolbar: 'full' } });

const BULLET_DROPDOWN_CARET = '[aria-label="Bullet list"] .dropdown-caret';
const STYLE_OPTION = (label: string) => `.bullet-style-buttons [aria-label="${label}"]`;

const STYLE_LABEL = {
  disc: 'Opaque circle',
  circle: 'Outline circle',
  square: 'Opaque square',
} as const;

const STYLE_MARKER = {
  disc: '•',
  circle: '◦',
  square: '▪',
} as const;

async function pickStyle(superdoc: SuperDocFixture, style: keyof typeof STYLE_LABEL) {
  await superdoc.page.locator(BULLET_DROPDOWN_CARET).click();
  await superdoc.waitForStable();
  await superdoc.page.locator(STYLE_OPTION(STYLE_LABEL[style])).click();
  await superdoc.waitForStable();
}

async function getMarkerTextForParagraph(superdoc: SuperDocFixture, text: string): Promise<string | null> {
  return superdoc.page.evaluate((searchText: string) => {
    const editor = (window as any).editor;
    let marker: string | null = null;
    editor.state.doc.descendants((node: any) => {
      if (marker !== null) return false;
      if (node.type.name !== 'paragraph') return true;
      const paraText = String(node.textContent ?? '');
      if (!paraText.includes(searchText)) return true;
      marker = node.attrs?.listRendering?.markerText ?? null;
      return false;
    });
    return marker;
  }, text);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findFirstMatch(source: string, pattern: RegExp, label: string): string {
  const match = source.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Unable to find ${label}.`);
  }
  return match[1];
}

function getParagraphXmlByText(documentXml: string, text: string): string {
  // Walk every <w:p>…</w:p> block and return the first one whose own text content
  // matches. A non-greedy regex anchored at the doc start would otherwise span
  // across earlier paragraphs and pick up *their* numId references for later
  // paragraphs — see the SD-2978 reproduction.
  const paragraphRegex = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  for (const match of documentXml.matchAll(paragraphRegex)) {
    const paragraphXml = match[0];
    const textContent = Array.from(paragraphXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g))
      .map((m) => m[1])
      .join('');
    if (textContent.includes(text)) return paragraphXml;
  }
  throw new Error(`Unable to find exported paragraph containing "${text}".`);
}

function getExportedBulletMarker({
  documentXml,
  numberingXml,
  paragraphText,
}: {
  documentXml: string;
  numberingXml: string;
  paragraphText: string;
}): string {
  const paragraphXml = getParagraphXmlByText(documentXml, paragraphText);
  const numId = findFirstMatch(paragraphXml, /<w:numId\b[^>]*w:val="([^"]+)"/, 'paragraph numId');
  const numXml = findFirstMatch(
    numberingXml,
    new RegExp(`(<w:num\\b[^>]*w:numId="${escapeRegex(numId)}"[\\s\\S]*?<\\/w:num>)`),
    `w:num ${numId}`,
  );
  const abstractNumId = findFirstMatch(numXml, /<w:abstractNumId\b[^>]*w:val="([^"]+)"/, 'abstractNumId');
  const abstractXml = findFirstMatch(
    numberingXml,
    new RegExp(`(<w:abstractNum\\b[^>]*w:abstractNumId="${escapeRegex(abstractNumId)}"[\\s\\S]*?<\\/w:abstractNum>)`),
    `w:abstractNum ${abstractNumId}`,
  );
  const levelZeroXml = findFirstMatch(abstractXml, /(<w:lvl\b[^>]*w:ilvl="0"[\s\S]*?<\/w:lvl>)/, 'level 0 definition');
  return findFirstMatch(levelZeroXml, /<w:lvlText\b[^>]*w:val="([^"]+)"/, 'level 0 bullet marker');
}

test.describe('bullet style export (SD-2526)', () => {
  test('exports a style change applied from the second item in an existing bullet list', async ({ superdoc }) => {
    await superdoc.type('alpha');
    await superdoc.waitForStable();

    await pickStyle(superdoc, 'disc');
    expect(await getMarkerTextForParagraph(superdoc, 'alpha')).toBe(STYLE_MARKER.disc);

    await superdoc.newLine();
    await superdoc.type('beta');
    await superdoc.waitForStable();
    expect(await getMarkerTextForParagraph(superdoc, 'beta')).toBe(STYLE_MARKER.disc);

    await pickStyle(superdoc, 'square');
    expect(await getMarkerTextForParagraph(superdoc, 'alpha')).toBe(STYLE_MARKER.disc);
    expect(await getMarkerTextForParagraph(superdoc, 'beta')).toBe(STYLE_MARKER.square);

    const bytes: number[] = await superdoc.page.evaluate(async () => {
      const blob: Blob = await (window as any).editor.exportDocx();
      const buffer = await blob.arrayBuffer();
      return Array.from(new Uint8Array(buffer));
    });

    const zip = await JSZip.loadAsync(Buffer.from(bytes));
    const documentXml = await zip.file('word/document.xml')!.async('string');
    const numberingXml = await zip.file('word/numbering.xml')!.async('string');

    expect(getExportedBulletMarker({ documentXml, numberingXml, paragraphText: 'alpha' })).toBe(STYLE_MARKER.disc);
    expect(getExportedBulletMarker({ documentXml, numberingXml, paragraphText: 'beta' })).toBe(STYLE_MARKER.square);
  });
});
