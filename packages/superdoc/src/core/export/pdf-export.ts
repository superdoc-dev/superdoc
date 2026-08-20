/**
 * Client-side DOCX -> PDF export for SuperDoc V2.
 *
 * SuperDoc's layout engine renders a pixel-accurate, paginated DOM. This module
 * treats that rendered DOM as the source of truth and redraws it into a PDF with
 * pdf-lib — no WASM, no server:
 *   - text is anchored word-by-word at the browser's measured coordinates, so
 *     positioning is WYSIWYG with the editor regardless of font-metric
 *     differences (justified / tabbed lines line up for free);
 *   - real fonts are embedded + subset (selectable text, no rasterization);
 *   - <a> links become clickable PDF annotations (external URIs + internal GoTo);
 *   - element backgrounds/borders reproduce tables, shading, rules, highlights;
 *   - images are re-encoded to PNG via canvas and embedded.
 *
 * V2 virtualizes pages (only pages near the viewport are painted), so the
 * exporter scrolls each page into view and waits for it to paint before
 * capturing it. pdf-lib + fontkit are dynamically imported so they only load
 * when an export actually runs.
 *
 * NOTE (fonts): SuperDoc loads the DOCX's embedded fonts as `FontFace` objects
 * but does not retain the bytes, and a `FontFace` cannot be read back — so the
 * exact embedded font is not recoverable at runtime. Callers therefore supply
 * embeddable font bytes via `fontBaseUrl` (a directory of Sans/Serif/Mono TTFs)
 * or `fonts` (an explicit slot->bytes map). See pdf-export-poc/FINDINGS.md.
 */
import type { PDFDocument, PDFFont, PDFPage, PDFImage } from 'pdf-lib';
import { DOM_CLASS_NAMES } from '@superdoc/dom-contract';
import type { EmbeddedFonts } from './font-extract';
import { resolveTokens, type FieldTemplates, type FieldParagraph } from './field-resolve';

const PT = 72 / 96; // CSS px @96dpi -> PDF points

/**
 * Every document DOM class the exporter reads, centralized so the coupling to
 * the painter lives in one place. `page` / `fragment` come from the public DOM
 * contract (`@superdoc/dom-contract`). The rest are painter output that is NOT
 * yet part of that contract — promoting them into `@superdoc/dom-contract` would
 * make this exporter fully contract-based and change-proof.
 */
const CLASS = {
  page: DOM_CLASS_NAMES.PAGE, // 'superdoc-page'
  fragment: DOM_CLASS_NAMES.FRAGMENT, // 'superdoc-fragment'
  // painter-internal (not in the public DOM contract yet):
  layout: 'superdoc-layout',
  textRun: 'superdoc-text-run',
  link: 'superdoc-link',
  pageHeader: 'superdoc-page-header',
  pageFooter: 'superdoc-page-footer',
  srOnly: 'superdoc-sr-only',
} as const;

type FaceKey = 'sans' | 'serif' | 'mono';
type StyleKey = 'regular' | 'bold' | 'italic' | 'bolditalic';
type FontSlot = `${FaceKey}:${StyleKey}`;

export interface PdfExportOptions {
  /** Root element to export. Defaults to the first `.superdoc-layout` (or `document`). */
  root?: HTMLElement | Document;
  /**
   * Directory URL containing `Sans-Regular.ttf`, `Sans-Bold.ttf`,
   * `Sans-Italic.ttf`, `Sans-BoldItalic.ttf`, `Serif-*.ttf`, `Mono-Regular.ttf`,
   * `Mono-Bold.ttf`. Missing serif falls back to sans.
   */
  fontBaseUrl?: string;
  /** Explicit slot -> font bytes map (overrides `fontBaseUrl` per slot). */
  fonts?: Partial<Record<FontSlot, ArrayBuffer>>;
  /**
   * Exact fonts extracted from the DOCX (family name -> variant -> bytes), used
   * for byte-exact glyphs when a run's family matches an embedded font.
   * `SuperDoc.export()` fills this in from the loaded document.
   */
  embeddedFonts?: EmbeddedFonts;
  /**
   * Header/footer paragraphs that contain PAGE/NUMPAGES fields, keyed by part
   * file (e.g. `footer1.xml`). `SuperDoc.export()` fills this in from the loaded
   * document so real page numbers can be drawn (SuperDoc omits the field result).
   */
  fieldTemplates?: FieldTemplates;
  /** Progress callback (human-readable status strings). */
  onProgress?: (message: string) => void;
  /**
   * Rendering strategy.
   *   'word' (default) — vector text, word-anchored at the browser's measured
   *     coordinates. Smallest files, crisp at any zoom, selectable text.
   *   'pixel' — pixel-exact raster sandwich: each page is rasterized by the
   *     browser's own engine (SVG <foreignObject>) and embedded as an image,
   *     with an invisible selectable-text + clickable-link overlay. The page
   *     image is pixel-identical to the editor's render (including RTL/Arabic
   *     shaping, which vector mode cannot reproduce). Larger files (~200KB/page
   *     at 2× density) and text prints as raster.
   */
  mode?: 'word' | 'pixel';
}

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function matchFieldTemplate(fragEl: Element, templates: FieldTemplates): FieldParagraph | null {
  const anchor = fragEl.getAttribute('data-source-anchor');
  if (!anchor) return null;
  let obj: { sourceRef?: { partUri?: string; xpathLikePath?: string } };
  try {
    obj = JSON.parse(anchor);
  } catch {
    return null;
  }
  const base = (obj?.sourceRef?.partUri || '').replace(/^.*\//, '');
  const paras = templates.get(base);
  if (!paras) return null;
  const ord = Number(String(obj?.sourceRef?.xpathLikePath || '').match(/ordinal=(\d+)/)?.[1] ?? '0');
  return paras.find((p) => p.ordinal === ord) ?? paras[0] ?? null;
}

const SLOTS: FontSlot[] = [
  'sans:regular',
  'sans:bold',
  'sans:italic',
  'sans:bolditalic',
  'serif:regular',
  'serif:bold',
  'serif:italic',
  'serif:bolditalic',
  'mono:regular',
  'mono:bold',
  'mono:italic',
  'mono:bolditalic',
];

function slotFile(slot: FontSlot): string {
  const [face, style] = slot.split(':') as [FaceKey, StyleKey];
  const cap = style === 'bolditalic' ? 'BoldItalic' : style[0].toUpperCase() + style.slice(1);
  const faceCap = face[0].toUpperCase() + face.slice(1);
  return `${faceCap}-${cap}.ttf`;
}

function classifyFamily(fontFamily: string): FaceKey {
  const f = fontFamily.toLowerCase();
  if (/mono|courier|consol/.test(f)) return 'mono';
  // Check sans BEFORE serif — "sans-serif" contains the substring "serif".
  if (/sans|ubuntu|arial|helvet|calibri|verdana|segoe|roboto|tahoma|inter|noto sans/.test(f)) return 'sans';
  if (/serif|times|georgia|garamond|minion|cambria|palatino|book antiqua/.test(f)) return 'serif';
  return 'sans';
}
function classifyStyle(weight: string, style: string): StyleKey {
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
interface Face {
  pdf: PDFFont;
  fk: { hasGlyphForCodePoint(cp: number): boolean };
}

const SYMBOL_FALLBACK_FILE = 'Symbol-Regular.ttf';
const SYMBOL_BOLD_FALLBACK_FILE = 'Symbol-Bold.ttf';
const CJK_FALLBACK_FILE = 'CJK-Regular.ttf';

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
    private opts: PdfExportOptions,
  ) {}

  async preload(): Promise<void> {
    for (const slot of SLOTS) {
      const explicit = this.opts.fonts?.[slot];
      if (explicit) {
        this.bytes.set(slot, explicit);
        continue;
      }
      if (this.opts.fontBaseUrl) {
        const url = `${this.opts.fontBaseUrl.replace(/\/$/, '')}/${slotFile(slot)}`;
        try {
          const r = await fetch(url);
          if (r.ok) this.bytes.set(slot, await r.arrayBuffer());
        } catch {
          /* fall back below */
        }
      }
    }
    if (this.opts.fontBaseUrl) {
      const base = this.opts.fontBaseUrl.replace(/\/$/, '');
      for (const [key, file] of [
        ['symbol', SYMBOL_FALLBACK_FILE],
        ['symbol-bold', SYMBOL_BOLD_FALLBACK_FILE],
      ] as const) {
        try {
          const r = await fetch(`${base}/${file}`);
          if (r.ok) this.bytes.set(key, await r.arrayBuffer());
        } catch {
          /* no symbol fallback available */
        }
      }
    }
    // serif falls back to sans; any missing slot falls back to sans:regular
    for (const slot of SLOTS) {
      if (this.bytes.has(slot)) continue;
      const [, style] = slot.split(':') as [FaceKey, StyleKey];
      const fallback = this.bytes.get(`sans:${style}`) ?? this.bytes.get('sans:regular');
      if (fallback) this.bytes.set(slot, fallback);
    }
    if (!this.bytes.get('sans:regular')) {
      throw new Error(
        'PDF export needs embeddable fonts: pass `fontBaseUrl` (a dir of TTFs) or `fonts` in the pdf export options.',
      );
    }
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
    const embBytes = this.opts.embeddedFonts?.[family]?.[variant];
    if (embBytes) {
      const ab = embBytes.buffer.slice(embBytes.byteOffset, embBytes.byteOffset + embBytes.byteLength) as ArrayBuffer;
      return this.embed(`emb:${family}:${variant}`, ab);
    }
    // 2) bundled open substitute, classified by family shape + variant
    const slot = `${classifyFamily(fontFamily)}:${variant}` as FontSlot;
    const buf = this.bytes.get(slot) ?? this.bytes.get('sans:regular')!;
    return this.embed(slot, buf);
  }

  /** Symbol / geometric-shape / Hebrew fallback face (DejaVu Sans). Weight-aware:
   * bold runs (e.g. bold Hebrew, which no bundled Latin face covers) get the bold
   * fallback so the weight survives, falling back to regular if it's missing. */
  private async symbol(bold = false): Promise<Face | null> {
    if (bold) {
      if (this.symbolBoldFace) return this.symbolBoldFace;
      const bbuf = this.bytes.get('symbol-bold');
      if (bbuf) {
        this.symbolBoldFace = await this.embed('symbol-bold', bbuf);
        return this.symbolBoldFace;
      }
      // fall through to the regular face
    }
    if (this.symbolFace) return this.symbolFace;
    const buf = this.bytes.get('symbol');
    if (!buf) return null;
    this.symbolFace = await this.embed('symbol', buf);
    return this.symbolFace;
  }

  /** CJK fallback face (Han + kana), fetched lazily from fontBaseUrl the first
   * time a CJK glyph is encountered (the font is large). */
  private async cjk(): Promise<Face | null> {
    if (this.cjkFace) return this.cjkFace;
    if (this.cjkTried || !this.opts.fontBaseUrl) return null;
    this.cjkTried = true;
    try {
      const r = await fetch(`${this.opts.fontBaseUrl.replace(/\/$/, '')}/${CJK_FALLBACK_FILE}`);
      if (!r.ok) return null;
      this.cjkFace = await this.embed('cjk', await r.arrayBuffer());
      return this.cjkFace;
    } catch {
      return null;
    }
  }

  /** Pick the face to draw `token` with: primary, else the first fallback
   * (symbol → CJK) that covers every code point in the token. */
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

// --- baseline metrics via canvas ---
let metricCtx: CanvasRenderingContext2D | null = null;
const metricCache = new Map<string, { asc: number; desc: number }>();
function fontMetrics(cssFont: string) {
  const hit = metricCache.get(cssFont);
  if (hit) return hit;
  if (!metricCtx) metricCtx = document.createElement('canvas').getContext('2d');
  metricCtx!.font = cssFont;
  const m = metricCtx!.measureText('Hg');
  const out = {
    asc: m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? 0,
    desc: m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent ?? 0,
  };
  metricCache.set(cssFont, out);
  return out;
}

function parseColor(c: string): { r: number; g: number; b: number } {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return { r: 0, g: 0, b: 0 };
  const [r, g, b] = m[1].split(',').map((x) => parseFloat(x));
  return { r: r / 255, g: g / 255, b: b / 255 };
}

// Parse an SVG paint value (hex / rgb() / basic name) to 0..1 RGB, or null.
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
    if (el.getAttribute('rx') || el.getAttribute('ry')) return null;
    const x = n('x'),
      y = n('y'),
      w = n('width'),
      h = n('height');
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
  return null;
}

/** Draw an inline SVG as true vector paths. Returns false (→ rasterize) when the
 * SVG uses features we don't translate (gradients, filters, arcs, transforms…). */
function drawSvgVector(
  svg: SVGElement,
  page: PDFPage,
  toX: (x: number) => number,
  toY: (y: number) => number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  const vw = vb[2];
  const vh = vb[3];
  const sr = svg.getBoundingClientRect();
  const drawables = Array.from(svg.querySelectorAll('path, rect, line, polygon, polyline'));
  if (
    !drawables.length ||
    drawables.length !== svg.querySelectorAll('path,rect,circle,ellipse,line,polygon,polyline').length
  ) {
    return false;
  }
  // `drawSvgPath` supports only a single uniform scale. If the viewBox→screen
  // scale differs on x vs y (e.g. a footnote separator: 100×100 viewBox rendered
  // 312×1), a uniform scale would distort the path — fall back to rasterizing,
  // which reproduces the element at its exact rendered size.
  const scaleX = sr.width / vw;
  const scaleY = sr.height / vh;
  if (Math.abs(scaleX - scaleY) > 0.02 * Math.max(scaleX, scaleY)) return false;
  const scale = scaleX * PT;
  const originXpt = toX(sr.left);
  const originYpt = toY(sr.top);
  for (const el of drawables) {
    const d = svgElToPathData(el);
    if (!d) return false;
    const cs = getComputedStyle(el);
    const fill = svgPaint(el.getAttribute('fill') ?? (el.hasAttribute('fill') ? cs.fill : cs.fill));
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

/** Uniform scale applied to the layout by the editor's zoom (via CSS transform). */
function detectLayoutScale(pageEl: HTMLElement): number {
  const layout = pageEl.closest(`.${CLASS.layout}`) ?? pageEl;
  const t = getComputedStyle(layout as Element).transform;
  if (!t || t === 'none') return 1;
  const m = t.match(/matrix\(([^)]+)\)/);
  if (!m) return 1;
  const a = parseFloat(m[1].split(',')[0]);
  return Number.isFinite(a) && a > 0 ? a : 1;
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
  } catch {
    return null;
  }
}

// Rasterize an inline SVG (vector shapes, charts, connectors) to PNG bytes so it
// can be embedded — SuperDoc paints drawings as inline SVG, which pdf-lib can't
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
  } catch {
    return null;
  }
}

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

/**
 * Reorder a logical-order string to VISUAL order for an RTL base line, so it can
 * be drawn left-to-right by pdf-lib and still read correctly. This is a level-1
 * bidi reorder (sufficient for footer fields like "עמוד 1 מתוך 2"): reverse the
 * whole line, then restore the internal left-to-right order of embedded
 * Latin/number runs. Hebrew needs no cursive shaping so simple reversal is
 * exact; Arabic would additionally need glyph shaping we don't have (use
 * `mode: 'pixel'` for exact Arabic).
 */
function reorderRtlVisual(str: string): string {
  const isLtr = (ch: string) => {
    const cp = ch.codePointAt(0)!;
    return (
      (cp >= 0x0030 && cp <= 0x0039) || // digits
      (cp >= 0x0041 && cp <= 0x005a) || // A-Z
      (cp >= 0x0061 && cp <= 0x007a) || // a-z
      (cp >= 0x00c0 && cp <= 0x024f) // Latin-1 supplement + extended
    );
  };
  const chars = [...str].reverse();
  let i = 0;
  while (i < chars.length) {
    if (isLtr(chars[i])) {
      let j = i + 1;
      // extend across an LTR run, allowing single interior spaces between LTR chars
      while (j < chars.length && (isLtr(chars[j]) || (chars[j] === ' ' && j + 1 < chars.length && isLtr(chars[j + 1]))))
        j++;
      const seg = chars.slice(i, j).reverse();
      for (let k = 0; k < seg.length; k++) chars[i + k] = seg[k];
      i = j;
    } else {
      i++;
    }
  }
  return chars.join('');
}

/**
 * Does this element paint ON TOP of the page's normal-flow text? A floating
 * DOCX image ("in front of text") is rendered as an absolutely/fixed-positioned
 * fragment with an auto or non-negative z-index, so the browser paints it above
 * the in-flow paragraph text it overlaps. The exporter must reproduce that
 * stacking: such images are drawn AFTER the text pass, otherwise overlapping
 * text bleeds through them and the image looks semi-transparent. Images behind
 * the text (negative z-index) and ordinary inline images draw before text.
 */
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

/**
 * Rasterize a page element to a PNG of the browser's OWN rendering by cloning it
 * into an SVG <foreignObject> and drawing that to a canvas. Unlike a
 * re-implemented renderer (e.g. html2canvas), the SVG image is painted by the
 * same layout+paint pipeline as the live page, so the output is pixel-identical
 * to the editor (measured 100.00% on the calibre + Hebrew fixtures). One catch:
 * fonts SuperDoc registers via the FontFace API are invisible to an isolated SVG
 * image, so the DOCX's embedded fonts are re-declared inside the SVG as data-URI
 * @font-face rules under both their plain and synthetic
 * `__superdoc_embedded_N__` family names.
 */
async function pageToPixelPng(pageEl: HTMLElement, embedded: EmbeddedFonts, scale = 2): Promise<Uint8Array | null> {
  try {
    const pr = pageEl.getBoundingClientRect();
    const W = Math.round(pr.width);
    const H = Math.round(pr.height);

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
    console.warn('[superdoc] PDF export: foreignObject page capture failed', e);
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
      pageEl.querySelector(`.${CLASS.textRun}, img, .${CLASS.fragment}`)
    ) {
      return;
    }
  }
}

function collectPages(root: HTMLElement | Document): HTMLElement[] {
  const scoped = root instanceof Document ? root : root;
  const inLayout = Array.from(scoped.querySelectorAll<HTMLElement>(`.${CLASS.layout} .${CLASS.page}`));
  const pages = inLayout.length ? inLayout : Array.from(scoped.querySelectorAll<HTMLElement>(`.${CLASS.page}`));
  return pages
    .filter((el) => el.getBoundingClientRect().width > 0)
    .sort((a, b) => Number(a.dataset.pageIndex ?? 0) - Number(b.dataset.pageIndex ?? 0));
}

/** Export the currently-rendered SuperDoc V2 pages to PDF bytes. */
export async function exportEditorPagesToPdf(options: PdfExportOptions = {}): Promise<Uint8Array> {
  const progress = options.onProgress ?? (() => {});
  const mode = options.mode ?? 'word';
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

  const root = options.root ?? document;
  const pageEls = collectPages(root);
  if (!pageEls.length) throw new Error('SuperDoc PDF export: no rendered .superdoc-page elements found.');

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const book = new FontBook(pdf, fontkit, options);
  await book.preload();

  // The editor applies zoom as a CSS transform on `.superdoc-layout`, which
  // scales getBoundingClientRect(). Measurements are only correct at 100% zoom;
  // SuperDoc.export() resets zoom for the duration of the export. Warn if a
  // direct caller left the editor zoomed.
  if (Math.abs(detectLayoutScale(pageEls[0]) - 1) > 0.001) {
    console.warn(
      '[superdoc] PDF export: editor is zoomed; reset zoom to 100% before exporting for correct page sizing.',
    );
  }

  const imgCache = new Map<string, PDFImage | null>();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  const bookmarks = new Map<string, { pageIndex: number; top: number }>();
  interface LinkReq {
    pageIndex: number;
    rects: Array<{ left: number; right: number; top: number; bottom: number }>;
    href: string;
    internal: boolean;
  }
  const linkReqs: LinkReq[] = [];
  const builtPages: PDFPage[] = [];
  const pageGeom: Array<{ Hpx: number }> = [];

  for (let i = 0; i < pageEls.length; i++) {
    const pageEl = pageEls[i];
    progress(`rendering page ${i + 1}/${pageEls.length}…`);
    await ensurePainted(pageEl);

    const pr = pageEl.getBoundingClientRect();
    const Hpx = pr.height;
    const page = pdf.addPage([pr.width * PT, Hpx * PT]);
    builtPages.push(page);
    pageGeom.push({ Hpx });

    const toX = (domX: number) => (domX - pr.left) * PT;
    const toY = (domY: number) => (Hpx - (domY - pr.top)) * PT;

    // Floating images that paint in front of text are deferred and drawn AFTER
    // the text pass (3b) so overlapping text does not bleed through them (see
    // paintsInFrontOfText). Only used in 'word' mode.
    const frontDraws: Array<() => void> = [];

    if (mode === 'pixel') {
      // pixel-exact raster sandwich: the page is rasterized by the browser's OWN
      // engine (SVG <foreignObject>), so the embedded image is pixel-identical
      // to what the editor paints. Text + links are added as an invisible
      // overlay below (3b) for selection/search/clicking.
      const png = await pageToPixelPng(pageEl, options.embeddedFonts ?? {}, 2);
      if (png) {
        const bg = await pdf.embedPng(png);
        page.drawImage(bg, { x: 0, y: 0, width: pr.width * PT, height: Hpx * PT });
      }
    } else {
      // 1) backgrounds + borders
      for (const el of Array.from(pageEl.querySelectorAll<HTMLElement>('*'))) {
        if (el === pageEl || el.classList.contains(CLASS.srOnly)) continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width < 0.5 || r.height < 0.5) continue;
        if (isVisible(cs.backgroundColor)) {
          const c = parseColor(cs.backgroundColor);
          page.drawRectangle({
            x: toX(r.left),
            y: toY(r.bottom),
            width: r.width * PT,
            height: r.height * PT,
            color: rgb(c.r, c.g, c.b),
          });
        }
        for (const side of ['top', 'bottom', 'left', 'right'] as const) {
          const w = parseFloat(cs.getPropertyValue(`border-${side}-width`));
          const st = cs.getPropertyValue(`border-${side}-style`);
          const col = cs.getPropertyValue(`border-${side}-color`);
          if (!(w > 0.3 && st !== 'none' && isVisible(col))) continue;
          // pdf-lib strokes lines CENTERED on the path, but the CSS box model
          // paints borders INSIDE the element's edge. Inset each stroke by half
          // its width so it lands exactly where the browser draws it.
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

      // 2) images
      for (const imgEl of Array.from(pageEl.querySelectorAll('img'))) {
        const img = imgEl as HTMLImageElement;
        const ir = img.getBoundingClientRect();
        if (ir.width < 1 || ir.height < 1) continue;
        let embedded = imgCache.get(img.src);
        if (embedded === undefined) {
          const bytes = await imgToPngBytes(img);
          embedded = bytes ? await pdf.embedPng(bytes) : null;
          imgCache.set(img.src, embedded);
        }
        if (!embedded) continue;
        const fixed = embedded;
        const draw = () =>
          page.drawImage(fixed, { x: toX(ir.left), y: toY(ir.bottom), width: ir.width * PT, height: ir.height * PT });
        if (paintsInFrontOfText(img, pageEl)) frontDraws.push(draw);
        else draw();
      }

      // 2b) inline SVG (vector shapes / charts / connectors): true-vector when we
      // can translate the paths, otherwise rasterize + embed. In-front SVGs must
      // be deferred past the text pass, so they take the raster path (the vector
      // path draws synchronously and can't be deferred).
      for (const svg of Array.from(pageEl.querySelectorAll('svg'))) {
        if ((svg.parentElement as Element | null)?.closest('svg')) continue;
        const sr = svg.getBoundingClientRect();
        if (sr.width < 1 || sr.height < 1) continue;
        const inFront = paintsInFrontOfText(svg, pageEl);
        if (!inFront && drawSvgVector(svg as SVGElement, page, toX, toY, rgb)) continue;
        const bytes = await svgToPngBytes(svg as SVGElement);
        if (!bytes) continue;
        const embedded = await pdf.embedPng(bytes);
        const draw = () =>
          page.drawImage(embedded, {
            x: toX(sr.left),
            y: toY(sr.bottom),
            width: sr.width * PT,
            height: sr.height * PT,
          });
        if (inFront) frontDraws.push(draw);
        else draw();
      }
    }

    // 3a) header/footer paragraphs with PAGE/NUMPAGES fields. SuperDoc omits the
    // field result, so mark those fragments to skip in the text walk and redraw
    // them (with real numbers) in 3c below.
    const fieldFragments = new Map<Element, FieldParagraph>();
    if (options.fieldTemplates?.size) {
      for (const frag of Array.from(
        pageEl.querySelectorAll(`.${CLASS.pageHeader} .${CLASS.fragment}, .${CLASS.pageFooter} .${CLASS.fragment}`),
      )) {
        const tpl = matchFieldTemplate(frag, options.fieldTemplates);
        if (tpl) fieldFragments.set(frag, tpl);
      }
    }

    // 3b) text — walk every visible text node and draw word-anchored, styled by
    // its parent element. Class-agnostic, so it captures text runs, list markers
    // (bullets/numbers), field content, etc. regardless of the container class.
    // In 'pixel' mode the page image already shows the text; the same walk still
    // runs but emits an INVISIBLE overlay so the PDF stays selectable/searchable.
    {
      const invisible = mode === 'pixel';
      const walker = document.createTreeWalker(pageEl, NodeFilter.SHOW_TEXT);
      let tn: Node | null;
      while ((tn = walker.nextNode())) {
        const value = tn.nodeValue || '';
        if (!value.trim()) continue;
        const parent = (tn as Text).parentElement;
        if (!parent || parent.closest(`.${CLASS.srOnly}`)) continue;
        const ownerFrag = parent.closest(`.${CLASS.fragment}`);
        if (!invisible && ownerFrag && fieldFragments.has(ownerFrag)) continue; // redrawn in 3c
        const cs = getComputedStyle(parent);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const sizePx = parseFloat(cs.fontSize);
        if (!sizePx) continue;
        const { asc, desc } = fontMetrics(`${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`);
        const color = parseColor(cs.color);
        const deco = cs.textDecorationLine || '';
        const underline = /underline/.test(deco);
        const strike = /line-through/.test(deco);
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
            if (!invisible && wholeCovered) {
              // fast path: primary font covers the whole token — keeps kerning
              drawWord(
                page,
                mm[0],
                toX(rect.left),
                toY(baselineDom),
                sizePx * PT,
                primaryFace.pdf,
                rgb(color.r, color.g, color.b),
                rect.width * PT,
              );
            } else {
              // Per-character at each glyph's MEASURED VISUAL position: the
              // fallback path for CJK/symbols/mixed scripts, AND the invisible
              // selectable layer (pixel mode). Placing each glyph where it
              // visibly sits, with a font that actually covers it, is what makes
              // the pixel-mode text layer select accurately and copy real
              // characters (incl. Hebrew/CJK) — the primary font alone would
              // embed uncovered glyphs as .notdef with no ToUnicode, so RTL/CJK
              // text would copy out as nothing.
              let off = 0;
              for (const ch of mm[0]) {
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
                  toX(cr.left),
                  toY(bl),
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
              const y = toY(baselineDom + sizePx * 0.12);
              page.drawLine({ start: { x: toX(rect.left), y }, end: { x: toX(rect.right), y }, thickness, color: dc });
            }
            if (strike) {
              const y = toY(baselineDom - sizePx * 0.28);
              page.drawLine({ start: { x: toX(rect.left), y }, end: { x: toX(rect.right), y }, thickness, color: dc });
            }
          }
        }
      }
    }

    // 3b-flush) draw floating images that sit in front of text, on top of the
    // text just painted, so overlapping words don't show through them.
    for (const draw of frontDraws) draw();

    // 3c) draw resolved header/footer field lines (real page numbers) — skipped
    // in pixel mode, where the page image already reflects the editor.
    for (const [frag, tpl] of mode === 'pixel' ? new Map<Element, FieldParagraph>() : fieldFragments) {
      const logical = resolveTokens(tpl.tokens, i + 1, pageEls.length);
      if (!logical.trim()) continue;
      const box = frag.getBoundingClientRect();
      if (box.width < 1) continue;
      // Field text is synthesized (real page numbers), so it isn't laid out in
      // the DOM and can't borrow the browser's bidi like body text does. For an
      // RTL field line (e.g. Hebrew "עמוד 1 מתוך 2") reorder to visual order so
      // pdf-lib's left-to-right draw reads correctly.
      const rtlField = getComputedStyle(frag).direction === 'rtl' || hasRtl(logical);
      const str = rtlField ? reorderRtlVisual(logical) : logical;
      const sizePt = tpl.sizeHalfPt ? tpl.sizeHalfPt / 2 : 11;
      const sizePx = sizePt / PT;
      const fam = getComputedStyle(frag).fontFamily || 'sans-serif';
      const { pdf: font } = await book.pickForToken(fam, 'normal', 'normal', str);
      const { asc, desc } = fontMetrics(`normal normal ${sizePx}px ${fam}`);
      const c = tpl.colorHex ? hexToRgb01(tpl.colorHex) : { r: 0, g: 0, b: 0 };
      const textWpt = font.widthOfTextAtSize(str, sizePt);
      const boxLeftPt = toX(box.left);
      const boxWpt = box.width * PT;
      let xPt = boxLeftPt;
      if (tpl.align === 'center') xPt = boxLeftPt + (boxWpt - textWpt) / 2;
      else if (tpl.align === 'right') xPt = boxLeftPt + boxWpt - textWpt;
      const baselineDom = box.top + box.height / 2 + (asc - desc) / 2;
      try {
        page.drawText(str, { x: xPt, y: toY(baselineDom), size: sizePt, font, color: rgb(c.r, c.g, c.b) });
      } catch {
        /* skip */
      }
    }

    // 4) collect bookmark targets + link requests (rects captured while painted)
    for (const bm of Array.from(pageEl.querySelectorAll<HTMLElement>('[data-bookmark-name]'))) {
      const name = bm.getAttribute('data-bookmark-name');
      if (name && !bookmarks.has(name)) {
        const top = (Hpx - (bm.getBoundingClientRect().top - pr.top)) * PT;
        bookmarks.set(name, { pageIndex: i, top });
      }
    }
    for (const a of Array.from(pageEl.querySelectorAll<HTMLAnchorElement>(`a.${CLASS.link}[href]`))) {
      const rawHref = a.getAttribute('href') || '';
      const rects = Array.from(a.getClientRects())
        .filter((rc) => rc.width >= 1 && rc.height >= 1)
        .map((rc) => ({
          left: rc.left - pr.left,
          right: rc.right - pr.left,
          top: rc.top - pr.top,
          bottom: rc.bottom - pr.top,
        }));
      if (!rects.length) continue;
      if (rawHref.startsWith('#')) linkReqs.push({ pageIndex: i, rects, href: rawHref.slice(1), internal: true });
      else if (/^(https?:|mailto:|tel:)/i.test(a.href))
        linkReqs.push({ pageIndex: i, rects, href: a.href, internal: false });
    }
  }

  // 5) resolve links now that all pages + bookmarks are known
  progress('linking…');
  const pushAnnot = (page: PDFPage, ref: unknown) => {
    let annots = page.node.get(PDFName.of('Annots')) as { push?: (r: unknown) => void } | undefined;
    if (!annots) {
      annots = pdf.context.obj([]) as never;
      page.node.set(PDFName.of('Annots'), annots as never);
    }
    annots.push?.(ref);
  };
  for (const req of linkReqs) {
    const { Hpx } = pageGeom[req.pageIndex];
    let action: unknown;
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
      const annot = pdf.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [r.left * PT, (Hpx - r.bottom) * PT, r.right * PT, (Hpx - r.top) * PT],
        Border: [0, 0, 0],
        A: action as never,
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
