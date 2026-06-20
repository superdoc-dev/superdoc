import type { GraphicPlacement } from '@superdoc/contracts';
import { isPlainObject, pickNumber, toBoolean } from './utilities.js';

const H_RELATIVE_VALUES = new Set(['column', 'page', 'margin']);
const V_RELATIVE_VALUES = new Set(['paragraph', 'page', 'margin']);
const H_ALIGN_VALUES = new Set(['left', 'center', 'right']);
const V_ALIGN_VALUES = new Set(['top', 'center', 'bottom']);

const normalizeAnchorRelative = (value: unknown, allowed: Set<string>): string | undefined => {
  if (typeof value !== 'string') return undefined;
  return allowed.has(value) ? value : undefined;
};

const normalizeAnchorAlign = (value: unknown, allowed: Set<string>): string | undefined => {
  if (typeof value !== 'string') return undefined;
  return allowed.has(value) ? value : undefined;
};

export type NormalizeGraphicAnchorInput = {
  anchorData: unknown;
  attrs: Record<string, unknown>;
  wrapBehindDoc?: boolean;
};

export const normalizeGraphicAnchor = ({
  anchorData,
  attrs,
  wrapBehindDoc,
}: NormalizeGraphicAnchorInput): GraphicPlacement | undefined => {
  const raw = isPlainObject(anchorData) ? anchorData : undefined;
  const marginOffset = isPlainObject(attrs.marginOffset) ? attrs.marginOffset : undefined;
  const simplePos = isPlainObject(attrs.simplePos) ? attrs.simplePos : undefined;
  const originalAttrs = isPlainObject(attrs.originalAttributes) ? attrs.originalAttributes : undefined;
  const isAnchored = attrs.isAnchor === true || Boolean(raw);

  const anchor: GraphicPlacement = {};
  if (isAnchored) {
    anchor.isAnchored = true;
  }

  const hRelative = normalizeAnchorRelative(raw?.hRelativeFrom, H_RELATIVE_VALUES);
  if (hRelative) anchor.hRelativeFrom = hRelative as GraphicPlacement['hRelativeFrom'];

  const vRelative = normalizeAnchorRelative(raw?.vRelativeFrom, V_RELATIVE_VALUES);
  if (vRelative) anchor.vRelativeFrom = vRelative as GraphicPlacement['vRelativeFrom'];

  const alignH = normalizeAnchorAlign(raw?.alignH, H_ALIGN_VALUES);
  if (alignH) anchor.alignH = alignH as GraphicPlacement['alignH'];

  const alignV = normalizeAnchorAlign(raw?.alignV, V_ALIGN_VALUES);
  if (alignV) anchor.alignV = alignV as GraphicPlacement['alignV'];

  const offsetH = pickNumber(marginOffset?.horizontal ?? marginOffset?.left ?? raw?.offsetH ?? simplePos?.x);
  if (offsetH != null) anchor.offsetH = offsetH;

  const offsetV = pickNumber(marginOffset?.top ?? marginOffset?.vertical ?? raw?.offsetV ?? simplePos?.y);
  if (offsetV != null) anchor.offsetV = offsetV;

  const behindDoc = toBoolean(raw?.behindDoc ?? wrapBehindDoc ?? originalAttrs?.behindDoc);
  if (behindDoc != null) anchor.behindDoc = behindDoc;

  const hasData =
    anchor.isAnchored ||
    anchor.hRelativeFrom != null ||
    anchor.vRelativeFrom != null ||
    anchor.alignH != null ||
    anchor.alignV != null ||
    anchor.offsetH != null ||
    anchor.offsetV != null ||
    anchor.behindDoc != null;

  return hasData ? anchor : undefined;
};
