import { describe, it, expect } from 'vitest';
import {
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
  it('combines bundled toolbar choices and document fonts alphabetically with no status field', () => {
    const options = buildFontFamilyOptions([
      { logicalFamily: 'Aptos', previewFamily: 'Aptos' },
      { logicalFamily: 'Bangla MN', previewFamily: 'Bangla MN' },
      { logicalFamily: 'Calibri', previewFamily: 'Carlito' },
      { logicalFamily: 'Apple Chancery', previewFamily: 'Apple Chancery' },
    ]);
    expect(options.map((option) => option.label)).toEqual([
      'Apple Chancery',
      'Aptos',
      'Arial',
      'Bangla MN',
      'Calibri',
      'Comic Sans MS',
      'Cooper Black',
      'Courier New',
      'Garamond',
      'Georgia',
      'Helvetica',
      'Tahoma',
      'Times New Roman',
      'Trebuchet MS',
    ]);
    expect(options.filter((option) => option.label === 'Calibri')).toHaveLength(1);
    expect(options.every((option) => !('status' in option))).toBe(true);
  });

  it('uses the logical family as the apply value and previewFamily only for row rendering', () => {
    const options = buildFontFamilyOptions([{ logicalFamily: 'Calibri', previewFamily: 'Carlito' }]);
    const calibri = options.find((option) => option.label === 'Calibri');
    expect(calibri).toMatchObject({ label: 'Calibri', value: 'Calibri', previewFamily: 'Carlito' });
  });
});
