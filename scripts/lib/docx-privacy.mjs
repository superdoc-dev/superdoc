/**
 * Shared DOCX privacy inspection.
 *
 * Reads the identity-bearing parts of a .docx without a ZIP dependency: a
 * DOCX is an ordinary ZIP, and Node's zlib can inflate its entries, so the
 * gate stays runnable from a clean checkout with no install step.
 *
 * Used by scripts/check-docx-privacy.mjs (report) and scripts/sanitize-docx.mjs
 * (rewrite).
 */

import { deflateRawSync, inflateRawSync } from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const STORED = 0;
const DEFLATED = 8;

/**
 * Parse a ZIP central directory into `{ name -> Buffer }`.
 *
 * Only STORED and DEFLATED entries are supported; those are the only methods
 * Word and every DOCX writer we care about emit. Anything else throws rather
 * than being skipped, so a part the gate cannot read is never mistaken for a
 * part that is not there.
 *
 * @param {Buffer} buffer
 * @returns {Map<string, Buffer>}
 */
/**
 * An XML part as text, honouring its byte-order mark.
 *
 * Word writes UTF-8, but a part saved as UTF-16 decodes to NUL-separated
 * letters under a UTF-8 read, and every metadata regex then matches nothing.
 *
 * @param {Buffer} raw
 * @returns {string}
 */
export function decodeXmlPart(raw) {
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) return raw.subarray(2).toString('utf16le');
  if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) {
    const body = raw.subarray(2);
    // swap16 needs an even length, and a truncated part need not have one.
    const even = body.length % 2 === 0 ? body : body.subarray(0, body.length - 1);
    return Buffer.from(even).swap16().toString('utf16le');
  }
  // A BOM is not required. XML's own encoding autodetection reads the first
  // character instead, which must be `<`: a UTF-16LE part begins `3C 00` and a
  // UTF-16BE part `00 3C`. Falling straight through to UTF-8 turns such a part
  // into NUL-separated letters, and every metadata pattern in this module then
  // matches nothing — the part reads as empty rather than as unreadable, so an
  // author survives in the archive while the gate reports the fixture clean.
  if (raw.length >= 4 && raw[0] === 0x3c && raw[1] === 0x00 && raw[3] === 0x00) {
    const even = raw.length % 2 === 0 ? raw : raw.subarray(0, raw.length - 1);
    return even.toString('utf16le');
  }
  if (raw.length >= 4 && raw[0] === 0x00 && raw[1] === 0x3c && raw[2] === 0x00) {
    const even = raw.length % 2 === 0 ? raw : raw.subarray(0, raw.length - 1);
    return Buffer.from(even).swap16().toString('utf16le');
  }
  return raw.toString('utf8');
}

/**
 * Serialize XML back into a part, keeping the declaration true of the bytes.
 *
 * Everything here writes UTF-8, including parts that arrived as UTF-16 and were
 * decoded by `decodeXmlPart`. Writing UTF-8 bytes under an inherited
 * `encoding="UTF-16"` declaration produces a part that this gate reads back
 * fine — it sniffs the BOM — and that Word and any conforming XML parser
 * misdecode or reject. The declaration is the only thing a downstream reader
 * has to go on, so it has to name the encoding actually used.
 *
 * @param {string} text
 * @returns {Buffer}
 */
export function encodeXmlPart(text) {
  const normalized = text.replace(
    /^(\uFEFF?\s*<\?xml\b[^?>]*?\bencoding\s*=\s*)(["'])[^"']*\2/i,
    (whole, head, quote) => `${head}${quote}UTF-8${quote}`,
  );
  return Buffer.from(normalized, 'utf8');
}

export function readZipEntries(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) {
    throw new Error('Not a ZIP archive (no end-of-central-directory record).');
  }
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    // Throw rather than break. Returning the entries parsed so far would make a
    // truncated or malformed archive look like one that simply lacks the part
    // holding an author, so the gate would report it clean: a fail-open on
    // exactly the input most likely to be hiding something.
    if (offset + 46 > buffer.length) {
      throw new Error(`central directory entry ${index} runs past the end of the archive`);
    }
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error(`central directory entry ${index} has no central-directory signature`);
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    // The local header repeats the name/extra lengths, and its extra field can
    // differ in length from the central one, so read them from the local record.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    if (entries.has(name)) {
      // A later member silently replaces an earlier one, so a real core.xml
      // followed by a clean copy inspects as clean while the archive still
      // publishes both. Word never writes duplicates; refuse the archive.
      throw new Error(`Duplicate archive entry: ${name}.`);
    }
    if (method === STORED) {
      entries.set(name, Buffer.from(raw));
    } else if (method === DEFLATED) {
      entries.set(name, inflateRawSync(raw));
    } else {
      // Dropping the entry would make an uninspectable part look like an absent
      // one, and the gate would call the fixture clean. Refuse the archive.
      throw new Error(`Unsupported compression method ${method} for ${name}.`);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }
  // A directory that advertises more members than it yields is malformed in a
  // way the loop above may not have caught. Refuse it rather than inspecting a
  // subset and calling the result clean.
  if (entries.size !== entryCount) {
    throw new Error(`central directory advertises ${entryCount} entries but yielded ${entries.size}`);
  }

  return entries;
}

/**
 * Whether `entryCount` central-directory headers starting at `offset` occupy
 * exactly `size` bytes.
 *
 * Walking the headers is the only way to tie a declared count to the directory
 * it claims to describe. Comparing the two catches a record that under-declares
 * its count to hide trailing entries.
 */
function describesWholeDirectory(buffer, offset, size, entryCount) {
  let cursor = offset;
  for (let seen = 0; seen < entryCount; seen += 1) {
    if (cursor + 46 > buffer.length) return false;
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) return false;
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return cursor - offset === size;
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 66 * 1024);
  for (let index = buffer.length - 22; index >= minimum; index -= 1) {
    if (buffer.readUInt32LE(index) !== EOCD_SIGNATURE) continue;

    // A ZIP comment is arbitrary bytes, so it can contain an EOCD signature of
    // its own. Scanning backward for the first signature therefore lets an
    // archive nominate a forged zero-entry record as its directory, and every
    // part goes uninspected while the gate reports the file clean.
    //
    // The real record is the one whose declared comment ends exactly at the end
    // of the archive. Check that rather than trusting the signature.
    const commentLength = buffer.readUInt16LE(index + 20);
    if (index + 22 + commentLength !== buffer.length) continue;

    // The comment check alone is not enough: an appended forgery also ends at
    // the end of the archive, and the backward scan reaches it first. So verify
    // the record actually describes a directory, by checking that the offset it
    // gives lands on a central-directory signature. A zero-entry forgery
    // pointing at offset 0 fails here, and the real record behind it wins.
    const entryCount = buffer.readUInt16LE(index + 10);
    const directorySize = buffer.readUInt32LE(index + 12);
    const directoryOffset = buffer.readUInt32LE(index + 16);
    if (entryCount === 0) continue;
    if (directoryOffset + 4 > buffer.length) continue;
    if (buffer.readUInt32LE(directoryOffset) !== CENTRAL_SIGNATURE) continue;

    // Pointing at a real directory is still not enough. A forgery can reuse the
    // genuine offset and size while under-declaring the count, and the reader
    // then stops early: the parts it never reaches look absent, so an identity
    // in a later entry goes unreported and the gate calls the file clean.
    //
    // So walk exactly `entryCount` headers and require them to consume exactly
    // `directorySize` bytes. An under-declared count leaves bytes over and a
    // over-declared one runs past, either way failing this record and letting
    // the genuine one behind it win.
    if (!describesWholeDirectory(buffer, directoryOffset, directorySize, entryCount)) continue;

    // The directory must also end exactly where this record begins. Without
    // that, a forgery can declare one entry and the size of just that entry:
    // internally consistent, pointing at a real directory, and still stopping
    // the reader before the entry that holds the identity. Anchoring the end to
    // the record leaves no room to under-declare.
    if (directoryOffset + directorySize !== index) continue;

    return index;
  }
  return -1;
}

/**
 * Serialize entries back into a ZIP archive.
 *
 * Everything is DEFLATE-compressed with a zeroed timestamp so sanitizing the
 * same fixture twice produces byte-identical output. That keeps fixture diffs
 * reviewable and avoids gratuitous churn in git history.
 *
 * @param {Map<string, Buffer>} entries
 * @returns {Buffer}
 */
export function writeZipEntries(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(content, { level: 9 });
    const crc = crc32(content);

    const local = Buffer.alloc(30 + nameBuffer.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(DEFLATED, 8);
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x0021, 12); // mod date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    nameBuffer.copy(local, 30);
    locals.push(local, compressed);

    const central = Buffer.alloc(46 + nameBuffer.length);
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(DEFLATED, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    nameBuffer.copy(central, 46);
    centrals.push(central);

    offset += local.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.size, 8);
  eocd.writeUInt16LE(entries.size, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuffer, eocd]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[index]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

/**
 * Hostnames that only ever carry format/vocabulary schemas. A URL under one of
 * these says nothing about where a document came from, so it is not taxonomy.
 */
const STANDARDS_NAMESPACE_HOSTS = [
  'schemas.microsoft.com',
  'schemas.openxmlformats.org',
  'purl.org',
  'www.w3.org',
  'w3.org',
  'dublincore.org',
  // RFC 2606 reserved names: guaranteed never to belong to a real organization.
  'example.com',
  'example.org',
  'example.net',
];

/** Word's own default content types, which identify no organization. */
const GENERIC_CONTENT_TYPE_NAMES = new Set(['document', 'doc', 'item', '']);

/**
 * Is this content type one of SharePoint's own generic names?
 *
 * Exported so the sanitizer classifies with the same function. The two used to
 * decide differently — the gate trimmed and compared case-sensitively, the
 * sanitizer did neither and matched case-insensitively — which broke in both
 * directions: `contentTypeName="document"` failed the gate and survived
 * sanitizing, while `contentTypeName="Document "` passed the gate and had its
 * customXml store deleted anyway.
 *
 * Trimmed and case-insensitive, the union of the two old behaviours. No
 * organization name is ever spelled `document`, so folding case costs the gate
 * nothing.
 *
 * @param {string} value
 * @returns {boolean}
 */
export const CONTENT_TYPE_NAME_PATTERN =
  /(?:^|\s)(?:[A-Za-z_][\w.-]*:)?contentTypeName\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** Start tags, so an attribute is read where an attribute can actually live. */
// Quoted runs are consumed whole, so a `>` inside an attribute value does not
// end the tag. `[^>]*` stopped early there and dropped every later attribute,
// including the author.
const START_TAG_PATTERN = /<[A-Za-z_](?:[^>"']|"[^"]*"|'[^']*')*>/g;

/**
 * Content-type names declared as attributes, in document order.
 *
 * Scoped to start tags because the raw text of an element or a comment can
 * contain the words `contentTypeName="Acme Matter"` while declaring nothing.
 * Reading those as taxonomy deleted a custom XML store that had no taxonomy.
 *
 * @param {string} xml
 * @returns {string[]}
 */
export function contentTypeNames(xml) {
  const values = [];
  START_TAG_PATTERN.lastIndex = 0;
  for (const tag of xml.matchAll(START_TAG_PATTERN)) {
    CONTENT_TYPE_NAME_PATTERN.lastIndex = 0;
    for (const match of tag[0].matchAll(CONTENT_TYPE_NAME_PATTERN)) {
      values.push(match[1] ?? match[2] ?? '');
    }
  }
  return values;
}

/**
 * XML element matchers, built once and shared by the gate and the sanitizer.
 *
 * Every spelling difference that is legal XML has cost this pair a round of
 * fixes: a namespace prefix, attributes on the tag, whitespace before the `>`,
 * an explicit end tag on an empty element. They are the same element each time,
 * and a matcher written by hand at each call site only covers the spellings
 * whoever wrote it happened to think of. These two builders are the one place
 * that knowledge lives, so a new spelling is handled everywhere at once.
 *
 * Deliberately still regex rather than a parser: this module has no
 * dependencies so the gate runs from a clean checkout with no install step.
 */
/**
 * A start-tag name with any namespace prefix. Exported so a matcher that needs
 * to read an attribute can still compose from the shared knowledge rather than
 * spelling the element out again and getting a different subset of XML right.
 *
 * @param {string} localName
 * @returns {string} regex source
 */
export const elementNameSource = (localName) => `(?:[A-Za-z_][\\w.-]*:)?${localName}`;

/**
 * An end tag with any prefix and optional whitespace before the `>`.
 *
 * @param {string} localName
 * @returns {string} regex source
 */
export const elementEndSource = (localName) => `</${elementNameSource(localName)}\\s*>`;

const ELEMENT_NAME = elementNameSource;
const ELEMENT_END = elementEndSource;

/**
 * `<name …>content</name>`, any prefix, any attributes, space before either `>`.
 * Groups: open tag, content, close tag.
 *
 * @param {string} localName
 * @param {string} flags
 * @returns {RegExp}
 */
/**
 * Attributes up to the end of a start tag, ignoring `>` inside a quoted value.
 *
 * `[^>]*` stops at the first `>` even when it sits inside an attribute, so an
 * element like `<Relationship ext:data=">" Target="https://client.example/"/>`
 * never matches and is neither inspected nor sanitized. That is a way past this
 * gate, so consume quoted runs and unquoted non-`>` characters explicitly.
 */
const ATTRIBUTES = String.raw`(?:"[^"]*"|'[^']*'|[^>"'])*`;

export function pairedElementPattern(localName, flags = 'gi') {
  return new RegExp(`(<${ELEMENT_NAME(localName)}${ATTRIBUTES}>)([\\s\\S]*?)(${ELEMENT_END(localName)})`, flags);
}

/**
 * An empty element in either spelling: `<name …/>` and `<name …></name>`.
 *
 * @param {string} localName
 * @param {string} flags
 * @returns {RegExp}
 */
export function emptyElementPattern(localName, flags = 'gi') {
  const open = `<${ELEMENT_NAME(localName)}${ATTRIBUTES}`;
  return new RegExp(`${open}/>|${open}>\\s*${ELEMENT_END(localName)}`, flags);
}

/**
 * SharePoint event receivers that name a deploying organization.
 *
 * Exported so the sanitizer finds receivers exactly where the inspector does.
 * The inspector always allowed attributes on the tag (`<Assembly type="...">`)
 * while the sanitizer matched only a bare `<Assembly>`, so an attributed
 * receiver produced a fixture the gate rejected and the cleanup would not
 * touch. Microsoft's and .NET's own handlers ship with SharePoint and name
 * nobody.
 *
 * @param {string} xml
 * @returns {Array<{tag: string, value: string}>}
 */
export function organizationReceivers(xml) {
  const found = [];
  // Only inside a `<Receivers>` block. `Assembly` and `Class` are ordinary
  // words: a custom store holding `<school><Class>Biology</Class></school>` is
  // not a SharePoint receiver, and treating it as one deleted the item and its
  // siblings. The containing element is what makes these names structural.
  const blocks = [...xml.matchAll(pairedElementPattern('Receivers'))].map((match) => match[2]);
  if (blocks.length === 0) return found;
  const scope = blocks.join('\n');
  for (const tag of ['Assembly', 'Class']) {
    for (const match of scope.matchAll(pairedElementPattern(tag))) {
      const value = match[2].trim();
      if (!value || /^(?:Microsoft|System)\./.test(value)) continue;
      found.push({ tag, value });
    }
  }
  return found;
}

export function isGenericContentTypeName(value) {
  return GENERIC_CONTENT_TYPE_NAMES.has(String(value).trim().toLowerCase());
}

/**
 * Word template names that name nobody.
 *
 * `Normal.dotm` is the default every Word install writes and carries no
 * information about who wrote the document. Anything else in `<Template>` is a
 * house style or a DMS path, which identifies the originating organization as
 * plainly as `<Company>` does — `T:\firmwide\HouseStyle.dotx` names a firm and
 * its network layout in one string.
 */
const GENERIC_TEMPLATE_NAMES = new Set(['', 'Normal', 'Normal.dotm', 'Normal.dotx']);

/**
 * Document-management stamps rendered into visible body text — the reference a
 * firm prints in a footer so a document can be traced back to its template or
 * matter. Two shapes, both structural rather than name-based:
 *
 *   ABC-OFFICE-03 VERSION 1.8a   uppercase dotted/hyphenated code + version
 *   DMS-21251548 - 1.0           a DMS/matter reference with a revision
 */
const DOCUMENT_STAMP_PATTERN =
  /\b[A-Z][A-Z0-9]{2,}(?:[-_][A-Z0-9]+){1,4}\s+(?:VERSION|VER|V)\s*[\d.]+[a-z]?\b|\b(?:DMS|NRPORTBL|IMANAGE|EDOCS)[-_ ]?\d{4,}\b/g;

/** The stamp scripts/sanitize-docx.mjs substitutes; it references nobody. */
const SYNTHETIC_STAMP = 'SUPERDOC-TEST VERSION 1.0a';

/** Bookkeeping properties editors write when saving; they name a tool, not a person. */
const TOOL_CUSTOM_PROPERTIES = new Set([
  'SuperdocVersion',
  'DocumentGuid',
  'Created',
  // 'Creator' is deliberately absent. In PDF-derived metadata it names a tool,
  // but as a DOCX custom property it routinely holds a person's name, and
  // skipping it hid exactly the identity this gate exists to catch.
  'Producer',
  'LastSaved',
  'AppVersion',
]);

/**
 * Property names that only exist because a document passed through a
 * document-management system (SharePoint, eDOCS, iManage, contract tooling).
 * The name alone identifies the originating system, so the value does not
 * matter.
 */
const DMS_PROPERTY_PATTERN =
  /^(_dlc_|ContentTypeId$|eDOCS|iManage|NRPortbl|ClientID$|MatterID$|db_contract|.*-Document-ID$)/i;

/**
 * Enumerate `<property name="..."><vt:*>value</vt:*></property>` pairs.
 *
 * @param {string} xml
 * @returns {Array<{name: string, value: string}>}
 */
/**
 * Should this custom property be reported as an identity?
 *
 * Exported so scripts/sanitize-docx.mjs removes exactly what the gate reports.
 * When the two disagree the gate flags a fixture the sanitizer cannot fix, and
 * the only remaining move is a hand-written exception.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isReportableCustomProperty(name) {
  return !TOOL_CUSTOM_PROPERTIES.has(name);
}

function customProperties(xml) {
  const results = [];
  // Both quote forms, as with author attributes: XML permits name='…' too.
  // Any namespace prefix: `<cp:property>` is as valid as `<property>`, and a
  // literal match lets prefixed DMS metadata past the gate entirely.
  const pattern = new RegExp(
    `<${elementNameSource('property')}\\b[^>]*\\bname\\s*=\\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\\s\\S]*?)${elementEndSource('property')}`,
    'gi',
  );
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    const value = match[3].replace(/<[^>]*>/g, '').trim();
    results.push({ name: (match[1] ?? match[2] ?? '').trim(), value });
  }
  return results;
}

/**
 * Is this URL a standards or reserved namespace rather than an organization's?
 *
 * Exported so the sanitizer decides with the same parser. A regex allowlist
 * with a negative lookahead answers a different question — it matches any host
 * that merely *starts* with an allowed name, so `schemas.microsoft.com.evil`
 * reads as allowed there and as an outside organization here. That split left
 * a fixture the gate rejects and the sanitizer refuses to touch.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isStandardsNamespace(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  // The host is only half of it. Userinfo on a standards URL is a credential
  // and a query or fragment is content somebody added; neither is part of the
  // namespace, so the allowlist must not launder them.
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return false;
  return STANDARDS_NAMESPACE_HOSTS.includes(parsed.hostname.toLowerCase());
}

/**
 * Blank out XML comments, preserving length so nothing else shifts.
 *
 * A commented element is not live metadata, but a regex over the raw part reads
 * it as though it were. Combined with returning only the first match, an
 * approved value inside a comment shadows a real identity after it:
 * `<!-- <dc:creator>SuperDoc</dc:creator> --><dc:creator>Jane Doe</dc:creator>`
 * reported only `SuperDoc`, so the gate passed while the document still
 * published `Jane Doe`.
 */
function stripXmlComments(xml) {
  return xml.replace(/<!--[\s\S]*?-->/g, (match) => ' '.repeat(match.length));
}

/**
 * Every value for a tag, ignoring commented markup.
 *
 * Plural on purpose. One element is the normal case, but a part may repeat a
 * tag, and taking only the first is how a later value goes uninspected.
 */
function textValuesOf(xml, tag) {
  // Match on the local name with any namespace prefix. A DOCX may bind Dublin
  // Core to `d:` instead of `dc:` and remain perfectly valid, and a gate keyed
  // to one spelling of the prefix reads such a file as having no author.
  const localName = escapeRegex(tag.includes(':') ? tag.split(':').pop() : tag);
  return [...stripXmlComments(xml).matchAll(pairedElementPattern(localName, 'gi'))]
    .map((match) => match[2].trim())
    .filter(Boolean);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function attributeValues(xml, attribute) {
  const values = [];
  // Both quote forms: XML permits `w:author='Jane Doe'` exactly as it permits
  // double quotes, and a gate that only reads one of them is a gate you get
  // past by pressing a different key.
  // Whitespace around the `=` is permitted by XML for the same reason, so
  // `w:author = "Jane Doe"` is the same attribute. Requiring the `=` to touch
  // the name made the spacing decide whether a reviewer's name was reported.
  // Read from start tags only, so the same text appearing in visible content is
  // not reported as a reviewer name — and, more importantly, so the gate and
  // the sanitizer agree about what is an attribute.
  const pattern = new RegExp(`${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'gi');
  START_TAG_PATTERN.lastIndex = 0;
  const tags = [...xml.matchAll(START_TAG_PATTERN)].map((tag) => tag[0]).join('\n');
  let match;
  while ((match = pattern.exec(tags)) !== null) {
    const value = (match[1] ?? match[2] ?? '').trim();
    if (value) values.push(value);
  }
  return values;
}

/** OLE compound-file magic. Encrypted .docx files use this container, not ZIP. */
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/**
 * True when the buffer is an encrypted (OLE compound file) document. Its
 * payload is ciphertext, so there is no readable metadata to inspect.
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function isEncryptedDocx(buffer) {
  return buffer.length >= OLE_MAGIC.length && buffer.subarray(0, OLE_MAGIC.length).equals(OLE_MAGIC);
}

const XML_NAMED_ENTITIES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
]);

/**
 * XML text as the character data it denotes.
 *
 * A parser resolves entities before anything reads the value, so
 * `ACME&#45;FILE` *is* `ACME-FILE` on the page and `https&#58;//host` is a URL.
 * Matching the raw spelling made the encoding the gate, the same way an escaped
 * JS string literal once did in the export scanner.
 *
 * @param {string} text
 * @returns {string}
 */
export function decodeXmlEntities(text) {
  // CDATA sections are literal character data wherever they appear, and a text
  // node may mix them with ordinary content or place several side by side —
  // `ACME<![CDATA[ VERSION 1.0a]]>` renders as one string. Each section's
  // payload is taken as-is and the text around it is decoded normally;
  // unwrapping only a whole-node section left the delimiters in the middle of
  // the value and the stamp unmatched.
  // Only when a section is actually closed. An unmatched `<![CDATA[` — inside a
  // comment, say — made the outside branch re-enter this function on the same
  // tail forever, which threw RangeError and took the whole scan with it.
  if (/<!\[CDATA\[[\s\S]*?\]\]>/.test(text)) {
    return text.replace(
      /<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]+?)(?=<!\[CDATA\[[\s\S]*?\]\]>|$)/g,
      (whole, inside, outside) => (inside !== undefined ? inside : decodeEntitiesOnly(outside ?? '')),
    );
  }
  return decodeEntitiesOnly(text);
}

/**
 * Entity references only, with no CDATA handling. Split out so the CDATA branch
 * above cannot recurse into itself.
 *
 * @param {string} text
 * @returns {string}
 */
function decodeEntitiesOnly(text) {
  if (!text.includes('&')) return text;
  return text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));/g, (whole, decimal, hex, named) => {
    if (decimal !== undefined || hex !== undefined) {
      const value = Number.parseInt(decimal ?? hex, decimal !== undefined ? 10 : 16);
      // Out of Unicode range is not a character; leave the source text alone
      // rather than decode it into something shorter than it really is.
      return Number.isFinite(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : whole;
    }
    return XML_NAMED_ENTITIES.get(named.toLowerCase()) ?? whole;
  });
}

/**
 * An attribute's value, decoded.
 *
 * Delimiters are located in the raw text and only the value between them is
 * decoded, because an XML reader resolves character references inside a value
 * rather than around it. Decoding first lets an encoded quote act as a
 * delimiter and silently truncate the value.
 *
 * @param {string} element raw start tag
 * @param {string} name attribute local name
 * @returns {string}
 */
export function attributeValueOf(element, name) {
  const match = new RegExp(`(?:^|\\s)(?:[A-Za-z_][\\w.-]*:)?${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(
    element,
  );
  return decodeXmlEntities(match?.[1] ?? match?.[2] ?? '');
}

/**
 * Character data as XML text.
 *
 * The inverse of `decodeXmlEntities`, for writing back text that was decoded
 * before it was matched. Only the characters that would otherwise change the
 * markup are escaped.
 *
 * @param {string} text
 * @returns {string}
 */
export function encodeXmlText(text) {
  return text.replace(/[&<>]/g, (character) => (character === '&' ? '&amp;' : character === '<' ? '&lt;' : '&gt;'));
}

/**
 * WordprocessingML elements that carry text a reader actually sees.
 *
 * `w:t` is ordinary run text and `w:delText` is text struck through by a
 * tracked deletion, which still renders in review view. `w:instrText` is
 * deliberately absent: it holds a field's *instruction*, not its result, so it
 * is not on the page. Rewriting it substituted the synthetic stamp into field
 * codes like `INCLUDETEXT "…"` and changed where the field pointed.
 *
 * Exported because the gate and the sanitizer have to read exactly the same
 * set. When they differed, one reported stamps the other would not clear and
 * the other rewrote text the gate never inspected.
 */
export const TEXT_ELEMENTS = ['t', 'delText'];

/** Parts whose text renders to a reader. Shared so the sanitizer agrees. */
export const VISIBLE_TEXT_PARTS =
  /^word\/(?:document\d*|header\d*|footer\d*|footnotes\d*|endnotes\d*|comments\d*|commentsExtended\d*|commentsIds\d*)\.xml$/i;

/**
 * The visible text of a part, as one concatenated run and as space-joined runs.
 *
 * Two readings because Word splits a single visible identifier across runs:
 * `MCL-OFFICE` + `-03 VERSION 1.8a` needs the concatenation, while a stamp
 * split across paragraphs needs the spaced form.
 *
 * @param {string} xml
 * @returns {{ joined: string, spaced: string }}
 */
export function visibleTextReadings(xml) {
  const nodes = TEXT_ELEMENTS.flatMap((localName) => [...xml.matchAll(pairedElementPattern(localName))])
    .sort((left, right) => left.index - right.index)
    .map((match) => decodeXmlEntities(match[2]));
  return { joined: nodes.join(''), spaced: nodes.join(' ') };
}

/**
 * External relationship targets reviewed and approved for publication.
 *
 * Judged separately from customXml taxonomy on purpose. A third-party URL
 * inside customXml signals where a document was managed, which is provenance.
 * A hyperlink in document content is ordinarily just content, so reusing the
 * taxonomy host rule here would conflate privacy with "contains an external
 * link" and would fail ordinary documents.
 *
 * Approved by exact target, not by hostname: an owned host still has to have
 * the path someone read. `https://superdoc.dev/` is approved; a customer-named
 * path on the same host is not.
 */
const APPROVED_RELATIONSHIP_TARGETS = new Set([
  'https://superdoc.dev/',
  'https://www.harbourshare.com/',
  // A public Green Lease Toolkit citation in a footnote. Public reference
  // material, not a customer. Note the scheme is http, as the fixture has it.
  'http://www.betterbuildingspartnership.co.uk/working-groups/green-leases/green-lease-toolkit/',
]);

/**
 * Public reference content approved by exact host and path shape.
 *
 * Encyclopedia articles only. Nothing else on the host is approved, so a
 * `Special:` page or a query-bearing URL still has to be read by someone.
 */
const APPROVED_RELATIONSHIP_PATTERNS = [/^https:\/\/en\.wikipedia\.org\/wiki\/[A-Za-z0-9_%(),.'-]+$/];

/** Hosts that name a machine rather than a public site. */
function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (!host.includes('.') && !host.includes(':')) return true;
  return (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === '0.0.0.0'
  );
}

/**
 * Why this external relationship target is not publishable, or null.
 *
 * Unreviewed is the default: anything not on the approved lists fails until
 * someone reads it. That is the only setting under which a new fixture cannot
 * quietly bring a customer URL along with it.
 *
 * @param {string} target
 * @returns {string|null}
 */
export function relationshipTargetProblem(target) {
  const raw = String(target ?? '').trim();
  if (!raw) return null;
  if (APPROVED_RELATIONSHIP_TARGETS.has(raw)) return null;
  if (APPROVED_RELATIONSHIP_PATTERNS.some((pattern) => pattern.test(raw))) return null;

  let url;
  try {
    url = new URL(raw);
  } catch {
    // A UNC path, a bare drive path, or anything else that is not a URL.
    return 'unparseable external target';
  }
  if (url.username || url.password) return 'credentials in an external target';
  const scheme = url.protocol.replace(':', '').toLowerCase();
  if (scheme === 'mailto') return 'email target';
  if (scheme === 'file') return 'file target';
  if (scheme !== 'http' && scheme !== 'https') return `${scheme} target`;
  if (isPrivateHost(url.hostname)) return 'private or local network target';
  if (url.search || url.hash) return 'external target carrying query or fragment';
  // RFC 2606 reserved names are guaranteed never to belong to a real
  // organization, which is why the sanitizer retargets to one. Approved last,
  // so a reserved host still cannot carry credentials, a private address or a
  // non-web scheme past the checks above.
  if (/^(?:[^.]+\.)*example\.(?:com|org|net)$/i.test(url.hostname)) return null;
  return 'unreviewed external target';
}

/**
 * Identity and taxonomy findings for one DOCX.
 *
 * @param {Buffer} buffer
 * @returns {{ identities: Array<{kind: string, value: string}>, taxonomy: string[], encrypted: boolean }}
 */
export function inspectDocx(buffer) {
  if (isEncryptedDocx(buffer)) {
    return { identities: [], taxonomy: [], bodyStamps: [], relationships: [], encrypted: true };
  }
  const entries = readZipEntries(buffer);
  const read = (name) => (entries.has(name) ? decodeXmlPart(entries.get(name)) : '');

  const identities = [];
  const push = (kind, value) => {
    if (value && String(value).trim()) identities.push({ kind, value: String(value).trim() });
  };

  /**
   * Inspect every occurrence of a tag, not just the first.
   *
   * A part can repeat a metadata element, and the gate suppresses approved
   * synthetic values such as `SuperDoc`. Reading only the first value therefore
   * let an approved one stand in front of a real identity and carry the whole
   * document past the check, with the real name still in the published file.
   */
  const pushAll = (kind, xml, tag) => {
    for (const value of textValuesOf(xml, tag)) push(kind, value);
  };

  const core = read('docProps/core.xml');
  pushAll('dc:creator', core, 'dc:creator');
  pushAll('cp:lastModifiedBy', core, 'cp:lastModifiedBy');
  pushAll('dc:title', core, 'dc:title');
  pushAll('dc:subject', core, 'dc:subject');
  pushAll('cp:keywords', core, 'cp:keywords');
  pushAll('dc:description', core, 'dc:description');

  const app = read('docProps/app.xml');
  pushAll('Company', app, 'Company');
  pushAll('Manager', app, 'Manager');
  // The base every relative hyperlink resolves against. Judged as an external
  // target rather than as a name, so the reviewed-target list decides.
  // Every occurrence, for the same reason as the identity fields above: a safe
  // first value would otherwise mask an unsafe second one.
  for (const hyperlinkBase of textValuesOf(app, 'HyperlinkBase')) {
    const problem = relationshipTargetProblem(hyperlinkBase);
    if (problem) push('HyperlinkBase', `${problem} ${hyperlinkBase}`);
  }
  // The template the document was created from. Nothing else in the pipeline
  // reads it, so it survives every property-level cleanup and ships as-is.
  for (const template of textValuesOf(app, 'Template')) {
    if (!GENERIC_TEMPLATE_NAMES.has(template.trim())) push('Template', template.trim());
  }

  const custom = read('docProps/custom.xml');
  if (custom.trim()) {
    for (const { name, value } of customProperties(custom)) {
      // SuperDoc and common editors write bookkeeping properties into every
      // document they save. Those name the tool, not a person or organization.
      if (TOOL_CUSTOM_PROPERTIES.has(name)) continue;
      // Document-management properties are the signal that a fixture came out
      // of somebody's DMS: the name alone identifies the system.
      if (DMS_PROPERTY_PATTERN.test(name)) {
        push('dms-property', value ? `${name}=${value}` : name);
        continue;
      }
      push('custom-property', value ? `${name}=${value}` : name);
    }
  }

  // Authors attached to collaborative artifacts, which survive independently of
  // the document properties.
  //
  // Every XML part under word/ is inspected rather than a named few. Tracked
  // changes and comments live wherever their content lives — headers, footers,
  // footnotes, endnotes, textboxes — so a list of "the parts that matter" is a
  // list of the parts somebody thought of. An author attribute is identity
  // regardless of which part carries it.
  for (const [name, content] of entries) {
    if (!/^word\/.*\.xml$/i.test(name)) continue;
    const xml = decodeXmlPart(content);
    // Any namespace prefix: a part may bind the Word namespace to something
    // other than `w`, and the attribute is still an author.
    for (const author of attributeValues(xml, '[A-Za-z0-9_.-]+:author')) push('w:author', author);
    // Initials identify a reviewer as surely as a name, and the sanitizer
    // already rewrites them. Reporting only the author would approve a fixture
    // whose author was hand-edited while the initials stayed real.
    for (const initials of attributeValues(xml, '[A-Za-z0-9_.-]+:initials')) push('w:initials', initials);
  }

  // SharePoint / DMS taxonomy identifies the originating organization even when
  // the document properties are clean.
  const taxonomy = [];
  for (const [name, content] of entries) {
    // itemProps parts belong to the same custom XML store and carry the same
    // schema/DMS taxonomy, so they are inspected alongside their item.
    if (!/^customXml\/item(?:Props)?\d*\.xml$/i.test(name)) continue;
    const xml = decodeXmlPart(content);
    // Both quote forms, as elsewhere in this module. Any namespace prefix too:
    // `ma` is only the prefix Word happens to write, and the same taxonomy bound
    // to another alias — or written unprefixed — names the organization just as
    // plainly. Keying on the literal `ma:` made the alias the gate.
    // Every contentTypeName, not just the first, for the same reason the event
    // receivers below are read whole: a part can carry a generic name ahead of
    // an organization's, and reading only the head sees the benign one.
    for (const contentTypeValue of contentTypeNames(xml)) {
      if (!isGenericContentTypeName(contentTypeValue)) {
        taxonomy.push(`${name}: contentTypeName="${contentTypeValue}"`);
      }
    }
    // SharePoint event receivers name the deploying organization in a .NET
    // assembly string rather than in a content type or a URL. Microsoft's own
    // handlers ship with SharePoint and name nobody.
    // Every receiver, not just the first. A list can hold a Microsoft handler
    // ahead of a third-party one, and reading only the head sees the benign one.
    for (const { tag, value } of organizationReceivers(xml)) {
      taxonomy.push(`${name}: <${tag}>${value.split(',')[0]}`);
    }
    // URI schemes are case-insensitive, so `HTTPS://` addresses the same host.
    // The sanitizer already matches without regard to case; a case-sensitive
    // detector left the two halves of the privacy policy disagreeing.
    const decodedXml = decodeXmlEntities(xml);
    for (const url of new Set(decodedXml.match(/https?:\/\/[^\s"'<>]+/gi) ?? [])) {
      if (isStandardsNamespace(url)) continue;
      taxonomy.push(`${name}: external URL ${url}`);
    }
  }

  // Visible body text. Document-management stamps live in footers and headers
  // as ordinary runs, so they survive every property-level cleanup and render
  // on the page. Matching every organization name is impossible; matching the
  // shape of a template/matter stamp is not.
  const bodyStamps = [];
  for (const [name, content] of entries) {
    // Footnotes and endnotes render to a reader exactly as headers and footers
    // do, so a stamp in one is just as visible and just as published.
    if (!VISIBLE_TEXT_PARTS.test(name)) continue;
    const xml = decodeXmlPart(content);
    // Two readings of the same part. Replacing tags with a space is right for
    // separate paragraphs but wrong inside one: Word splits a single visible
    // word across runs, so `MCL-OFFICE` + `-03 VERSION 1.8a` becomes
    // `MCL-OFFICE -03 VERSION 1.8a` and stops matching. Concatenating the
    // `<w:t>` nodes reconstructs what the page actually shows.
    // Both readings are built from the same text-bearing elements the sanitizer
    // rewrites. Stripping every tag instead read field instructions and other
    // non-rendered content as visible text, which reported stamps the cleanup
    // would not touch.
    const { joined, spaced } = visibleTextReadings(xml);

    const seenStamps = new Set();
    for (const text of [spaced, joined]) {
      for (const match of text.matchAll(DOCUMENT_STAMP_PATTERN)) {
        const stamp = match[0].trim();
        // The concatenated reading joins a stamp to whatever run follows it,
        // usually a page number. `…VERSION 1.0a` + `63` reads as `1.0a63`, and
        // the pattern then matches the truncated prefix `…VERSION 1.`. A
        // fragment of the approved synthetic stamp is not a finding.
        if (seenStamps.has(stamp)) continue;
        if (stamp === SYNTHETIC_STAMP || SYNTHETIC_STAMP.startsWith(stamp)) continue;
        seenStamps.add(stamp);
        bodyStamps.push(`${name}: ${stamp}`);
      }
    }
  }

  // Relationship targets. `.rels` parts are not customXml, so nothing above
  // ever looked at them, and an external hyperlink rode out of the tree inside
  // the compressed fixture.
  const relationships = [];
  for (const [name, content] of entries) {
    if (!/(?:^|\/)_rels\/[^/]+\.rels$/i.test(name)) continue;
    const xml = decodeXmlPart(content);
    for (const element of xml.matchAll(emptyElementPattern('Relationship'))) {
      // Attribute boundaries are found in the RAW element and only the value is
      // decoded. Decoding the whole element first turns an encoded quote into a
      // delimiter: `Target="https://superdoc.dev/&#34;customer"` truncated to
      // the approved `https://superdoc.dev/` and the rest of the URL was
      // published. An XML reader resolves the reference *inside* the value,
      // which is what this order reproduces.
      if (!attributeValueOf(element[0], 'TargetMode').match(/^External$/i)) continue;
      const value = attributeValueOf(element[0], 'Target');
      const problem = relationshipTargetProblem(value);
      if (problem) relationships.push(`${name}: ${problem} ${value}`);
    }
  }

  return { identities, taxonomy, bodyStamps, relationships, encrypted: false };
}
