/**
 * Parse PAGE / NUMPAGES fields out of a DOCX's header/footer parts.
 *
 * SuperDoc's layout omits the *result* of these fields (it renders "Page  of "
 * with the numbers missing and no space reserved), so a DOM-only exporter can't
 * show page numbers. We parse the header/footer XML here, and the exporter
 * redraws those specific lines with the numbers filled in.
 */
import JSZip from 'jszip';

export type FieldToken = { lit: string } | { field: 'PAGE' | 'NUMPAGES' };

export interface FieldParagraph {
  ordinal: number;
  align: 'left' | 'center' | 'right' | 'justify';
  tokens: FieldToken[];
  colorHex?: string; // RRGGBB
  sizeHalfPt?: number; // w:sz (half-points)
}

/** Map key = part base name, e.g. `footer1.xml`. Only parts with page fields. */
export type FieldTemplates = Map<string, FieldParagraph[]>;

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

function parseParagraph(pXml: string, ordinal: number): FieldParagraph | null {
  const tokens: FieldToken[] = [];
  let inResult = false;
  const re =
    /<w:fldChar[^>]*w:fldCharType="(begin|separate|end)"[^>]*\/?>|<w:instrText[^>]*>([\s\S]*?)<\/w:instrText>|<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:fldSimple[^>]*w:instr="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pXml))) {
    if (m[1]) {
      if (m[1] === 'separate') inResult = true;
      else if (m[1] === 'end') inResult = false;
    } else if (m[2] !== undefined) {
      const instr = m[2].trim().toUpperCase();
      if (/NUMPAGES/.test(instr)) tokens.push({ field: 'NUMPAGES' });
      else if (/\bPAGE\b/.test(instr)) tokens.push({ field: 'PAGE' });
    } else if (m[3] !== undefined) {
      if (!inResult) tokens.push({ lit: decodeXml(m[3]) });
    } else if (m[4] !== undefined) {
      const instr = m[4].trim().toUpperCase();
      if (/NUMPAGES/.test(instr)) tokens.push({ field: 'NUMPAGES' });
      else if (/\bPAGE\b/.test(instr)) tokens.push({ field: 'PAGE' });
    }
  }
  if (!tokens.some((t) => 'field' in t)) return null;

  const jc = pXml.match(/<w:jc\s+w:val="([^"]+)"/);
  const align = (jc?.[1] as FieldParagraph['align']) ?? 'left';
  const color = pXml.match(/<w:color\s+w:val="([0-9A-Fa-f]{6})"/)?.[1];
  const sz = pXml.match(/<w:sz\s+w:val="(\d+)"/)?.[1];
  return { ordinal, align, tokens, colorHex: color, sizeHalfPt: sz ? Number(sz) : undefined };
}

export async function parseFieldTemplates(docx: ArrayBuffer): Promise<FieldTemplates> {
  const out: FieldTemplates = new Map();
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(docx);
  } catch {
    return out;
  }
  const parts = Object.keys(zip.files).filter((n) => /^word\/(header|footer)\d+\.xml$/.test(n));
  for (const part of parts) {
    const xml = await zip.files[part].async('string');
    const paras: FieldParagraph[] = [];
    let ordinal = 0;
    for (const pm of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
      const parsed = parseParagraph(pm[1], ordinal);
      if (parsed) paras.push(parsed);
      ordinal++;
    }
    if (paras.length) out.set(part.replace(/^word\//, ''), paras);
  }
  return out;
}

export function resolveTokens(tokens: FieldToken[], pageNumber: number, totalPages: number): string {
  return tokens
    .map((t) => ('lit' in t ? t.lit : t.field === 'PAGE' ? String(pageNumber) : String(totalPages)))
    .join('');
}
