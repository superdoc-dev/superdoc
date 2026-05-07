import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';

export type InternalMoveRequest = {
  sourceStart: number;
  sourceEnd: number;
  targetPos: number;
  expectedNodeType?: string;
  canInsertAt: (doc: ProseMirrorNode, pos: number, node: ProseMirrorNode) => boolean;
};

export type InternalMoveResult =
  | { ok: true; transaction: Transaction; mappedTarget: number }
  | { ok: false; reason: 'invalid-source' | 'same-range' | 'wrong-node-type' | 'invalid-target' };

type InternalMoveState = {
  doc: ProseMirrorNode;
  tr: Transaction;
};

type TargetBias = 'before' | 'after';

export function canInsertNodeAtPosition(doc: ProseMirrorNode, pos: number, node: ProseMirrorNode): boolean {
  try {
    const resolvedPos = doc.resolve(pos);
    const { parent } = resolvedPos;
    const index = resolvedPos.index();

    if (typeof parent.canReplaceWith === 'function') {
      return parent.canReplaceWith(index, index, node.type);
    }

    return Boolean(parent.type.contentMatch.matchType(node.type));
  } catch {
    return false;
  }
}

function resolveInsertionBoundary(
  doc: ProseMirrorNode,
  pos: number,
  node: ProseMirrorNode,
  canInsertAt: InternalMoveRequest['canInsertAt'],
  bias: TargetBias,
): number | null {
  try {
    const resolvedPos = doc.resolve(pos);
    const candidates: number[] = [];

    for (let depth = resolvedPos.depth; depth > 0; depth--) {
      const before = resolvedPos.before(depth);
      const after = resolvedPos.after(depth);
      if (bias === 'before') {
        candidates.push(before, after);
      } else {
        candidates.push(after, before);
      }
    }

    for (const candidate of candidates) {
      if (candidate < 0 || candidate > doc.content.size) continue;
      if (candidate === pos) continue;
      if (canInsertAt(doc, candidate, node)) return candidate;
    }
  } catch {
    return null;
  }

  return null;
}

export function createInternalNodeMoveTransaction(
  state: InternalMoveState,
  request: InternalMoveRequest,
): InternalMoveResult {
  const { sourceStart, sourceEnd, targetPos, expectedNodeType, canInsertAt } = request;

  if (targetPos >= sourceStart && targetPos <= sourceEnd) {
    return { ok: false, reason: 'same-range' };
  }

  const sourceNode = state.doc.nodeAt(sourceStart);
  if (!sourceNode || sourceEnd !== sourceStart + sourceNode.nodeSize) {
    return { ok: false, reason: 'invalid-source' };
  }

  if (expectedNodeType && sourceNode.type.name !== expectedNodeType) {
    return { ok: false, reason: 'wrong-node-type' };
  }

  const tr = state.tr;
  tr.delete(sourceStart, sourceEnd);

  const mappedTarget = tr.mapping.map(targetPos);
  if (mappedTarget < 0 || mappedTarget > tr.doc.content.size) {
    return { ok: false, reason: 'invalid-target' };
  }

  let insertTarget = mappedTarget;
  if (!canInsertAt(tr.doc, insertTarget, sourceNode)) {
    const boundaryTarget = resolveInsertionBoundary(
      tr.doc,
      insertTarget,
      sourceNode,
      canInsertAt,
      targetPos <= sourceStart ? 'before' : 'after',
    );
    if (boundaryTarget == null) {
      return { ok: false, reason: 'invalid-target' };
    }
    insertTarget = boundaryTarget;
  }

  tr.insert(insertTarget, sourceNode);
  tr.setMeta('uiEvent', 'drop');
  return { ok: true, transaction: tr, mappedTarget: insertTarget };
}
