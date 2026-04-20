import type { NormalizedParagraph, ResolvedStyle, TriState, WordExtraction, WordParagraph } from './types.ts';
import type { SuperDocExtraction } from './superdoc.ts';

const WD_UNDEFINED = 9999999;

export function normalizeWord(extraction: WordExtraction): NormalizedParagraph[] {
  return extraction.paragraphs.map((p, i) => wordParagraphToNormalized(p, i + 1));
}

function wordParagraphToNormalized(p: WordParagraph, ordinal: number): NormalizedParagraph {
  return {
    ordinal,
    text: p.text ?? '',
    style: p.style,
    resolved: {
      fontName: p.fontName,
      fontSize: p.fontSize,
      bold: wordTri(p.bold),
      italic: wordTri(p.italic),
      color: oleToHex(p.colorRgb),
      leftIndent: p.leftIndent,
      firstLineIndent: p.firstLineIndent,
      alignment: wordAlignment(p.alignment),
      listString: p.listString ?? '',
      listLevel: p.listLevel,
    },
    page: p.page,
    y: p.y,
  };
}

function wordTri(v: number): TriState {
  if (v === WD_UNDEFINED) return 'mixed';
  return Boolean(v);
}

function wordAlignment(v: number): ResolvedStyle['alignment'] {
  switch (v) {
    case 0:
      return 'left';
    case 1:
      return 'center';
    case 2:
      return 'right';
    case 3:
      return 'justify';
    default:
      return 'unknown';
  }
}

function oleToHex(ole: number): string {
  // Word's Font.TextColor.RGB returns 0x00BBGGRR. Convert to #RRGGBB.
  const r = ole & 0xff;
  const g = (ole >> 8) & 0xff;
  const b = (ole >> 16) & 0xff;
  return `#${[r, g, b]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

export function normalizeSuperDoc(extraction: SuperDocExtraction): NormalizedParagraph[] {
  const out: NormalizedParagraph[] = [];
  let ordinal = 0;
  for (const block of extraction.blocks) {
    if (block.kind !== 'paragraph') continue;
    ordinal += 1;
    const bid = block.id ?? '';
    const text = (block.runs ?? []).map((r) => r.text ?? '').join('');
    const y_px = extraction.blockY[bid];
    const page = extraction.blockPage[bid] ?? 0;
    out.push({
      ordinal,
      text,
      style: '',
      page,
      y: y_px !== undefined ? pxToPt(y_px) : 0,
    });
  }
  return out;
}

export { pxToPt, oleToHex, wordTri, wordAlignment };

function pxToPt(px: number): number {
  return (px * 72) / 96;
}
