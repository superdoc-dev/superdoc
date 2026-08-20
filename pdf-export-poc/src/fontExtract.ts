/**
 * Extract and deobfuscate the fonts embedded in a DOCX so they can be embedded
 * byte-exact into the exported PDF.
 *
 * Word stores embedded fonts as obfuscated `.odttf` files: the real TTF/OTF is
 * XOR-scrambled in its first 32 bytes with a 16-byte key derived from the
 * `w:fontKey` GUID (the GUID bytes, reversed). We read `word/fontTable.xml` +
 * its rels to map each family/variant to its file + key, then unscramble.
 */
import JSZip from 'jszip';

export type Variant = 'regular' | 'bold' | 'italic' | 'bolditalic';
export type EmbeddedFonts = Record<string, Partial<Record<Variant, Uint8Array>>>;

const EMBED_TO_VARIANT: Record<string, Variant> = {
  embedRegular: 'regular',
  embedBold: 'bold',
  embedItalic: 'italic',
  embedBoldItalic: 'bolditalic',
};

function deobfuscate(data: Uint8Array, guid: string): Uint8Array {
  const hex = guid.replace(/[{}-]/g, '');
  if (hex.length !== 32) return data;
  const key = new Uint8Array(16);
  for (let i = 0; i < 16; i++) key[i] = parseInt(hex.substr(i * 2, 2), 16);
  const mask = key.slice().reverse();
  const out = data.slice();
  const n = Math.min(32, out.length);
  for (let i = 0; i < n; i++) out[i] ^= mask[i % 16];
  return out;
}

const attr = (s: string, name: string): string | null => {
  const m = s.match(new RegExp(`${name.replace(':', '\\:')}="([^"]+)"`));
  return m ? m[1] : null;
};

/** Returns a map of DOCX font family name -> variant -> unscrambled TTF/OTF bytes. */
export async function extractEmbeddedFonts(docx: ArrayBuffer): Promise<EmbeddedFonts> {
  const out: EmbeddedFonts = {};
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(docx);
  } catch {
    return out;
  }
  const ftFile = zip.file('word/fontTable.xml');
  const relsFile = zip.file('word/_rels/fontTable.xml.rels');
  if (!ftFile || !relsFile) return out;

  const ft = await ftFile.async('string');
  const rels = await relsFile.async('string');

  // rId -> target path (attribute order varies)
  const relMap: Record<string, string> = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = m[0];
    const id = attr(tag, 'Id');
    const target = attr(tag, 'Target');
    if (id && target) relMap[id] = target;
  }

  const fontRe = /<w:font\b[^>]*>([\s\S]*?)<\/w:font>|<w:font\b[^>]*\/>/g;
  const fontOpenRe = /<w:font\b[^>]*w:name="([^"]+)"/;
  let fm: RegExpExecArray | null;
  while ((fm = fontRe.exec(ft))) {
    const whole = fm[0];
    const nameMatch = whole.match(fontOpenRe);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const body = fm[1] ?? '';
    for (const em of body.matchAll(/<w:(embedRegular|embedBold|embedItalic|embedBoldItalic)\b([^>]*)\/?>/g)) {
      const variant = EMBED_TO_VARIANT[em[1]];
      const rid = attr(em[2], 'r:id');
      const key = attr(em[2], 'w:fontKey');
      if (!variant || !rid || !key) continue;
      let target = relMap[rid];
      if (!target) continue;
      target = target.replace(/^\//, '');
      if (!target.startsWith('word/')) target = `word/${target}`;
      const f = zip.file(target);
      if (!f) continue;
      const raw = new Uint8Array(await f.async('arraybuffer'));
      (out[name] ||= {})[variant] = deobfuscate(raw, key);
    }
  }
  return out;
}
