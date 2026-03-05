import type {
  SectionBorderSpec,
  SectionBreakType,
  SectionColumns,
  SectionDirection,
  SectionHeaderFooterKind,
  SectionHeaderFooterRefs,
  SectionHeaderFooterVariant,
  SectionLineNumbering,
  SectionLineNumberRestart,
  SectionOrientation,
  SectionPageBorders,
  SectionPageMargins,
  SectionPageNumbering,
  SectionPageNumberingFormat,
  SectionPageSetup,
  SectionVerticalAlign,
} from '@superdoc/document-api';
import { inchesToTwips, twipsToInches } from '../../core/super-converter/helpers.js';

export interface XmlElement {
  type?: string;
  name: string;
  attributes?: Record<string, string | number | boolean>;
  elements?: XmlElement[];
}

const LINE_NUMBER_RESTART_VALUES: readonly SectionLineNumberRestart[] = [
  'continuous',
  'newPage',
  'newSection',
] as const;
const PAGE_NUMBER_FORMAT_VALUES: readonly SectionPageNumberingFormat[] = [
  'decimal',
  'lowerLetter',
  'upperLetter',
  'lowerRoman',
  'upperRoman',
  'numberInDash',
] as const;
const SECTION_ORIENTATION_VALUES: readonly SectionOrientation[] = ['portrait', 'landscape'] as const;
const SECTION_VERTICAL_ALIGN_VALUES: readonly SectionVerticalAlign[] = ['top', 'center', 'bottom', 'both'] as const;

function toNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toPositiveInteger(value: unknown): number | undefined {
  const parsed = toNumber(value);
  if (parsed == null || !Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function toNonNegativeNumber(value: unknown): number | undefined {
  const parsed = toNumber(value);
  if (parsed == null || parsed < 0) return undefined;
  return parsed;
}

function toInchesFromTwips(value: unknown): number | undefined {
  const twips = toNumber(value);
  if (twips == null) return undefined;
  return twipsToInches(twips);
}

function toTwipsString(valueInches: number): string {
  return String(inchesToTwips(valueInches));
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function setStringAttr(element: XmlElement, key: string, value: unknown): void {
  if (!element.attributes) element.attributes = {};
  if (value === undefined || value === null) {
    delete element.attributes[key];
    return;
  }
  element.attributes[key] = String(value);
}

function setBooleanAttr(element: XmlElement, key: string, value: boolean | undefined): void {
  if (value === undefined) return;
  setStringAttr(element, key, value ? '1' : '0');
}

function toBooleanAttr(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = String(value).toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'off') return false;
  return undefined;
}

function isKnownValue<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function ensureElements(element: XmlElement): XmlElement[] {
  if (!Array.isArray(element.elements)) element.elements = [];
  return element.elements;
}

export function cloneXmlElement<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isSectPrElement(value: unknown): value is XmlElement {
  return Boolean(value && typeof value === 'object' && (value as XmlElement).name === 'w:sectPr');
}

export function createSectPrElement(): XmlElement {
  return { type: 'element', name: 'w:sectPr', elements: [] };
}

export function ensureSectPrElement(current: unknown): XmlElement {
  if (isSectPrElement(current)) return cloneXmlElement(current);
  return createSectPrElement();
}

export function findChild(element: XmlElement, childName: string): XmlElement | undefined {
  return element.elements?.find((entry) => entry?.name === childName);
}

export function ensureChild(element: XmlElement, childName: string): XmlElement {
  const existing = findChild(element, childName);
  if (existing) return existing;

  const created: XmlElement = { type: 'element', name: childName, attributes: {}, elements: [] };
  ensureElements(element).push(created);
  return created;
}

export function removeChildren(
  element: XmlElement,
  predicate: (entry: XmlElement) => boolean,
): { removed: boolean; element: XmlElement } {
  if (!Array.isArray(element.elements) || element.elements.length === 0) return { removed: false, element };
  const kept = element.elements.filter((entry) => !predicate(entry));
  const removed = kept.length !== element.elements.length;
  element.elements = kept;
  return { removed, element };
}

function sectionRefElementName(kind: SectionHeaderFooterKind): 'w:headerReference' | 'w:footerReference' {
  return kind === 'header' ? 'w:headerReference' : 'w:footerReference';
}

function toRefVariant(value: unknown): SectionHeaderFooterVariant | undefined {
  return isKnownValue(value, ['default', 'first', 'even'] as const) ? value : undefined;
}

function toPageBorderDisplay(value: unknown): SectionPageBorders['display'] {
  return isKnownValue(value, ['allPages', 'firstPage', 'notFirstPage'] as const) ? value : undefined;
}

function toPageBorderOffsetFrom(value: unknown): SectionPageBorders['offsetFrom'] {
  return isKnownValue(value, ['page', 'text'] as const) ? value : undefined;
}

function toPageBorderZOrder(value: unknown): SectionPageBorders['zOrder'] {
  return isKnownValue(value, ['front', 'back'] as const) ? value : undefined;
}

export function readSectPrBreakType(sectPr: XmlElement): SectionBreakType | undefined {
  const typeNode = findChild(sectPr, 'w:type');
  const value = asString(typeNode?.attributes?.['w:val']);
  return isKnownValue(value, ['continuous', 'nextPage', 'evenPage', 'oddPage'] as const) ? value : undefined;
}

export function writeSectPrBreakType(sectPr: XmlElement, breakType: SectionBreakType): void {
  const typeNode = ensureChild(sectPr, 'w:type');
  setStringAttr(typeNode, 'w:val', breakType);
}

export function readSectPrMargins(sectPr: XmlElement): SectionPageMargins & { header?: number; footer?: number } {
  const pgMar = findChild(sectPr, 'w:pgMar');
  if (!pgMar) return {};

  return {
    top: toInchesFromTwips(pgMar.attributes?.['w:top']),
    right: toInchesFromTwips(pgMar.attributes?.['w:right']),
    bottom: toInchesFromTwips(pgMar.attributes?.['w:bottom']),
    left: toInchesFromTwips(pgMar.attributes?.['w:left']),
    gutter: toInchesFromTwips(pgMar.attributes?.['w:gutter']),
    header: toInchesFromTwips(pgMar.attributes?.['w:header']),
    footer: toInchesFromTwips(pgMar.attributes?.['w:footer']),
  };
}

export function writeSectPrPageMargins(sectPr: XmlElement, margins: SectionPageMargins): void {
  const pgMar = ensureChild(sectPr, 'w:pgMar');
  if (margins.top !== undefined) setStringAttr(pgMar, 'w:top', toTwipsString(margins.top));
  if (margins.right !== undefined) setStringAttr(pgMar, 'w:right', toTwipsString(margins.right));
  if (margins.bottom !== undefined) setStringAttr(pgMar, 'w:bottom', toTwipsString(margins.bottom));
  if (margins.left !== undefined) setStringAttr(pgMar, 'w:left', toTwipsString(margins.left));
  if (margins.gutter !== undefined) setStringAttr(pgMar, 'w:gutter', toTwipsString(margins.gutter));
}

export function writeSectPrHeaderFooterMargins(
  sectPr: XmlElement,
  margins: { header?: number; footer?: number },
): void {
  const pgMar = ensureChild(sectPr, 'w:pgMar');
  if (margins.header !== undefined) setStringAttr(pgMar, 'w:header', toTwipsString(margins.header));
  if (margins.footer !== undefined) setStringAttr(pgMar, 'w:footer', toTwipsString(margins.footer));
}

export function readSectPrPageSetup(sectPr: XmlElement): SectionPageSetup | undefined {
  const pgSz = findChild(sectPr, 'w:pgSz');
  if (!pgSz) return undefined;

  const width = toInchesFromTwips(pgSz.attributes?.['w:w']);
  const height = toInchesFromTwips(pgSz.attributes?.['w:h']);
  const orientationRaw = asString(pgSz.attributes?.['w:orient']);
  const orientation = isKnownValue(orientationRaw, SECTION_ORIENTATION_VALUES) ? orientationRaw : undefined;
  const paperSize = asString(pgSz.attributes?.['w:code']);

  if (width == null && height == null && orientation == null && paperSize == null) return undefined;
  return { width, height, orientation, paperSize };
}

export function writeSectPrPageSetup(sectPr: XmlElement, setup: SectionPageSetup): void {
  const pgSz = ensureChild(sectPr, 'w:pgSz');
  if (setup.width !== undefined) setStringAttr(pgSz, 'w:w', toTwipsString(setup.width));
  if (setup.height !== undefined) setStringAttr(pgSz, 'w:h', toTwipsString(setup.height));
  if (setup.orientation !== undefined) setStringAttr(pgSz, 'w:orient', setup.orientation);
  if (setup.paperSize !== undefined) setStringAttr(pgSz, 'w:code', setup.paperSize);

  // Keep page geometry consistent with orientation when dimensions are known.
  // Word and the layout engine primarily honor w:w / w:h for page geometry.
  // If orientation flips without swapping these values, the visible page can remain unchanged.
  if (setup.orientation !== undefined) {
    const widthTwips = toNumber(pgSz.attributes?.['w:w']);
    const heightTwips = toNumber(pgSz.attributes?.['w:h']);
    if (widthTwips == null || heightTwips == null) return;

    const isLandscapeDimensions = widthTwips > heightTwips;
    const wantsLandscape = setup.orientation === 'landscape';
    if (isLandscapeDimensions === wantsLandscape) return;

    setStringAttr(pgSz, 'w:w', String(heightTwips));
    setStringAttr(pgSz, 'w:h', String(widthTwips));
  }
}

export function readSectPrColumns(sectPr: XmlElement): SectionColumns | undefined {
  const cols = findChild(sectPr, 'w:cols');
  if (!cols) return undefined;

  const count = toPositiveInteger(cols.attributes?.['w:num']);
  const gap = toInchesFromTwips(cols.attributes?.['w:space']);
  const equalWidth = toBooleanAttr(cols.attributes?.['w:equalWidth']);
  if (count == null && gap == null && equalWidth == null) return undefined;
  return { count, gap, equalWidth };
}

export function writeSectPrColumns(sectPr: XmlElement, columns: SectionColumns): void {
  const cols = ensureChild(sectPr, 'w:cols');
  if (columns.count !== undefined) setStringAttr(cols, 'w:num', columns.count);
  if (columns.gap !== undefined) setStringAttr(cols, 'w:space', toTwipsString(columns.gap));
  if (columns.equalWidth !== undefined) setBooleanAttr(cols, 'w:equalWidth', columns.equalWidth);
}

export function readSectPrLineNumbering(sectPr: XmlElement): SectionLineNumbering | undefined {
  const lnNumType = findChild(sectPr, 'w:lnNumType');
  if (!lnNumType) return undefined;

  const restartRaw = asString(lnNumType.attributes?.['w:restart']);
  const restart = isKnownValue(restartRaw, LINE_NUMBER_RESTART_VALUES) ? restartRaw : undefined;

  return {
    enabled: true,
    countBy: toPositiveInteger(lnNumType.attributes?.['w:countBy']),
    start: toPositiveInteger(lnNumType.attributes?.['w:start']),
    distance: toInchesFromTwips(lnNumType.attributes?.['w:distance']),
    restart,
  };
}

export function writeSectPrLineNumbering(sectPr: XmlElement, numbering: SectionLineNumbering): void {
  if (!numbering.enabled) {
    removeChildren(sectPr, (entry) => entry.name === 'w:lnNumType');
    return;
  }

  const lnNumType = ensureChild(sectPr, 'w:lnNumType');
  if (numbering.countBy !== undefined) setStringAttr(lnNumType, 'w:countBy', numbering.countBy);
  if (numbering.start !== undefined) setStringAttr(lnNumType, 'w:start', numbering.start);
  if (numbering.distance !== undefined) setStringAttr(lnNumType, 'w:distance', toTwipsString(numbering.distance));
  if (numbering.restart !== undefined) setStringAttr(lnNumType, 'w:restart', numbering.restart);
}

export function readSectPrPageNumbering(sectPr: XmlElement): SectionPageNumbering | undefined {
  const pgNumType = findChild(sectPr, 'w:pgNumType');
  if (!pgNumType) return undefined;

  const formatRaw = asString(pgNumType.attributes?.['w:fmt']);
  const format = isKnownValue(formatRaw, PAGE_NUMBER_FORMAT_VALUES) ? formatRaw : undefined;
  const start = toPositiveInteger(pgNumType.attributes?.['w:start']);

  if (format == null && start == null) return undefined;
  return { format, start };
}

export function writeSectPrPageNumbering(sectPr: XmlElement, numbering: SectionPageNumbering): void {
  if (numbering.start === undefined && numbering.format === undefined) return;
  const pgNumType = ensureChild(sectPr, 'w:pgNumType');
  if (numbering.start !== undefined) setStringAttr(pgNumType, 'w:start', numbering.start);
  if (numbering.format !== undefined) setStringAttr(pgNumType, 'w:fmt', numbering.format);
}

export function readSectPrTitlePage(sectPr: XmlElement): boolean {
  return Boolean(findChild(sectPr, 'w:titlePg'));
}

export function writeSectPrTitlePage(sectPr: XmlElement, enabled: boolean): void {
  if (enabled) {
    ensureChild(sectPr, 'w:titlePg');
    return;
  }
  removeChildren(sectPr, (entry) => entry.name === 'w:titlePg');
}

export function readSectPrVerticalAlign(sectPr: XmlElement): SectionVerticalAlign | undefined {
  const vAlign = findChild(sectPr, 'w:vAlign');
  const raw = asString(vAlign?.attributes?.['w:val']);
  return isKnownValue(raw, SECTION_VERTICAL_ALIGN_VALUES) ? raw : undefined;
}

export function writeSectPrVerticalAlign(sectPr: XmlElement, value: SectionVerticalAlign): void {
  const vAlign = ensureChild(sectPr, 'w:vAlign');
  setStringAttr(vAlign, 'w:val', value);
}

export function readSectPrDirection(sectPr: XmlElement): SectionDirection | undefined {
  const bidi = findChild(sectPr, 'w:bidi');
  if (!bidi) return undefined;
  const value = toBooleanAttr(bidi.attributes?.['w:val']);
  return value === false ? 'ltr' : 'rtl';
}

export function writeSectPrDirection(sectPr: XmlElement, direction: SectionDirection): void {
  if (direction === 'ltr') {
    removeChildren(sectPr, (entry) => entry.name === 'w:bidi');
    return;
  }
  const bidi = ensureChild(sectPr, 'w:bidi');
  setStringAttr(bidi, 'w:val', '1');
}

function readSectPrRefByVariant(
  sectPr: XmlElement,
  kind: SectionHeaderFooterKind,
  variant: SectionHeaderFooterVariant,
): string | undefined {
  const elementName = sectionRefElementName(kind);
  const refNode = sectPr.elements?.find(
    (entry) => entry.name === elementName && toRefVariant(entry.attributes?.['w:type']) === variant,
  );
  return asString(refNode?.attributes?.['r:id']);
}

export function readSectPrRefsByKind(
  sectPr: XmlElement,
  kind: SectionHeaderFooterKind,
): SectionHeaderFooterRefs | undefined {
  const refs: SectionHeaderFooterRefs = {
    default: readSectPrRefByVariant(sectPr, kind, 'default'),
    first: readSectPrRefByVariant(sectPr, kind, 'first'),
    even: readSectPrRefByVariant(sectPr, kind, 'even'),
  };

  if (refs.default == null && refs.first == null && refs.even == null) return undefined;
  return refs;
}

/**
 * Canonical adapter-facing alias used by section mutation adapters.
 */
export const readSectPrHeaderFooterRefs = readSectPrRefsByKind;

export function setSectPrHeaderFooterRef(
  sectPr: XmlElement,
  kind: SectionHeaderFooterKind,
  variant: SectionHeaderFooterVariant,
  refId: string,
): void {
  const elementName = sectionRefElementName(kind);
  removeChildren(
    sectPr,
    (entry) => entry.name === elementName && toRefVariant(entry.attributes?.['w:type']) === variant,
  );
  ensureElements(sectPr).push({
    type: 'element',
    name: elementName,
    attributes: {
      'w:type': variant,
      'r:id': refId,
    },
    elements: [],
  });
}

export function clearSectPrHeaderFooterRef(
  sectPr: XmlElement,
  kind: SectionHeaderFooterKind,
  variant: SectionHeaderFooterVariant,
): boolean {
  const elementName = sectionRefElementName(kind);
  const { removed } = removeChildren(
    sectPr,
    (entry) => entry.name === elementName && toRefVariant(entry.attributes?.['w:type']) === variant,
  );
  return removed;
}

export function getSectPrHeaderFooterRef(
  sectPr: XmlElement,
  kind: SectionHeaderFooterKind,
  variant: SectionHeaderFooterVariant,
): string | undefined {
  return readSectPrRefByVariant(sectPr, kind, variant);
}

function readBorderSpec(element: XmlElement | undefined): SectionBorderSpec | undefined {
  if (!element?.attributes) return undefined;
  const attributes = element.attributes;
  const style = asString(attributes['w:val']);
  const size = toNonNegativeNumber(attributes['w:sz']);
  const space = toNonNegativeNumber(attributes['w:space']);
  const color = asString(attributes['w:color']);
  const shadow = toBooleanAttr(attributes['w:shadow']);
  const frame = toBooleanAttr(attributes['w:frame']);

  if (style == null && size == null && space == null && color == null && shadow == null && frame == null)
    return undefined;
  return { style, size, space, color, shadow, frame };
}

function writeBorderSpec(
  parent: XmlElement,
  edge: 'top' | 'right' | 'bottom' | 'left',
  border: SectionBorderSpec,
): void {
  if (
    border.style === undefined &&
    border.size === undefined &&
    border.space === undefined &&
    border.color === undefined &&
    border.shadow === undefined &&
    border.frame === undefined
  ) {
    return;
  }

  const edgeElement = ensureChild(parent, `w:${edge}`);
  if (border.style !== undefined) setStringAttr(edgeElement, 'w:val', border.style);
  if (border.size !== undefined) setStringAttr(edgeElement, 'w:sz', border.size);
  if (border.space !== undefined) setStringAttr(edgeElement, 'w:space', border.space);
  if (border.color !== undefined) setStringAttr(edgeElement, 'w:color', border.color);
  if (border.shadow !== undefined) setBooleanAttr(edgeElement, 'w:shadow', border.shadow);
  if (border.frame !== undefined) setBooleanAttr(edgeElement, 'w:frame', border.frame);
}

export function readSectPrPageBorders(sectPr: XmlElement): SectionPageBorders | undefined {
  const pgBorders = findChild(sectPr, 'w:pgBorders');
  if (!pgBorders) return undefined;

  const top = readBorderSpec(findChild(pgBorders, 'w:top'));
  const right = readBorderSpec(findChild(pgBorders, 'w:right'));
  const bottom = readBorderSpec(findChild(pgBorders, 'w:bottom'));
  const left = readBorderSpec(findChild(pgBorders, 'w:left'));

  const display = toPageBorderDisplay(pgBorders.attributes?.['w:display']);
  const offsetFrom = toPageBorderOffsetFrom(pgBorders.attributes?.['w:offsetFrom']);
  const zOrder = toPageBorderZOrder(pgBorders.attributes?.['w:zOrder']);

  if (display == null && offsetFrom == null && zOrder == null && !top && !right && !bottom && !left) return undefined;
  return { display, offsetFrom, zOrder, top, right, bottom, left };
}

export function writeSectPrPageBorders(sectPr: XmlElement, borders: SectionPageBorders): void {
  const hasRootAttributes =
    borders.display !== undefined || borders.offsetFrom !== undefined || borders.zOrder !== undefined;
  const hasTop = Boolean(
    borders.top &&
      (borders.top.style !== undefined ||
        borders.top.size !== undefined ||
        borders.top.space !== undefined ||
        borders.top.color !== undefined ||
        borders.top.shadow !== undefined ||
        borders.top.frame !== undefined),
  );
  const hasRight = Boolean(
    borders.right &&
      (borders.right.style !== undefined ||
        borders.right.size !== undefined ||
        borders.right.space !== undefined ||
        borders.right.color !== undefined ||
        borders.right.shadow !== undefined ||
        borders.right.frame !== undefined),
  );
  const hasBottom = Boolean(
    borders.bottom &&
      (borders.bottom.style !== undefined ||
        borders.bottom.size !== undefined ||
        borders.bottom.space !== undefined ||
        borders.bottom.color !== undefined ||
        borders.bottom.shadow !== undefined ||
        borders.bottom.frame !== undefined),
  );
  const hasLeft = Boolean(
    borders.left &&
      (borders.left.style !== undefined ||
        borders.left.size !== undefined ||
        borders.left.space !== undefined ||
        borders.left.color !== undefined ||
        borders.left.shadow !== undefined ||
        borders.left.frame !== undefined),
  );

  if (!hasRootAttributes && !hasTop && !hasRight && !hasBottom && !hasLeft) {
    return;
  }

  const pgBorders = ensureChild(sectPr, 'w:pgBorders');
  if (borders.display !== undefined) setStringAttr(pgBorders, 'w:display', borders.display);
  if (borders.offsetFrom !== undefined) setStringAttr(pgBorders, 'w:offsetFrom', borders.offsetFrom);
  if (borders.zOrder !== undefined) setStringAttr(pgBorders, 'w:zOrder', borders.zOrder);
  if (hasTop && borders.top) writeBorderSpec(pgBorders, 'top', borders.top);
  if (hasRight && borders.right) writeBorderSpec(pgBorders, 'right', borders.right);
  if (hasBottom && borders.bottom) writeBorderSpec(pgBorders, 'bottom', borders.bottom);
  if (hasLeft && borders.left) writeBorderSpec(pgBorders, 'left', borders.left);
}

export function clearSectPrPageBorders(sectPr: XmlElement): boolean {
  const { removed } = removeChildren(sectPr, (entry) => entry.name === 'w:pgBorders');
  return removed;
}
