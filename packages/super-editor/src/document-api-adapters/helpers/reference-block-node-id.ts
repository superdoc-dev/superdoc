import type { Node as ProseMirrorNode } from 'prosemirror-model';

type ReferenceBlockType = 'index' | 'bibliography' | 'tableOfAuthorities';

const REFERENCE_BLOCK_PREFIX: Readonly<Record<ReferenceBlockType, string>> = {
  index: 'index-auto',
  bibliography: 'bibliography-auto',
  tableOfAuthorities: 'toa-auto',
};

/** FNV-1a 32-bit hash — fast, non-cryptographic, deterministic. */
function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function toReferenceBlockType(node: ProseMirrorNode): ReferenceBlockType | undefined {
  switch (node.type.name) {
    case 'documentIndex':
    case 'index':
      return 'index';
    case 'bibliography':
      return 'bibliography';
    case 'tableOfAuthorities':
      return 'tableOfAuthorities';
    default:
      return undefined;
  }
}

/**
 * Public id used for reference blocks.
 *
 * Must stay stable across stateless re-opens of the same document. Runtime
 * `sdBlockId` values are not persisted through DOCX export/reopen for these
 * field-backed blocks, so public ids must be derived from deterministic
 * document order instead. Callers that still hold a session-local `sdBlockId`
 * can resolve it through each resolver's `commandNodeId` fallback.
 */
export function resolvePublicReferenceBlockNodeId(node: ProseMirrorNode, occurrenceIndex: number): string {
  const blockType = toReferenceBlockType(node);
  if (!blockType) {
    throw new Error(`Unsupported reference block node type: ${node.type.name}`);
  }

  const prefix = REFERENCE_BLOCK_PREFIX[blockType];
  return `${prefix}-${stableHash(`${blockType}:${occurrenceIndex}`)}`;
}
