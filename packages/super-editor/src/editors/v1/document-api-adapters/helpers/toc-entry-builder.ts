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
  /** Display text for this entry. */
  text: string;
  /** TOC level (1-based). */
  level: number;
  /**
   * sdBlockId of the source paragraph.
   * For headings: the heading paragraph's sdBlockId.
   * For TC fields: the containing paragraph's sdBlockId.
   */
  sdBlockId: string;
  /** Source type for diagnostic purposes. */
  kind: 'heading' | 'appliedOutline' | 'tcField';
  /** Whether to omit the page number for this specific entry (TC \n switch). */
  omitPageNumber?: boolean;
}

// ---------------------------------------------------------------------------
// Source collection
// ---------------------------------------------------------------------------

/**
 * Collects all document nodes that qualify as TOC entry sources.
 *
 * Sources are collected based on the instruction's active switches:
 * - \o (outlineLevels): heading nodes whose level falls within the range
 * - \u (useAppliedOutlineLevel): paragraph nodes with explicit outlineLevel
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

  // Track the current paragraph context for TC field collection
  let currentParagraphSdBlockId: string | undefined;

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
      if (!sdBlockId) return true;

      const text = flattenText(node);
      // Word's TOC skips heading-styled paragraphs with no visible text
      // (page-break spacers, empty stubs).
      if (text.trim().length === 0) return true;

      // \o switch — heading-style level
      if (outlineLevels) {
        const headingLevel = getHeadingLevel(styleId);
        if (headingLevel != null && headingLevel >= outlineLevels.from && headingLevel <= outlineLevels.to) {
          sources.push({ text, level: headingLevel, sdBlockId, kind: 'heading' });
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
            sources.push({ text, level: tocLevel, sdBlockId, kind: 'appliedOutline' });
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

      sources.push({
        text: tcConfig.text,
        level: tcConfig.level,
        sdBlockId: currentParagraphSdBlockId,
        kind: 'tcField',
        omitPageNumber: tcConfig.omitPageNumber || undefined,
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
 * (resolved page numbers, preserved tab spacing, sampled font/size marks)
 * without a follow-up `mode: 'pageNumbers'` pass.
 */
export interface BuildTocEntryOptions {
  /** sdBlockId → page number map from PresentationEditor's last layout cycle. */
  pageMap?: Map<string, number>;
  /** Right-tab stop position (twips) to mirror the existing TOC's spacing. */
  tabPos?: number;
  /** Marks sampled from the existing TOC entry text. `link` is filtered out and rebuilt. */
  entryTextMarks?: EntryTextMark[];
  /**
   * Paragraph-level `<w:rPr>` overrides sampled from the existing entry. Word
   * stamps these on TOC entries (e.g. `bold: false`, `italic: false`) to
   * disable the TOC1 paragraph style's `<w:b/><w:i/>`. Preserving them keeps
   * the rebuilt entries visually identical to the imported ones.
   */
  paragraphRunProperties?: Record<string, unknown>;
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

function buildEntryParagraph(
  source: TocSource,
  config: TocSwitchConfig,
  options: BuildTocEntryOptions = {},
): EntryParagraphJson {
  const { display } = config;

  // Title text. Marks are stacked: sampled (font/size/textStyle/bold/italic)
  // first, link last. Wrapped in a `run` so `wrapTextInRunsPlugin` does not
  // re-wrap and merge the TOC1 paragraph style's run properties via addToSet,
  // which would clobber the sampled `textStyle` mark.
  const titleMarks: EntryTextMark[] = (options.entryTextMarks ?? []).filter(
    (mark) => mark?.type && mark.type !== 'link',
  );
  if (display.hyperlinks) {
    titleMarks.push({
      type: 'link',
      attrs: { anchor: generateTocBookmarkName(source.sdBlockId), rId: null, history: true },
    });
  }
  const titleText: Record<string, unknown> = { type: 'text', text: source.text || ' ' };
  if (titleMarks.length > 0) titleText.marks = titleMarks;

  const content: Array<Record<string, unknown>> = [asRun([titleText])];

  // Determine whether to omit page number for this entry.
  const omitRange = display.omitPageNumberLevels;
  const omitPageNumber = Boolean(
    (omitRange && source.level >= omitRange.from && source.level <= omitRange.to) || source.omitPageNumber,
  );

  if (!omitPageNumber) {
    // Separator: custom \p text or default tab.
    content.push(asRun([display.separator ? { type: 'text', text: display.separator } : { type: 'tab' }]));

    // Page number — resolved from the page map when available; '0' placeholder
    // otherwise (e.g. freshly-pasted heading whose synthetic id hasn't been
    // seen by a layout cycle yet).
    const resolvedPage = options.pageMap?.get(source.sdBlockId);
    content.push(
      asRun([
        {
          type: 'text',
          text: resolvedPage != null ? String(resolvedPage) : '0',
          marks: [{ type: 'tocPageNumber' }],
        },
      ]),
    );
  }

  const paragraphProperties: Record<string, unknown> = { styleId: `TOC${source.level}` };
  if (options.paragraphRunProperties && Object.keys(options.paragraphRunProperties).length > 0) {
    paragraphProperties.runProperties = { ...options.paragraphRunProperties };
  }

  const rightAlign = display.rightAlignPageNumbers !== false; // default true
  if (rightAlign && !omitPageNumber) {
    // Word's default TOC tab leader is dots. The \p switch is only emitted
    // for a non-default separator, so an absent `tabLeader` means "use the
    // default", not "no leader". `'none'` is the explicit opt-out.
    const leader =
      display.tabLeader === 'none' ? undefined : (display.tabLeader && TAB_LEADER_MAP[display.tabLeader]) || 'dot';
    const pos = options.tabPos ?? DEFAULT_RIGHT_TAB_POS;
    paragraphProperties.tabStops = [{ tab: { tabType: 'right', pos, ...(leader ? { leader } : {}) } }];
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
