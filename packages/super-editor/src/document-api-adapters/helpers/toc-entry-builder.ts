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

  doc.descendants((node, _pos) => {
    // Skip TOC nodes themselves — don't collect entries from within a TOC
    if (node.type.name === 'tableOfContents') return false;

    if (node.type.name === 'paragraph') {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      const paragraphProps = attrs?.paragraphProperties as Record<string, unknown> | undefined;
      const styleId = paragraphProps?.styleId as string | undefined;
      const sdBlockId = (attrs?.sdBlockId ?? attrs?.paraId) as string | undefined;

      // Update paragraph context for TC field collection
      currentParagraphSdBlockId = sdBlockId;

      if (!sdBlockId) return true;

      // Check heading by style (\o switch)
      if (outlineLevels) {
        const headingLevel = getHeadingLevel(styleId);
        if (headingLevel != null && headingLevel >= outlineLevels.from && headingLevel <= outlineLevels.to) {
          sources.push({ text: flattenText(node), level: headingLevel, sdBlockId, kind: 'heading' });
          // Continue descending to find TC fields within this paragraph
          return true;
        }
      }

      // Check applied outline level (\u switch)
      if (useApplied && outlineLevels) {
        const rawOutlineLevel = paragraphProps?.outlineLevel as number | undefined;
        if (rawOutlineLevel != null) {
          const tocLevel = rawOutlineLevel + 1;
          if (tocLevel >= outlineLevels.from && tocLevel <= outlineLevels.to) {
            sources.push({ text: flattenText(node), level: tocLevel, sdBlockId, kind: 'appliedOutline' });
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

/**
 * Builds ProseMirror-compatible paragraph JSON nodes for TOC entries.
 *
 * Each entry gets:
 * - Paragraph style: TOC{level}
 * - tocSourceId paragraph attribute (source heading/TC field's sdBlockId)
 * - Link mark with anchor pointing to source sdBlockId (when \h is set)
 * - Page number placeholder "0" with tocPageNumber mark
 * - Separator: custom (\p switch) or default tab
 */
export function buildTocEntryParagraphs(sources: TocSource[], config: TocSwitchConfig): EntryParagraphJson[] {
  return sources.map((source) => buildEntryParagraph(source, config));
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

function buildEntryParagraph(source: TocSource, config: TocSwitchConfig): EntryParagraphJson {
  const { display } = config;
  const content: Array<Record<string, unknown>> = [];

  // Entry text — optionally wrapped in hyperlink mark
  const textNode: Record<string, unknown> = {
    type: 'text',
    text: source.text || ' ',
  };

  if (display.hyperlinks) {
    textNode.marks = [
      {
        type: 'link',
        attrs: {
          anchor: source.sdBlockId,
          rId: null,
          history: true,
        },
      },
    ];
  }

  content.push(textNode);

  // Determine whether to omit page number for this entry
  const omitRange = display.omitPageNumberLevels;
  const levelOmitted = omitRange && source.level >= omitRange.from && source.level <= omitRange.to;
  const entryOmitted = source.omitPageNumber;
  const omitPageNumber = levelOmitted || entryOmitted;

  if (!omitPageNumber) {
    // Separator between entry text and page number (\p switch overrides default tab)
    if (display.separator) {
      content.push({ type: 'text', text: display.separator });
    } else {
      content.push({ type: 'tab' });
    }

    // Page number placeholder with tocPageNumber mark for surgical updates
    content.push({
      type: 'text',
      text: '0',
      marks: [{ type: 'tocPageNumber' }],
    });
  }

  // Build paragraph properties — add right-aligned tab stop when enabled
  const paragraphProperties: Record<string, unknown> = {
    styleId: `TOC${source.level}`,
  };

  const rightAlign = display.rightAlignPageNumbers !== false; // default true
  if (rightAlign && !omitPageNumber) {
    const leader =
      display.tabLeader && display.tabLeader !== 'none' ? (TAB_LEADER_MAP[display.tabLeader] ?? undefined) : undefined;
    paragraphProperties.tabStops = [
      { tab: { tabType: 'right', pos: DEFAULT_RIGHT_TAB_POS, ...(leader ? { leader } : {}) } },
    ];
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
