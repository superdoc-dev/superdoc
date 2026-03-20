import { describe, it, expect } from 'vitest';
import { isXmlLike, hex, sniffEncoding, stripBOM, ensureXmlString } from './encoding-helpers.js';

function utf16leWithBOM(str) {
  const bom = Buffer.from([0xff, 0xfe]);
  const body = Buffer.from(str, 'utf16le');
  return Buffer.concat([bom, body]);
}

function utf16beWithBOM(str) {
  const le = Buffer.from(str, 'utf16le');
  const swapped = Buffer.alloc(le.length);
  for (let i = 0; i < le.length; i += 2) {
    swapped[i] = le[i + 1];
    swapped[i + 1] = le[i];
  }
  const bom = Buffer.from([0xfe, 0xff]);
  return Buffer.concat([bom, swapped]);
}

function noBOMUtf16leBytes(str) {
  // UTF-16LE WITHOUT a BOM (to trigger the NUL-heuristic)
  return Buffer.from(str, 'utf16le');
}

describe('isXmlLike', () => {
  it('matches .xml and .rels', () => {
    expect(isXmlLike('word/document.xml')).toBe(true);
    expect(isXmlLike('word/_rels/document.xml.rels')).toBe(true);
    expect(isXmlLike('docProps/core.xml')).toBe(true);
  });
  it('rejects non-xml', () => {
    expect(isXmlLike('word/media/image1.png')).toBe(false);
    expect(isXmlLike('customXml/item1.xml.bin')).toBe(false);
    expect(isXmlLike('word/fonts/font1.odttf')).toBe(false);
  });
});

describe('hex', () => {
  it('renders hex dump of first N bytes', () => {
    const u8 = new Uint8Array([0xff, 0xfe, 0x3c, 0x00, 0x3f, 0x00]);
    expect(hex(u8, 6)).toBe('ff fe 3c 00 3f 00');
  });
});

describe('sniffEncoding', () => {
  it('detects UTF-16LE by BOM', () => {
    const u8 = utf16leWithBOM('<?xml version="1.0"?>');
    expect(sniffEncoding(u8)).toBe('utf-16le');
  });
  it('detects UTF-16BE by BOM', () => {
    const u8 = utf16beWithBOM('<?xml version="1.0"?>');
    expect(sniffEncoding(u8)).toBe('utf-16be');
  });
  it('defaults to utf-8 for plain ASCII/UTF-8', () => {
    const u8 = new TextEncoder().encode('<?xml version="1.0"?><a/>');
    expect(sniffEncoding(u8)).toBe('utf-8');
  });
  it('heuristically detects UTF-16 (no BOM) via NUL density', () => {
    const u8 = noBOMUtf16leBytes('<?xml version="1.0"?><root/>');
    // Our heuristic returns 'utf-16le' for lots of NULs
    expect(sniffEncoding(u8)).toBe('utf-16le');
  });
});

describe('stripBOM', () => {
  it('removes U+FEFF if present', () => {
    const s = '\uFEFF<?xml?><r/>';
    expect(stripBOM(s)).toBe('<?xml?><r/>');
  });
  it('no-ops when no BOM present', () => {
    const s = '<?xml?><r/>';
    expect(stripBOM(s)).toBe(s);
  });
});

describe('ensureXmlString', () => {
  it('returns same string when given a plain XML string', () => {
    const s = '<?xml version="1.0"?><r/>';
    expect(ensureXmlString(s)).toBe(s);
  });

  it('strips leading BOM from a decoded string', () => {
    const s = '\uFEFF<?xml version="1.0"?><r/>';
    expect(ensureXmlString(s)).toBe('<?xml version="1.0"?><r/>');
  });

  it('decodes UTF-8 bytes', () => {
    const u8 = new TextEncoder().encode('<?xml version="1.0"?><root>héllo</root>');
    const out = ensureXmlString(u8);
    expect(out).toContain('<?xml');
    expect(out).toContain('héllo');
  });

  it('decodes UTF-16LE with BOM bytes and rewrites encoding to UTF-8', () => {
    const u8 = utf16leWithBOM('<?xml version="1.0" encoding="utf-16"?><props><k>v</k></props>');
    const out = ensureXmlString(u8);
    expect(out).toContain('encoding="UTF-8"');
    expect(out).not.toContain('encoding="utf-16"');
    expect(out).toContain('<props>');
    expect(out).not.toMatch(/\u0000/);
  });

  it('decodes UTF-16BE with BOM bytes and rewrites encoding to UTF-8', () => {
    const u8 = utf16beWithBOM('<?xml version="1.0" encoding="utf-16"?><props><k>v</k></props>');
    const out = ensureXmlString(u8);
    expect(out).toContain('encoding="UTF-8"');
    expect(out).not.toContain('encoding="utf-16"');
    expect(out).toContain('<props>');
    expect(out).not.toMatch(/\u0000/);
  });

  it('does not rewrite encoding for UTF-8 input', () => {
    const u8 = new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><root/>');
    const out = ensureXmlString(u8);
    expect(out).toContain('encoding="UTF-8"');
  });

  it('decodes UTF-16 (no BOM) via heuristic', () => {
    const u8 = noBOMUtf16leBytes('<?xml version="1.0"?><root>NOBOM</root>');
    const out = ensureXmlString(u8);
    expect(out).toContain('<root>');
    expect(out).toContain('NOBOM');
    expect(out).not.toMatch(/\u0000/);
  });

  it('accepts ArrayBuffer input', () => {
    const u8 = new TextEncoder().encode('<?xml version="1.0"?><r/>');
    const out = ensureXmlString(u8.buffer);
    expect(out).toContain('<r/>');
  });

  it('throws on unsupported content types', () => {
    expect(() => ensureXmlString(12345)).toThrow(/Unsupported content type/);
  });

  it('decodes from Node Buffer (utf-8)', () => {
    const buf = Buffer.from('<?xml version="1.0"?><root/>', 'utf8');
    const out = ensureXmlString(buf);
    expect(out).toContain('<root/>');
  });
});

describe('ensureXmlString cross-env', () => {
  it('decodes from Node Buffer (utf-8)', () => {
    const buf = Buffer.from('<?xml version="1.0"?><root/>', 'utf8');
    const out = ensureXmlString(buf);
    expect(out).toContain('<root/>');
  });
});
