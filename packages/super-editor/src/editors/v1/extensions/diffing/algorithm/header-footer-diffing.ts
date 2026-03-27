import type { Node as PMNode, Schema } from 'prosemirror-model';
import { diffNodes, normalizeNodes, type NodeDiff } from './generic-diffing';
import { resolveSectionProjections } from '../../../document-api-adapters/helpers/sections-resolver.js';
import { readTargetSectPr } from '../../../document-api-adapters/helpers/section-projection-access.js';
import { readSectPrHeaderFooterRefs } from '../../../document-api-adapters/helpers/sections-xml.js';

/**
 * Header/footer kind names used throughout the diff payload.
 */
export type HeaderFooterKind = 'header' | 'footer';

/**
 * Explicit slot variants supported by section properties.
 */
export type HeaderFooterVariant = 'default' | 'first' | 'even';

/**
 * Serialized header/footer part state captured from one editor.
 */
export interface HeaderFooterPartState {
  refId: string;
  kind: HeaderFooterKind;
  partPath: string;
  content: Record<string, unknown>;
}

/**
 * Serialized section slot state captured from one editor.
 */
export interface HeaderFooterSlotState {
  sectionId: string;
  titlePg: boolean;
  header: Record<HeaderFooterVariant, string | null>;
  footer: Record<HeaderFooterVariant, string | null>;
}

/**
 * Canonical header/footer state captured from one editor.
 */
export interface HeaderFooterState {
  parts: HeaderFooterPartState[];
  slots: HeaderFooterSlotState[];
}

/**
 * Content diff for one existing header/footer part.
 */
export interface ModifiedHeaderFooterPart {
  refId: string;
  kind: HeaderFooterKind;
  oldPartPath: string;
  partPath: string;
  docDiffs: NodeDiff[];
}

/**
 * Full header/footer diff payload.
 */
export interface HeaderFootersDiff {
  addedParts: HeaderFooterPartState[];
  removedParts: HeaderFooterPartState[];
  modifiedParts: ModifiedHeaderFooterPart[];
  slotChanges: HeaderFooterSlotState[];
}

type HeaderFooterEditor = {
  state: { doc: PMNode };
  converter?: {
    headers?: Record<string, unknown>;
    footers?: Record<string, unknown>;
    convertedXml?: Record<string, unknown>;
  } | null;
};

export const SLOT_VARIANTS: HeaderFooterVariant[] = ['default', 'first', 'even'];
const PART_KINDS: HeaderFooterKind[] = ['header', 'footer'];

/**
 * Captures the header/footer state needed by snapshotting, diffing, and replay.
 *
 * @param editor Editor instance whose converter and section XML should be read.
 * @returns Canonical header/footer state for the editor.
 */
export function captureHeaderFooterState(editor: HeaderFooterEditor): HeaderFooterState {
  return {
    parts: collectHeaderFooterParts(editor),
    slots: collectHeaderFooterSlots(editor),
  };
}

/**
 * Computes the header/footer diff between two captured states.
 *
 * @param oldState Previous header/footer state.
 * @param newState Updated header/footer state.
 * @param schema Schema used to rebuild stored PM JSON.
 * @returns Header/footer diff, or `null` when no changes were detected.
 */
export function diffHeaderFooters(
  oldState: HeaderFooterState | null | undefined,
  newState: HeaderFooterState | null | undefined,
  schema: Schema,
): HeaderFootersDiff | null {
  const previous = oldState ?? { parts: [], slots: [] };
  const next = newState ?? { parts: [], slots: [] };
  const previousParts = new Map(previous.parts.map((part) => [part.refId, part]));
  const nextParts = new Map(next.parts.map((part) => [part.refId, part]));

  const addedParts: HeaderFooterPartState[] = [];
  const removedParts: HeaderFooterPartState[] = [];
  const modifiedParts: ModifiedHeaderFooterPart[] = [];

  for (const nextPart of next.parts) {
    const previousPart = previousParts.get(nextPart.refId);
    if (!previousPart) {
      addedParts.push(structuredClone(nextPart));
      continue;
    }
    if (previousPart.kind !== nextPart.kind) {
      removedParts.push(structuredClone(previousPart));
      addedParts.push(structuredClone(nextPart));
      continue;
    }

    const oldDoc = schema.nodeFromJSON(previousPart.content);
    const newDoc = schema.nodeFromJSON(nextPart.content);
    const docDiffs = diffNodes(normalizeNodes(oldDoc), normalizeNodes(newDoc));
    if (docDiffs.length > 0 || previousPart.partPath !== nextPart.partPath) {
      modifiedParts.push({
        refId: nextPart.refId,
        kind: nextPart.kind,
        oldPartPath: previousPart.partPath,
        partPath: nextPart.partPath,
        docDiffs,
      });
    }
  }

  for (const previousPart of previous.parts) {
    if (!nextParts.has(previousPart.refId)) {
      removedParts.push(structuredClone(previousPart));
    }
  }

  const previousSlots = new Map(previous.slots.map((slot) => [slot.sectionId, slot]));
  const nextSlots = new Map(next.slots.map((slot) => [slot.sectionId, slot]));
  const slotChanges: HeaderFooterSlotState[] = [];
  const sectionIds = new Set([...previousSlots.keys(), ...nextSlots.keys()]);
  for (const sectionId of sectionIds) {
    const previousSlot = previousSlots.get(sectionId);
    const nextSlot = nextSlots.get(sectionId) ?? createClearedSlotState(sectionId);
    if (!slotsEqual(previousSlot, nextSlot)) {
      slotChanges.push(structuredClone(nextSlot));
    }
  }

  if (addedParts.length === 0 && removedParts.length === 0 && modifiedParts.length === 0 && slotChanges.length === 0) {
    return null;
  }

  return {
    addedParts,
    removedParts,
    modifiedParts,
    slotChanges,
  };
}

/**
 * Builds the part snapshot list from converter header/footer collections.
 *
 * @param editor Editor whose converter collections should be read.
 * @returns Sorted part snapshot list.
 */
function collectHeaderFooterParts(editor: HeaderFooterEditor): HeaderFooterPartState[] {
  const parts: HeaderFooterPartState[] = [];
  const partPaths = readHeaderFooterPartPaths(editor);

  for (const kind of PART_KINDS) {
    const source = kind === 'header' ? editor.converter?.headers : editor.converter?.footers;
    if (!source) continue;

    for (const [refId, content] of Object.entries(source)) {
      const partPath = partPaths.get(refId);
      if (!partPath || !content || typeof content !== 'object') continue;
      parts.push({
        refId,
        kind,
        partPath,
        content: structuredClone(content as Record<string, unknown>),
      });
    }
  }

  return parts.sort(compareParts);
}

/**
 * Reads relationship targets for all header/footer references in the document.
 *
 * @param editor Editor whose `document.xml.rels` should be inspected.
 * @returns Map from relationship id to normalized OOXML part path.
 */
function readHeaderFooterPartPaths(editor: HeaderFooterEditor): Map<string, string> {
  const result = new Map<string, string>();
  const relsPart = editor.converter?.convertedXml?.['word/_rels/document.xml.rels'] as
    | {
        elements?: Array<{
          name?: string;
          attributes?: Record<string, string>;
          elements?: Array<{ name?: string; attributes?: Record<string, string> }>;
        }>;
      }
    | undefined;
  const relsRoot = relsPart?.elements?.find((entry) => entry.name === 'Relationships');
  if (!relsRoot?.elements) {
    return result;
  }

  for (const entry of relsRoot.elements) {
    const type = entry.attributes?.Type;
    if (
      entry.name !== 'Relationship' ||
      (type !== 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header' &&
        type !== 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer')
    ) {
      continue;
    }

    const refId = entry.attributes?.Id;
    const target = entry.attributes?.Target;
    if (!refId || !target) {
      continue;
    }

    result.set(refId, normalizePartPath(target));
  }

  return result;
}

/**
 * Normalizes a relationship target into a `word/...` OOXML part path.
 *
 * @param target Raw relationship target string.
 * @returns Normalized OOXML part path.
 */
export function normalizePartPath(target: string): string {
  let normalized = target.replace(/^\.\//, '');
  if (normalized.startsWith('../')) {
    normalized = normalized.slice(3);
  }
  if (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }
  if (!normalized.startsWith('word/')) {
    normalized = `word/${normalized}`;
  }
  return normalized;
}

/**
 * Builds the section slot snapshot list from section properties.
 *
 * @param editor Editor whose section projections should be read.
 * @returns Sorted slot snapshot list.
 */
function collectHeaderFooterSlots(editor: HeaderFooterEditor): HeaderFooterSlotState[] {
  const slots: HeaderFooterSlotState[] = [];

  for (const projection of resolveSectionProjections(editor as never)) {
    const sectPr = readTargetSectPr(editor as never, projection);
    const headerRefs = sectPr ? readSectPrHeaderFooterRefs(sectPr, 'header') : undefined;
    const footerRefs = sectPr ? readSectPrHeaderFooterRefs(sectPr, 'footer') : undefined;

    slots.push({
      sectionId: projection.sectionId,
      titlePg: projection.range.titlePg === true,
      header: {
        default: headerRefs?.default ?? null,
        first: headerRefs?.first ?? null,
        even: headerRefs?.even ?? null,
      },
      footer: {
        default: footerRefs?.default ?? null,
        first: footerRefs?.first ?? null,
        even: footerRefs?.even ?? null,
      },
    });
  }

  return slots.sort((a, b) => a.sectionId.localeCompare(b.sectionId));
}

/**
 * Compares two part entries in stable order.
 *
 * @param a First part entry.
 * @param b Second part entry.
 * @returns Sort order.
 */
function compareParts(a: HeaderFooterPartState, b: HeaderFooterPartState): number {
  if (a.kind !== b.kind) {
    return a.kind.localeCompare(b.kind);
  }
  return a.refId.localeCompare(b.refId);
}

/**
 * Creates an explicit cleared slot payload for a section that no longer exists.
 *
 * @param sectionId Removed section id.
 * @returns Slot state that clears title-page and variant refs on replay.
 */
function createClearedSlotState(sectionId: string): HeaderFooterSlotState {
  return {
    sectionId,
    titlePg: false,
    header: {
      default: null,
      first: null,
      even: null,
    },
    footer: {
      default: null,
      first: null,
      even: null,
    },
  };
}

/**
 * Compares two slot states by value.
 *
 * @param previous Previous slot state.
 * @param next Next slot state.
 * @returns `true` when both slot states are equivalent.
 */
function slotsEqual(previous: HeaderFooterSlotState | undefined, next: HeaderFooterSlotState): boolean {
  if (!previous) {
    return false;
  }

  if (previous.titlePg !== next.titlePg) {
    return false;
  }

  for (const variant of SLOT_VARIANTS) {
    if (previous.header[variant] !== next.header[variant]) {
      return false;
    }
    if (previous.footer[variant] !== next.footer[variant]) {
      return false;
    }
  }

  return true;
}
