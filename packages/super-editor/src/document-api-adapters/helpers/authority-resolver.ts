/**
 * Authority resolver — finds, resolves, and extracts info from
 * tableOfAuthorities (block) and authorityEntry (inline) nodes.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type {
  AuthoritiesAddress,
  AuthorityEntryAddress,
  AuthoritiesConfig,
  AuthoritiesDomain,
  AuthorityEntryDomain,
  AuthoritiesInfo,
  AuthorityEntryInfo,
  DiscoveryItem,
} from '@superdoc/document-api';
import { buildDiscoveryItem, buildResolvedHandle } from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedAuthority {
  node: ProseMirrorNode;
  pos: number;
  nodeId: string;
}

export interface ResolvedAuthorityEntry {
  node: ProseMirrorNode;
  pos: number;
  instruction: string;
  longCitation: string;
  shortCitation: string;
  category: number;
  blockId: string;
}

// ---------------------------------------------------------------------------
// Table of Authorities (block) resolution
// ---------------------------------------------------------------------------

export function findAllAuthorities(doc: ProseMirrorNode): ResolvedAuthority[] {
  const results: ResolvedAuthority[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'tableOfAuthorities') {
      const nodeId = (node.attrs?.sdBlockId as string) ?? `toa-${pos}`;
      results.push({ node, pos, nodeId });
      return false;
    }
    return true;
  });
  return results;
}

export function resolveAuthorityTarget(doc: ProseMirrorNode, target: AuthoritiesAddress): ResolvedAuthority {
  const all = findAllAuthorities(doc);
  const found = all.find((a) => a.nodeId === target.nodeId);
  if (!found) {
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `Table of authorities with nodeId "${target.nodeId}" not found.`,
    );
  }
  return found;
}

export function extractAuthorityInfo(resolved: ResolvedAuthority): AuthoritiesInfo {
  const instruction = (resolved.node.attrs?.instruction as string) ?? '';
  return {
    address: { kind: 'block', nodeType: 'tableOfAuthorities', nodeId: resolved.nodeId },
    instruction,
    config: parseToaInstruction(instruction),
    entryCount: resolved.node.childCount,
  };
}

export function buildAuthorityDiscoveryItem(
  resolved: ResolvedAuthority,
  evaluatedRevision: string,
): DiscoveryItem<AuthoritiesDomain> {
  const instruction = (resolved.node.attrs?.instruction as string) ?? '';
  const address: AuthoritiesAddress = {
    kind: 'block',
    nodeType: 'tableOfAuthorities',
    nodeId: resolved.nodeId,
  };
  const domain: AuthoritiesDomain = {
    address,
    instruction,
    config: parseToaInstruction(instruction),
    entryCount: resolved.node.childCount,
  };

  const handle = buildResolvedHandle(resolved.nodeId, 'stable', 'node');
  const id = `toa:${resolved.nodeId}:${evaluatedRevision}`;
  return buildDiscoveryItem(id, handle, domain);
}

// ---------------------------------------------------------------------------
// Authority entry (inline) resolution
// ---------------------------------------------------------------------------

export function findAllAuthorityEntries(doc: ProseMirrorNode): ResolvedAuthorityEntry[] {
  const results: ResolvedAuthorityEntry[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'authorityEntry') {
      results.push({
        node,
        pos,
        instruction: (node.attrs?.instruction as string) ?? '',
        longCitation: (node.attrs?.longCitation as string) ?? '',
        shortCitation: (node.attrs?.shortCitation as string) ?? '',
        category: (node.attrs?.category as number) ?? 0,
        blockId: resolveParentBlockId(doc, pos),
      });
    }
    return true;
  });
  return results;
}

export function resolveAuthorityEntryTarget(
  doc: ProseMirrorNode,
  target: AuthorityEntryAddress,
): ResolvedAuthorityEntry {
  const all = findAllAuthorityEntries(doc);
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
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Authority entry not found at the specified anchor.');
  }
  return found;
}

export function extractAuthorityEntryInfo(doc: ProseMirrorNode, resolved: ResolvedAuthorityEntry): AuthorityEntryInfo {
  return {
    address: buildEntryAddress(doc, resolved),
    longCitation: resolved.longCitation,
    shortCitation: resolved.shortCitation,
    category: resolved.category,
    bold: (resolved.node.attrs?.bold as boolean) ?? false,
    italic: (resolved.node.attrs?.italic as boolean) ?? false,
    instruction: resolved.instruction,
  };
}

export function buildAuthorityEntryDiscoveryItem(
  doc: ProseMirrorNode,
  resolved: ResolvedAuthorityEntry,
  evaluatedRevision: string,
): DiscoveryItem<AuthorityEntryDomain> {
  const address = buildEntryAddress(doc, resolved);
  const domain: AuthorityEntryDomain = {
    address,
    longCitation: resolved.longCitation,
    shortCitation: resolved.shortCitation,
    category: resolved.category,
    bold: (resolved.node.attrs?.bold as boolean) ?? false,
    italic: (resolved.node.attrs?.italic as boolean) ?? false,
    instruction: resolved.instruction,
  };

  const ref = `${resolved.blockId}:${resolved.pos}`;
  const handle = buildResolvedHandle(ref, 'ephemeral', 'node');
  const id = `authorityEntry:${ref}:${evaluatedRevision}`;
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

function buildEntryAddress(doc: ProseMirrorNode, resolved: ResolvedAuthorityEntry): AuthorityEntryAddress {
  const r = doc.resolve(resolved.pos);
  const offset = resolved.pos - r.start(r.depth);
  return {
    kind: 'inline',
    nodeType: 'authorityEntry',
    anchor: {
      start: { blockId: resolved.blockId, offset },
      end: { blockId: resolved.blockId, offset: offset + resolved.node.nodeSize },
    },
  };
}

// ---------------------------------------------------------------------------
// Instruction parsing
// ---------------------------------------------------------------------------

const TOA_LEADER_REVERSE_MAP: Record<string, string> = { '.': 'dot', '-': 'hyphen', _: 'underscore' };

export function parseToaInstruction(instruction: string): AuthoritiesConfig {
  const config: AuthoritiesConfig = {};

  const c = instruction.match(/\\c\s+(\d+)/);
  if (c) config.category = parseInt(c[1], 10);

  const e = instruction.match(/\\e\s+"([^"]*)"/);
  if (e) config.entryPageSeparator = e[1];

  if (/\\p(?:\s|$)/.test(instruction)) config.usePassim = true;

  if (/\\h(?:\s|$)/.test(instruction)) config.includeHeadings = true;

  const l = instruction.match(/\\l\s+"([^"]*)"/);
  if (l) config.tabLeader = (TOA_LEADER_REVERSE_MAP[l[1]] ?? l[1]) as AuthoritiesConfig['tabLeader'];

  const g = instruction.match(/\\g\s+"([^"]*)"/);
  if (g) config.pageRangeSeparator = g[1];

  return config;
}
