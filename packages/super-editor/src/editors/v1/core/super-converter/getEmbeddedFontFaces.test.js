import { describe, it, expect, vi } from 'vitest';
import { SuperConverter } from './SuperConverter.js';

/**
 * Build a minimal valid SFNT with a single OS/2 table at a known offset, so the converter's
 * extraction + OS/2 face classification can be tested without a real font fixture. Mirrors the layout
 * the OS/2 parser expects: 12-byte offset table + one 16-byte directory record ("OS/2") + the table.
 */
function makeSfnt({ usWeightClass, fsType, fsSelection }) {
  const os2Offset = 28; // 12 (offset table) + 16 (one directory record)
  const os2Length = 64; // through fsSelection @62-63
  const buf = new ArrayBuffer(os2Offset + os2Length);
  const dv = new DataView(buf);
  dv.setUint32(0, 0x00010000); // sfnt version (TrueType)
  dv.setUint16(4, 1); // numTables
  for (let i = 0; i < 4; i += 1) dv.setUint8(12 + i, 'OS/2'.charCodeAt(i));
  dv.setUint32(16, 0); // checksum
  dv.setUint32(20, os2Offset); // table offset
  dv.setUint32(24, os2Length); // table length
  dv.setUint16(os2Offset + 4, usWeightClass);
  dv.setUint16(os2Offset + 8, fsType);
  dv.setUint16(os2Offset + 62, fsSelection);
  return buf;
}

const GUID = '{12345678-1234-1234-1234-123456789ABC}';

/**
 * Obfuscate a font the way Word does, so the converter must deobfuscate it. The DOCX obfuscation XORs
 * the first 32 bytes with the reversed GUID byte pattern - the SAME operation as deobfuscation (XOR is
 * symmetric), so this is `deobfuscateFont` run forwards. Returns a Uint8Array (the shape unzip yields).
 */
function obfuscate(cleanBuffer, guidHex = GUID) {
  const dta = new Uint8Array(cleanBuffer.slice(0));
  const guidStr = guidHex.replace(/[-{}]/g, '');
  const guidBytes = new Uint8Array(16);
  for (let i = 0, j = 0; i < 32; i += 2, j += 1) guidBytes[j] = parseInt(guidStr[i] + guidStr[i + 1], 16);
  for (let i = 0; i < 32; i += 1) dta[i] ^= guidBytes[15 - (i % 16)];
  return dta;
}

/** w:font entry with embedded faces (w:embed* children carrying r:id + w:fontKey). */
function fontEntry(name, embeds) {
  return {
    type: 'element',
    name: 'w:font',
    attributes: { 'w:name': name },
    elements: embeds.map(([embedName, rId]) => ({
      type: 'element',
      name: embedName,
      attributes: { 'r:id': rId, 'w:fontKey': GUID },
    })),
  };
}

function makeConverter() {
  const converter = new SuperConverter();
  converter.convertedXml['word/fontTable.xml'] = {
    elements: [
      {
        type: 'element',
        name: 'w:fonts',
        elements: [
          fontEntry('Calibri', [
            ['w:embedRegular', 'rId1'],
            ['w:embedBold', 'rId2'],
          ]),
          // OS/2 (700/italic) must WIN over the "Regular" embed name.
          fontEntry('Aptos', [['w:embedRegular', 'rId3']]),
          // Restricted-License (fsType bit 1): extracted but flagged not embeddable.
          fontEntry('SecretFont', [['w:embedRegular', 'rId4']]),
          // Unreadable bytes (not an SFNT): null OS/2 policy -> fallback face from the embed NAME,
          // and conservatively not embeddable.
          fontEntry('CorruptFont', [['w:embedBold', 'rId5']]),
          // A font referenced by an embed whose relationship is missing -> skipped (no Target).
          fontEntry('GhostFont', [['w:embedRegular', 'rId99']]),
          // A non-embedded entry (no r:id/w:fontKey child) -> ignored entirely.
          {
            type: 'element',
            name: 'w:font',
            attributes: { 'w:name': 'Arial' },
            elements: [{ type: 'element', name: 'w:altName', attributes: { 'w:val': 'Arial' } }],
          },
        ],
      },
    ],
  };
  converter.convertedXml['word/_rels/fontTable.xml.rels'] = {
    elements: [
      {
        type: 'element',
        name: 'Relationships',
        elements: [
          { type: 'element', name: 'Relationship', attributes: { Id: 'rId1', Target: 'fonts/font1.odttf' } },
          { type: 'element', name: 'Relationship', attributes: { Id: 'rId2', Target: 'fonts/font2.odttf' } },
          { type: 'element', name: 'Relationship', attributes: { Id: 'rId3', Target: 'fonts/font3.odttf' } },
          { type: 'element', name: 'Relationship', attributes: { Id: 'rId4', Target: 'fonts/font4.odttf' } },
          { type: 'element', name: 'Relationship', attributes: { Id: 'rId5', Target: 'fonts/font5.odttf' } },
          // rId99 intentionally absent.
        ],
      },
    ],
  };
  converter.fonts = {
    'word/fonts/font1.odttf': obfuscate(makeSfnt({ usWeightClass: 400, fsType: 0, fsSelection: 0 })),
    'word/fonts/font2.odttf': obfuscate(makeSfnt({ usWeightClass: 700, fsType: 0, fsSelection: 0 })),
    'word/fonts/font3.odttf': obfuscate(makeSfnt({ usWeightClass: 700, fsType: 0, fsSelection: 0x01 })),
    'word/fonts/font4.odttf': obfuscate(makeSfnt({ usWeightClass: 400, fsType: 0x0002, fsSelection: 0 })),
    'word/fonts/font5.odttf': new Uint8Array([1, 2, 3, 4]), // too short to be an SFNT
  };
  return converter;
}

describe('SuperConverter.getEmbeddedFontFaces', () => {
  it('extracts + deobfuscates embedded faces with OS/2-derived weight/style and embeddability', () => {
    const faces = makeConverter().getEmbeddedFontFaces();

    // Drop the binary source for the structural comparison; assert it separately below.
    const summary = faces.map(({ source: _source, ...rest }) => rest);
    expect(summary).toEqual([
      { family: 'Calibri', weight: '400', style: 'normal', fsType: 0, embeddable: true, relationshipId: 'rId1' },
      { family: 'Calibri', weight: '700', style: 'normal', fsType: 0, embeddable: true, relationshipId: 'rId2' },
      // OS/2 (700/italic) overrides the "Regular" embed name.
      { family: 'Aptos', weight: '700', style: 'italic', fsType: 0, embeddable: true, relationshipId: 'rId3' },
      // Restricted-License: extracted, fsType preserved, not embeddable.
      {
        family: 'SecretFont',
        weight: '400',
        style: 'normal',
        fsType: 0x0002,
        embeddable: false,
        relationshipId: 'rId4',
      },
      // Unreadable OS/2: face from the embed name (Bold -> 700), fsType null, not embeddable.
      {
        family: 'CorruptFont',
        weight: '700',
        style: 'normal',
        fsType: null,
        embeddable: false,
        relationshipId: 'rId5',
      },
      // GhostFont (missing relationship) and Arial (no embed) are absent.
    ]);
  });

  it('returns the deobfuscated SFNT bytes as a fresh ArrayBuffer (round-trips the obfuscation)', () => {
    const faces = makeConverter().getEmbeddedFontFaces();
    const calibri = faces.find((f) => f.relationshipId === 'rId1');

    expect(calibri.source).toBeInstanceOf(ArrayBuffer);
    expect(calibri.source.byteLength).toBe(92);
    // Deobfuscation restored the SFNT version word (0x00010000) the obfuscation had scrambled.
    expect(new DataView(calibri.source).getUint32(0)).toBe(0x00010000);
  });

  it('does not mutate the pooled converter font bytes (deobfuscation works on a copy)', () => {
    const converter = makeConverter();
    const before = Array.from(converter.fonts['word/fonts/font1.odttf'].slice(0, 4));
    converter.getEmbeddedFontFaces();
    const after = Array.from(converter.fonts['word/fonts/font1.odttf'].slice(0, 4));
    expect(after).toEqual(before); // stored obfuscated bytes untouched
  });

  it('legacy CSS extraction does not corrupt bytes before registry extraction', () => {
    const converter = makeConverter();
    const before = Array.from(converter.fonts['word/fonts/font1.odttf']);
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-font');
    try {
      const legacy = converter.getFontFaceImportString();
      expect(legacy.fontsImported).toContain('Calibri');
    } finally {
      if (originalCreateObjectURL) URL.createObjectURL = originalCreateObjectURL;
      else delete URL.createObjectURL;
    }

    expect(Array.from(converter.fonts['word/fonts/font1.odttf'])).toEqual(before);
    const faces = converter.getEmbeddedFontFaces();
    const calibri = faces.find((f) => f.relationshipId === 'rId1');
    expect(new DataView(calibri.source).getUint32(0)).toBe(0x00010000);
  });

  it('legacy @font-face injection honors the embedding policy (restricted + unreadable excluded)', () => {
    const converter = makeConverter();
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-font');
    try {
      const legacy = converter.getFontFaceImportString();
      // Embeddable fonts still get an @font-face.
      expect(legacy.fontsImported).toEqual(expect.arrayContaining(['Calibri', 'Aptos']));
      expect(legacy.styleString).toContain('Calibri');
      // Restricted (fsType bit 1) and unreadable (null OS/2 policy) must NOT be injected - the same gate
      // getEmbeddedFontFaces applies, so the legacy path can't leak restricted bytes under the family.
      expect(legacy.fontsImported).not.toContain('SecretFont');
      expect(legacy.fontsImported).not.toContain('CorruptFont');
      expect(legacy.styleString).not.toContain('SecretFont');
      expect(legacy.styleString).not.toContain('CorruptFont');
    } finally {
      if (originalCreateObjectURL) URL.createObjectURL = originalCreateObjectURL;
      else delete URL.createObjectURL;
    }
  });

  it('returns [] when there is no font table or no embedded binaries', () => {
    const empty = new SuperConverter();
    expect(empty.getEmbeddedFontFaces()).toEqual([]);

    const noBinaries = makeConverter();
    noBinaries.fonts = {};
    expect(noBinaries.getEmbeddedFontFaces()).toEqual([]);
  });
});
