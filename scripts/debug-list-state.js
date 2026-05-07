/**
 * Browser-console diagnostic for list-marker drift after style switches.
 *
 * Usage:
 *   1. Reproduce the drift in the editor (e.g. decimal list → 20 items →
 *      switch to lower-alpha) so a drifting paragraph is visible on the page.
 *   2. Open the dev-tools console.
 *   3. Copy the entire contents of this file and paste into the console.
 *   4. Share the printed output.
 *
 * What it prints:
 *   - The first list paragraph found (text + numId/ilvl/abstractId).
 *   - The RAW abstract level JSON — the source of truth that
 *     `setLvlStyleOnAbstract` mutates. We want to see the actual `w:lvlJc`
 *     and `w:pPr/w:ind/w:hanging` attribute values.
 *   - The TRANSLATED abstract object — whatever shape `translatedNumbering`
 *     stores it in (so we can confirm the rebuild after mutation reflects
 *     the new lvlJc/hanging).
 *   - The paragraph's inline indent, styleId, and listRendering — to rule
 *     out stale or overriding values on the node itself.
 */
(() => {
  const ed = window.editor;
  if (!ed?.state?.doc || !ed.converter) {
    console.log('[debug-list-state] window.editor is not available');
    return;
  }
  const conv = ed.converter;

  // 1. Find the first list paragraph in the document
  let firstListPara = null;
  ed.state.doc.descendants((node, pos) => {
    if (firstListPara) return false;
    if (node.type.name !== 'paragraph') return;
    if (!node.attrs?.paragraphProperties?.numberingProperties) return;
    firstListPara = { node, pos };
    return false;
  });
  if (!firstListPara) {
    console.log('[debug-list-state] no list paragraph found');
    return;
  }
  const { node } = firstListPara;
  const np = node.attrs.paragraphProperties.numberingProperties;
  const numId = np.numId;
  const ilvl = np.ilvl ?? 0;

  // 2. Walk numId → abstractId → level element in the raw OOXML JSON tree
  const numDef = conv.numbering?.definitions?.[numId];
  const abstractIdRaw = numDef?.elements?.find((e) => e.name === 'w:abstractNumId')?.attributes?.['w:val'];
  const abstractId = abstractIdRaw != null ? Number(abstractIdRaw) : null;
  const abs = abstractId != null ? conv.numbering?.abstracts?.[abstractId] : null;
  const lvlEl = abs?.elements?.find((e) => e.name === 'w:lvl' && e.attributes?.['w:ilvl'] === String(ilvl));

  // 3. The translated form (whatever shape — log as-is)
  const transAbs = abstractId != null ? conv.translatedNumbering?.abstracts?.[abstractId] : null;

  // 3b. Dump per-paragraph state for ALL list paragraphs. Helps diagnose
  //     whether listRendering / sdBlockRev / numberingProperties were
  //     refreshed uniformly across items after a style toggle.
  const allParas = [];
  ed.state.doc.descendants((n, p) => {
    if (n.type.name !== 'paragraph') return;
    if (!n.attrs?.paragraphProperties?.numberingProperties) return;
    allParas.push({
      pos: p,
      text: n.textContent.slice(0, 16),
      numId: n.attrs?.paragraphProperties?.numberingProperties?.numId,
      ilvl: n.attrs?.paragraphProperties?.numberingProperties?.ilvl ?? 0,
      sdBlockId: n.attrs?.sdBlockId ?? null,
      sdBlockRev: n.attrs?.sdBlockRev ?? null,
      lr_markerText: n.attrs?.listRendering?.markerText ?? null,
      lr_justification: n.attrs?.listRendering?.justification ?? null,
      lr_path: n.attrs?.listRendering?.path ?? null,
      styleId: n.attrs?.paragraphProperties?.styleId ?? null,
      inlineIndent: n.attrs?.paragraphProperties?.indent ?? null,
    });
  });

  // ---- Readable, expandable groups (for skimming in dev tools) -----------
  console.group('[debug-list-state]');
  console.log('paragraph text:', node.textContent.slice(0, 24));
  console.log('numId:', numId, '| ilvl:', ilvl, '| abstractId:', abstractId);
  console.group('RAW level (source of truth my fix mutates)');
  console.log(lvlEl ? JSON.parse(JSON.stringify(lvlEl)) : '(no raw level found)');
  console.groupEnd();
  console.group('TRANSLATED abstract (whole object)');
  console.log(transAbs);
  console.groupEnd();
  console.group('paragraph state');
  console.log('paragraphProperties.indent (inline):', node.attrs?.paragraphProperties?.indent ?? '(none)');
  console.log('paragraphProperties.styleId:', node.attrs?.paragraphProperties?.styleId);
  console.log('listRendering:', node.attrs?.listRendering);
  console.groupEnd();
  console.groupEnd();

  // ---- Single stringified payload for copy-paste sharing ----------------
  // JSON.stringify can't serialize functions, BigInt, Map, etc. — fall back
  // to a string label for unsupported values so the dump never crashes.
  const safeReplacer = (_key, value) => {
    if (typeof value === 'bigint') return `[BigInt ${value}]`;
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
    if (value instanceof Map) return Object.fromEntries(value.entries());
    if (value instanceof Set) return [...value.values()];
    return value;
  };
  const payload = {
    paragraphText: node.textContent.slice(0, 64),
    numId,
    ilvl,
    abstractId,
    rawLevel: lvlEl ?? null,
    translatedAbstract: transAbs ?? null,
    paragraphState: {
      inlineIndent: node.attrs?.paragraphProperties?.indent ?? null,
      styleId: node.attrs?.paragraphProperties?.styleId ?? null,
      listRendering: node.attrs?.listRendering ?? null,
    },
    allParas,
  };
  // 4. DOM-side: measure every rendered list item's marker container, tab
  //    span, and text-start X. Drift shows up here as varying `textStartX`.
  const root = document.querySelector('.superdoc-document, .superdoc, body') ?? document.body;
  const lineRect = (el) => {
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left * 100) / 100, width: Math.round(r.width * 100) / 100 };
  };
  const items = Array.from(root.querySelectorAll('.superdoc-paragraph-marker'));
  const dom = items.map((markerEl) => {
    const container = markerEl.parentElement; // markerContainer
    const lineEl = container?.parentElement; // line containing marker + tab + text
    // tabEl is the sibling AFTER markerContainer (markerContainer was prepended
    // last, so DOM order is: markerContainer, tabEl, ...text).
    const tabEl = container?.nextElementSibling?.classList?.contains('superdoc-tab')
      ? container.nextElementSibling
      : null;
    // First inline content node after the tab (the actual text content).
    let textNode = tabEl?.nextElementSibling ?? null;
    // Skip past any zero-width helpers if present.
    while (textNode && textNode.getBoundingClientRect().width === 0) {
      textNode = textNode.nextElementSibling;
    }
    const lineMetrics = lineEl ? lineRect(lineEl) : null;
    const containerMetrics = container ? lineRect(container) : null;
    const tabMetrics = tabEl ? lineRect(tabEl) : null;
    const textMetrics = textNode ? lineRect(textNode) : null;
    return {
      marker: markerEl.textContent,
      // Computed font of the rendered marker — to compare canvas vs DOM widths.
      computedFontSize: container ? window.getComputedStyle(markerEl).fontSize : null,
      computedFontFamily: container ? window.getComputedStyle(markerEl).fontFamily : null,
      // Inline styles set by the painter.
      tabStyleWidth: tabEl?.style.width ?? null,
      containerStyleLeft: container?.style.left ?? null,
      containerStylePaddingLeft: container?.style.paddingLeft ?? null,
      // Rendered geometry (px from viewport-left of each box).
      lineLeft: lineMetrics?.left ?? null,
      containerLeft: containerMetrics?.left ?? null,
      containerWidth: containerMetrics?.width ?? null,
      tabLeft: tabMetrics?.left ?? null,
      tabWidth: tabMetrics?.width ?? null,
      textLeft: textMetrics?.left ?? null,
      // Most useful number: where text actually starts, relative to the line.
      textStartXFromLine:
        textMetrics && lineMetrics ? Math.round((textMetrics.left - lineMetrics.left) * 100) / 100 : null,
    };
  });

  console.group('[debug-list-state] DOM measurements per item');
  console.table(dom);
  console.groupEnd();

  let serialized;
  try {
    serialized = JSON.stringify({ ...payload, dom }, safeReplacer, 2);
  } catch (err) {
    serialized = `[stringify failed: ${err?.message ?? err}]`;
  }
  console.log('[debug-list-state] ===== COPY EVERYTHING BELOW =====');
  console.log(serialized);
  console.log('[debug-list-state] ===== COPY EVERYTHING ABOVE =====');
})();
