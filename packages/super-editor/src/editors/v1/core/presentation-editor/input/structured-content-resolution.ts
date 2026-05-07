import type { Node as ProseMirrorNode } from 'prosemirror-model';

export type StructuredContentSelection = {
  node: ProseMirrorNode;
  pos: number;
  start: number;
  end: number;
};

function matchesStructuredContentId(node: ProseMirrorNode, id: string): boolean {
  if (!id) return false;
  const attrs = node.attrs as { id?: unknown; sdtId?: unknown } | null | undefined;
  const nodeId = attrs?.id;
  const nodeSdtId = attrs?.sdtId;

  return (nodeId != null && String(nodeId) === id) || (nodeSdtId != null && String(nodeSdtId) === id);
}

function resolvePosSafely(doc: ProseMirrorNode, pos: number): ReturnType<ProseMirrorNode['resolve']> | null {
  if (!Number.isInteger(pos)) return null;

  try {
    return doc.resolve(pos);
  } catch {
    return null;
  }
}

export function findStructuredContentBlockAtPos(doc: ProseMirrorNode, pos: number): StructuredContentSelection | null {
  if (!Number.isFinite(pos)) return null;

  const $pos = resolvePosSafely(doc, pos);
  if (!$pos) return null;

  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type?.name === 'structuredContentBlock') {
      return {
        node,
        pos: $pos.before(depth),
        start: $pos.start(depth),
        end: $pos.end(depth),
      };
    }
  }

  return null;
}

export function findStructuredContentBlockById(doc: ProseMirrorNode, id: string): StructuredContentSelection | null {
  if (!id) return null;

  let found: StructuredContentSelection | null = null;

  doc.descendants((node, pos) => {
    if (node.type?.name !== 'structuredContentBlock') return true;
    if (!matchesStructuredContentId(node, id)) return true;

    found = {
      node,
      pos,
      start: pos + 1,
      end: pos + node.nodeSize - 1,
    };
    return false;
  });

  return found;
}

export function findStructuredContentInlineAtPos(doc: ProseMirrorNode, pos: number): StructuredContentSelection | null {
  if (!Number.isFinite(pos)) return null;

  const $pos = resolvePosSafely(doc, pos);
  if (!$pos) return null;

  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type?.name === 'structuredContent') {
      return {
        node,
        pos: $pos.before(depth),
        start: $pos.start(depth),
        end: $pos.end(depth),
      };
    }
  }

  return null;
}

export function findStructuredContentInlineById(doc: ProseMirrorNode, id: string): StructuredContentSelection | null {
  if (!id) return null;

  let found: StructuredContentSelection | null = null;

  doc.descendants((node, pos) => {
    if (node.type?.name !== 'structuredContent') return true;
    if (!matchesStructuredContentId(node, id)) return true;

    found = {
      node,
      pos,
      start: pos + 1,
      end: pos + node.nodeSize - 1,
    };
    return false;
  });

  return found;
}
