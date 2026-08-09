// Fixtures ship in the public documentation site, so they must not carry
// human-identifying metadata, or review markup a reader could mistake for
// their own edit. These assertions are the contract that keeps that true.
// Word's own machine metadata is out of scope and documented in README.md.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import JSZip from 'jszip';

const FIXTURES = new URL('../public/fixtures/', import.meta.url);

async function openFixture(name) {
  const bytes = await readFile(new URL(name, FIXTURES));
  const zip = await JSZip.loadAsync(bytes);
  const read = async (entry) => (zip.file(entry) ? zip.file(entry).async('string') : '');
  return {
    bytes,
    zip,
    document: await read('word/document.xml'),
    core: await read('docProps/core.xml'),
    app: await read('docProps/app.xml'),
  };
}

/**
 * Author fields must be empty, not a placeholder. `tests/content.test.mjs`
 * owns that rule for every fixture; this asserts the specific upstream
 * identifiers that were present in the source document, so a regenerated
 * fixture can never reintroduce them.
 */
const FORBIDDEN_IDENTIFIERS = ['Andrii', 'Orlov', 'python-docx'];

test('the quickstart fixture carries no upstream author metadata', async () => {
  const { core, app } = await openFixture('sample-nda.docx');

  for (const identifier of FORBIDDEN_IDENTIFIERS) {
    assert.ok(!core.includes(identifier), `core.xml must not contain "${identifier}"`);
    assert.ok(!app.includes(identifier), `app.xml must not contain "${identifier}"`);
  }
});

/**
 * Every WordprocessingML element that carries review state. Kept as one list
 * so the gate cannot drift narrower than the generator that produces the
 * fixture: both must cover the same forms.
 */
const REVISION_ELEMENTS = [
  'w:ins',
  'w:del',
  'w:moveFrom',
  'w:moveTo',
  'w:moveFromRangeStart',
  'w:moveFromRangeEnd',
  'w:moveToRangeStart',
  'w:moveToRangeEnd',
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
  'w:commentRangeStart',
  'w:commentRangeEnd',
  'w:commentReference',
];

test('the quickstart fixture has no tracked changes or comments in any part', async () => {
  const { zip } = await openFixture('sample-nda.docx');

  // Scan every Word XML part, not just the body: a header, footer, or note
  // could otherwise carry review markup past this gate.
  const wordParts = Object.keys(zip.files).filter((name) => name.startsWith('word/') && name.endsWith('.xml'));
  assert.ok(wordParts.length > 0, 'expected the package to contain Word XML parts');

  for (const part of wordParts) {
    const xml = await zip.file(part).async('string');
    for (const element of REVISION_ELEMENTS) {
      assert.ok(!new RegExp(`<${element}\\b`).test(xml), `${part} must not contain <${element}>`);
    }
  }

  // Comment bodies and reviewer identities live in dedicated parts, so their
  // absence is a separate guarantee from the markup scan above.
  for (const part of [
    'word/comments.xml',
    'word/commentsExtended.xml',
    'word/commentsIds.xml',
    'word/commentsExtensible.xml',
    'word/people.xml',
  ]) {
    assert.equal(zip.file(part), null, `must not ship ${part}`);
  }
});

/**
 * Name of the first entry in the archive, read from the ZIP bytes rather than
 * from a library's file map. Word expects `[Content_Types].xml` to come first
 * physically, and an in-memory map's iteration order is not a guarantee of
 * that, however closely the two happen to agree today.
 */
function firstArchiveEntry(bytes) {
  const LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const offset = bytes.indexOf(LOCAL_HEADER);

  assert.notEqual(offset, -1, 'expected a ZIP local file header');

  const nameLength = bytes.readUInt16LE(offset + 26);
  return bytes.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
}

test('the quickstart fixture is a valid DOCX package with real content', async () => {
  const { zip, document, bytes } = await openFixture('sample-nda.docx');

  // OPC requires the content-type map, and Word expects it first in the archive.
  assert.equal(firstArchiveEntry(bytes), '[Content_Types].xml');
  assert.ok(zip.file('word/document.xml'), 'must contain a main document part');

  // Structure the quickstart relies on to demonstrate DOCX fidelity:
  // real Word styles rather than inline formatting.
  assert.match(document, /NON-DISCLOSURE AGREEMENT/);
  assert.ok(/w:val="Heading1"/.test(document), 'must use a Heading 1 style');
  assert.ok(/w:val="Heading2"/.test(document), 'must use a Heading 2 style');
  assert.ok(/w:val="ListBullet"/.test(document), 'must contain a bulleted list');
});

test('the tracked-changes fixture keeps its tracked change', async () => {
  // The review documentation depends on this fixture having a suggestion.
  // Guard it so fixture cleanup never silently empties the review guide.
  const { document } = await openFixture('tracked-changes.docx');
  assert.ok(/<w:ins\b/.test(document), 'tracked-changes.docx must retain its tracked insertion');
});

/**
 * The custom UI overview's fixture exists to be short. If it grows into another
 * contract, the page's one instruction — select a sentence, press Bold — ends up
 * below the fold, which is the problem it was made to solve.
 */
test('the formatting fixture stays short, clean, and free of review markup', async () => {
  const { bytes, document } = await openFixture('formatting-sample.docx');

  // Assert on visible text, not bytes. DEFLATE compresses repetition away, so
  // 4,800 characters of padding moved the packaged size by 39 bytes — a size
  // ceiling would have let this document grow to any length a reader has to
  // scroll through.
  const visibleText = [...document.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/g)].map((match) => match[1]).join(' ');
  assert.ok(visibleText.length < 500, `formatting-sample.docx must stay short, got ${visibleText.length} characters`);
  assert.ok(bytes.length < 8_000, `must stay a small package, got ${bytes.length} bytes`);

  const paragraphs = document.match(/<w:p>/g) ?? [];
  assert.ok(paragraphs.length <= 5, `must stay a handful of paragraphs, got ${paragraphs.length}`);

  for (const element of ['w:ins', 'w:del', 'w:commentReference']) {
    assert.ok(!new RegExp(`<${element}\\b`).test(document), `must not contain <${element}>`);
  }

  // The sentence the page tells the reader to select has to actually be there.
  assert.match(document, /Select this sentence and press the Bold button above\./);
});
