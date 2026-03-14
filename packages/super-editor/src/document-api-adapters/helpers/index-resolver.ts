/**
 * Index resolver — finds, resolves, and extracts info from documentIndex
 * and indexEntry nodes.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type {
  IndexAddress,
  IndexEntryAddress,
  IndexConfig,
  IndexDomain,
  IndexEntryDomain,
  IndexInfo,
  IndexEntryInfo,
  DiscoveryItem,
  InlineAnchor,
} from '@superdoc/document-api';
import { buildDiscoveryItem, buildResolvedHandle } from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedIndex {
  node: ProseMirrorNode;
  pos: number;
  nodeId: string;
}

export interface ResolvedIndexEntry {
  node: ProseMirrorNode;
  pos: number;
  instruction: string;
  blockId: string;
}

// ---------------------------------------------------------------------------
// Index (block) resolution
// ---------------------------------------------------------------------------

export function findAllIndexNodes(doc: ProseMirrorNode): ResolvedIndex[] {
  const results: ResolvedIndex[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'documentIndex' || node.type.name === 'index') {
      const nodeId = (node.attrs?.sdBlockId as string) ?? `index-${pos}`;
      results.push({ node, pos, nodeId });
      return false;
    }
    return true;
  });
  return results;
}

export function resolveIndexTarget(doc: ProseMirrorNode, target: IndexAddress): ResolvedIndex {
  const all = findAllIndexNodes(doc);
  const found = all.find((i) => i.nodeId === target.nodeId);
  if (!found) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Index with nodeId "${target.nodeId}" not found.`);
  }
  return found;
}

export function extractIndexInfo(node: ProseMirrorNode): IndexInfo {
  const instruction = (node.attrs?.instruction as string) ?? '';
  return {
    address: {
      kind: 'block',
      nodeType: 'index',
      nodeId: (node.attrs?.sdBlockId as string) ?? '',
    },
    instruction,
    config: parseIndexInstruction(instruction),
    entryCount: node.childCount,
  };
}

export function buildIndexDiscoveryItem(
  resolved: ResolvedIndex,
  evaluatedRevision: string,
): DiscoveryItem<IndexDomain> {
  const instruction = (resolved.node.attrs?.instruction as string) ?? '';
  const address: IndexAddress = { kind: 'block', nodeType: 'index', nodeId: resolved.nodeId };
  const domain: IndexDomain = {
    address,
    instruction,
    config: parseIndexInstruction(instruction),
    entryCount: resolved.node.childCount,
  };

  const handle = buildResolvedHandle(resolved.nodeId, 'stable', 'node');
  const id = `index:${resolved.nodeId}:${evaluatedRevision}`;
  return buildDiscoveryItem(id, handle, domain);
}

// ---------------------------------------------------------------------------
// Index entry (inline) resolution
// ---------------------------------------------------------------------------

export function findAllIndexEntries(doc: ProseMirrorNode): ResolvedIndexEntry[] {
  const results: ResolvedIndexEntry[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'indexEntry') {
      const instruction = (node.attrs?.instruction as string) ?? '';
      const blockId = resolveParentBlockId(doc, pos);
      results.push({ node, pos, instruction, blockId });
    }
    return true;
  });
  return results;
}

export function resolveIndexEntryTarget(doc: ProseMirrorNode, target: IndexEntryAddress): ResolvedIndexEntry {
  const all = findAllIndexEntries(doc);
  const found = all.find((e) => {
    if (target.anchor?.start?.blockId && e.blockId !== target.anchor.start.blockId) return false;
    if (target.anchor?.start?.offset !== undefined) {
      const resolved = doc.resolve(e.pos);
      const offset = e.pos - resolved.start(resolved.depth);
      if (offset !== target.anchor.start.offset) return false;
    }
    return true;
  });

  if (!found) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Index entry not found at the specified anchor.');
  }
  return found;
}

export function extractIndexEntryInfo(doc: ProseMirrorNode, resolved: ResolvedIndexEntry): IndexEntryInfo {
  const subEntry = (resolved.node.attrs?.subEntry as string) || undefined;
  return {
    address: buildEntryAddress(doc, resolved),
    instruction: resolved.instruction,
    text: extractPrimaryEntryText(resolved.node.attrs?.instructionTokens, resolved.instruction, subEntry),
    subEntry,
    bold: (resolved.node.attrs?.bold as boolean) ?? false,
    italic: (resolved.node.attrs?.italic as boolean) ?? false,
    crossReference: (resolved.node.attrs?.crossReference as string) || undefined,
    pageRangeBookmark: (resolved.node.attrs?.pageRangeBookmark as string) || undefined,
    entryType: (resolved.node.attrs?.entryType as string) || undefined,
  };
}

export function buildIndexEntryDiscoveryItem(
  doc: ProseMirrorNode,
  resolved: ResolvedIndexEntry,
  evaluatedRevision: string,
): DiscoveryItem<IndexEntryDomain> {
  const subEntry = (resolved.node.attrs?.subEntry as string) || undefined;
  const address = buildEntryAddress(doc, resolved);
  const domain: IndexEntryDomain = {
    address,
    instruction: resolved.instruction,
    text: extractPrimaryEntryText(resolved.node.attrs?.instructionTokens, resolved.instruction, subEntry),
    subEntry,
    bold: (resolved.node.attrs?.bold as boolean) ?? false,
    italic: (resolved.node.attrs?.italic as boolean) ?? false,
  };

  const ref = `${resolved.blockId}:${resolved.pos}`;
  const handle = buildResolvedHandle(ref, 'ephemeral', 'node');
  const id = `indexEntry:${ref}:${evaluatedRevision}`;
  return buildDiscoveryItem(id, handle, domain);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveParentBlockId(doc: ProseMirrorNode, pos: number): string {
  const resolved = doc.resolve(pos);
  for (let depth = resolved.depth; depth >= 0; depth--) {
    const node = resolved.node(depth);
    const blockId = node.attrs?.sdBlockId as string | undefined;
    if (blockId) return blockId;
  }
  return '';
}

function buildEntryAddress(doc: ProseMirrorNode, resolved: ResolvedIndexEntry): IndexEntryAddress {
  const r = doc.resolve(resolved.pos);
  const offset = resolved.pos - r.start(r.depth);
  return {
    kind: 'inline',
    nodeType: 'indexEntry',
    anchor: {
      start: { blockId: resolved.blockId, offset },
      end: { blockId: resolved.blockId, offset: offset + resolved.node.nodeSize },
    },
  };
}

function extractPrimaryEntryText(instructionTokens: unknown, instruction: string, subEntry?: string): string {
  if (Array.isArray(instructionTokens) && instructionTokens.length > 0) {
    const rawTokenText = instructionTokens
      .map((token) => readInstructionTokenText(token))
      .filter((text): text is string => text.length > 0)
      .join('');

    if (rawTokenText) {
      const parsedFromTokens = parseXeInstructionEntryText(rawTokenText);
      const candidate = parsedFromTokens || rawTokenText;
      return removeTrailingSubEntry(candidate, subEntry);
    }
  }

  const parsedFromInstruction = parseXeInstructionEntryText(instruction);
  return removeTrailingSubEntry(parsedFromInstruction, subEntry);
}

function readInstructionTokenText(token: unknown): string {
  if (typeof token === 'string') return token;
  if (!token || typeof token !== 'object') return '';
  const tokenObject = token as { type?: unknown; text?: unknown };
  if (tokenObject.type === 'tab') return '\t';
  return typeof tokenObject.text === 'string' ? tokenObject.text : '';
}

function parseXeInstructionEntryText(instruction: string): string {
  const xeMatch = instruction.match(/^\s*XE\s+"([^"]*)"/);
  if (!xeMatch) return '';
  return xeMatch[1] ?? '';
}

function removeTrailingSubEntry(text: string, subEntry?: string): string {
  if (!subEntry) return text;
  const suffix = `:${subEntry}`;
  if (!text.endsWith(suffix)) return text;
  return text.slice(0, -suffix.length);
}

// ---------------------------------------------------------------------------
// Instruction parsing
// ---------------------------------------------------------------------------

export function parseIndexInstruction(instruction: string): IndexConfig {
  const config: IndexConfig = {};

  const h = instruction.match(/\\h\s+"([^"]*)"/);
  if (h) config.headingSeparator = h[1];

  const e = instruction.match(/\\e\s+"([^"]*)"/);
  if (e) config.entryPageSeparator = e[1];

  const g = instruction.match(/\\g\s+"([^"]*)"/);
  if (g) config.pageRangeSeparator = g[1];

  const s = instruction.match(/\\s\s+(\S+)/);
  if (s) config.sequenceId = s[1];

  const c = instruction.match(/\\c\s+(\d+)/);
  if (c) config.columns = parseInt(c[1], 10);

  const f = instruction.match(/\\f\s+"([^"]*)"/);
  if (f) config.entryTypeFilter = f[1];

  const b = instruction.match(/\\b\s+"([^"]*)"/);
  if (b) config.pageRangeBookmark = b[1];

  const p = instruction.match(/\\p\s+"([^"]*)-([^"]*)"/);
  if (p) config.letterRange = { from: p[1], to: p[2] };

  if (/\\r(?:\s|$)/.test(instruction)) config.runIn = true;

  if (/\\a(?:\s|$)/.test(instruction)) config.accentedSorting = true;

  return config;
}
