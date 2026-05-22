// Browser-side extractor for SD per-page content.
// Run via:
//   agent-browser eval "$(cat tools/sd-2656-footnote-analyzer/scripts/extract-sd-pages.js)"
//
// For each SD page, extract:
//   - first ~100 chars of body text (top of page)
//   - last ~100 chars of body text (bottom of page, excluding footer/band)
//   - body refs (already done by extract-page-state.js, copied here too)
//   - footer text (e.g., "Last Updated October 2025  1")
//
// Outputs JSON to console. Caller redirects to output/sd-pages.json.
 
(() => {
  const w = window;
  const ed = w.editor || w.superdocdev?.editor || w.superdoc?.activeEditor;
  if (!ed) return JSON.stringify({ error: 'no editor' });
  const pe = ed.presentationEditor || ed;
  const snap = pe?.getLayoutSnapshot?.();
  if (!snap || !snap.layout) return JSON.stringify({ error: 'no snapshot' });

  const conv = ed.converter || ed.options?.converter;
  const idToNum = (conv && conv.footnoteNumberById) || {};
  const toWordNum = (sdId) => idToNum[String(sdId)] ?? null;

  // PM-doc walk to identify body refs per page (re-use logic from extract-page-state).
  const pmRefs = [];
  try {
    const state = ed.state || (ed.view && ed.view.state);
    if (state?.doc) {
      state.doc.descendants((node, pos) => {
        if (node.type?.name === 'footnoteReference') {
          const id = node.attrs?.id ?? node.attrs?.footnoteId ?? String(pmRefs.length + 1);
          pmRefs.push({ pmPos: pos, id: String(id) });
        }
      });
    }
  } catch {
    // ignore
  }

  const refsByPage = new Map();
  for (let pi = 0; pi < snap.layout.pages.length; pi += 1) {
    const page = snap.layout.pages[pi];
    const ranges = [];
    (page.fragments ?? []).forEach((frag) => {
      if (frag.kind !== 'para') return;
      const bid = frag.blockId;
      if (typeof bid === 'string' && bid.startsWith('footnote-')) return;
      const pmStart = frag.pmStart;
      const pmEnd = frag.pmEnd;
      if (typeof pmStart !== 'number' || typeof pmEnd !== 'number') return;
      ranges.push({ pmStart, pmEnd });
    });
    refsByPage.set(pi, []);
    pmRefs.forEach((ref) => {
      const hit = ranges.find((r) => ref.pmPos >= r.pmStart && ref.pmPos <= r.pmEnd);
      if (hit) refsByPage.get(pi).push(ref);
    });
    refsByPage.get(pi).sort((a, b) => a.pmPos - b.pmPos);
  }

  // For body text extraction, we read the DOM if mounted, else from FlowBlock + measures.
  // For comprehensive coverage we need ALL pages, including unmounted. Use the layout snapshot's
  // page fragments to find which blocks are on each page, then read block text from PM doc.
  //
  // Each ParaFragment has blockId + fromLine/toLine. We can't easily slice text by line without
  // measure, so we approximate: use the first body fragment's blockId text content (first N chars
  // of that block's text) and the last body fragment's text content (last N chars).
  const blocksById = new Map();
  if (Array.isArray(snap.blocks)) {
    for (const b of snap.blocks) blocksById.set(b.id, b);
  }

  const getBlockText = (block) => {
    if (!block) return '';
    if (block.kind === 'paragraph') {
      const runs = Array.isArray(block.runs) ? block.runs : [];
      return runs.map((r) => (typeof r.text === 'string' ? r.text : '')).join('');
    }
    if (block.kind === 'list') {
      const items = Array.isArray(block.items) ? block.items : [];
      return items
        .map((it) => {
          const para = it.paragraph;
          const runs = Array.isArray(para?.runs) ? para.runs : [];
          return runs.map((r) => (typeof r.text === 'string' ? r.text : '')).join('');
        })
        .join(' ');
    }
    return '';
  };

  const out = { totalPages: snap.layout.pages.length, pages: [] };

  for (let pi = 0; pi < snap.layout.pages.length; pi += 1) {
    const page = snap.layout.pages[pi];
    const frags = Array.isArray(page.fragments) ? page.fragments : [];

    // Body fragments only (exclude footnote band).
    const bodyFrags = frags
      .filter((f) => {
        const bid = f.blockId;
        if (typeof bid !== 'string') return false;
        if (bid.startsWith('footnote-')) return false;
        return f.kind === 'para' || f.kind === 'list-item' || f.kind === 'table';
      })
      .sort((a, b) => (a.y ?? 0) - (b.y ?? 0));

    const firstBody = bodyFrags[0];
    const lastBody = bodyFrags[bodyFrags.length - 1];

    const firstBlock = firstBody ? blocksById.get(firstBody.blockId) : null;
    const lastBlock = lastBody ? blocksById.get(lastBody.blockId) : null;

    const firstText = firstBlock ? getBlockText(firstBlock).slice(0, 120) : '';
    const lastText = lastBlock ? getBlockText(lastBlock).slice(-120) : '';

    // body refs in document order
    const refs = (refsByPage.get(pi) ?? []).map((r) => ({
      sdId: r.id,
      wordNum: toWordNum(r.id),
    }));

    // Footnote slices on this page
    const fnSliceIds = new Set();
    frags.forEach((f) => {
      const bid = f.blockId;
      if (typeof bid !== 'string') return;
      if (
        !bid.startsWith('footnote-') ||
        bid.startsWith('footnote-separator-') ||
        bid.startsWith('footnote-continuation-separator-')
      )
        return;
      const rest = bid.slice('footnote-'.length);
      const dashIdx = rest.indexOf('-');
      const sdId = dashIdx === -1 ? rest : rest.slice(0, dashIdx);
      const num = toWordNum(sdId);
      if (num != null) fnSliceIds.add(num);
    });

    out.pages.push({
      pageIndex: pi,
      pageNumber: page.number ?? pi + 1,
      bodyStart: firstText.replace(/\s+/g, ' ').trim(),
      bodyEnd: lastText.replace(/\s+/g, ' ').trim(),
      bodyRefs: refs.map((r) => r.wordNum).filter((n) => n != null),
      footnoteSliceIds: [...fnSliceIds].sort((a, b) => a - b),
    });
  }

  return JSON.stringify(out);
})();
