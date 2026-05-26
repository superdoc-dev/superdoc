/**
 * TOC entry builder — rebuilds TOC materialized content from document sources.
 *
 * Collects heading nodes AND TC field nodes based on the TOC instruction's
 * source switches, then builds materialized paragraph JSON for the TOC.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { TocSwitchConfig } from '@superdoc/document-api';
import { parseTcInstruction } from '../../core/super-converter/field-references/shared/tc-switches.js';
import { getHeadingLevel } from './node-address-resolver.js';
import { buildFallbackBlockNodeId } from './deterministic-node-id.js';
import { generateTocBookmarkName } from './toc-bookmark-sync.js';

// ---------------------------------------------------------------------------
// Source types
// ---------------------------------------------------------------------------

export interface TocSource {
  /** Flat display text for this entry (used as a fallback and for diagnostics). */
  text: string;
  /**
   * Per-text-node segments captured from the source paragraph, preserving the
   * character-level marks (bold, italic, color, font…). When present, the
   * entry builder emits one styled text node per segment so heading-level
   * formatting is reflected in the TOC. Absent for TC fields, where only a
   * plain string is available from the field instruction.
   */
  segments?: TocTextSegment[];
  /**
   * Auto-numbered marker prefix (e.g. "ARTICLE 1") resolved from the source
   * paragraph's `listRendering.markerText`. Emitted as a separate run before
   * the heading text so Word's two-run TOC1 shape is preserved on rebuild.
   * Undefined for paragraphs without auto-numbering and for TC entries.
   */
  markerText?: string;
  /** TOC level (1-based). */
  level: number;
  /**
   * sdBlockId of the source paragraph.
   * For headings: the heading paragraph's sdBlockId.
   * For TC fields: the containing paragraph's sdBlockId.
   */
  sdBlockId: string;
  /** Source type for diagnostic purposes. */
  kind: 'heading' | 'appliedOutline' | 'tcField' | 'customStyle';
  /** Whether to omit the page number for this specific entry (TC \n switch). */
  omitPageNumber?: boolean;
  /**
   * Existing `_Toc...` bookmark name on the source paragraph (when present).
   * Reused as the rebuilt entry's link anchor so the rebuild does not invent
   * synthetic bookmark names for headings/sections that Word has already
   * tagged. Undefined when no such bookmark exists yet — in that case the
   * entry builder falls back to a deterministic synthetic name.
   */
  bodyAnchor?: string;
  /**
   * Marks captured from the body source for the *title* portion of a TC
   * entry (the text after the embedded `\t`). Lets the rebuilt section row
   * inherit the bold/underline that Word applies in Heading2 paragraphs.
   * Undefined for non-TC sources.
   */
  titleMarks?: EntryTextMark[];
}

/** A run of source text with its surviving character marks. */
export interface TocTextSegment {
  text: string;
  marks?: EntryTextMark[];
}

/**
 * Marks that ARE allowed to flow from the source heading into a TOC entry.
 * Anything not on this list is dropped — the TOC mirrors a deliberately
 * narrow subset of character formatting from the heading:
 *
 * - `bold`, `italic`, `underline` — font style.
 * - `color` — font color.
 * - `highlight` — background color.
 * - `fontFamily` — font family.
 * - `textStyle` — kept ONLY for its `fontFamily` attribute; `fontSize` and
 *   any other attributes are scrubbed so heading point sizes do not bleed
 *   into the (typically smaller) TOC entry size.
 *
 * Notably excluded: `fontSize`, `link` (TOC has its own anchor), comments,
 * track-changes, strike, baseline shifts, and `tocPageNumber`.
 */
const ALLOWED_SOURCE_MARK_TYPES = new Set(['bold', 'italic', 'underline', 'color', 'highlight', 'fontFamily']);

/** Attributes preserved on a passthrough `textStyle` mark — `fontSize` is dropped. */
const TEXT_STYLE_ALLOWED_ATTRS = new Set(['fontFamily']);

/**
 * Filters and rewrites a single source mark to the form allowed on a TOC
 * entry. Returns `null` when the mark must be dropped entirely.
 */
function sanitizeSourceMark(mark: EntryTextMark): EntryTextMark | null {
  if (!mark?.type) return null;

  if (mark.type === 'textStyle') {
    const attrs = mark.attrs ?? {};
    const kept: Record<string, unknown> = {};
    for (const key of Object.keys(attrs)) {
      if (TEXT_STYLE_ALLOWED_ATTRS.has(key) && attrs[key] != null) kept[key] = attrs[key];
    }
    return Object.keys(kept).length > 0 ? { type: 'textStyle', attrs: kept } : null;
  }

  if (!ALLOWED_SOURCE_MARK_TYPES.has(mark.type)) return null;
  return mark.attrs && Object.keys(mark.attrs).length > 0
    ? { type: mark.type, attrs: { ...mark.attrs } }
    : { type: mark.type };
}

// ---------------------------------------------------------------------------
// Source collection
// ---------------------------------------------------------------------------

/** Normalises a style name/styleId for case- and whitespace-insensitive comparison. */
function normalizeStyleKey(value: string | undefined | null): string {
  return value ? value.replace(/\s+/g, '').toLowerCase() : '';
}

/**
 * Cleans up the text inside a TC entry. The field preprocessor concatenates
 * each `<w:instrText>` run with a trailing space, which leaves stray gaps
 * around tabs and before punctuation (`" Section 1.1 \tCertain Basic Terms . "`).
 * Tabs are meaningful (they separate the section number from the title) so
 * we keep them; spaces collapse to a single space and trailing space before
 * a `.` or `:` is removed.
 */
function normalizeTcEntryText(text: string): string {
  return text
    .replace(/ +\t/g, '\t')
    .replace(/\t +/g, '\t')
    .replace(/ {2,}/g, ' ')
    .replace(/ +([.,;:!?])/g, '$1')
    .trim();
}

/**
 * Pulls the rendered list-marker (e.g. "ARTICLE 1") from a paragraph's
 * `listRendering` attribute. The layout pass populates this with the resolved
 * marker text so we don't have to re-evaluate the numbering definition here.
 */
function readListMarker(node: ProseMirrorNode): string | undefined {
  const lr = (node.attrs as Record<string, unknown> | undefined)?.listRendering as
    | { markerText?: string | null }
    | null
    | undefined;
  const marker = lr?.markerText;
  if (!marker) return undefined;
  const trimmed = marker.replace(/\s+$/, '');
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Returns the last `_Toc...` bookmark name attached to the given paragraph
 * (scanning its descendants). Word emits a new TOC bookmark for each TOC
 * regeneration and tends to leave the older one in the document, so the
 * *last* one is the anchor the current TOC's hyperlinks point at.
 */
function findBodyTocAnchor(node: ProseMirrorNode): string | undefined {
  let last: string | undefined;
  node.descendants((child) => {
    if (child.type.name === 'bookmarkStart') {
      const name = (child.attrs as Record<string, unknown> | undefined)?.name as string | undefined;
      if (name?.startsWith('_Toc')) last = name;
    }
    return true;
  });
  return last;
}

/**
 * Inspects a paragraph for the character marks that should flow onto the
 * "title" portion of a TC entry (i.e. the text after the embedded `\t`).
 * Word's TC field doesn't carry character formatting in its instruction
 * string — it inherits from the body run that surrounds the title.
 * We capture the marks of the longest non-empty bold/italic/underline text
 * node to keep the title visually consistent with how Word renders it.
 */
function findTitleMarksOnParagraph(node: ProseMirrorNode): EntryTextMark[] | undefined {
  let best: { length: number; marks: EntryTextMark[] } | undefined;
  node.descendants((child) => {
    if (!child.isText || !child.text) return true;
    const captured: EntryTextMark[] = [];
    for (const mark of child.marks ?? []) {
      const raw: EntryTextMark = { type: mark.type?.name ?? '' };
      if (mark.attrs && Object.keys(mark.attrs).length > 0) raw.attrs = { ...mark.attrs };
      const sanitized = sanitizeSourceMark(raw);
      if (sanitized) captured.push(sanitized);
    }
    if (!captured.some((m) => m.type === 'bold' || m.type === 'italic' || m.type === 'underline')) return true;
    if (!best || child.text.length > best.length) best = { length: child.text.length, marks: captured };
    return true;
  });
  return best?.marks;
}

/**
 * Collects all document nodes that qualify as TOC entry sources.
 *
 * Sources are collected based on the instruction's active switches:
 * - \o (outlineLevels): heading nodes whose level falls within the range
 * - \u (useAppliedOutlineLevel): paragraph nodes with explicit outlineLevel
 * - \t (customStyles): paragraph nodes whose styleId matches a custom-style mapping
 * - \f (tcFieldIdentifier): TC field nodes with matching identifier
 * - \l (tcFieldLevels): TC field nodes within the level range
 *
 * All sources are merged into a single list sorted by document position.
 * No deduplication — TC fields and headings at the same position are both included.
 */
export function collectTocSources(doc: ProseMirrorNode, config: TocSwitchConfig): TocSource[] {
  const sources: TocSource[] = [];
  const { outlineLevels, useAppliedOutlineLevel, tcFieldIdentifier, tcFieldLevels } = config.source;
  const useApplied = useAppliedOutlineLevel ?? false;
  const collectTcFields = tcFieldIdentifier !== undefined || tcFieldLevels !== undefined;

  // Build a lookup from normalized custom-style name → TOC level. Word's \t
  // switch matches against the style *name*, but the PM document only stores
  // styleId. For built-in styles the two differ only by whitespace (e.g.
  // styleId "Heading1" vs name "Heading 1"), so normalizing both sides handles
  // the common case without needing a styles-table lookup.
  const customStyleLevels = new Map<string, number>();
  for (const mapping of config.preserved?.customStyles ?? []) {
    const key = normalizeStyleKey(mapping.styleName);
    if (key && Number.isFinite(mapping.level)) customStyleLevels.set(key, mapping.level);
  }

  // Track the current paragraph context for TC field collection
  let currentParagraphSdBlockId: string | undefined;
  let currentParagraphNode: ProseMirrorNode | undefined;

  doc.descendants((node, pos) => {
    // Skip TOC nodes themselves — don't collect entries from within a TOC
    if (node.type.name === 'tableOfContents') return false;

    if (node.type.name === 'paragraph') {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      const paragraphProps = attrs?.paragraphProperties as Record<string, unknown> | undefined;
      const styleId = paragraphProps?.styleId as string | undefined;
      // Pasted/new paragraphs intentionally lose paraId/sdBlockId (see
      // InputRule.js SUPERDOC_SLICE_PASTE_IDENTITY_RESETS). Synthesize a
      // position-based id so they still appear in the rebuilt TOC.
      const sdBlockId =
        ((attrs?.sdBlockId ?? attrs?.paraId) as string | undefined) ?? buildFallbackBlockNodeId('paragraph', pos);
      currentParagraphSdBlockId = sdBlockId;
      currentParagraphNode = node;
      if (!sdBlockId) return true;

      const text = flattenText(node);
      // Word's TOC skips heading-styled paragraphs with no visible text
      // (page-break spacers, empty stubs).
      if (text.trim().length === 0) return true;

      const markerText = readListMarker(node);
      const bodyAnchor = findBodyTocAnchor(node);
      const segments = extractTextSegments(node);

      // \o switch — heading-style level
      if (outlineLevels) {
        const headingLevel = getHeadingLevel(styleId);
        if (headingLevel != null && headingLevel >= outlineLevels.from && headingLevel <= outlineLevels.to) {
          sources.push({
            text,
            segments,
            markerText,
            level: headingLevel,
            sdBlockId,
            kind: 'heading',
            bodyAnchor,
          });
          return true; // descend so TC fields inside this paragraph are still collected
        }
      }

      // \u switch — applied paragraph outline level
      if (useApplied) {
        const effectiveLevels = outlineLevels ?? { from: 1, to: 9 };
        const rawOutlineLevel = paragraphProps?.outlineLevel as number | undefined;
        if (rawOutlineLevel != null) {
          const tocLevel = rawOutlineLevel + 1;
          if (tocLevel >= effectiveLevels.from && tocLevel <= effectiveLevels.to) {
            sources.push({
              text,
              segments,
              markerText,
              level: tocLevel,
              sdBlockId,
              kind: 'appliedOutline',
              bodyAnchor,
            });
            return true;
          }
        }
      }

      // \t switch — custom-style mapping. Falls through after \o/\u so a
      // heading-styled paragraph is preferred as a heading source.
      if (customStyleLevels.size > 0) {
        const tocLevel = customStyleLevels.get(normalizeStyleKey(styleId));
        if (tocLevel != null) {
          const effectiveLevels = outlineLevels ?? { from: 1, to: 9 };
          if (tocLevel >= effectiveLevels.from && tocLevel <= effectiveLevels.to) {
            sources.push({
              text,
              segments,
              markerText,
              level: tocLevel,
              sdBlockId,
              kind: 'customStyle',
              bodyAnchor,
            });
            return true;
          }
        }
      }

      return true;
    }

    // Collect TC field nodes (\f and/or \l switches)
    if (collectTcFields && node.type.name === 'tableOfContentsEntry' && currentParagraphSdBlockId) {
      const instruction = (node.attrs?.instruction as string) ?? '';
      const tcConfig = parseTcInstruction(instruction);

      // Filter by \f identifier
      if (tcFieldIdentifier && tcConfig.tableIdentifier !== tcFieldIdentifier) {
        return false;
      }

      // Filter by \l level range
      if (tcFieldLevels) {
        if (tcConfig.level < tcFieldLevels.from || tcConfig.level > tcFieldLevels.to) {
          return false;
        }
      }

      // The TC instruction lives inside the containing paragraph; reuse its
      // bookmark + character marks so the rebuilt entry retains the same
      // anchor and bold/underline that Word renders for the section title.
      const bodyAnchor = currentParagraphNode ? findBodyTocAnchor(currentParagraphNode) : undefined;
      const titleMarks = currentParagraphNode ? findTitleMarksOnParagraph(currentParagraphNode) : undefined;

      sources.push({
        text: normalizeTcEntryText(tcConfig.text),
        level: tcConfig.level,
        sdBlockId: currentParagraphSdBlockId,
        kind: 'tcField',
        omitPageNumber: tcConfig.omitPageNumber || undefined,
        bodyAnchor,
        titleMarks,
      });

      return false;
    }

    return true;
  });

  return sources;
}

/** @deprecated Use `collectTocSources` instead. Kept for backward compatibility. */
export const collectHeadingSources = collectTocSources;

function flattenText(node: ProseMirrorNode): string {
  let text = '';
  node.descendants((child) => {
    if (child.isText) text += child.text;
    return true;
  });
  return text;
}

/**
 * Walks the paragraph's text descendants and returns one segment per text node,
 * sanitised through `sanitizeSourceMark`. Adjacent segments with identical
 * mark sets are coalesced to keep the rebuilt content tidy.
 */
function extractTextSegments(node: ProseMirrorNode): TocTextSegment[] {
  const segments: TocTextSegment[] = [];
  node.descendants((child) => {
    if (!child.isText || !child.text) return true;
    const marks: EntryTextMark[] = [];
    for (const mark of child.marks ?? []) {
      const raw: EntryTextMark = { type: mark.type?.name ?? '' };
      if (mark.attrs && Object.keys(mark.attrs).length > 0) raw.attrs = { ...mark.attrs };
      const sanitized = sanitizeSourceMark(raw);
      if (sanitized) marks.push(sanitized);
    }
    const last = segments[segments.length - 1];
    if (last && marksEqual(last.marks, marks)) {
      last.text += child.text;
    } else {
      segments.push(marks.length > 0 ? { text: child.text, marks } : { text: child.text });
    }
    return true;
  });
  return segments;
}

function marksEqual(a: EntryTextMark[] | undefined, b: EntryTextMark[] | undefined): boolean {
  const aLen = a?.length ?? 0;
  const bLen = b?.length ?? 0;
  if (aLen !== bLen) return false;
  if (aLen === 0) return true;
  // Compare structurally — JSON.stringify is sufficient because attrs are flat
  // and the iteration order of ProseMirror marks is stable per text node.
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// Entry paragraph builder
// ---------------------------------------------------------------------------

export interface EntryParagraphJson {
  type: 'paragraph';
  attrs: Record<string, unknown>;
  content: Array<Record<string, unknown>>;
}

/** A mark in JSON form, as carried on the rebuilt TOC entry's text runs. */
export interface EntryTextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/**
 * Optional context that lets the entry builder produce final-looking output
 * (resolved page numbers, preserved tab spacing) without a follow-up
 * `mode: 'pageNumbers'` pass.
 *
 * Run-level formatting is intentionally NOT sampled from the existing TOC.
 * Word's "Update field" rebuilds entries from the linked TOC1, TOC2, …
 * paragraph styles — it does not copy direct formatting from the first entry.
 * Sampling marks from the existing TOC made any direct formatting on entry 1
 * (e.g. bold) leak into every rebuilt entry.
 */
export interface BuildTocEntryOptions {
  /** sdBlockId → page number map from PresentationEditor's last layout cycle. */
  pageMap?: Map<string, number>;
  /** Right-tab stop position (twips) to mirror the existing TOC's spacing. */
  tabPos?: number;
}

/**
 * Build TOC entry paragraphs. Each paragraph carries `pStyle="TOC{level}"`,
 * a `tocSourceId` attr pointing back to the source heading, and three runs:
 * the (linked) entry title, the tab/separator, and the page number.
 */
export function buildTocEntryParagraphs(
  sources: TocSource[],
  config: TocSwitchConfig,
  options: BuildTocEntryOptions = {},
): EntryParagraphJson[] {
  return sources.map((source) => buildEntryParagraph(source, config, options));
}

/** Default right-margin position for right-aligned tab stops (twips). ~6.5 inches. */
const DEFAULT_RIGHT_TAB_POS = 9350;

/** Maps tabLeader display config values to OOXML leader attribute values. */
const TAB_LEADER_MAP: Record<string, string> = {
  dot: 'dot',
  hyphen: 'hyphen',
  underscore: 'heavy',
  middleDot: 'middleDot',
};

/** Wrap inline children in a `run` node — the schema unit that `wrapTextInRunsPlugin` skips. */
function asRun(children: Array<Record<string, unknown>>): Record<string, unknown> {
  return { type: 'run', content: children };
}

/**
 * Builds a `pageReference` PM node mirroring what the OOXML importer emits
 * for `<w:fldChar>PAGEREF</w:fldChar>` fields — an atom with `instruction`
 * + a single result run carrying the resolved page number. Word's TOC
 * entries reference the heading via `PAGEREF <anchor> \h`; we reproduce
 * the same shape so updating the TOC keeps the field intact instead of
 * downgrading it to a plain text run with a `tocPageNumber` mark.
 */
function buildPageReferenceNode(
  anchor: string,
  resolvedPage: number | undefined,
  linkMark: EntryTextMark | undefined,
): Record<string, unknown> {
  const pageText = resolvedPage != null ? String(resolvedPage) : '0';
  const marksAsAttrs = linkMark ? [{ type: 'link', attrs: { anchor, history: true, href: `#${anchor}` } }] : [];
  return {
    type: 'pageReference',
    attrs: {
      marksAsAttrs,
      instruction: `PAGEREF ${anchor} \\h`,
    },
    content: [asRun([{ type: 'text', text: pageText }])],
  };
}

/** Builds the link mark JSON used for every text/tab node in a TOC entry. */
function buildLinkMark(anchor: string): EntryTextMark {
  return {
    type: 'link',
    attrs: {
      anchor,
      history: true,
      href: `#${anchor}`,
      rel: 'noopener noreferrer nofollow',
    },
  };
}

/** Filters source segments through the allow-list at build time. */
function sanitizeSegment(segment: TocTextSegment): EntryTextMark[] {
  return (segment.marks ?? []).map((m) => sanitizeSourceMark(m)).filter((m): m is EntryTextMark => m !== null);
}

/**
 * Marks Word's "Update field" propagates from the body source onto a TC
 * entry's title run — bold / italic / underline only. Per ECMA-376
 * §17.16.5.68 the TOC{n} paragraph style supplies typography (font family,
 * size, weight defaults); we deliberately drop `textStyle` and any colour
 * marks so the heading's Times-New-Roman text doesn't override the TOC2
 * style's theme font.
 */
const TC_TITLE_INHERITED_MARK_TYPES = new Set(['bold', 'italic', 'underline']);

function filterTitleMarks(marks: EntryTextMark[] | undefined): EntryTextMark[] {
  if (!marks) return [];
  return marks
    .map((m) => sanitizeSourceMark(m))
    .filter((m): m is EntryTextMark => m !== null && TC_TITLE_INHERITED_MARK_TYPES.has(m.type));
}

/**
 * Builds the inline content for a non-TC entry (heading / customStyle /
 * appliedOutline). When the source has an auto-numbered marker we split it
 * into a marker run + a title run so the rebuild matches the two-run shape
 * Word emits ("ARTICLE 1" + " BASIC INFORMATION").
 *
 * Per ECMA-376 §17.16.5.68, Word builds these entries by combining the
 * heading paragraph's *text* with the linked TOC{n} style's typography —
 * the heading's own character marks (bold/underline/font from Heading1,
 * etc.) are not carried into the TOC entry. We mirror that behaviour by
 * emitting plain text runs and letting the rebuilt paragraph's `styleId`
 * drive font/weight via the style cascade.
 */
function buildHeadingContent(source: TocSource, linkMark: EntryTextMark | undefined): Array<Record<string, unknown>> {
  const segments: TocTextSegment[] =
    source.segments && source.segments.length > 0 ? source.segments : [{ text: source.text || ' ' }];

  const wrapTextNode = (text: string): Record<string, unknown> => {
    const marks = linkMark ? [linkMark] : [];
    const node: Record<string, unknown> = { type: 'text', text };
    if (marks.length > 0) node.marks = marks;
    return node;
  };

  const runs: Array<Record<string, unknown>> = [];

  if (source.markerText) {
    runs.push(asRun([wrapTextNode(source.markerText)]));

    // Heading body text — prefixed by a space matching Word's separator
    // between the numbered marker and the heading text in the TOC entry.
    const headingNodes: Array<Record<string, unknown>> = [];
    let first = true;
    for (const segment of segments) {
      const text = first ? ` ${segment.text}` : segment.text;
      headingNodes.push(wrapTextNode(text || ' '));
      first = false;
    }
    runs.push(asRun(headingNodes));
  } else {
    runs.push(asRun(segments.map((segment) => wrapTextNode(segment.text || ' '))));
  }

  return runs;
}

/**
 * Builds the inline content for a TC-field entry. Word emits the TC's
 * instruction text split by an embedded tab — the part before the tab is
 * the section number ("Section 1.1") and the part after is the title
 * ("Certain Basic Terms"). We mirror that with three runs: number / tab /
 * title (with bold/underline if the surrounding Heading2 carried those
 * marks).
 */
function buildTcContent(source: TocSource, linkMark: EntryTextMark | undefined): Array<Record<string, unknown>> {
  const text = source.text ?? '';
  const tabIndex = text.indexOf('\t');
  const wrapTextNode = (value: string, marks: EntryTextMark[]): Record<string, unknown> => {
    const allMarks = linkMark ? [...marks, linkMark] : [...marks];
    const node: Record<string, unknown> = { type: 'text', text: value };
    if (allMarks.length > 0) node.marks = allMarks;
    return node;
  };
  const wrapTabNode = (): Record<string, unknown> => {
    const marks = linkMark ? [linkMark] : [];
    const node: Record<string, unknown> = { type: 'tab' };
    if (marks.length > 0) node.marks = marks;
    return node;
  };

  if (tabIndex < 0) {
    // No tab inside the TC instruction — single text run, no split.
    return [asRun([wrapTextNode(text || ' ', [])])];
  }

  const numberPart = text.slice(0, tabIndex);
  const titlePart = text.slice(tabIndex + 1);
  // Inherit only bold/italic/underline from the Heading2 body — letting the
  // body's `textStyle` (Times New Roman, etc.) flow into the TOC2 entry
  // overrides whatever font the TOC2 paragraph style would otherwise provide.
  const titleMarks = filterTitleMarks(source.titleMarks);

  const runs: Array<Record<string, unknown>> = [];
  runs.push(asRun([wrapTextNode(numberPart || ' ', [])]));
  runs.push(asRun([wrapTabNode()]));
  runs.push(asRun([wrapTextNode(titlePart || ' ', titleMarks)]));
  return runs;
}

function buildEntryParagraph(
  source: TocSource,
  config: TocSwitchConfig,
  options: BuildTocEntryOptions = {},
): EntryParagraphJson {
  const { display } = config;

  // Reuse an existing `_Toc...` body bookmark when present so navigation and
  // round-trips with Word stay aligned. Fall back to a deterministic synthetic
  // name only when the source paragraph has no TOC bookmark yet.
  const anchor = source.bodyAnchor ?? generateTocBookmarkName(source.sdBlockId);
  const linkMark: EntryTextMark | undefined = display.hyperlinks ? buildLinkMark(anchor) : undefined;

  const content: Array<Record<string, unknown>> =
    source.kind === 'tcField' ? buildTcContent(source, linkMark) : buildHeadingContent(source, linkMark);

  // Determine whether to omit page number for this entry.
  const omitRange = display.omitPageNumberLevels;
  const omitPageNumber = Boolean(
    (omitRange && source.level >= omitRange.from && source.level <= omitRange.to) || source.omitPageNumber,
  );

  if (!omitPageNumber) {
    // Tab separator before the page number — carries the link mark like the
    // surrounding text runs so the entire entry is one hyperlink target.
    const tabMarks = linkMark ? [linkMark] : [];
    const tabNode: Record<string, unknown> = { type: 'tab' };
    if (tabMarks.length > 0) tabNode.marks = tabMarks;
    content.push(asRun([tabNode]));

    // Real PAGEREF field, matching what the importer materializes for the
    // page-number column of a TOC entry.
    const resolvedPage = options.pageMap?.get(source.sdBlockId);
    content.push(buildPageReferenceNode(anchor, resolvedPage, linkMark));
  }

  const paragraphProperties: Record<string, unknown> = { styleId: `TOC${source.level}` };

  const rightAlign = display.rightAlignPageNumbers !== false; // default true
  if (rightAlign && !omitPageNumber) {
    // Word's default TOC tab leader is dots. The \p switch is only emitted
    // for a non-default separator, so an absent `tabLeader` means "use the
    // default", not "no leader". `'none'` is the explicit opt-out.
    const leader =
      display.tabLeader === 'none' ? undefined : (display.tabLeader && TAB_LEADER_MAP[display.tabLeader]) || 'dot';
    const pos = options.tabPos ?? DEFAULT_RIGHT_TAB_POS;
    const rightStop: Record<string, unknown> = { tab: { tabType: 'right', pos, ...(leader ? { leader } : {}) } };
    // TOC2+ entries in Word also carry a left tab at 1440 twips so the title
    // column lines up. TOC1 doesn't (the article number sits at the margin).
    paragraphProperties.tabStops =
      source.level >= 2 ? [{ tab: { tabType: 'left', pos: 1440 } }, rightStop] : [rightStop];
  }

  return {
    type: 'paragraph',
    attrs: {
      paragraphProperties,
      sdBlockId: undefined, // assigned by the editor on insertion
      tocSourceId: source.sdBlockId, // anchors page-number lookup to source paragraph
    },
    content,
  };
}
