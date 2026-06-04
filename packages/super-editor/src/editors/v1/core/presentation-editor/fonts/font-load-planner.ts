import { resolvePrimaryPhysicalFamily, type FontFaceRequest } from '@superdoc/font-system';
import type { FlowBlock, ParagraphBlock, TableBlock, ListBlock, Run } from '@superdoc/contracts';

/**
 * Face-aware font-load planner.
 *
 * The load gate must await the exact physical FACES the document RENDERS - family +
 * weight + style - not every family declared in the docx fontTable. Two reasons:
 *  1. `document.fonts.load('16px "Carlito"')` loads only the regular (400/normal) face,
 *     so bold/italic text would measure against the wrong face and reflow on late load.
 *  2. A docx fontTable declares many fonts that are never rendered; awaiting all of them
 *     over-fetches and (with a large pack on a slow link) causes a late-load reflow storm.
 *
 * This walks the layout input (`blocksForLayout`) - which exists BEFORE measurement and
 * already carries each run's `fontFamily` + `bold`/`italic` - and emits the deduped set of
 * physical face requests. It resolves logical -> physical with `resolvePrimaryPhysicalFamily`,
 * the SAME primary resolution measure and paint use, so the planned set cannot disagree
 * with what is actually measured/painted. Declared-font diagnostics stay separate
 * (`getDocumentFonts()` / `getReport()`); this feeds loading only.
 */

/** Anything that carries a measurable text font: a run, a list marker run, etc. */
interface FontBearing {
  fontFamily?: unknown;
  bold?: unknown;
  italic?: unknown;
}

function faceKey(req: FontFaceRequest): string {
  return `${req.family.toLowerCase()}|${req.weight}|${req.style}`;
}

/** Collect a face request from any font-bearing object into the deduped map. */
function collect(out: Map<string, FontFaceRequest>, node: FontBearing | null | undefined): void {
  if (!node || typeof node.fontFamily !== 'string' || !node.fontFamily) return;
  const family = resolvePrimaryPhysicalFamily(node.fontFamily);
  if (!family) return;
  const req: FontFaceRequest = {
    family,
    weight: node.bold === true ? '700' : '400',
    style: node.italic === true ? 'italic' : 'normal',
  };
  const key = faceKey(req);
  if (!out.has(key)) out.set(key, req);
}

function collectRuns(out: Map<string, FontFaceRequest>, runs: Run[] | undefined): void {
  if (!runs) return;
  // Duck-typed on fontFamily so every font-bearing run kind is covered (text,
  // fieldAnnotation, dropCap, ...) - missing one would silently measure against fallback.
  for (const run of runs) {
    const bearing = run as unknown as FontBearing;
    // A field annotation with no explicit font is measured against 'Arial' by the measurer
    // (its buildFontString default), so plan that face rather than skip the fontless run.
    if (run.kind === 'fieldAnnotation' && (typeof bearing.fontFamily !== 'string' || !bearing.fontFamily)) {
      collect(out, { ...bearing, fontFamily: 'Arial' });
    } else {
      collect(out, bearing);
    }
  }
}

function collectParagraph(out: Map<string, FontFaceRequest>, paragraph: ParagraphBlock | undefined): void {
  if (!paragraph) return;
  collectRuns(out, paragraph.runs);
  // The word-layout list marker glyph ("1.", "•") is measured with its OWN run font
  // (attrs.wordLayout.marker.run, used by the measurer's buildFontString), which can be a
  // different family/weight/style than the item text - so it must be planned too.
  collect(out, paragraph.attrs?.wordLayout?.marker?.run as FontBearing | undefined);
  // A drop cap is measured from attrs.dropCapDescriptor.run (measureDropCap) with its own,
  // often distinct and large, font; the cap text is moved out of `runs`, so plan it here.
  collect(out, paragraph.attrs?.dropCapDescriptor?.run as FontBearing | undefined);
}

function collectTable(out: Map<string, FontFaceRequest>, table: TableBlock): void {
  for (const row of table.rows) {
    for (const cell of row.cells) {
      collectParagraph(out, cell.paragraph);
      if (cell.blocks) for (const b of cell.blocks) collectBlock(out, b as FlowBlock);
    }
  }
}

function collectList(out: Map<string, FontFaceRequest>, list: ListBlock): void {
  for (const item of list.items) {
    // collectParagraph covers the item text AND any word-layout marker font on the
    // paragraph's attrs. The ListBlock-level `item.marker` (ListMarker) carries no font of
    // its own - that glyph is measured with the paragraph font, already collected here.
    collectParagraph(out, item.paragraph);
  }
}

function collectBlock(out: Map<string, FontFaceRequest>, block: FlowBlock): void {
  switch (block.kind) {
    case 'paragraph':
      // Via collectParagraph (not collectRuns) so a top-level paragraph's word-layout
      // marker run font is collected too, not just its text runs.
      collectParagraph(out, block);
      break;
    case 'table':
      collectTable(out, block);
      break;
    case 'list':
      collectList(out, block);
      break;
    default:
      // image/drawing/section/page/column breaks carry no measurable text font.
      break;
  }
}

/**
 * The deduped physical face requests the given layout blocks actually render. The caller
 * passes every block this render measures - body, notes, header/footer, and (in paginated
 * mode) footnotes - so each measured face is planned; this function only walks what it is
 * given.
 */
export function planRequiredFontFaces(blocks: readonly FlowBlock[] | null | undefined): FontFaceRequest[] {
  const out = new Map<string, FontFaceRequest>();
  if (blocks) for (const block of blocks) collectBlock(out, block);
  return [...out.values()];
}
