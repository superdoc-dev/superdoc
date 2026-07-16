import { describe, it, expect } from 'vitest';
import {
  BASELINE_BUNDLED,
  FULLY_ACTIVE_BUNDLED,
  buildDocumentFontOptions,
  buildFontFamilyOptions,
  type FontFaceRequest,
  type FontLoadStatus,
  type FontRegistry,
  type UsedFace,
} from './index';

/** Face-aware fake registry: per-face load status + which faces are registered (hasFace). */
class FaceRegistry {
  readonly faceStatuses = new Map<string, FontLoadStatus>();
  readonly registered = new Set<string>();
  #key(family: string, weight: string, style: string): string {
    return `${family.toLowerCase()}|${weight}|${style}`;
  }
  getStatus(): FontLoadStatus {
    return 'unloaded';
  }
  getFaceStatus(req: FontFaceRequest): FontLoadStatus {
    return this.faceStatuses.get(this.#key(req.family, req.weight, req.style)) ?? 'unloaded';
  }
  hasFace(family: string, weight: '400' | '700', style: 'normal' | 'italic'): boolean {
    return this.registered.has(this.#key(family, weight, style));
  }
  setFace(family: string, weight: '400' | '700', style: 'normal' | 'italic', status: FontLoadStatus): void {
    this.registered.add(this.#key(family, weight, style));
    this.faceStatuses.set(this.#key(family, weight, style), status);
  }
  asRegistry(): FontRegistry {
    return this as unknown as FontRegistry;
  }
}

const regular = (logicalFamily: string): UsedFace => ({ logicalFamily, weight: '400', style: 'normal' });

/** A registry with the bundled clone pack loaded (so substitutes resolve) + one customer/embedded face. */
function loadedRegistry(): FaceRegistry {
  const reg = new FaceRegistry();
  const faces = [
    ['400', 'normal'],
    ['700', 'normal'],
    ['400', 'italic'],
    ['700', 'italic'],
  ] as const;
  for (const clone of ['Carlito', 'Caladea', 'Liberation Sans', 'Liberation Serif', 'Liberation Mono']) {
    for (const [w, s] of faces) reg.setFace(clone, w, s, 'loaded'); // the bundled clones are four-face fonts
  }
  reg.setFace('BrandSans', '400', 'normal', 'loaded'); // a document-embedded / customer-added real face
  return reg;
}

describe('buildDocumentFontOptions (document-specific toolbar fonts)', () => {
  it('returns one plain option for each font the document uses', () => {
    const reg = loadedRegistry().asRegistry();
    const options = buildDocumentFontOptions(
      [
        regular('Calibri'),
        regular('Cambria'),
        regular('Calibri Light'),
        regular('Georgia'),
        regular('Aptos'),
        regular('Cambria Math'),
        regular('BrandSans'),
        regular('Wingdings'),
      ],
      reg,
    );
    expect(options.map((o) => o.logicalFamily)).toEqual([
      'Calibri',
      'Cambria',
      'Calibri Light',
      'Georgia',
      'Aptos',
      'Cambria Math',
      'BrandSans',
      'Wingdings',
    ]);
    expect(options.every((option) => !('status' in option))).toBe(true);
  });

  it('previews a bundled substitute through its physical clone, while preserving the logical name', () => {
    const reg = loadedRegistry().asRegistry();
    const [calibri] = buildDocumentFontOptions([regular('Calibri')], reg);
    expect(calibri).toMatchObject({ logicalFamily: 'Calibri', previewFamily: 'Carlito' });
  });

  it('dedupes a family used at multiple faces into one option (regular face represents it)', () => {
    const reg = loadedRegistry().asRegistry();
    const options = buildDocumentFontOptions(
      [
        { logicalFamily: 'Calibri', weight: '700', style: 'normal' },
        { logicalFamily: 'Calibri', weight: '400', style: 'normal' },
        { logicalFamily: 'Calibri', weight: '400', style: 'italic' },
      ],
      reg,
    );
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ logicalFamily: 'Calibri', previewFamily: 'Carlito' });
  });

  it('keeps the regular face as the preview representative when another used face is absent', () => {
    const reg = new FaceRegistry();
    reg.setFace('Carlito', '400', 'normal', 'loaded');
    const options = buildDocumentFontOptions(
      [
        { logicalFamily: 'Calibri', weight: '400', style: 'normal' },
        { logicalFamily: 'Calibri', weight: '700', style: 'normal' },
      ],
      reg.asRegistry(),
    );
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ logicalFamily: 'Calibri', previewFamily: 'Carlito' });
  });
});

describe('buildFontFamilyOptions (custom UI font picker rows)', () => {
  const documentOptions = [
    { logicalFamily: 'Aptos', previewFamily: 'Aptos' },
    { logicalFamily: 'Bangla MN', previewFamily: 'Bangla MN' },
    { logicalFamily: 'Calibri', previewFamily: 'Carlito' },
    { logicalFamily: 'Apple Chancery', previewFamily: 'Apple Chancery' },
  ];

  it('with no pack configured: the baseline plus document fonts, alphabetical, no status field', () => {
    const options = buildFontFamilyOptions(documentOptions);
    expect(options.map((option) => option.label)).toEqual([
      'Apple Chancery',
      'Aptos',
      'Arial',
      'Bangla MN',
      'Calibri',
      'Courier New',
      'Times New Roman',
    ]);
    // BASELINE_BUNDLED is the explicit form of the same default.
    expect(buildFontFamilyOptions(documentOptions, BASELINE_BUNDLED).map((o) => o.label)).toEqual(
      options.map((o) => o.label),
    );
    expect(options.filter((option) => option.label === 'Calibri')).toHaveLength(1);
    expect(options.every((option) => !('status' in option))).toBe(true);
  });

  it('baseline built-in rows preview in the logical family; configured rows preview in the physical clone', () => {
    // In baseline the physical clone (e.g. Liberation Serif) is neither registered nor served, so the
    // row must preview in the logical family that actually renders - not the clone.
    const baselineTnr = buildFontFamilyOptions([], BASELINE_BUNDLED).find((o) => o.label === 'Times New Roman');
    expect(baselineTnr?.previewFamily).toBe('Times New Roman');
    // With the pack configured the clone is served, so the preview uses the physical clone.
    const richTnr = buildFontFamilyOptions([], FULLY_ACTIVE_BUNDLED).find((o) => o.label === 'Times New Roman');
    expect(richTnr?.previewFamily).not.toBe('Times New Roman');
  });

  it('with the pack configured: the full built-in set plus document fonts', () => {
    const options = buildFontFamilyOptions(documentOptions, FULLY_ACTIVE_BUNDLED);
    expect(options.map((option) => option.label)).toEqual([
      'Apple Chancery',
      'Aptos',
      'Arial',
      'Arial Black',
      'Arial Narrow',
      'Bangla MN',
      'Baskerville Old Face',
      'Bookman Old Style',
      'Brush Script MT',
      'Calibri',
      'Century',
      'Century Gothic',
      'Comic Sans MS',
      'Cooper Black',
      'Courier New',
      'Garamond',
      'Georgia',
      'Gill Sans MT Condensed',
      'Helvetica',
      'Lucida Console',
      'Segoe UI',
      'Tahoma',
      'Times New Roman',
      'Trebuchet MS',
      'Verdana',
    ]);
    expect(options.filter((option) => option.label === 'Calibri')).toHaveLength(1);
  });

  it('uses the logical family as the apply value and previewFamily only for row rendering', () => {
    const options = buildFontFamilyOptions([{ logicalFamily: 'Calibri', previewFamily: 'Carlito' }]);
    const calibri = options.find((option) => option.label === 'Calibri');
    expect(calibri).toMatchObject({ label: 'Calibri', value: 'Calibri', previewFamily: 'Carlito' });
  });
});
