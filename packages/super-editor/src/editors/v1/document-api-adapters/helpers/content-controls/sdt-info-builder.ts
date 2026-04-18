/**
 * SDT info builder — constructs ContentControlInfo from ProseMirror node attributes.
 *
 * Single source of truth for control-type resolution, lock-mode resolution,
 * appearance resolution, and the canonical info shape. Used by both
 * node-info-mapper.ts and content-controls-wrappers.ts.
 */

import type {
  ContentControlInfo,
  ContentControlType,
  ContentControlBinding,
  ContentControlTarget,
  ContentControlProperties,
  LockMode,
} from '@superdoc/document-api';
import type { ResolvedSdt } from './target-resolution.js';
import { findSdtPrChild, getSdtPrChildAttrs, type SdtPrElement } from './sdt-properties-write.js';

// ---------------------------------------------------------------------------
// Enum resolution
// ---------------------------------------------------------------------------

const VALID_CONTROL_TYPES: readonly string[] = [
  'text',
  'date',
  'checkbox',
  'comboBox',
  'dropDownList',
  'repeatingSection',
  'repeatingSectionItem',
  'group',
];

const VALID_LOCK_MODES: readonly string[] = ['unlocked', 'sdtLocked', 'contentLocked', 'sdtContentLocked'];

const VALID_APPEARANCES: readonly string[] = ['boundingBox', 'tags', 'hidden'];

/** Resolve the SDT control type from node attributes. */
export function resolveControlType(attrs: Record<string, unknown>): ContentControlType {
  const rawType = attrs.controlType ?? attrs.type;
  if (typeof rawType === 'string' && VALID_CONTROL_TYPES.includes(rawType)) {
    return rawType as ContentControlType;
  }
  return 'unknown';
}

/** Resolve the lock mode from node attributes. */
export function resolveLockMode(attrs: Record<string, unknown>): LockMode {
  const raw = attrs.lockMode;
  if (typeof raw === 'string' && VALID_LOCK_MODES.includes(raw)) {
    return raw as LockMode;
  }
  return 'unlocked';
}

/** Resolve the visual appearance from node attributes. */
export function resolveAppearance(attrs: Record<string, unknown>): ContentControlInfo['properties']['appearance'] {
  const raw = attrs.appearance;
  if (typeof raw === 'string' && VALID_APPEARANCES.includes(raw)) {
    return raw as ContentControlInfo['properties']['appearance'];
  }
  return undefined;
}

/** Extract data binding metadata from the sdtPr passthrough object (XML element form). */
export function resolveBinding(attrs: Record<string, unknown>): ContentControlBinding | undefined {
  const sdtPr = attrs.sdtPr as SdtPrElement | undefined;
  if (!sdtPr) return undefined;
  const bindingAttrs = getSdtPrChildAttrs(sdtPr, 'w:dataBinding');
  if (!bindingAttrs) return undefined;
  const storeItemId = bindingAttrs['w:storeItemID'] as string | undefined;
  const xpath = bindingAttrs['w:xpath'] as string | undefined;
  if (!storeItemId || !xpath) return undefined;
  const prefixMappings = bindingAttrs['w:prefixMappings'] as string | undefined;
  return { storeItemId, xpath, prefixMappings };
}

// ---------------------------------------------------------------------------
// Target builder
// ---------------------------------------------------------------------------

/** Build a ContentControlTarget from a resolved SDT node. */
export function buildTarget(sdt: ResolvedSdt): ContentControlTarget {
  return { kind: sdt.kind, nodeType: 'sdt', nodeId: String(sdt.node.attrs.id ?? '') };
}

// ---------------------------------------------------------------------------
// Info builder
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared subtype readers (used by both info-builder and wrapper getters)
// ---------------------------------------------------------------------------

/** Read the checked state from a checkbox sdtPr element. */
export function readCheckboxChecked(sdtPr: SdtPrElement | undefined): boolean {
  const cbEl = findSdtPrChild(sdtPr, 'w14:checkbox') ?? findSdtPrChild(sdtPr, 'w:checkbox');
  const checkedEl = cbEl?.elements?.find((e) => e.name === 'w14:checked' || e.name === 'w:checked');
  const checkedVal = checkedEl?.attributes?.['w14:val'] ?? checkedEl?.attributes?.['w:val'];
  return checkedVal === '1' || checkedVal === 'true' || checkedVal === true;
}

/** Read choice-list items and selected value from a comboBox/dropDownList sdtPr element. */
export function readChoiceListData(
  sdtPr: SdtPrElement | undefined,
  controlType: 'comboBox' | 'dropDownList',
): { items: Array<{ displayText: string; value: string }>; selectedValue: string | undefined } {
  const listEl = findSdtPrChild(sdtPr, `w:${controlType}`);
  const itemElements = listEl?.elements?.filter((e) => e.name === 'w:listItem') ?? [];
  const items = itemElements.map((item) => ({
    displayText: String(item.attributes?.['w:displayText'] ?? ''),
    value: String(item.attributes?.['w:value'] ?? ''),
  }));
  const selectedValue = listEl?.attributes?.['w:lastValue'] as string | undefined;
  return { items, selectedValue };
}

// ---------------------------------------------------------------------------
// Subtype-specific property extraction from sdtPr passthrough
// ---------------------------------------------------------------------------

/** Resolve subtype-specific properties from sdtPr in XML element form. */
function resolveSubtypeProperties(
  controlType: ContentControlType,
  sdtPr: SdtPrElement | undefined,
): Partial<ContentControlProperties> {
  if (!sdtPr) return {};

  switch (controlType) {
    case 'text': {
      const textAttrs = getSdtPrChildAttrs(sdtPr, 'w:text');
      if (!textAttrs) return {};
      const multiline = textAttrs['w:multiLine'];
      return { multiline: multiline === '1' || multiline === 'true' || multiline === true };
    }
    case 'date': {
      const dateEl = findSdtPrChild(sdtPr, 'w:date');
      if (!dateEl) return {};
      const fmtEl = findSdtPrChild(dateEl, 'w:dateFormat');
      const lidEl = findSdtPrChild(dateEl, 'w:lid');
      const storageEl = findSdtPrChild(dateEl, 'w:storeMappedDataAs');
      const calendarEl = findSdtPrChild(dateEl, 'w:calendar');
      return {
        dateFormat: fmtEl?.attributes?.['w:val'] as string | undefined,
        dateLocale: lidEl?.attributes?.['w:val'] as string | undefined,
        storageFormat: storageEl?.attributes?.['w:val'] as string | undefined,
        calendar: calendarEl?.attributes?.['w:val'] as string | undefined,
      };
    }
    case 'checkbox': {
      const cbEl = findSdtPrChild(sdtPr, 'w14:checkbox') ?? findSdtPrChild(sdtPr, 'w:checkbox');
      if (!cbEl) return {};
      const checkedState = cbEl.elements?.find((e) => e.name === 'w14:checkedState');
      const uncheckedState = cbEl.elements?.find((e) => e.name === 'w14:uncheckedState');
      return {
        checked: readCheckboxChecked(sdtPr),
        checkedSymbol: checkedState
          ? {
              font: String(checkedState.attributes?.['w14:font'] ?? ''),
              char: String(checkedState.attributes?.['w14:val'] ?? ''),
            }
          : undefined,
        uncheckedSymbol: uncheckedState
          ? {
              font: String(uncheckedState.attributes?.['w14:font'] ?? ''),
              char: String(uncheckedState.attributes?.['w14:val'] ?? ''),
            }
          : undefined,
      };
    }
    case 'comboBox':
    case 'dropDownList':
      return readChoiceListData(sdtPr, controlType);
    case 'repeatingSection': {
      const rsEl = findSdtPrChild(sdtPr, 'w15:repeatingSection') ?? findSdtPrChild(sdtPr, 'w:repeatingSection');
      if (!rsEl) return {};
      const allowEl = rsEl.elements?.find(
        (e) => e.name === 'w15:allowInsertDeleteSection' || e.name === 'w:allowInsertDeleteSection',
      );
      const allow = allowEl?.attributes?.['w15:val'] ?? allowEl?.attributes?.['w:val'];
      return { allowInsertDelete: allow === '1' || allow === 'true' || allow === true };
    }
    default:
      return {};
  }
}

/** Build the full ContentControlInfo shape from a resolved SDT node. */
export function buildContentControlInfoFromNode(sdt: ResolvedSdt): ContentControlInfo {
  const attrs = sdt.node.attrs as Record<string, unknown>;
  const id = String(attrs.id ?? '');
  const controlType = resolveControlType(attrs);
  const lockMode = resolveLockMode(attrs);
  const sdtPr = typeof attrs.sdtPr === 'object' && attrs.sdtPr !== null ? (attrs.sdtPr as SdtPrElement) : undefined;

  let text: string | undefined;
  try {
    text = sdt.node.textContent || undefined;
  } catch {
    text = undefined;
  }

  const subtypeProps = resolveSubtypeProperties(controlType, sdtPr);

  return {
    nodeType: 'sdt',
    kind: sdt.kind,
    id,
    controlType,
    lockMode,
    properties: {
      tag: typeof attrs.tag === 'string' ? attrs.tag : undefined,
      alias: typeof attrs.alias === 'string' ? attrs.alias : undefined,
      appearance: resolveAppearance(attrs),
      placeholder: typeof attrs.placeholder === 'string' ? attrs.placeholder : undefined,
      color: typeof attrs.color === 'string' ? attrs.color : undefined,
      showingPlaceholder: typeof attrs.showingPlaceholder === 'boolean' ? attrs.showingPlaceholder : undefined,
      temporary: typeof attrs.temporary === 'boolean' ? attrs.temporary : undefined,
      tabIndex: typeof attrs.tabIndex === 'number' ? attrs.tabIndex : undefined,
      ...subtypeProps,
    },
    binding: resolveBinding(attrs),
    raw: sdtPr,
    target: { kind: sdt.kind, nodeType: 'sdt', nodeId: id },
    text,
  };
}

/**
 * Build a minimal ContentControlInfo from raw node attributes and kind.
 * Used by node-info-mapper.ts when no ResolvedSdt is available.
 */
export function buildContentControlInfoFromAttrs(
  attrs: Record<string, unknown> | undefined,
  kind: 'block' | 'inline',
): ContentControlInfo {
  const safeAttrs = attrs ?? {};
  const id = String(safeAttrs.id ?? '');
  const controlType = resolveControlType(safeAttrs);
  const lockMode = resolveLockMode(safeAttrs);

  return {
    nodeType: 'sdt',
    kind,
    id,
    controlType,
    lockMode,
    properties: {
      tag: typeof safeAttrs.tag === 'string' ? safeAttrs.tag : undefined,
      alias: typeof safeAttrs.alias === 'string' ? safeAttrs.alias : undefined,
      appearance: resolveAppearance(safeAttrs),
      placeholder: typeof safeAttrs.placeholder === 'string' ? safeAttrs.placeholder : undefined,
      color: typeof safeAttrs.color === 'string' ? safeAttrs.color : undefined,
      showingPlaceholder: typeof safeAttrs.showingPlaceholder === 'boolean' ? safeAttrs.showingPlaceholder : undefined,
      temporary: typeof safeAttrs.temporary === 'boolean' ? safeAttrs.temporary : undefined,
      tabIndex: typeof safeAttrs.tabIndex === 'number' ? safeAttrs.tabIndex : undefined,
    },
    target: { kind, nodeType: 'sdt', nodeId: id },
  };
}
