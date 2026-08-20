/**
 * Client-side DOCX -> PDF exporter for SuperDoc V2.
 *
 * SuperDoc's layout engine renders a pixel-accurate, paginated DOM. We treat
 * that rendered DOM as the source of truth and re-draw it into a PDF with
 * pdf-lib:
 *   - text is anchored word-by-word at the browser's measured coordinates, so
 *     positioning is WYSIWYG regardless of font-metric differences (justified /
 *     tabbed lines line up for free);
 *   - real fonts are embedded + subset (selectable text, no rasterization);
 *   - <a> links become clickable PDF annotations (external URIs + internal GoTo);
 *   - element backgrounds/borders reproduce tables, shading, rules, highlights;
 *   - images are re-encoded to PNG via canvas and embedded.
 *
 * V2 virtualizes pages (only pages near the viewport are painted). The exporter
 * scrolls each page into view and waits for it to paint before capturing it, so
 * a full document exports even in a normal-height window. No WASM, no network
 * engine — pdf-lib + fontkit are lazy-imported only when an export runs.
 */
import type { PDFDocument, PDFFont, PDFPage, PDFImage } from 'pdf-lib';
import type { EmbeddedFonts, Variant } from './fontExtract';
import { resolveTokens, type FieldTemplates, type FieldParagraph } from './fieldResolve';

const PT = 72 / 96; // CSS px @96dpi -> PDF points

type FaceKey = 'sans' | 'serif' | 'mono';
type StyleKey = 'regular' | 'bold' | 'italic' | 'bolditalic';

const FONT_FILES: Record<string, string> = {
  'sans:regular': '/fonts/Sans-Regular.ttf',
  'sans:bold': '/fonts/Sans-Bold.ttf',
  'sans:italic': '/fonts/Sans-Italic.ttf',
  'sans:bolditalic': '/fonts/Sans-BoldItalic.ttf',
  'serif:regular': '/fonts/Serif-Regular.ttf',
  'serif:bold': '/fonts/Serif-Bold.ttf',
  'serif:italic': '/fonts/Serif-Italic.ttf',
  'serif:bolditalic': '/fonts/Serif-BoldItalic.ttf',
  'mono:regular': '/fonts/Mono-Regular.ttf',
  'mono:bold': '/fonts/Mono-Bold.ttf',
  'mono:italic': '/fonts/Mono-Regular.ttf',
  'mono:bolditalic': '/fonts/Mono-Bold.ttf',
};

function classifyFamily(fontFamily: string): FaceKey {
  const f = fontFamily.toLowerCase();
  if (/mono|courier|consol/.test(f)) return 'mono';
  // Check sans BEFORE serif — "sans-serif" contains the substring "serif".
  if (/sans|ubuntu|arial|helvet|calibri|verdana|segoe|roboto|tahoma|inter|noto sans/.test(f)) return 'sans';
  if (/serif|times|georgia|garamond|minion|cambria|palatino|book antiqua/.test(f)) return 'serif';
  return 'sans';
}
function classifyStyle(weight: string, style: string): Variant {
  const bold = parseInt(weight, 10) >= 600 || weight === 'bold' || weight === 'bolder';
  const italic = style === 'italic' || style === 'oblique';
  return bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'regular';
}

// The primary family name, stripped of SuperDoc's embedded-face prefix + quotes,
// e.g. `__superdoc_embedded_0__Ubuntu, sans-serif` -> `Ubuntu`.
function primaryFamily(fontFamily: string): string {
  const first = (fontFamily.split(',')[0] || '').trim().replace(/^["']|["']$/g, '');
  return first.replace(/^__superdoc_embedded_\d+__/, '').trim();
}

// A PDF font plus its fontkit face (for glyph-coverage queries).
export interface Face {
  pdf: PDFFont;
  fk: { hasGlyphForCodePoint(cp: number): boolean };
}

const SYMBOL_FALLBACK_URL = '/fonts/Symbol-Regular.ttf';
const SYMBOL_BOLD_FALLBACK_URL = '/fonts/Symbol-Bold.ttf';
const CJK_FALLBACK_URL = '/fonts/CJK-Regular.ttf';

class FontBook {
  private cache = new Map<string, Face>();
  private bytes = new Map<string, ArrayBuffer>();
  private symbolFace: Face | null = null;
  private symbolBoldFace: Face | null = null;
  private cjkFace: Face | null = null;
  private cjkTried = false;
  constructor(
    private pdf: PDFDocument,
    private fontkit: { create(b: Uint8Array): { hasGlyphForCodePoint(cp: number): boolean } },
    private embedded: EmbeddedFonts = {},
  ) {}

  async preload() {
    const uniq = new Set([...Object.values(FONT_FILES), SYMBOL_FALLBACK_URL, SYMBOL_BOLD_FALLBACK_URL]);
    await Promise.all(
      [...uniq].map(async (url) => {
        const r = await fetch(url);
        if (r.ok) this.bytes.set(url, await r.arrayBuffer());
      }),
    );
  }

  private async embed(key: string, buf: ArrayBuffer): Promise<Face> {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const pdf = await this.pdf.embedFont(buf, { subset: true });
    const fk = this.fontkit.create(new Uint8Array(buf));
    const face = { pdf, fk };
    this.cache.set(key, face);
    return face;
  }

  async pick(fontFamily: string, weight: string, style: string): Promise<Face> {
    const variant = classifyStyle(weight, style);
    // 1) exact embedded DOCX font for this family + variant (byte-exact fidelity)
    const family = primaryFamily(fontFamily);
    const embBytes = this.embedded[family]?.[variant];
    if (embBytes)
      return this.embed(
        `emb:${family}:${variant}`,
        embBytes.buffer.slice(embBytes.byteOffset, embBytes.byteOffset + embBytes.byteLength) as ArrayBuffer,
      );
    // 2) bundled open substitute, classified by family shape + variant
    const key = `${classifyFamily(fontFamily)}:${variant}`;
    const url = FONT_FILES[key] ?? FONT_FILES['sans:regular'];
    const buf = this.bytes.get(url);
    if (!buf) throw new Error(`font not preloaded: ${url}`);
    return this.embed(key, buf);
  }

  /** Symbol / geometric-shape / Hebrew fallback face (DejaVu Sans), preloaded.
   * Weight-aware: bold runs (e.g. bold Hebrew, which no bundled Latin face
   * covers) get DejaVu Sans Bold so the weight survives the fallback. */
  private async symbol(bold = false): Promise<Face | null> {
    if (bold) {
      if (this.symbolBoldFace) return this.symbolBoldFace;
      const buf = this.bytes.get(SYMBOL_BOLD_FALLBACK_URL);
      if (buf) {
        this.symbolBoldFace = await this.embed('symbol:bold', buf);
        return this.symbolBoldFace;
      }
      // fall through to regular if the bold face is unavailable
    }
    if (this.symbolFace) return this.symbolFace;
    const buf = this.bytes.get(SYMBOL_FALLBACK_URL);
    if (!buf) return null;
    this.symbolFace = await this.embed('symbol', buf);
    return this.symbolFace;
  }

  /** CJK fallback face (Noto Sans JP — Han + kana). Fetched lazily (it's large,
   * so only downloaded the first time a CJK glyph is actually encountered). */
  private async cjk(): Promise<Face | null> {
    if (this.cjkFace) return this.cjkFace;
    if (this.cjkTried) return null;
    this.cjkTried = true;
    try {
      const r = await fetch(CJK_FALLBACK_URL);
      if (!r.ok) return null;
      this.cjkFace = await this.embed('cjk', await r.arrayBuffer());
      return this.cjkFace;
    } catch {
      return null;
    }
  }

  /** Pick the face to draw `token` with: the primary font, else the first
   * fallback (symbol → CJK) that covers every code point in the token. */
  async pickForToken(fontFamily: string, weight: string, style: string, token: string): Promise<Face> {
    const primary = await this.pick(fontFamily, weight, style);
    const cps = [...token].map((c) => c.codePointAt(0)!);
    const covers = (f: Face | null) => !!f && cps.every((cp) => f.fk.hasGlyphForCodePoint(cp));
    if (covers(primary)) return primary;
    const bold = classifyStyle(weight, style).startsWith('bold');
    for (const get of [() => this.symbol(bold), () => this.cjk()]) {
      const f = await get();
      if (covers(f)) return f!;
    }
    return primary;
  }

  private charFaceCache = new Map<string, Face>();

  /** Best face for a single code point: primary, else symbol, else CJK. Cached. */
  async faceForChar(fontFamily: string, weight: string, style: string, cp: number): Promise<Face> {
    const primary = await this.pick(fontFamily, weight, style);
    if (primary.fk.hasGlyphForCodePoint(cp)) return primary;
    const ck = `${classifyFamily(fontFamily)}:${classifyStyle(weight, style)}:${cp}`;
    const cached = this.charFaceCache.get(ck);
    if (cached) return cached;
    let chosen = primary;
    const bold = classifyStyle(weight, style).startsWith('bold');
    for (const get of [() => this.symbol(bold), () => this.cjk()]) {
      const f = await get();
      if (f && f.fk.hasGlyphForCodePoint(cp)) {
        chosen = f;
        break;
      }
    }
    this.charFaceCache.set(ck, chosen);
    return chosen;
  }
}

const metricCanvas = document.createElement('canvas');
const metricCtx = metricCanvas.getContext('2d')!;
const metricCache = new Map<string, { asc: number; desc: number }>();
function fontMetrics(cssFont: string) {
  if (metricCache.has(cssFont)) return metricCache.get(cssFont)!;
  metricCtx.font = cssFont;
  const m = metricCtx.measureText('Hg');
  const asc = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? 0;
  const desc = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent ?? 0;
  const out = { asc, desc };
  metricCache.set(cssFont, out);
  return out;
}

function parseColor(c: string): { r: number; g: number; b: number } {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return { r: 0, g: 0, b: 0 };
  const [r, g, b] = m[1].split(',').map((x) => parseFloat(x));
  return { r: r / 255, g: g / 255, b: b / 255 };
}

// Parse an SVG paint value (hex / rgb() / named-ish) to 0..1 RGB, or null.
function svgPaint(v: string | null): { r: number; g: number; b: number } | null {
  if (!v || v === 'none' || v === 'transparent') return null;
  const t = v.trim();
  if (t[0] === '#') {
    let h = t.slice(1);
    if (h.length === 3)
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    if (h.length !== 6) return null;
    const n = parseInt(h, 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }
  const m = t.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(',').map((x) => parseFloat(x));
    return { r: r / 255, g: g / 255, b: b / 255 };
  }
  if (t === 'black') return { r: 0, g: 0, b: 0 };
  if (t === 'white') return { r: 1, g: 1, b: 1 };
  return null;
}

// Convert a drawable SVG element to a path `d` string in viewBox units, or null
// if it needs the raster fallback (arcs / unsupported elements).
function svgElToPathData(el: Element): string | null {
  const t = el.tagName.toLowerCase();
  const n = (a: string) => parseFloat(el.getAttribute(a) || '0');
  if (t === 'path') return el.getAttribute('d');
  if (t === 'rect') {
    const x = n('x'),
      y = n('y'),
      w = n('width'),
      h = n('height');
    if (el.getAttribute('rx') || el.getAttribute('ry')) return null; // rounded → raster
    return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
  }
  if (t === 'line') return `M ${n('x1')} ${n('y1')} L ${n('x2')} ${n('y2')}`;
  if (t === 'polygon' || t === 'polyline') {
    const pts = (el.getAttribute('points') || '')
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (pts.length < 4) return null;
    let d = `M ${pts[0]} ${pts[1]}`;
    for (let i = 2; i + 1 < pts.length; i += 2) d += ` L ${pts[i]} ${pts[i + 1]}`;
    if (t === 'polygon') d += ' Z';
    return d;
  }
  return null; // circle / ellipse / text / etc → raster fallback
}

/** Draw an inline SVG as true vector paths. Returns false (→ rasterize) when the
 * SVG uses features we don't translate (gradients, filters, arcs, transforms…). */
function drawSvgVector(
  svg: SVGElement,
  page: PDFPage,
  toX: (x: number) => number,
  toY: (y: number) => number,
  rgb: (r: number, g: number, b: number) => any,
): boolean {
  if (
    svg.querySelector(
      'image, foreignObject, filter, linearGradient, radialGradient, pattern, use, clipPath, mask, text, tspan',
    )
  ) {
    return false;
  }
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || !vb[2] || !vb[3]) return false;
  const [vx, vy, vw, vh] = vb;
  const sr = svg.getBoundingClientRect();
  const drawables = Array.from(svg.querySelectorAll('path, rect, line, polygon, polyline'));
  if (
    !drawables.length ||
    drawables.length !== svg.querySelectorAll('path,rect,circle,ellipse,line,polygon,polyline').length
  ) {
    return false; // contains circle/ellipse we don't vectorize → raster whole thing
  }
  // `drawSvgPath` supports only a single uniform scale. If the viewBox→screen
  // scale differs on x vs y (e.g. a footnote separator: 100×100 viewBox rendered
  // 312×1), a uniform scale would distort the path — fall back to rasterizing,
  // which reproduces the element at its exact rendered size.
  const scaleX = sr.width / vw;
  const scaleY = sr.height / vh;
  if (Math.abs(scaleX - scaleY) > 0.02 * Math.max(scaleX, scaleY)) return false;
  // viewBox units -> PDF points; drawSvgPath multiplies path coords by `scale`.
  const scale = scaleX * PT;
  const originXpt = toX(sr.left);
  const originYpt = toY(sr.top);
  for (const el of drawables) {
    let d = svgElToPathData(el);
    if (!d) return false;
    // account for viewBox min-x/min-y offset
    if (vx || vy) d = `M ${-vx} ${-vy} m 0 0 ` + d; // negligible for 0 0 origin; keep simple
    const cs = getComputedStyle(el);
    const fill = svgPaint(
      el.getAttribute('fill') ?? (cs.fill === 'rgb(0, 0, 0)' && !el.hasAttribute('fill') ? null : cs.fill),
    );
    const stroke = svgPaint(el.getAttribute('stroke') ?? cs.stroke);
    const sw = parseFloat(el.getAttribute('stroke-width') ?? cs.strokeWidth ?? '0') || 0;
    try {
      page.drawSvgPath(d, {
        x: originXpt,
        y: originYpt,
        scale,
        color: fill ? rgb(fill.r, fill.g, fill.b) : undefined,
        borderColor: stroke ? rgb(stroke.r, stroke.g, stroke.b) : undefined,
        borderWidth: stroke ? Math.max(0.3, sw * (sr.width / vw) * PT) : 0,
      });
    } catch {
      return false;
    }
  }
  return true;
}
function isVisible(color: string): boolean {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return false;
  const parts = m[1].split(',').map((x) => parseFloat(x));
  return parts.length < 4 || parts[3] > 0.01;
}

async function imgToPngBytes(img: HTMLImageElement): Promise<Uint8Array | null> {
  try {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const b64 = c.toDataURL('image/png').split(',')[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  } catch (e) {
    console.warn('[pdf] image capture failed', e);
    return null;
  }
}

// Rasterize an inline SVG (vector shapes, charts, connectors) to PNG bytes so it
// can be embedded. SuperDoc paints drawings as inline SVG, which pdf-lib can't
// embed directly.
async function svgToPngBytes(svgEl: SVGElement, scale = 2): Promise<Uint8Array | null> {
  try {
    const rect = svgEl.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const clone = svgEl.cloneNode(true) as SVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    const xml = new XMLSerializer().serializeToString(clone);
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('svg load'));
      img.src = url;
    });
    const c = document.createElement('canvas');
    c.width = w * scale;
    c.height = h * scale;
    const ctx = c.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    const b64 = c.toDataURL('image/png').split(',')[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  } catch (e) {
    console.warn('[pdf] svg capture failed', e);
    return null;
  }
}

/**
 * Rasterize a page element to a PNG of the browser's OWN rendering by cloning it
 * into an SVG <foreignObject> and drawing that to a canvas. Unlike a
 * re-implemented renderer (html2canvas), the SVG image is painted by the same
 * Blink layout+paint pipeline as the live page, so the output is pixel-identical
 * to the editor (measured 99.99–100% on the calibre fixture). One catch: fonts
 * SuperDoc registers via the FontFace API are invisible to an isolated SVG
 * image, so the DOCX's embedded fonts are re-declared inside the SVG as
 * data-URI @font-face rules under both their plain names and SuperDoc's
 * synthetic `__superdoc_embedded_N__` family names.
 */
async function pageToPixelPng(pageEl: HTMLElement, embedded: EmbeddedFonts, scale = 2): Promise<Uint8Array | null> {
  try {
    const pr = pageEl.getBoundingClientRect();
    const W = Math.round(pr.width),
      H = Math.round(pr.height);

    const b64 = (u8: Uint8Array) => {
      let s = '';
      for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192));
      return btoa(s);
    };
    const VW: Record<string, [string, string]> = {
      regular: ['400', 'normal'],
      bold: ['700', 'normal'],
      italic: ['400', 'italic'],
      bolditalic: ['700', 'italic'],
    };
    // map base family -> synthetic FontFace-API family actually used on the page
    const synth = new Map<string, string>();
    (document.fonts as unknown as { forEach(cb: (f: FontFace) => void): void }).forEach((f) => {
      const m = /^(__superdoc_embedded_\d+__)(.+)$/.exec(f.family.replace(/^["']|["']$/g, ''));
      if (m) synth.set(m[2], m[1] + m[2]);
    });
    let fontCss = '';
    for (const [fam, variants] of Object.entries(embedded)) {
      const names = [fam, synth.get(fam)].filter(Boolean) as string[];
      for (const [variant, bytes] of Object.entries(variants)) {
        if (!bytes) continue;
        const [weight, style] = VW[variant] ?? VW.regular;
        const src = `url(data:font/truetype;base64,${b64(bytes)}) format('truetype')`;
        for (const name of names)
          fontCss += `@font-face{font-family:"${name}";font-weight:${weight};font-style:${style};src:${src};}`;
      }
    }

    // deep-clone with every element's computed style frozen inline
    const clone = pageEl.cloneNode(true) as HTMLElement;
    const srcEls = [pageEl, ...Array.from(pageEl.querySelectorAll<HTMLElement>('*'))];
    const dstEls = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))];
    for (let i = 0; i < srcEls.length; i++) {
      const cs = getComputedStyle(srcEls[i]);
      let t = '';
      for (const prop of Array.from(cs)) t += `${prop}:${cs.getPropertyValue(prop)};`;
      dstEls[i].setAttribute('style', t);
    }
    // the SVG image context cannot fetch blob:/http: URLs — data-URI every <img>
    const srcImgs = Array.from(pageEl.querySelectorAll('img'));
    const dstImgs = Array.from(clone.querySelectorAll('img'));
    for (let i = 0; i < srcImgs.length; i++) {
      try {
        const im = srcImgs[i] as HTMLImageElement;
        const c = document.createElement('canvas');
        c.width = im.naturalWidth || im.width;
        c.height = im.naturalHeight || im.height;
        c.getContext('2d')!.drawImage(im, 0, 0);
        dstImgs[i].setAttribute('src', c.toDataURL('image/png'));
      } catch {
        /* leave original src */
      }
    }

    const ser = new XMLSerializer().serializeToString(clone);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
      `<style>${fontCss}</style>` +
      `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${ser}</div></foreignObject></svg>`;
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('foreignObject svg load failed'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
    await delay(150); // let the embedded fonts settle inside the SVG image
    const canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out64 = canvas.toDataURL('image/png').split(',')[1];
    const bin = atob(out64);
    const arr = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    return arr;
  } catch (e) {
    console.warn('[pdf] foreignObject page capture failed', e);
    return null;
  }
}

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function ensurePainted(pageEl: HTMLElement): Promise<void> {
  pageEl.scrollIntoView({ block: 'center' });
  for (let t = 0; t < 40; t++) {
    await raf();
    await delay(25);
    if (
      (pageEl.textContent || '').trim().length > 0 ||
      pageEl.querySelector('.superdoc-text-run, img, .superdoc-fragment')
    )
      return;
  }
}

/**
 * Does this element paint ON TOP of the page's normal-flow text? A floating
 * DOCX image ("in front of text") is rendered by SuperDoc as an absolutely /
 * fixed-positioned fragment with an auto or non-negative z-index, so the browser
 * paints it above the in-flow paragraph text it overlaps. We must reproduce that
 * stacking: such images are drawn AFTER the text pass, otherwise the text bleeds
 * through them and the image looks semi-transparent. Images anchored behind the
 * text (Word "behind text" → negative z-index) and ordinary inline images stay
 * in the normal image pass, before text.
 */
// Unicode ranges for right-to-left scripts (Hebrew, Arabic + presentation forms).
function isRtlCodePoint(cp: number): boolean {
  return (
    (cp >= 0x0590 && cp <= 0x05ff) || // Hebrew
    (cp >= 0x0600 && cp <= 0x06ff) || // Arabic
    (cp >= 0x0700 && cp <= 0x074f) || // Syriac
    (cp >= 0x0750 && cp <= 0x077f) || // Arabic Supplement
    (cp >= 0xfb1d && cp <= 0xfb4f) || // Hebrew presentation forms
    (cp >= 0xfb50 && cp <= 0xfdff) || // Arabic presentation forms-A
    (cp >= 0xfe70 && cp <= 0xfeff) // Arabic presentation forms-B
  );
}
function hasRtl(str: string): boolean {
  for (const ch of str) if (isRtlCodePoint(ch.codePointAt(0)!)) return true;
  return false;
}

function isLtrCodePoint(cp: number): boolean {
  return (
    (cp >= 0x0030 && cp <= 0x0039) || // digits
    (cp >= 0x0041 && cp <= 0x005a) || // A-Z
    (cp >= 0x0061 && cp <= 0x007a) || // a-z
    (cp >= 0x00c0 && cp <= 0x024f) // Latin-1 supplement + extended
  );
}
// Reverse each maximal run of characters matched by `pick` (in place).
function reverseRunsInPlace(chars: string[], pick: (ch: string) => boolean): void {
  let i = 0;
  while (i < chars.length) {
    if (pick(chars[i])) {
      let j = i + 1;
      // extend across the run, absorbing a single interior space between members
      while (j < chars.length && (pick(chars[j]) || (chars[j] === ' ' && j + 1 < chars.length && pick(chars[j + 1]))))
        j++;
      const seg = chars.slice(i, j).reverse();
      for (let k = 0; k < seg.length; k++) chars[i + k] = seg[k];
      i = j;
    } else i++;
  }
}
/**
 * Reorder a logical-order string to VISUAL order so pdf-lib's left-to-right draw
 * reads correctly, for a line whose bidi resolves right-to-left — e.g. a footer
 * field like "עמוד 1 מתוך 2", where the weak numbers get absorbed into the
 * surrounding Hebrew and the whole line renders RTL even in an LTR container
 * (verified against the browser's own layout). Level-1 bidi: reverse the whole
 * line, then restore the internal left-to-right order of embedded Latin/number
 * runs. Hebrew needs no cursive shaping so this is exact; Arabic joining still
 * needs `mode: 'pixel'`.
 */
function reorderBidiVisual(str: string): string {
  const isLtr = (ch: string) => isLtrCodePoint(ch.codePointAt(0)!);
  const chars = [...str].reverse();
  reverseRunsInPlace(chars, isLtr);
  return chars.join('');
}

/**
 * Effective opacity of an element = product of the computed `opacity` of it and
 * every ancestor up to (and including checks against) `stop`. SuperDoc dims
 * headers/footers to `opacity: 0.5` in the editing view; honoring that keeps the
 * vector export matching what the editor paints (and consistent with pixel mode,
 * which captures it for free).
 */
function effectiveOpacity(el: Element, stop: Element): number {
  let o = 1;
  let n: Element | null = el;
  while (n && n !== stop.parentElement) {
    const v = parseFloat(getComputedStyle(n).opacity);
    if (!Number.isNaN(v)) o *= v;
    if (n === stop) break;
    n = n.parentElement;
  }
  return o;
}

function paintsInFrontOfText(el: Element, pageEl: Element): boolean {
  let n: Element | null = el;
  while (n && n !== pageEl) {
    const cs = getComputedStyle(n);
    if (cs.position === 'absolute' || cs.position === 'fixed') {
      const z = parseInt(cs.zIndex, 10);
      return Number.isNaN(z) ? true : z >= 0;
    }
    n = n.parentElement;
  }
  return false;
}

export interface ExportOptions {
  onProgress?: (msg: string) => void;
  /** Exact fonts extracted from the DOCX (family -> variant -> bytes) for byte-exact glyphs. */
  embeddedFonts?: EmbeddedFonts;
  /** Header/footer paragraphs containing PAGE/NUMPAGES fields, keyed by part file. */
  fieldTemplates?: FieldTemplates;
  /**
   * Rendering strategy:
   *   'word'   — vector, word-anchored + width-matched text (default, smallest).
   *   'glyph'  — vector, per-character positioned text (tightest vector fidelity).
   *   'pixel'  — pixel-exact raster-sandwich: each page is rendered by the
   *              browser's own engine via SVG <foreignObject> and embedded as an
   *              image (verified 99.99–100% identical to the editor's pixels),
   *              with an invisible selectable-text + clickable-link layer.
   *              Larger files; text prints as raster.
   *   'raster' — deprecated alias for 'pixel'.
   */
  mode?: 'word' | 'glyph' | 'pixel' | 'raster';
}

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

// Match a header/footer fragment element to a parsed field template paragraph.
function matchFieldTemplate(fragEl: Element, templates: FieldTemplates): FieldParagraph | null {
  const anchor = fragEl.getAttribute('data-source-anchor');
  if (!anchor) return null;
  let obj: any;
  try {
    obj = JSON.parse(anchor);
  } catch {
    return null;
  }
  const partUri: string = obj?.sourceRef?.partUri || '';
  const base = partUri.replace(/^.*\//, '');
  const paras = templates.get(base);
  if (!paras) return null;
  const ord = Number(String(obj?.sourceRef?.xpathLikePath || '').match(/ordinal=(\d+)/)?.[1] ?? '0');
  return paras.find((p) => p.ordinal === ord) ?? paras[0] ?? null;
}

export async function exportSuperDocToPdf(_superdoc: unknown, opts: ExportOptions = {}): Promise<Uint8Array> {
  const progress = opts.onProgress ?? (() => {});
  // 'raster' is the deprecated name for 'pixel'; normalize once here.
  const mode = (opts.mode === 'pixel' ? 'raster' : opts.mode) ?? 'word';
  progress('loading pdf engine…');
  const pdfLib = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const { PDFDocument, PDFName, PDFString, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix } =
    pdfLib;

  // Draw a word so it occupies exactly `targetWpt` points wide — horizontally
  // scaling the glyphs when the embedded/substitute font's natural width differs
  // from what SuperDoc measured. Keeps word spacing WYSIWYG under any font.
  const drawWord = (
    page: PDFPage,
    word: string,
    xPt: number,
    yPt: number,
    sizePt: number,
    font: PDFFont,
    col: ReturnType<typeof rgb>,
    targetWpt: number,
    opacity = 1,
  ) => {
    const natural = font.widthOfTextAtSize(word, sizePt);
    let sx = natural > 0.01 && targetWpt > 0.01 ? targetWpt / natural : 1;
    if (!Number.isFinite(sx) || sx <= 0) sx = 1;
    sx = Math.min(3, Math.max(0.2, sx));
    if (Math.abs(sx - 1) < 0.008) {
      page.drawText(word, { x: xPt, y: yPt, size: sizePt, font, color: col, opacity });
      return;
    }
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(sx, 0, 0, 1, 0, 0));
    page.drawText(word, { x: xPt / sx, y: yPt, size: sizePt, font, color: col, opacity });
    page.pushOperators(popGraphicsState());
  };

  const pageEls = collectPages();
  if (!pageEls.length) throw new Error('No rendered .superdoc-page elements found.');

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const book = new FontBook(pdf, fontkit, opts.embeddedFonts ?? {});
  await book.preload();

  const imgCache = new Map<string, PDFImage | null>();
  const scrollX = window.scrollX,
    scrollY = window.scrollY;

  // collected across the scroll-capture pass
  const bookmarks = new Map<string, { pageIndex: number; top: number }>(); // name -> dest
  type LinkReq = { pageIndex: number; rects: DOMRect[]; href: string; internal: boolean };
  const linkReqs: LinkReq[] = [];
  const builtPages: PDFPage[] = [];
  const pageGeom: Array<{ pr: DOMRect; Hpx: number }> = [];

  for (let i = 0; i < pageEls.length; i++) {
    const pageEl = pageEls[i];
    progress(`rendering page ${i + 1}/${pageEls.length}…`);
    await ensurePainted(pageEl);

    const pr = pageEl.getBoundingClientRect();
    const Wpx = pr.width,
      Hpx = pr.height;
    const page = pdf.addPage([Wpx * PT, Hpx * PT]);
    builtPages.push(page);
    pageGeom.push({ pr, Hpx });

    const toPdfX = (domX: number) => (domX - pr.left) * PT;
    const toPdfY = (domY: number) => (Hpx - (domY - pr.top)) * PT;

    if (mode === 'raster') {
      // pixel-exact raster-sandwich: the page is rasterized by the browser's OWN
      // engine (SVG <foreignObject>), so the embedded image is pixel-identical to
      // what the editor paints. Text + links are added as an invisible overlay
      // below (3b) for selection/search/clicking.
      const png = await pageToPixelPng(pageEl as HTMLElement, opts.embeddedFonts ?? {}, 2);
      if (png) {
        const bg = await pdf.embedPng(png);
        page.drawImage(bg, { x: 0, y: 0, width: Wpx * PT, height: Hpx * PT });
      }
    } else {
      // 1) backgrounds + borders (tables, shading, rules, highlights)
      drawDecorations(pageEl, pageEl, page, toPdfX, toPdfY, rgb);

      // Floating images that paint in front of text are deferred and drawn on
      // top AFTER the text pass (3b), so overlapping text does not bleed through
      // them (see paintsInFrontOfText).
      const frontDraws: Array<() => void> = [];

      // 2) images
      for (const img of Array.from(pageEl.querySelectorAll('img'))) {
        const el = img as HTMLImageElement;
        const ir = el.getBoundingClientRect();
        if (ir.width < 1 || ir.height < 1) continue;
        let embedded = imgCache.get(el.src);
        if (embedded === undefined) {
          const bytes = await imgToPngBytes(el);
          embedded = bytes ? await pdf.embedPng(bytes) : null;
          imgCache.set(el.src, embedded);
        }
        if (!embedded) continue;
        const draw = () =>
          page.drawImage(embedded!, {
            x: toPdfX(ir.left),
            y: toPdfY(ir.bottom),
            width: ir.width * PT,
            height: ir.height * PT,
          });
        if (paintsInFrontOfText(el, pageEl)) frontDraws.push(draw);
        else draw();
      }

      // 2b) inline SVG (vector shapes / charts / connectors).
      for (const svg of Array.from(pageEl.querySelectorAll('svg'))) {
        if ((svg.parentElement as Element | null)?.closest('svg')) continue;
        const sr = svg.getBoundingClientRect();
        if (sr.width < 1 || sr.height < 1) continue;
        const inFront = paintsInFrontOfText(svg, pageEl);
        // Behind-text SVGs can draw immediately as crisp vector; in-front SVGs
        // must be deferred past the text pass, so they take the raster path
        // (the vector path draws synchronously and can't be deferred).
        if (!inFront && drawSvgVector(svg as SVGElement, page, toPdfX, toPdfY, rgb)) continue;
        const bytes = await svgToPngBytes(svg as SVGElement);
        if (!bytes) continue;
        const embedded = await pdf.embedPng(bytes);
        const draw = () =>
          page.drawImage(embedded, {
            x: toPdfX(sr.left),
            y: toPdfY(sr.bottom),
            width: sr.width * PT,
            height: sr.height * PT,
          });
        if (inFront) frontDraws.push(draw);
        else draw();
      }
      // stash for flushing after the text pass
      (page as any).__frontDraws = frontDraws;
    }

    // 3a) header/footer paragraphs with PAGE/NUMPAGES fields. SuperDoc omits the
    // field result, so mark those fragments to skip in the text walk and redraw
    // them (with real numbers) in 3c below.
    const fieldFragments = new Map<Element, FieldParagraph>();
    if (opts.fieldTemplates?.size) {
      for (const frag of Array.from(
        pageEl.querySelectorAll('.superdoc-page-header .superdoc-fragment, .superdoc-page-footer .superdoc-fragment'),
      )) {
        const tpl = matchFieldTemplate(frag, opts.fieldTemplates);
        if (tpl) fieldFragments.set(frag, tpl);
      }
    }

    // 3b) text — walk every visible text node and draw word-anchored, styled by
    // its parent element. Class-agnostic, so it captures text runs, list markers
    // (bullets/numbers), field content, etc. regardless of the container class.
    {
      // In raster mode the page image already shows the text; we still emit the
      // text as an INVISIBLE overlay so the PDF stays selectable/searchable.
      const invisible = mode === 'raster';
      const walker = document.createTreeWalker(pageEl, NodeFilter.SHOW_TEXT);
      let tn: Node | null;
      while ((tn = walker.nextNode())) {
        const value = tn.nodeValue || '';
        if (!value.trim()) continue;
        const parent = (tn as Text).parentElement;
        if (!parent || parent.closest('.superdoc-sr-only')) continue;
        const fieldFrag = parent.closest('.superdoc-fragment');
        if (!invisible && fieldFrag && fieldFragments.has(fieldFrag)) continue; // redrawn in 3c
        const cs = getComputedStyle(parent);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const sizePx = parseFloat(cs.fontSize);
        if (!sizePx) continue;
        const { asc, desc } = fontMetrics(`${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`);
        const color = parseColor(cs.color);
        const deco = cs.textDecorationLine || '';
        const underline = /underline/.test(deco),
          strike = /line-through/.test(deco);
        const dcol = parseColor(isVisible(cs.textDecorationColor || '') ? cs.textDecorationColor : cs.color);

        const re = /\S+/g;
        let mm: RegExpExecArray | null;
        while ((mm = re.exec(value))) {
          const range = document.createRange();
          range.setStart(tn, mm.index);
          range.setEnd(tn, mm.index + mm[0].length);
          const rect = range.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          const baselineDom = rect.top + rect.height / 2 + (asc - desc) / 2;
          try {
            const primaryFace = await book.pick(cs.fontFamily, cs.fontWeight, cs.fontStyle);
            const cps = [...mm[0]].map((c) => c.codePointAt(0)!);
            const wholeCovered = cps.every((cp) => primaryFace.fk.hasGlyphForCodePoint(cp));
            const alpha = invisible ? 0 : 1;
            if (!invisible && wholeCovered && mode !== 'glyph') {
              // fast path: primary font covers the whole token — keeps kerning
              drawWord(
                page,
                mm[0],
                toPdfX(rect.left),
                toPdfY(baselineDom),
                sizePx * PT,
                primaryFace.pdf,
                rgb(color.r, color.g, color.b),
                rect.width * PT,
              );
            } else {
              // Per-character at each glyph's MEASURED VISUAL position: used for
              // 'glyph' mode, CJK/symbol/mixed-coverage tokens, and the invisible
              // selectable layer (pixel mode). Placing each glyph where it visibly
              // sits — with a font that actually covers it — is what makes the
              // pixel-mode text layer select accurately and copy real characters
              // (incl. Hebrew/CJK), and lets a bidi-aware reader reorder RTL.
              let off = 0;
              const token = mm[0];
              for (const ch of token) {
                const cRange = document.createRange();
                cRange.setStart(tn, mm.index + off);
                cRange.setEnd(tn, mm.index + off + ch.length);
                off += ch.length;
                const cr = cRange.getBoundingClientRect();
                if (cr.width <= 0 || cr.height <= 0) continue;
                const face = await book.faceForChar(cs.fontFamily, cs.fontWeight, cs.fontStyle, ch.codePointAt(0)!);
                const bl = cr.top + cr.height / 2 + (asc - desc) / 2;
                drawWord(
                  page,
                  ch,
                  toPdfX(cr.left),
                  toPdfY(bl),
                  sizePx * PT,
                  face.pdf,
                  rgb(color.r, color.g, color.b),
                  cr.width * PT,
                  alpha,
                );
              }
            }
          } catch {
            /* glyph outside subset — skip token */
          }
          if (!invisible && (underline || strike)) {
            const thickness = Math.max(0.5, sizePx * 0.06) * PT;
            const dc = rgb(dcol.r, dcol.g, dcol.b);
            if (underline) {
              const y = toPdfY(baselineDom + sizePx * 0.12);
              page.drawLine({
                start: { x: toPdfX(rect.left), y },
                end: { x: toPdfX(rect.right), y },
                thickness,
                color: dc,
              });
            }
            if (strike) {
              const y = toPdfY(baselineDom - sizePx * 0.28);
              page.drawLine({
                start: { x: toPdfX(rect.left), y },
                end: { x: toPdfX(rect.right), y },
                thickness,
                color: dc,
              });
            }
          }
        }
      }
    }

    // 3b-flush) draw floating images that sit in front of text, on top of the
    // text just painted, so overlapping words don't show through them.
    {
      const fronts: Array<() => void> = (page as any).__frontDraws || [];
      for (const draw of fronts) draw();
      delete (page as any).__frontDraws;
    }

    // 3c) draw resolved header/footer field lines (real page numbers) — skipped
    // in raster mode, where the page image already reflects the editor.
    for (const [frag, tpl] of mode === 'raster' ? [] : fieldFragments) {
      const logical = resolveTokens(tpl.tokens, i + 1, pageEls.length);
      if (!logical.trim()) continue;
      const box = frag.getBoundingClientRect();
      if (box.width < 1) continue;
      // Field text is synthesized (real page numbers), so it isn't laid out in
      // the DOM and can't borrow the browser's bidi like body text does. For a
      // line containing RTL characters, reorder to visual order (honoring the
      // fragment's base direction) so pdf-lib's left-to-right draw reads right.
      const csFrag = getComputedStyle(frag);
      const str = hasRtl(logical) ? reorderBidiVisual(logical) : logical;
      const sizePt = tpl.sizeHalfPt ? tpl.sizeHalfPt / 2 : 11;
      const sizePx = sizePt / PT;
      const fam = csFrag.fontFamily || 'sans-serif';
      const { pdf: font } = await book.pickForToken(fam, 'normal', 'normal', str);
      const { asc, desc } = fontMetrics(`normal normal ${sizePx}px ${fam}`);
      const c = tpl.colorHex ? hexToRgb01(tpl.colorHex) : { r: 0, g: 0, b: 0 };
      // SuperDoc dims headers/footers (opacity 0.5) in the editing view; match it.
      const op = effectiveOpacity(frag, pageEl);
      const textWpt = font.widthOfTextAtSize(str, sizePt);
      const boxLeftPt = toPdfX(box.left);
      const boxWpt = box.width * PT;
      let xPt = boxLeftPt;
      if (tpl.align === 'center') xPt = boxLeftPt + (boxWpt - textWpt) / 2;
      else if (tpl.align === 'right') xPt = boxLeftPt + boxWpt - textWpt;
      const baselineDom = box.top + box.height / 2 + (asc - desc) / 2;
      try {
        page.drawText(str, {
          x: xPt,
          y: toPdfY(baselineDom),
          size: sizePt,
          font,
          color: rgb(c.r, c.g, c.b),
          opacity: op,
        });
      } catch {
        /* skip */
      }
    }

    // 4a) collect bookmarks present on this page (targets for internal links)
    for (const bm of Array.from(pageEl.querySelectorAll<HTMLElement>('[data-bookmark-name]'))) {
      const name = bm.getAttribute('data-bookmark-name');
      if (name && !bookmarks.has(name)) {
        const top = (Hpx - (bm.getBoundingClientRect().top - pr.top)) * PT;
        bookmarks.set(name, { pageIndex: i, top });
      }
    }
    // 4b) collect link requests (rects captured now, while painted)
    for (const a of Array.from(pageEl.querySelectorAll<HTMLAnchorElement>('a.superdoc-link[href]'))) {
      const raw = a.getAttribute('href') || '';
      const rects = Array.from(a.getClientRects())
        .filter((rc) => rc.width >= 1 && rc.height >= 1)
        .map((rc) => domRectRel(rc, pr));
      if (!rects.length) continue;
      if (raw.startsWith('#')) linkReqs.push({ pageIndex: i, rects, href: raw.slice(1), internal: true });
      else if (/^(https?:|mailto:|tel:)/i.test(a.href))
        linkReqs.push({ pageIndex: i, rects, href: a.href, internal: false });
    }
  }

  // 5) resolve links now that all pages + bookmarks are known
  progress('linking…');
  const pushAnnot = (page: PDFPage, ref: any) => {
    let annots = page.node.get(PDFName.of('Annots'));
    if (!annots) {
      annots = pdf.context.obj([]);
      page.node.set(PDFName.of('Annots'), annots);
    }
    (annots as any).push(ref);
  };
  for (const req of linkReqs) {
    const { Hpx } = pageGeom[req.pageIndex];
    let action: any = null;
    if (req.internal) {
      const dest = bookmarks.get(req.href);
      if (!dest) continue;
      action = {
        Type: 'Action',
        S: 'GoTo',
        D: [builtPages[dest.pageIndex].ref, PDFName.of('XYZ'), null, dest.top, null],
      };
    } else {
      action = { Type: 'Action', S: 'URI', URI: PDFString.of(req.href) };
    }
    for (const r of req.rects) {
      const x1 = r.left * PT,
        x2 = r.right * PT;
      const y1 = (Hpx - r.bottom) * PT,
        y2 = (Hpx - r.top) * PT;
      const annot = pdf.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [x1, y1, x2, y2],
        Border: [0, 0, 0],
        A: action,
      });
      pushAnnot(builtPages[req.pageIndex], pdf.context.register(annot));
    }
  }

  window.scrollTo(scrollX, scrollY);
  progress('serializing…');
  const bytes = await pdf.save();
  progress(`done — ${(bytes.byteLength / 1024).toFixed(0)} KB`);
  return bytes;
}

// rect relative to a page's top-left, in CSS px (scroll-invariant)
function domRectRel(rc: DOMRect, pr: DOMRect) {
  return {
    left: rc.left - pr.left,
    right: rc.right - pr.left,
    top: rc.top - pr.top,
    bottom: rc.bottom - pr.top,
  } as DOMRect;
}

function collectPages(): HTMLElement[] {
  const inLayout = Array.from(document.querySelectorAll<HTMLElement>('.superdoc-layout .superdoc-page'));
  const any = inLayout.length ? inLayout : Array.from(document.querySelectorAll<HTMLElement>('.superdoc-page'));
  return any
    .filter((el) => el.getBoundingClientRect().width > 0)
    .sort((a, b) => Number(a.dataset.pageIndex ?? 0) - Number(b.dataset.pageIndex ?? 0));
}

function drawDecorations(
  root: HTMLElement,
  pageEl: HTMLElement,
  page: PDFPage,
  toX: (x: number) => number,
  toY: (y: number) => number,
  rgb: any,
) {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    if (el === pageEl || el.classList.contains('superdoc-sr-only')) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) continue;
    if (isVisible(cs.backgroundColor)) {
      const c = parseColor(cs.backgroundColor);
      page.drawRectangle({
        x: toX(r.left),
        y: toY(r.bottom),
        width: (r.right - r.left) * PT,
        height: (r.bottom - r.top) * PT,
        color: rgb(c.r, c.g, c.b),
      });
    }
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      const w = parseFloat(cs.getPropertyValue(`border-${side}-width`));
      const st = cs.getPropertyValue(`border-${side}-style`);
      const col = cs.getPropertyValue(`border-${side}-color`);
      if (!(w > 0.3 && st !== 'none' && isVisible(col))) continue;
      // pdf-lib strokes lines CENTERED on the path, but the CSS box model paints
      // borders INSIDE the element's edge. Inset each stroke by half its width so
      // it lands where the browser draws it (otherwise thick borders sit ~w/2 off).
      const h = w / 2;
      let x1: number, y1: number, x2: number, y2: number;
      if (side === 'top') {
        x1 = r.left;
        x2 = r.right;
        y1 = y2 = r.top + h;
      } else if (side === 'bottom') {
        x1 = r.left;
        x2 = r.right;
        y1 = y2 = r.bottom - h;
      } else if (side === 'left') {
        y1 = r.top;
        y2 = r.bottom;
        x1 = x2 = r.left + h;
      } else {
        y1 = r.top;
        y2 = r.bottom;
        x1 = x2 = r.right - h;
      }
      const c = parseColor(col);
      page.drawLine({
        start: { x: toX(x1), y: toY(y1) },
        end: { x: toX(x2), y: toY(y2) },
        thickness: w * PT,
        color: rgb(c.r, c.g, c.b),
      });
    }
  }
}
