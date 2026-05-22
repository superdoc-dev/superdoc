// Browser-side extractor. Run via:
//   agent-browser eval "$(cat tools/sd-2656-footnote-analyzer/scripts/extract-page-state.js)"
//
// Output: JSON.stringify of:
//   { totalPages, pages: [{ pageIndex, footnoteReserved, bodyMaxY,
//       bodyRefs: [refIdInOrder...],           // refs anchored on this page (ordered by PM pos)
//       footnoteSlices: [{ id, fromLine, toLine, totalLines, isContinuation }],
//       separators: [{ blockId, x, y, width, height }],
//   }] }
//
// Reads from window.superdocdev.editor.presentationEditor.getLayoutSnapshot()
// + DOM-based extraction for body ref markers.
 
(() => {
  // Dev app exposes both `window.editor` (Editor) and `window.superdoc` (SuperDoc).
  // The CLAUDE.md mentions `superdocdev` for some builds — try them in order.
  const w = window;
  const ed = w.editor || w.superdocdev?.editor || w.superdoc?.activeEditor;
  if (!ed) return JSON.stringify({ error: 'no editor' });
  const pe = ed.presentationEditor || ed;
  const snap = pe?.getLayoutSnapshot?.();
  if (!snap || !snap.layout)
    return JSON.stringify({ error: 'no snapshot', hasGetLayoutSnapshot: typeof pe?.getLayoutSnapshot });

  // OOXML footnote IDs include reserved values (-1 separator, 0 continuation
  // separator, 1 endnote-or-similar). User-visible numbers start at 1 and are
  // tracked in converter.footnoteNumberById (e.g. "2" -> 1).
  const conv = ed.converter || ed.options?.converter;
  const idToNum = (conv && conv.footnoteNumberById) || {};
  const toWordNum = (sdId) => {
    const v = idToNum[String(sdId)];
    return v != null ? v : null;
  };

  // Build a map from blockId -> footnote id, by stripping "footnote-" prefix.
  // The FootnotesBuilder uses blockId of the form "footnote-<id>" or
  // "footnote-<id>-block-<n>" depending on shape (paragraph or multi-block).
  const footnoteIdFromBlockId = (blockId) => {
    if (typeof blockId !== 'string') return null;
    // Separators look like: footnote-separator-page-N-col-M or footnote-continuation-separator-page-N-col-M
    if (blockId.startsWith('footnote-separator-')) return { sep: 'first' };
    if (blockId.startsWith('footnote-continuation-separator-')) return { sep: 'continuation' };
    if (!blockId.startsWith('footnote-')) return null;
    // Try "footnote-<id>-..." form first; if not, the rest is the id.
    const rest = blockId.slice('footnote-'.length);
    // FootnotesBuilder strips "footnote-" and may have a suffix; treat the
    // first dash-separated token as the id only if multiple blocks. In practice
    // single-paragraph footnotes use blockId = "footnote-<id>" exactly.
    const dashIdx = rest.indexOf('-');
    if (dashIdx === -1) return { id: rest };
    // Multi-block case: "footnote-<id>-<n>" — split on first dash.
    return { id: rest.slice(0, dashIdx) };
  };

  // Body ref extraction: read footnoteReference nodes from the PM doc
  // (full doc, virtualization-independent) and map each to a layout page
  // via the paragraph fragment whose pmStart..pmEnd contains the ref's pos.
  const refsByPage = new Map(); // pageIndex -> [{ refId, pmPos }]
  const pmRefs = []; // ordered: { pmPos, id (footnote id) }

  // Walk PM doc for footnoteReference nodes.
  try {
    const state = ed.state || (ed.view && ed.view.state);
    if (state?.doc) {
      state.doc.descendants((node, pos) => {
        if (node.type?.name === 'footnoteReference') {
          // The footnote id is stored on attrs (commonly `id` or `footnoteId`).
          const id = node.attrs?.id ?? node.attrs?.footnoteId ?? node.attrs?.refId ?? String(pmRefs.length + 1);
          pmRefs.push({ pmPos: pos, id: String(id) });
        }
      });
    }
  } catch {
    // ignore — we'll just produce empty bodyRefs
  }

  // Build a per-page list of paragraph fragments with PM ranges (body only,
  // excluding footnote-band paragraphs).
  const fragRangesByPage = new Map(); // pi -> [{ pmStart, pmEnd }]
  for (let pi = 0; pi < snap.layout.pages.length; pi += 1) {
    const page = snap.layout.pages[pi];
    const list = [];
    (page.fragments ?? []).forEach((frag) => {
      if (frag.kind !== 'para') return;
      const bid = frag.blockId;
      if (typeof bid === 'string' && bid.startsWith('footnote-')) return;
      const pmStart = frag.pmStart;
      const pmEnd = frag.pmEnd;
      if (typeof pmStart !== 'number' || typeof pmEnd !== 'number') return;
      list.push({ pmStart, pmEnd });
    });
    fragRangesByPage.set(pi, list);
  }

  // Assign each ref to a page by finding the body fragment containing it.
  pmRefs.forEach((ref) => {
    for (let pi = 0; pi < snap.layout.pages.length; pi += 1) {
      const ranges = fragRangesByPage.get(pi) ?? [];
      const hit = ranges.find((r) => ref.pmPos >= r.pmStart && ref.pmPos <= r.pmEnd);
      if (hit) {
        const list = refsByPage.get(pi) ?? [];
        list.push({ refId: ref.id, pmPos: ref.pmPos });
        refsByPage.set(pi, list);
        return;
      }
    }
  });
  // Sort each page's refs by PM order.
  refsByPage.forEach((list) => list.sort((a, b) => a.pmPos - b.pmPos));

  // Per-page footnote slices from the layout snapshot.
  const out = { totalPages: snap.layout.pages.length, pages: [] };
  for (let pi = 0; pi < snap.layout.pages.length; pi += 1) {
    const page = snap.layout.pages[pi];
    const fragments = Array.isArray(page.fragments) ? page.fragments : [];

    // Footnote band fragments. Each para fragment whose blockId starts with
    // "footnote-" (excluding separators) represents a rendered slice of a note.
    const slices = [];
    const separators = [];
    fragments.forEach((frag) => {
      const bid = frag.blockId;
      const parsed = footnoteIdFromBlockId(bid);
      if (!parsed) return;
      if (parsed.sep) {
        separators.push({
          blockId: bid,
          kind: parsed.sep,
          x: Math.round(frag.x ?? 0),
          y: Math.round(frag.y ?? 0),
          width: Math.round(frag.width ?? 0),
          height: Math.round(frag.height ?? 0),
        });
        return;
      }
      if (frag.kind === 'para') {
        slices.push({
          id: parsed.id,
          fromLine: frag.fromLine ?? 0,
          toLine: frag.toLine ?? 0,
          continuesFromPrev: !!frag.continuesFromPrev,
          continuesOnNext: !!frag.continuesOnNext,
          y: Math.round(frag.y ?? 0),
          height: Math.round(frag.toLine - frag.fromLine || 0),
        });
      } else if (frag.kind === 'list-item') {
        slices.push({
          id: parsed.id,
          itemId: frag.itemId,
          fromLine: frag.fromLine ?? 0,
          toLine: frag.toLine ?? 0,
          continuesFromPrev: !!frag.continuesFromPrev,
          continuesOnNext: !!frag.continuesOnNext,
          y: Math.round(frag.y ?? 0),
        });
      }
    });
    // Sort slices by y for natural order.
    slices.sort((a, b) => a.y - b.y);

    const bodyRefs = (refsByPage.get(pi) ?? []).map((r) => ({
      sdId: r.refId,
      wordNum: toWordNum(r.refId),
    }));
    const slicesWithNum = slices.map((s) => ({
      ...s,
      wordNum: toWordNum(s.id),
    }));
    out.pages.push({
      pageIndex: pi,
      pageNumber: page.number ?? pi + 1,
      footnoteReserved: page.footnoteReserved ?? 0,
      bodyMaxY: page.bodyMaxY ?? null,
      pageSize: page.size ?? snap.layout.pageSize ?? null,
      margins: page.margins ?? null,
      bodyRefs,
      footnoteSlices: slicesWithNum,
      separators,
    });
  }
  out.idToNum = idToNum;
  return JSON.stringify(out);
})();
