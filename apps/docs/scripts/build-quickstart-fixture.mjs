/**
 * Builds the Editor quickstart fixture: `public/fixtures/sample-nda.docx`.
 *
 * The quickstart's job is to prove a real DOCX opens, edits, and exports. It
 * must therefore be a clean document: no tracked changes or comments for a
 * reader to mistake for their own edit, and no identifying metadata. The
 * tracked-changes fixture stays reserved for the review documentation, where
 * an existing suggestion is the point.
 *
 * Source: `../fixtures/nda.docx` (synthetic, redistributable), owned by this
 * app because this script is its only consumer. We keep its formatting so the
 * fixture exercises real DOCX fidelity: Word heading styles and a bulleted
 * list rather than plain paragraphs.
 *
 * Run: node scripts/build-quickstart-fixture.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(HERE, '../fixtures/nda.docx');
const OUT = path.resolve(HERE, '../public/fixtures/sample-nda.docx');

/**
 * Author fields are emptied, not replaced with a placeholder: the existing
 * fixture gate in `tests/content.test.mjs` treats any non-empty `dc:creator`
 * or `cp:lastModifiedBy` as identifying metadata.
 */
const SANITIZED_CORE_PROPERTIES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Mutual Non-Disclosure Agreement</dc:title><dc:subject></dc:subject><dc:creator></dc:creator><cp:keywords></cp:keywords><dc:description>Synthetic sample document for the SuperDoc quickstart.</dc:description><cp:lastModifiedBy></cp:lastModifiedBy><cp:revision>1</cp:revision><dcterms:created xsi:type="dcterms:W3CDTF">2025-01-15T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2025-01-15T00:00:00Z</dcterms:modified><cp:category></cp:category></cp:coreProperties>`;

/**
 * Strip identifying and machine-specific fields from extended properties.
 *
 * `Template` is emptied rather than normalized to `Normal.dotm`: the fixture
 * policy asks for template metadata to be stripped when it is not the behavior
 * under test, and an empty value cannot be mistaken for a real template the
 * document depends on.
 */
function sanitizeAppProperties(xml) {
  return xml
    .replace(/<Template>[^<]*<\/Template>/, '<Template></Template>')
    .replace(/<TotalTime>[^<]*<\/TotalTime>/, '<TotalTime>0</TotalTime>')
    .replace(/<Application>[^<]*<\/Application>/, '<Application>SuperDoc</Application>')
    .replace(/<Manager>[^<]*<\/Manager>/, '<Manager></Manager>')
    .replace(/<Company>[^<]*<\/Company>/, '<Company></Company>');
}

/**
 * Word parts that exist only to carry review data. Removing the markup from a
 * story part is not enough on its own: the comment bodies and the reviewer
 * identities live in these.
 */
const COMMENT_PARTS = [
  'word/comments.xml',
  'word/commentsExtended.xml',
  'word/commentsIds.xml',
  'word/commentsExtensible.xml',
  'word/people.xml',
];

/**
 * Custom XML data stores. Word writes one here for an empty bibliography, and
 * its `itemProps` part carries a datastore GUID. Nothing in the quickstart
 * exercises custom XML, and the fixture policy says to strip it when it is not
 * the behavior under test, so it goes.
 */
const CUSTOM_XML_PARTS = ['customXml/item1.xml', 'customXml/itemProps1.xml', 'customXml/_rels/item1.xml.rels'];

const STRIPPED_PARTS = [...COMMENT_PARTS, ...CUSTOM_XML_PARTS];

/**
 * Remove tracked-change and comment markup. The source NDA has none today;
 * this keeps the guarantee true if the upstream fixture ever gains some.
 *
 * Each form is handled by what it means for the accepted document: markup that
 * wraps surviving content is unwrapped, markup for content that a reviewer
 * removed is dropped with its content, and property-change records are dropped
 * outright because they only describe a prior formatting state.
 */
function stripRevisionsAndComments(xml) {
  let out = xml;

  // Content that survives acceptance: keep the text, drop the wrapper.
  // `moveTo` is the destination half of a tracked move, so it stays.
  for (const tag of ['w:ins', 'w:moveTo']) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g'), '$1');
  }

  // Content that acceptance removes: drop the element and everything in it.
  // `moveFrom` is the origin half of a move, whose text lives in `moveTo`.
  for (const tag of ['w:del', 'w:moveFrom']) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'g'), '');
  }

  // Property-change records and move-range anchors carry no document content,
  // only the reviewer's name and the superseded state.
  for (const tag of [
    'w:rPrChange',
    'w:pPrChange',
    'w:tblPrChange',
    'w:trPrChange',
    'w:tcPrChange',
    'w:sectPrChange',
    'w:numberingChange',
    'w:cellIns',
    'w:cellDel',
    'w:cellMerge',
    'w:moveFromRangeStart',
    'w:moveFromRangeEnd',
    'w:moveToRangeStart',
    'w:moveToRangeEnd',
    'w:commentRangeStart',
    'w:commentRangeEnd',
    'w:commentReference',
  ]) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'g'), '');
    out = out.replace(new RegExp(`<${tag}\\b[^>]*/>`, 'g'), '');
  }

  return out;
}

/** Every story part that can carry revision markup, not just the body. */
function reviewBearingParts(zip) {
  return Object.keys(zip.files).filter(
    (name) =>
      /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(name) && !COMMENT_PARTS.includes(name),
  );
}

/** Escape a literal string for safe interpolation into a RegExp. */
function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Drop a relationship pointing at a removed part, by target file name. */
function removeRelationships(xml, removedTargets) {
  let out = xml;
  for (const target of removedTargets) {
    const file = escapeForRegExp(target.replace(/^word\//, ''));
    out = out.replace(new RegExp(`<Relationship\\b[^>]*Target="\\.?/?${file}"[^>]*/>`, 'g'), '');
  }
  return out;
}

/** Drop the content-type override for a removed part. */
function removeContentTypeOverrides(xml, removedTargets) {
  let out = xml;
  for (const target of removedTargets) {
    out = out.replace(new RegExp(`<Override\\b[^>]*PartName="/${escapeForRegExp(target)}"[^>]*/>`, 'g'), '');
  }
  return out;
}

async function main() {
  const zip = await JSZip.loadAsync(await readFile(SOURCE));

  // Strip revision markup from every story part, not just the body: headers,
  // footers, and notes can carry it too.
  for (const part of reviewBearingParts(zip)) {
    const xml = await zip.file(part).async('string');
    zip.file(part, stripRevisionsAndComments(xml));
  }

  // Then remove the parts that exist only to hold comment bodies and reviewer
  // identities, plus the custom XML data store, along with the package metadata
  // that references them.
  const removed = STRIPPED_PARTS.filter((part) => zip.file(part));
  for (const part of removed) zip.remove(part);

  if (removed.length > 0) {
    const rels = 'word/_rels/document.xml.rels';
    if (zip.file(rels)) {
      zip.file(rels, removeRelationships(await zip.file(rels).async('string'), removed));
    }
    const contentTypes = '[Content_Types].xml';
    if (zip.file(contentTypes)) {
      zip.file(contentTypes, removeContentTypeOverrides(await zip.file(contentTypes).async('string'), removed));
    }
  }

  zip.file('docProps/core.xml', SANITIZED_CORE_PROPERTIES);

  const app = await zip.file('docProps/app.xml').async('string');
  zip.file('docProps/app.xml', sanitizeAppProperties(app));

  // Pin every entry's timestamp. `generateAsync({ date })` only applies to
  // entries that lack one, so without this the rebuilt fixture differs
  // byte-for-byte on each run and churns in git.
  const FIXED_DATE = new Date('2025-01-15T00:00:00Z');
  for (const entry of Object.values(zip.files)) {
    entry.date = FIXED_DATE;
  }

  const bytes = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    date: FIXED_DATE,
  });
  await writeFile(OUT, bytes);

  console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${bytes.length} bytes)`);
}

await main();
