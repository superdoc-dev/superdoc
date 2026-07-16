/**
 * Editor-neutral paragraph-attribute normalization.
 *
 * Maps the typed style-engine `ParagraphProperties` into the visual subset
 * of `@superdoc/contracts` `ParagraphAttrs` that the v2 review adapter is
 * allowed to emit from resolved properties alone.
 *
 * Out of scope by design:
 *  - list-marker / wordLayout layout (owned by the numbering-marker resolver)
 *  - drop-cap PM-node traversal (out of scope here, lives in pm-adapter)
 *  - direction-aware logical-to-physical indent mirroring (owned by the painter)
 *
 * The mapping is intentionally narrow: features the resolver cannot
 * faithfully emit without extra context (numbering markers, drop caps,
 * cell direction context) are NOT inferred here — they remain pm-adapter
 * or downstream concerns.
 */

import type {
  BorderProperties,
  ParagraphBorders,
  ParagraphFrameProperties,
  ParagraphProperties,
  ParagraphSpacing as OoxmlParagraphSpacing,
  ParagraphTabStop,
  ShadingProperties,
} from '../ooxml/types.js';
import type {
  ParagraphAttrs,
  ParagraphBorder,
  ParagraphBorders as LayoutParagraphBorders,
  ParagraphFrame,
  ParagraphIndent,
  ParagraphShading,
  ParagraphSpacing as LayoutParagraphSpacing,
} from '@superdoc/contracts';
import { twipsToPx } from './units.js';
import { normalizeHexColor } from './colors.js';

const AUTO_SPACING_LINE_DEFAULT = 240;
const AUTO_SPACING_DEFAULT_MULTIPLIER = 1.15;

export function normalizeParagraphAttrsFromOoxml(
  props: ParagraphProperties | null | undefined,
): Partial<ParagraphAttrs> {
  if (!props) return {};
  const attrs: Partial<ParagraphAttrs> = {};

  if (props.styleId) attrs.styleId = String(props.styleId);

  const alignment = mapAlignment(props.justification);
  if (alignment) attrs.alignment = alignment;

  const spacing = mapSpacing(props.spacing, props.numberingProperties != null);
  if (spacing) attrs.spacing = spacing;

  const indent = mapIndent(props);
  if (indent) attrs.indent = indent;

  if (props.keepNext) attrs.keepNext = true;
  if (props.keepLines) attrs.keepLines = true;
  if (props.pageBreakBefore) attrs.pageBreakBefore = true;
  if (props.contextualSpacing) attrs.contextualSpacing = true;
  if (props.runProperties?.vanish === true) {
    attrs.suppressParagraphBreak = true;
  }

  const borders = mapParagraphBorders(props.borders);
  if (borders) attrs.borders = borders;

  const shading = mapParagraphShading(props.shading);
  if (shading) attrs.shading = shading;

  const tabs = mapTabStops(props.tabStops);
  if (tabs && tabs.length > 0) attrs.tabs = tabs;

  const frame = mapFrame(props.framePr);
  if (frame) attrs.frame = frame;

  if (props.numberingProperties && props.numberingProperties.numId !== 0) {
    attrs.numberingProperties = {
      ...(props.numberingProperties.numId != null ? { numId: props.numberingProperties.numId } : {}),
      ...(props.numberingProperties.ilvl != null ? { ilvl: props.numberingProperties.ilvl } : {}),
    };
  }

  return attrs;
}

function mapAlignment(value: string | undefined): ParagraphAttrs['alignment'] | undefined {
  if (value === 'left' || value === 'center' || value === 'right' || value === 'justify') return value;
  if (
    value === 'both' ||
    value === 'distribute' ||
    value === 'numTab' ||
    value === 'thaiDistribute' ||
    value === 'lowKashida' ||
    value === 'mediumKashida' ||
    value === 'highKashida'
  ) {
    return 'justify';
  }
  // start/end without explicit direction default to left.
  if (value === 'start') return 'left';
  if (value === 'end') return 'right';
  return undefined;
}

function mapSpacing(spacing: OoxmlParagraphSpacing | undefined, isList: boolean): LayoutParagraphSpacing | undefined {
  if (!spacing) return undefined;
  const out: LayoutParagraphSpacing = {};
  let before = spacing.before;
  let after = spacing.after;
  if (spacing.beforeAutospacing) {
    before = isList ? undefined : (spacing.line ?? AUTO_SPACING_LINE_DEFAULT) * AUTO_SPACING_DEFAULT_MULTIPLIER;
  }
  if (spacing.afterAutospacing) {
    after = isList ? undefined : (spacing.line ?? AUTO_SPACING_LINE_DEFAULT) * AUTO_SPACING_DEFAULT_MULTIPLIER;
  }
  if (before != null) out.before = twipsToPx(before);
  if (after != null) out.after = twipsToPx(after);
  if (spacing.line != null) {
    const rule = spacing.lineRule;
    if (rule === 'exact' || rule === 'atLeast') {
      out.line = twipsToPx(spacing.line);
      out.lineUnit = 'px';
      out.lineRule = rule;
    } else if (rule === 'auto') {
      out.line = (spacing.line * AUTO_SPACING_DEFAULT_MULTIPLIER) / AUTO_SPACING_LINE_DEFAULT;
      out.lineUnit = 'multiplier';
      out.lineRule = 'auto';
    } else {
      out.line = spacing.line / AUTO_SPACING_LINE_DEFAULT;
      out.lineUnit = 'multiplier';
    }
  }
  if (spacing.beforeAutospacing) out.beforeAutospacing = true;
  if (spacing.afterAutospacing) out.afterAutospacing = true;
  return Object.keys(out).length > 0 ? out : undefined;
}

function mapIndent(props: ParagraphProperties): ParagraphIndent | undefined {
  const indent = props.indent;
  if (!indent) return undefined;
  const out: ParagraphIndent = {};
  // Prefer physical left/right; fall back to logical start/end as LTR-default.
  // Direction-aware mirroring is owned by pm-adapter / DomPainter; we deliver
  // LTR-default physical sides so the painter's mirror path remains the
  // single source of truth.
  if (indent.left != null) out.left = twipsToPx(indent.left);
  else if (indent.start != null) out.left = twipsToPx(indent.start);
  if (indent.right != null) out.right = twipsToPx(indent.right);
  else if (indent.end != null) out.right = twipsToPx(indent.end);
  if (indent.firstLine != null) out.firstLine = twipsToPx(indent.firstLine);
  if (indent.hanging != null) out.hanging = twipsToPx(indent.hanging);
  return Object.keys(out).length > 0 ? out : undefined;
}

function mapParagraphBorders(borders: ParagraphBorders | undefined): LayoutParagraphBorders | undefined {
  if (!borders) return undefined;
  const out: LayoutParagraphBorders = {};
  for (const side of ['top', 'right', 'bottom', 'left', 'between'] as const) {
    const mapped = mapParagraphBorder(borders[side]);
    if (mapped) out[side] = mapped;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function mapParagraphBorder(border: BorderProperties | undefined): ParagraphBorder | undefined {
  if (!border) return undefined;
  const style = mapBorderStyle(border.val);
  if (style === 'none') return { style: 'none' };
  const out: ParagraphBorder = {};
  if (style) out.style = style;
  if (border.size != null) {
    const widthPx = (border.size / 8) * (96 / 72); // eighth-points -> px
    if (widthPx > 0) out.width = Math.max(0.5, Math.min(100, widthPx));
  }
  const color = normalizeHexColor(border.color);
  if (color) out.color = color;
  if (border.space != null) out.space = Math.max(0, border.space);
  return Object.keys(out).length > 0 ? out : undefined;
}

function mapBorderStyle(value: string | undefined): ParagraphBorder['style'] {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower === 'nil' || lower === 'none') return 'none';
  if (lower === 'double') return 'double';
  if (lower === 'dashed' || lower === 'dashsmallgap' || lower === 'dashlargegap') return 'dashed';
  if (lower === 'dotted' || lower === 'dot') return 'dotted';
  return 'solid';
}

function mapParagraphShading(shading: ShadingProperties | undefined): ParagraphShading | undefined {
  if (!shading) return undefined;
  const out: ParagraphShading = {};
  const fill = normalizeHexColor(shading.fill);
  if (fill) out.fill = fill;
  const color = normalizeHexColor(shading.color);
  if (color) out.color = color;
  if (shading.val) out.val = shading.val;
  if (shading.themeColor) out.themeColor = shading.themeColor;
  if (shading.themeFill) out.themeFill = shading.themeFill;
  if (shading.themeFillShade) out.themeFillShade = shading.themeFillShade;
  if (shading.themeFillTint) out.themeFillTint = shading.themeFillTint;
  if (shading.themeShade) out.themeShade = shading.themeShade;
  if (shading.themeTint) out.themeTint = shading.themeTint;
  return Object.keys(out).length > 0 ? out : undefined;
}

function mapTabStops(stops: ParagraphTabStop[] | undefined): ParagraphAttrs['tabs'] | undefined {
  if (!stops || stops.length === 0) return undefined;
  const out: NonNullable<ParagraphAttrs['tabs']> = [];
  for (const ts of stops) {
    const tab = ts.tab;
    if (!tab) continue;
    const val = mapTabVal(tab.tabType);
    if (!val) continue;
    if (tab.pos == null) continue;
    const entry: NonNullable<ParagraphAttrs['tabs']>[number] = {
      val,
      pos: tab.pos,
    };
    const leader = mapTabLeader(tab.leader);
    if (leader) entry.leader = leader;
    out.push(entry);
  }
  return out.length > 0 ? out : undefined;
}

function mapTabVal(value: string | undefined): NonNullable<ParagraphAttrs['tabs']>[number]['val'] | undefined {
  switch (value) {
    case 'start':
    case 'center':
    case 'end':
    case 'decimal':
    case 'bar':
    case 'clear':
      return value;
    case 'left':
    case 'num':
      return 'start';
    case 'right':
      return 'end';
    case 'dec':
      return 'decimal';
    default:
      return value == null ? 'start' : undefined;
  }
}

function mapTabLeader(value: string | undefined): NonNullable<ParagraphAttrs['tabs']>[number]['leader'] | undefined {
  switch (value) {
    case 'none':
    case 'dot':
    case 'hyphen':
    case 'heavy':
    case 'underscore':
    case 'middleDot':
      return value;
    case 'thick':
      return 'heavy';
    default:
      return undefined;
  }
}

function mapFrame(frame: ParagraphFrameProperties | undefined): ParagraphFrame | undefined {
  if (!frame) return undefined;
  const out: Record<string, unknown> = {};
  if (frame.wrap) out.wrap = frame.wrap;
  if (frame.x != null) out.x = twipsToPx(frame.x);
  if (frame.y != null) out.y = twipsToPx(frame.y);
  if (frame.xAlign) out.xAlign = frame.xAlign;
  if (frame.yAlign) out.yAlign = frame.yAlign;
  if (frame.hAnchor) out.hAnchor = frame.hAnchor;
  if (frame.vAnchor) out.vAnchor = frame.vAnchor;
  return Object.keys(out).length > 0 ? (out as ParagraphFrame) : undefined;
}
