import { describe, it, expect } from 'vitest';
import { parseEmbeddingPolicy } from './os2';

/**
 * Build a minimal SFNT font with a single OS/2 table at a known offset, so the parser can be tested
 * deterministically without a real font fixture. Layout: 12-byte offset table + one 16-byte table
 * directory record (tag "OS/2") + the OS/2 table (only usWeightClass/fsType/fsSelection are set).
 */
function makeFont(opts: { usWeightClass: number; fsType: number; fsSelection: number; tag?: string }): ArrayBuffer {
  const tag = opts.tag ?? 'OS/2';
  const os2Offset = 28; // 12 (offset table) + 16 (one directory record)
  const os2Length = 64; // through fsSelection @62-63
  const buf = new ArrayBuffer(os2Offset + os2Length);
  const dv = new DataView(buf);
  dv.setUint32(0, 0x00010000); // sfnt version (TrueType)
  dv.setUint16(4, 1); // numTables
  for (let i = 0; i < 4; i += 1) dv.setUint8(12 + i, tag.charCodeAt(i));
  dv.setUint32(16, 0); // checksum
  dv.setUint32(20, os2Offset); // table offset
  dv.setUint32(24, os2Length); // table length
  dv.setUint16(os2Offset + 4, opts.usWeightClass);
  dv.setUint16(os2Offset + 8, opts.fsType);
  dv.setUint16(os2Offset + 62, opts.fsSelection);
  return buf;
}

describe('parseEmbeddingPolicy (OS/2)', () => {
  it('reads an installable Regular font: 400/normal, embeddable', () => {
    expect(parseEmbeddingPolicy(makeFont({ usWeightClass: 400, fsType: 0x0000, fsSelection: 0 }))).toEqual({
      fsType: 0x0000,
      face: { weight: '400', style: 'normal' },
      embeddable: true,
    });
  });

  it('reads Bold (usWeightClass 700) and SemiBold (600) as the 700 face; 500 stays 400', () => {
    expect(parseEmbeddingPolicy(makeFont({ usWeightClass: 700, fsType: 0, fsSelection: 0 }))?.face.weight).toBe('700');
    expect(parseEmbeddingPolicy(makeFont({ usWeightClass: 600, fsType: 0, fsSelection: 0 }))?.face.weight).toBe('700');
    expect(parseEmbeddingPolicy(makeFont({ usWeightClass: 500, fsType: 0, fsSelection: 0 }))?.face.weight).toBe('400');
  });

  it('reads the italic bit from fsSelection', () => {
    expect(parseEmbeddingPolicy(makeFont({ usWeightClass: 400, fsType: 0, fsSelection: 0x01 }))?.face.style).toBe(
      'italic',
    );
    expect(parseEmbeddingPolicy(makeFont({ usWeightClass: 700, fsType: 0, fsSelection: 0x01 }))?.face).toEqual({
      weight: '700',
      style: 'italic',
    });
  });

  it('marks a Restricted-License font (fsType bit 1) as NOT embeddable', () => {
    const policy = parseEmbeddingPolicy(makeFont({ usWeightClass: 400, fsType: 0x0002, fsSelection: 0 }));
    expect(policy?.embeddable).toBe(false);
    expect(policy?.fsType).toBe(0x0002);
  });

  it('treats Preview&Print and Editable as embeddable', () => {
    expect(parseEmbeddingPolicy(makeFont({ usWeightClass: 400, fsType: 0x0004, fsSelection: 0 }))?.embeddable).toBe(
      true,
    );
    expect(parseEmbeddingPolicy(makeFont({ usWeightClass: 400, fsType: 0x0008, fsSelection: 0 }))?.embeddable).toBe(
      true,
    );
  });

  it('returns null for non-SFNT / truncated bytes and for a font with no OS/2 table', () => {
    expect(parseEmbeddingPolicy(new ArrayBuffer(4))).toBeNull(); // too short
    expect(parseEmbeddingPolicy(makeFont({ usWeightClass: 400, fsType: 0, fsSelection: 0, tag: 'cmap' }))).toBeNull();
  });

  it('honors a typed-array view byteOffset (a subarray into a larger pooled buffer)', () => {
    const font = makeFont({ usWeightClass: 700, fsType: 0x0002, fsSelection: 0x01 });
    // Place the font at a non-zero offset inside a bigger buffer, then view it via subarray - the
    // shape a deobfuscated Node Buffer / Uint8Array.subarray() takes. Reading from buffer offset 0
    // would parse the leading padding, not the font.
    const padded = new Uint8Array(font.byteLength + 128);
    padded.set(new Uint8Array(font), 64);
    const view = padded.subarray(64, 64 + font.byteLength);
    expect(view.byteOffset).toBe(64);
    expect(parseEmbeddingPolicy(view)).toEqual({
      fsType: 0x0002,
      face: { weight: '700', style: 'italic' },
      embeddable: false,
    });
  });
});
