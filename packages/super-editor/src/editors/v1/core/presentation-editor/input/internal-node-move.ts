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
type BoundaryCandidate = {
  pos: number;
  side: TargetBias;
};

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
  avoidPos?: number,
): number | null {
  try {
    const resolvedPos = doc.resolve(pos);
    const candidates: BoundaryCandidate[] = [];

    for (let depth = resolvedPos.depth; depth > 0; depth--) {
      candidates.push(
        { pos: resolvedPos.before(depth), side: 'before' },
        { pos: resolvedPos.after(depth), side: 'after' },
      );
    }

    candidates.sort((a, b) => {
      const distanceDelta = Math.abs(a.pos - pos) - Math.abs(b.pos - pos);
      if (distanceDelta !== 0) return distanceDelta;
      if (a.side === bias && b.side !== bias) return -1;
      if (b.side === bias && a.side !== bias) return 1;
      return 0;
    });

    let avoidedCandidate: number | null = null;
    for (const candidate of candidates) {
      const candidatePos = candidate.pos;
      if (candidatePos < 0 || candidatePos > doc.content.size) continue;
      if (candidatePos === pos) continue;
      if (!canInsertAt(doc, candidatePos, node)) continue;
      if (avoidPos != null && candidatePos === avoidPos) {
        avoidedCandidate = candidatePos;
        continue;
      }
      return candidatePos;
    }

    return avoidedCandidate;
  } catch {
    return null;
  }
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
  const mappedSourceStart = tr.mapping.map(sourceStart);
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
      mappedSourceStart,
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
