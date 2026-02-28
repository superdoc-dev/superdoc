/**
 * TOC entry builder — rebuilds TOC materialized content from document headings.
 *
 * This is the core algorithm for TOC materialization and refresh.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { TocSwitchConfig } from '@superdoc/document-api';
import { getHeadingLevel } from './node-address-resolver.js';

// ---------------------------------------------------------------------------
// Heading source collection
// ---------------------------------------------------------------------------

interface HeadingSource {
  text: string;
  level: number;
  sdBlockId: string;
}

/**
 * Collects all document nodes that qualify as TOC entry sources.
 *
 * Qualification rules:
 * - \o (outlineLevels): heading nodes whose level falls within the specified range
 * - \u (useAppliedOutlineLevel): also includes paragraph nodes with explicit outlineLevel
 */
export function collectHeadingSources(doc: ProseMirrorNode, config: TocSwitchConfig): HeadingSource[] {
  const sources: HeadingSource[] = [];
  const { outlineLevels } = config.source;
  const useApplied = config.source.useAppliedOutlineLevel ?? false;

  doc.descendants((node, _pos) => {
    if (node.type.name === 'tableOfContents') return false; // skip TOC nodes themselves

    if (node.type.name === 'paragraph') {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      const paragraphProps = attrs?.paragraphProperties as Record<string, unknown> | undefined;
      const styleId = paragraphProps?.styleId as string | undefined;
      const sdBlockId = (attrs?.sdBlockId ?? attrs?.paraId) as string | undefined;
      if (!sdBlockId) return true;

      // Check if it's a heading (by style)
      const headingLevel = getHeadingLevel(styleId);
      if (headingLevel != null && outlineLevels) {
        if (headingLevel >= outlineLevels.from && headingLevel <= outlineLevels.to) {
          sources.push({ text: flattenText(node), level: headingLevel, sdBlockId });
          return false;
        }
      }

      // Check applied outline level (\u switch)
      // outlineLevel is 0-based in PM attrs; TOC levels are 1-based (same as node-info-mapper)
      if (useApplied && outlineLevels) {
        const rawOutlineLevel = paragraphProps?.outlineLevel as number | undefined;
        if (rawOutlineLevel != null) {
          const tocLevel = rawOutlineLevel + 1;
          if (tocLevel >= outlineLevels.from && tocLevel <= outlineLevels.to) {
            sources.push({ text: flattenText(node), level: tocLevel, sdBlockId });
            return false;
          }
        }
      }
    }

    return true;
  });

  return sources;
}

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
 * - Link mark with anchor pointing to source sdBlockId (when \h is set)
 * - Page number placeholder "0" (accurate page numbers require layout-engine)
 * - Separator: custom (\p switch) or default tab with dot leader
 */
export function buildTocEntryParagraphs(sources: HeadingSource[], config: TocSwitchConfig): EntryParagraphJson[] {
  return sources.map((source) => buildEntryParagraph(source, config));
}

function buildEntryParagraph(source: HeadingSource, config: TocSwitchConfig): EntryParagraphJson {
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

  // Page number (unless level is in \n exclusion range)
  const omitRange = display.omitPageNumberLevels;
  const omitPageNumber = omitRange && source.level >= omitRange.from && source.level <= omitRange.to;

  if (!omitPageNumber) {
    // Separator between entry text and page number (\p switch overrides default tab)
    if (display.separator) {
      content.push({ type: 'text', text: display.separator });
    } else {
      content.push({ type: 'tab' });
    }

    // Page number placeholder (accurate numbers require layout-engine)
    content.push({ type: 'text', text: '0' });
  }

  return {
    type: 'paragraph',
    attrs: {
      paragraphProperties: {
        styleId: `TOC${source.level}`,
      },
      sdBlockId: undefined, // will be assigned by the editor
    },
    content,
  };
}
