/**
 * Pure XML-tree helpers for `templates.apply` source-authoritative adoption.
 *
 * These operate on xml-js JSON element trees (the converter's `parseXmlToJson`
 * shape) and never touch the editor/converter runtime — so they can be run on
 * clones for dry-run planning and on live parts for application.
 */

export interface XmlElement {
  type?: string;
  name?: string;
  attributes?: Record<string, string>;
  elements?: XmlElement[];
  text?: string;
  declaration?: unknown;
}

/** Local (namespace-stripped) name of an element, e.g. `w:style` -> `style`. */
export function localName(el: XmlElement): string | undefined {
  if (!el.name) return undefined;
  return el.name.includes(':') ? el.name.split(':').pop() : el.name;
}

/** Find the first descendant-or-self root element whose local name matches. */
export function rootElement(parsed: XmlElement, name: string): XmlElement | undefined {
  return parsed.elements?.find((el) => localName(el) === name);
}

/** Direct children of `el` with the given local name. */
export function childrenByLocalName(el: XmlElement, name: string): XmlElement[] {
  return (el.elements ?? []).filter((c) => localName(c) === name);
}

export function firstChildByLocalName(el: XmlElement, name: string): XmlElement | undefined {
  return (el.elements ?? []).find((c) => localName(c) === name);
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

function mergeIgnorableValues(currentValue: string | undefined, sourceValue: string | undefined): string | undefined {
  const merged = [
    ...new Set([
      ...(currentValue ?? '').split(/\s+/).filter(Boolean),
      ...(sourceValue ?? '').split(/\s+/).filter(Boolean),
    ]),
  ];
  return merged.length ? merged.join(' ') : undefined;
}

function mergeNamespaceAttributes(currentEl: XmlElement, sourceEl: XmlElement): void {
  const sourceAttrs = sourceEl.attributes ?? {};
  if (Object.keys(sourceAttrs).length === 0) return;
  const nextAttrs = { ...(currentEl.attributes ?? {}) };

  for (const [key, value] of Object.entries(sourceAttrs)) {
    if (key === 'mc:Ignorable') {
      const merged = mergeIgnorableValues(nextAttrs[key], value);
      if (merged) nextAttrs[key] = merged;
      continue;
    }
    if (key === 'xmlns' || key.startsWith('xmlns:')) {
      nextAttrs[key] = value;
    }
  }

  currentEl.attributes = nextAttrs;
}

function deepEqualValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqualValue(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a !== 'object') return false;

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!(key in bRecord)) return false;
    if (!deepEqualValue(aRecord[key], bRecord[key])) return false;
  }

  return true;
}

export function xmlDeepEqual(a: unknown, b: unknown): boolean {
  return deepEqualValue(a, b);
}

// ---------------------------------------------------------------------------
// Styles — source-authoritative overlap + docDefaults/latentStyles singletons
// ---------------------------------------------------------------------------

export interface StylesMergeResult {
  /** Shared styleIds whose target definition was replaced in place by the source. */
  replacedIds: string[];
  /** Source-only styleIds appended to the target. */
  addedIds: string[];
  /** docDefaults adopted from the source. */
  docDefaultsAdopted: boolean;
  /** latentStyles adopted from the source. */
  latentStylesAdopted: boolean;
  /** Element references (in the merged tree) for every source-origin style. */
  importedStyleEls: XmlElement[];
}

function styleId(el: XmlElement): string | undefined {
  return el.attributes?.['w:styleId'];
}

/**
 * Insert/replace a singleton child (`w:docDefaults` / `w:latentStyles`) with the
 * canonical OOXML ordering: docDefaults first, then latentStyles, then styles.
 */
function replaceSingleton(stylesEl: XmlElement, name: string, sourceNode: XmlElement | undefined): boolean {
  if (!sourceNode) return false;
  if (!stylesEl.elements) stylesEl.elements = [];
  const existingSingletons = stylesEl.elements.filter((c) => localName(c) === name);
  const existingIndex = stylesEl.elements.findIndex((c) => localName(c) === name);
  const desiredIndex =
    name === 'docDefaults' ? 0 : stylesEl.elements.some((c) => localName(c) === 'docDefaults') ? 1 : 0;
  if (
    existingSingletons.length === 1 &&
    existingIndex === desiredIndex &&
    xmlDeepEqual(existingSingletons[0], sourceNode)
  ) {
    return false;
  }

  // Remove existing singleton(s) of this name.
  stylesEl.elements = stylesEl.elements.filter((c) => localName(c) !== name);
  const next = clone(sourceNode);
  if (name === 'docDefaults') {
    stylesEl.elements.unshift(next);
    return true;
  }
  // latentStyles: after docDefaults (if any), before the first style.
  const hasDocDefaults = stylesEl.elements.some((c) => localName(c) === 'docDefaults');
  const insertAt = hasDocDefaults ? 1 : 0;
  stylesEl.elements.splice(insertAt, 0, next);
  return true;
}

/**
 * Source-authoritative style-system merge (`DA-TEMPLATE-011/012/013`).
 *
 * - Replaces the target `w:docDefaults` / `w:latentStyles` with the source.
 * - For a shared `styleId`, replaces the target style in place with the source
 *   definition (no `*-tmpl` rename).
 * - Appends source-only styles.
 * - Leaves target-only styles untouched (retained for preserved content).
 *
 * The full source style set is imported. That is a superset of the strict
 * `basedOn`/`next`/`link`/numbering closure, so every imported dependency is
 * present; importing the superset is safe because the source is authoritative.
 */
export function mergeStylesAuthoritative(currentRoot: XmlElement, sourceRoot: XmlElement): StylesMergeResult {
  const result: StylesMergeResult = {
    replacedIds: [],
    addedIds: [],
    docDefaultsAdopted: false,
    latentStylesAdopted: false,
    importedStyleEls: [],
  };

  const curStyles = rootElement(currentRoot, 'styles');
  const srcStyles = rootElement(sourceRoot, 'styles');
  if (!curStyles || !srcStyles) return result;
  mergeNamespaceAttributes(curStyles, srcStyles);
  if (!curStyles.elements) curStyles.elements = [];

  // Singletons.
  result.docDefaultsAdopted = replaceSingleton(
    curStyles,
    'docDefaults',
    firstChildByLocalName(srcStyles, 'docDefaults'),
  );
  result.latentStylesAdopted = replaceSingleton(
    curStyles,
    'latentStyles',
    firstChildByLocalName(srcStyles, 'latentStyles'),
  );

  // Index current styles by id.
  const indexById = new Map<string, number>();
  curStyles.elements.forEach((el, idx) => {
    if (localName(el) === 'style') {
      const id = styleId(el);
      if (id) indexById.set(id, idx);
    }
  });

  const srcStyleEls = childrenByLocalName(srcStyles, 'style');
  for (const srcEl of srcStyleEls) {
    const id = styleId(srcEl);
    if (!id) continue;
    const next = clone(srcEl);
    if (indexById.has(id)) {
      // Source-authoritative in-place replacement.
      const idx = indexById.get(id)!;
      curStyles.elements[idx] = next;
      result.replacedIds.push(id);
    } else {
      curStyles.elements.push(next);
      indexById.set(id, curStyles.elements.length - 1);
      result.addedIds.push(id);
    }
    result.importedStyleEls.push(next);
  }

  return result;
}

/**
 * Rewrite numbering references that live inside imported source style nodes so
 * they resolve through the reconciled numbering graph (`DA-TEMPLATE-014`). Only
 * imported (source-origin) styles are rewritten; target styles keep their own
 * numbering references.
 */
export function rewriteImportedStyleNumbering(importedStyleEls: XmlElement[], numRemap: Map<string, string>): void {
  if (numRemap.size === 0) return;
  const walk = (el: XmlElement): void => {
    if (localName(el) === 'numId') {
      const v = el.attributes?.['w:val'];
      if (v !== undefined && numRemap.has(v)) {
        el.attributes!['w:val'] = numRemap.get(v)!;
      }
    }
    if (el.elements) for (const c of el.elements) walk(c);
  };
  for (const styleEl of importedStyleEls) walk(styleEl);
}

// ---------------------------------------------------------------------------
// Numbering — dependency-graph reconciliation
// ---------------------------------------------------------------------------

export interface NumberingMergeResult {
  /** old numId -> new numId for remapped source list instances. */
  numRemap: Map<string, string>;
  /** old abstractNumId -> new abstractNumId for remapped source abstracts. */
  abstractRemap: Map<string, string>;
  /** Receipt id-mappings (numbering kind), only for entries actually remapped. */
  mappings: Array<{ kind: 'numbering'; from: string; to: string }>;
}

function numAttr(el: XmlElement, attr: string): string | undefined {
  return el.attributes?.[attr];
}

function reorderNumberingChildren(numberingEl: XmlElement): void {
  if (!numberingEl.elements) return;

  const other: XmlElement[] = [];
  const abstracts: XmlElement[] = [];
  const nums: XmlElement[] = [];

  for (const el of numberingEl.elements) {
    const ln = localName(el);
    if (ln === 'abstractNum') abstracts.push(el);
    else if (ln === 'num') nums.push(el);
    else other.push(el);
  }

  numberingEl.elements = [...other, ...abstracts, ...nums];
}

/**
 * Reconcile source numbering into the current numbering as a dependency graph.
 *
 * Imports the source `w:abstractNum` / `w:num` graph, remapping ids that collide
 * with the target's existing ids, and rewires each imported `w:num`'s
 * `w:abstractNumId` to the (possibly remapped) abstract. IDs are preserved when
 * free, remapped only on collision. Existing target definitions are retained,
 * and the merged child list is normalized so non-definition children stay ahead
 * of `w:abstractNum` / `w:num` entries.
 */
export function mergeNumberingGraph(currentRoot: XmlElement, sourceRoot: XmlElement): NumberingMergeResult {
  const result: NumberingMergeResult = { numRemap: new Map(), abstractRemap: new Map(), mappings: [] };

  const cur = rootElement(currentRoot, 'numbering');
  const src = rootElement(sourceRoot, 'numbering');
  if (!cur || !src) return result;
  mergeNamespaceAttributes(cur, src);
  if (!cur.elements) cur.elements = [];

  const usedAbstract = new Set<string>();
  const usedNum = new Set<string>();
  for (const el of cur.elements) {
    const ln = localName(el);
    if (ln === 'abstractNum') {
      const id = numAttr(el, 'w:abstractNumId');
      if (id !== undefined) usedAbstract.add(id);
    } else if (ln === 'num') {
      const id = numAttr(el, 'w:numId');
      if (id !== undefined) usedNum.add(id);
    }
  }

  const nextFree = (used: Set<string>): string => {
    let i = 1;
    while (used.has(String(i))) i++;
    const v = String(i);
    used.add(v);
    return v;
  };

  const srcAbstract = childrenByLocalName(src, 'abstractNum');
  const srcNums = childrenByLocalName(src, 'num');

  // abstractNum first (definitions), so num can rewire to them.
  for (const el of srcAbstract) {
    const id = numAttr(el, 'w:abstractNumId');
    if (id === undefined) continue;
    const next = clone(el);
    let finalId = id;
    if (usedAbstract.has(id)) {
      finalId = nextFree(usedAbstract);
      next.attributes = next.attributes ?? {};
      next.attributes['w:abstractNumId'] = finalId;
      result.mappings.push({ kind: 'numbering', from: `abstractNumId:${id}`, to: `abstractNumId:${finalId}` });
    } else {
      usedAbstract.add(id);
    }
    result.abstractRemap.set(id, finalId);
    cur.elements.push(next);
  }

  for (const el of srcNums) {
    const id = numAttr(el, 'w:numId');
    if (id === undefined) continue;
    const next = clone(el);
    // Rewire <w:abstractNumId w:val="..."/> to the (possibly remapped) abstract.
    const absRef = firstChildByLocalName(next, 'abstractNumId');
    const absVal = absRef?.attributes?.['w:val'];
    if (absRef && absVal !== undefined && result.abstractRemap.has(absVal)) {
      absRef.attributes = absRef.attributes ?? {};
      absRef.attributes['w:val'] = result.abstractRemap.get(absVal)!;
    }
    let finalId = id;
    if (usedNum.has(id)) {
      finalId = nextFree(usedNum);
      next.attributes = next.attributes ?? {};
      next.attributes['w:numId'] = finalId;
      result.numRemap.set(id, finalId);
      result.mappings.push({ kind: 'numbering', from: `numId:${id}`, to: `numId:${finalId}` });
    } else {
      usedNum.add(id);
    }
    cur.elements.push(next);
  }

  reorderNumberingChildren(cur);

  return result;
}

// ---------------------------------------------------------------------------
// Settings — bounded, layout/style-affecting reconciliation
// ---------------------------------------------------------------------------

/**
 * Local names of layout/style-affecting settings adopted from the source
 * (`DA-TEMPLATE-018`). Everything else (rsid*, docId, write-protection,
 * revision/tracking state, attachedTemplate, etc.) is preserved from the target.
 */
const LAYOUT_AFFECTING_SETTING_NAMES = new Set<string>([
  'defaultTabStop',
  'autoHyphenation',
  'consecutiveHyphenLimit',
  'hyphenationZone',
  'doNotHyphenateCaps',
  'characterSpacingControl',
  'decimalSymbol',
  'listSeparator',
  'mirrorMargins',
  'gutterAtTop',
  'bookFoldPrinting',
  'bookFoldRevPrinting',
  'bookFoldPrintingSheets',
  'evenAndOddHeaders',
  'compat',
  'themeFontLang',
  'displayBackgroundShape',
  'noPunctuationKerning',
  'kerning',
]);

export interface SettingsReconcileResult {
  adopted: string[];
  changed: boolean;
}

/**
 * Bounded settings reconciliation. Adopts the source's layout/style-affecting
 * settings into the current settings part, preserving everything identity- or
 * workflow-oriented. Mutates `currentRoot` in place.
 */
export function reconcileSettings(currentRoot: XmlElement, sourceRoot: XmlElement): SettingsReconcileResult {
  const result: SettingsReconcileResult = { adopted: [], changed: false };
  const cur = rootElement(currentRoot, 'settings');
  const src = rootElement(sourceRoot, 'settings');
  if (!cur || !src) return result;
  mergeNamespaceAttributes(cur, src);
  if (!cur.elements) cur.elements = [];

  for (const srcEl of src.elements ?? []) {
    const ln = localName(srcEl);
    if (!ln || !LAYOUT_AFFECTING_SETTING_NAMES.has(ln)) continue;
    const idx = cur.elements.findIndex((c) => localName(c) === ln);
    const next = clone(srcEl);
    if (idx >= 0) {
      if (xmlDeepEqual(cur.elements[idx], next)) continue;
      cur.elements[idx] = next;
    } else {
      cur.elements.push(next);
    }
    result.adopted.push(ln);
    result.changed = true;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Section properties — page-1 governing sectPr
// ---------------------------------------------------------------------------

/** Find the body-level (final) `w:sectPr` in a parsed `word/document.xml`. */
export function findFinalBodySectPr(documentRoot: XmlElement): XmlElement | undefined {
  const doc = rootElement(documentRoot, 'document');
  if (!doc) return undefined;
  const body = firstChildByLocalName(doc, 'body');
  if (!body) return undefined;
  // The body-level sectPr is the last direct child sectPr of w:body.
  const sectPrs = childrenByLocalName(body, 'sectPr');
  return sectPrs.length ? sectPrs[sectPrs.length - 1] : undefined;
}

function findParagraphSectPr(paragraph: XmlElement): XmlElement | undefined {
  if (localName(paragraph) !== 'p') return undefined;
  const pPr = firstChildByLocalName(paragraph, 'pPr');
  return pPr ? firstChildByLocalName(pPr, 'sectPr') : undefined;
}

function findFirstSectionBreakSectPr(node: XmlElement): XmlElement | undefined {
  const directSectPr = findParagraphSectPr(node);
  if (directSectPr) return directSectPr;

  // Ignore tracked-change containers; only the live pPr/sectPr path governs the page.
  if (localName(node) === 'pPrChange') return undefined;

  for (const child of node.elements ?? []) {
    const sectPr = findFirstSectionBreakSectPr(child);
    if (sectPr) return sectPr;
  }
  return undefined;
}

/**
 * Find the `w:sectPr` whose settings govern page 1 of the source document.
 *
 * For a multi-section DOCX, this is the first paragraph-attached section break
 * in story order. For a single-section DOCX, it falls back to the body-level
 * final `w:sectPr`. Copying that whole section preserves the source page-1
 * header/footer visibility semantics via `w:titlePg`.
 */
export function findPageOneSectPr(documentRoot: XmlElement): XmlElement | undefined {
  const doc = rootElement(documentRoot, 'document');
  if (!doc) return undefined;
  const body = firstChildByLocalName(doc, 'body');
  if (!body) return undefined;

  for (const child of body.elements ?? []) {
    if (localName(child) === 'sectPr') continue;
    const sectPr = findFirstSectionBreakSectPr(child);
    if (sectPr) return sectPr;
  }

  return findFinalBodySectPr(documentRoot);
}

/** Rewrite header/footer reference relationship ids in a sectPr clone. */
export function rewriteSectPrRefs(sectPr: XmlElement, relIdRemap: Map<string, string>): void {
  for (const el of sectPr.elements ?? []) {
    const ln = localName(el);
    if (ln === 'headerReference' || ln === 'footerReference') {
      const rid = el.attributes?.['r:id'];
      if (rid !== undefined && relIdRemap.has(rid)) {
        el.attributes!['r:id'] = relIdRemap.get(rid)!;
      }
    }
  }
}
