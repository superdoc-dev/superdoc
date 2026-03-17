import type { Transaction } from 'prosemirror-state';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { v4 as uuidv4 } from 'uuid';

import type { Editor } from './Editor.js';

export type TrackedRangeSpec = {
  id: string;
  type: string;
  metadata?: Record<string, unknown>;
  kind?: 'range' | 'point';
  inclusiveStart?: boolean;
  inclusiveEnd?: boolean;
};

export type ResolvedRange = {
  id: string;
  from: number;
  to: number;
  spec: TrackedRangeSpec;
};

type TrackablePosition = {
  blockId: string;
  offset: number;
};

type TrackableInlineAnchor = {
  start: TrackablePosition;
  end: TrackablePosition;
};

type TrackableNodeAddress =
  | {
      kind: 'inline';
      anchor: TrackableInlineAnchor;
    }
  | {
      kind: 'block';
      nodeId: string;
      nodeType?: string;
    };

type TrackableFindNodeItem = {
  address?: TrackableNodeAddress;
};

type TrackNodeInput = TrackableNodeAddress | TrackableFindNodeItem;

type ResolvedBlockCandidate = {
  node: ProseMirrorNode;
  pos: number;
};

type OffsetRange = {
  start: number;
  end: number;
};

const DEFAULT_TRACKED_NODE_TYPE = 'tracked-node';
type ScrollBlock = 'start' | 'center' | 'end' | 'nearest';

export type PositionTrackerState = {
  decorations: DecorationSet;
  generation: number;
};

type PositionTrackerMeta =
  | { action: 'add'; decorations: Decoration[] }
  | { action: 'remove'; ids: string[] }
  | { action: 'removeByType'; type: string };

export const positionTrackerKey = new PluginKey<PositionTrackerState>('positionTracker');

function getNodeIdCandidates(node: ProseMirrorNode): string[] {
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const candidateFields = ['paraId', 'sdBlockId', 'blockId', 'id', 'uuid'] as const;
  const ids: string[] = [];

  for (const field of candidateFields) {
    const value = attrs[field];
    if (typeof value === 'string' && value.length > 0) {
      ids.push(value);
    }
  }

  return ids;
}

function findBlockCandidateById(doc: ProseMirrorNode, blockId: string): ResolvedBlockCandidate | null {
  let match: ResolvedBlockCandidate | null = null;
  let isAmbiguous = false;

  doc.descendants((node, pos) => {
    if (!node.isBlock) return;
    const ids = getNodeIdCandidates(node);
    if (!ids.includes(blockId)) return;

    if (match) {
      isAmbiguous = true;
      return false;
    }

    match = { node, pos };
    return;
  });

  if (isAmbiguous) return null;
  return match;
}

function resolveSegmentPosition(
  targetOffset: number,
  segmentStart: number,
  segmentLength: number,
  docFrom: number,
  docTo: number,
): number {
  if (segmentLength <= 1) {
    return targetOffset <= segmentStart ? docFrom : docTo;
  }
  return docFrom + (targetOffset - segmentStart);
}

function resolveOffsetsInBlock(
  blockNode: ProseMirrorNode,
  blockPos: number,
  range: OffsetRange,
): { from: number; to: number } | null {
  if (range.start < 0 || range.end < range.start) return null;

  let flattenedOffset = 0;
  let fromPos: number | undefined;
  let toPos: number | undefined;

  const advanceSegment = (segmentLength: number, docFrom: number, docTo: number) => {
    const segmentStart = flattenedOffset;
    const segmentEnd = flattenedOffset + segmentLength;

    if (fromPos == null && range.start <= segmentEnd) {
      fromPos = resolveSegmentPosition(range.start, segmentStart, segmentLength, docFrom, docTo);
    }
    if (toPos == null && range.end <= segmentEnd) {
      toPos = resolveSegmentPosition(range.end, segmentStart, segmentLength, docFrom, docTo);
    }

    flattenedOffset = segmentEnd;
  };

  const walkNodeContent = (node: ProseMirrorNode, contentStart: number) => {
    let isFirstChild = true;
    let childOffset = 0;

    for (let i = 0; i < node.childCount; i += 1) {
      const child = node.child(i);
      const childPos = contentStart + childOffset;

      if (child.isBlock && !isFirstChild) {
        advanceSegment(1, childPos, childPos + 1);
      }

      walkNode(child, childPos);
      childOffset += child.nodeSize;
      isFirstChild = false;
    }
  };

  const walkNode = (node: ProseMirrorNode, docPos: number) => {
    if (node.isText) {
      const text = node.text ?? '';
      if (text.length > 0) {
        advanceSegment(text.length, docPos, docPos + text.length);
      }
      return;
    }

    if (node.isLeaf) {
      advanceSegment(1, docPos, docPos + node.nodeSize);
      return;
    }

    walkNodeContent(node, docPos + 1);
  };

  walkNodeContent(blockNode, blockPos + 1);

  if (flattenedOffset === 0 && range.start === 0 && range.end === 0) {
    const anchor = blockPos + 1;
    return { from: anchor, to: anchor };
  }

  if (range.end > flattenedOffset) return null;
  if (fromPos == null || toPos == null) return null;
  return { from: fromPos, to: toPos };
}

function getTrackableAddress(input: TrackNodeInput): TrackableNodeAddress | null {
  if (!input || typeof input !== 'object') return null;
  if ('kind' in input && (input.kind === 'inline' || input.kind === 'block')) {
    return input as TrackableNodeAddress;
  }
  if ('address' in input && input.address && typeof input.address === 'object') {
    const address = input.address as TrackableNodeAddress;
    if (address.kind === 'inline' || address.kind === 'block') return address;
  }
  return null;
}

export function createPositionTrackerPlugin(): Plugin<PositionTrackerState> {
  return new Plugin<PositionTrackerState>({
    key: positionTrackerKey,

    state: {
      init(): PositionTrackerState {
        return {
          decorations: DecorationSet.empty,
          generation: 0,
        };
      },

      apply(tr: Transaction, state: PositionTrackerState): PositionTrackerState {
        let { decorations, generation } = state;
        const meta = tr.getMeta(positionTrackerKey) as PositionTrackerMeta | undefined;

        if (meta?.action === 'add') {
          decorations = decorations.add(tr.doc, meta.decorations);
        } else if (meta?.action === 'remove') {
          const toRemove = decorations
            .find()
            .filter((decoration) => meta.ids.includes((decoration.spec as TrackedRangeSpec).id));
          decorations = decorations.remove(toRemove);
        } else if (meta?.action === 'removeByType') {
          const toRemove = decorations
            .find()
            .filter((decoration) => (decoration.spec as TrackedRangeSpec).type === meta.type);
          decorations = decorations.remove(toRemove);
        }

        if (tr.docChanged) {
          decorations = decorations.map(tr.mapping, tr.doc);
          generation += 1;
        }

        return { decorations, generation };
      },
    },

    props: {
      decorations() {
        return null;
      },
    },
  });
}

export class PositionTracker {
  #editor: Editor;

  constructor(editor: Editor) {
    this.#editor = editor;
  }

  #getState(): PositionTrackerState | null {
    if (!this.#editor?.state) return null;
    return positionTrackerKey.getState(this.#editor.state) ?? null;
  }

  #resolveTrackNodeAddress(address: TrackableNodeAddress): { from: number; to: number } | null {
    const doc = this.#editor?.state?.doc;
    if (!doc) return null;

    if (address.kind === 'inline') {
      const { start, end } = address.anchor;
      if (!start || !end || start.blockId !== end.blockId) return null;

      const block = findBlockCandidateById(doc, start.blockId);
      if (!block) return null;

      return resolveOffsetsInBlock(block.node, block.pos, {
        start: start.offset,
        end: end.offset,
      });
    }

    const block = findBlockCandidateById(doc, address.nodeId);
    if (!block) return null;

    const anchor = block.pos + 1;
    return { from: anchor, to: anchor };
  }

  track(from: number, to: number, spec: Omit<TrackedRangeSpec, 'id'>): string {
    const id = uuidv4();
    if (!this.#editor?.state) return id;

    const fullSpec: TrackedRangeSpec = { kind: 'range', ...spec, id };
    const deco = Decoration.inline(from, to, {}, fullSpec);
    const tr = this.#editor.state.tr
      .setMeta(positionTrackerKey, {
        action: 'add',
        decorations: [deco],
      })
      .setMeta('addToHistory', false);

    this.#editor.dispatch(tr);
    return id;
  }

  trackMany(ranges: Array<{ from: number; to: number; spec: Omit<TrackedRangeSpec, 'id'> }>): string[] {
    if (!this.#editor?.state) {
      return ranges.map(() => uuidv4());
    }

    const ids: string[] = [];
    const decorations: Decoration[] = [];

    for (const { from, to, spec } of ranges) {
      const id = uuidv4();
      ids.push(id);
      const fullSpec: TrackedRangeSpec = { kind: 'range', ...spec, id };
      decorations.push(Decoration.inline(from, to, {}, fullSpec));
    }

    const tr = this.#editor.state.tr
      .setMeta(positionTrackerKey, {
        action: 'add',
        decorations,
      })
      .setMeta('addToHistory', false);

    this.#editor.dispatch(tr);
    return ids;
  }

  trackNode(input: TrackNodeInput, spec?: Omit<TrackedRangeSpec, 'id' | 'kind'>): string | null {
    const [trackedId] = this.trackNodes([input], spec);
    return trackedId ?? null;
  }

  trackNodes(inputs: TrackNodeInput[], spec?: Omit<TrackedRangeSpec, 'id' | 'kind'>): Array<string | null> {
    if (!Array.isArray(inputs) || inputs.length === 0) return [];

    const trackSpec = { type: DEFAULT_TRACKED_NODE_TYPE, ...(spec ?? {}) };
    const pendingRanges: Array<{ from: number; to: number; spec: Omit<TrackedRangeSpec, 'id'> }> = [];
    const pendingInputIndexes: number[] = [];
    const results: Array<string | null> = Array.from({ length: inputs.length }, () => null);

    for (let index = 0; index < inputs.length; index += 1) {
      const address = getTrackableAddress(inputs[index]);
      if (!address) continue;

      const resolved = this.#resolveTrackNodeAddress(address);
      if (!resolved) continue;

      pendingRanges.push({
        from: resolved.from,
        to: resolved.to,
        spec: trackSpec,
      });
      pendingInputIndexes.push(index);
    }

    if (pendingRanges.length === 0) return results;

    const trackedIds = this.trackMany(pendingRanges);
    for (let i = 0; i < pendingInputIndexes.length; i += 1) {
      const inputIndex = pendingInputIndexes[i];
      results[inputIndex] = trackedIds[i] ?? null;
    }

    return results;
  }

  untrack(id: string): void {
    if (!this.#editor?.state) return;
    const tr = this.#editor.state.tr
      .setMeta(positionTrackerKey, {
        action: 'remove',
        ids: [id],
      })
      .setMeta('addToHistory', false);
    this.#editor.dispatch(tr);
  }

  untrackMany(ids: string[]): void {
    if (!this.#editor?.state || ids.length === 0) return;
    const tr = this.#editor.state.tr
      .setMeta(positionTrackerKey, {
        action: 'remove',
        ids,
      })
      .setMeta('addToHistory', false);
    this.#editor.dispatch(tr);
  }

  untrackByType(type: string): void {
    if (!this.#editor?.state) return;
    const tr = this.#editor.state.tr
      .setMeta(positionTrackerKey, {
        action: 'removeByType',
        type,
      })
      .setMeta('addToHistory', false);
    this.#editor.dispatch(tr);
  }

  resolve(id: string): ResolvedRange | null {
    const state = this.#getState();
    if (!state) return null;
    const found = state.decorations.find().find((decoration) => (decoration.spec as TrackedRangeSpec).id === id);
    if (!found) return null;

    const spec = found.spec as TrackedRangeSpec;
    return {
      id: spec.id,
      from: found.from,
      to: found.to,
      spec,
    };
  }

  resolveMany(ids: string[]): Map<string, ResolvedRange | null> {
    const result = new Map<string, ResolvedRange | null>();
    for (const id of ids) {
      result.set(id, null);
    }

    const state = this.#getState();
    if (!state || ids.length === 0) return result;

    const idSet = new Set(ids);
    for (const decoration of state.decorations.find()) {
      const spec = decoration.spec as TrackedRangeSpec;
      if (idSet.has(spec.id)) {
        result.set(spec.id, {
          id: spec.id,
          from: decoration.from,
          to: decoration.to,
          spec,
        });
      }
    }

    return result;
  }

  findByType(type: string): ResolvedRange[] {
    const state = this.#getState();
    if (!state) return [];

    return state.decorations
      .find()
      .filter((decoration) => (decoration.spec as TrackedRangeSpec).type === type)
      .map((decoration) => {
        const spec = decoration.spec as TrackedRangeSpec;
        return {
          id: spec.id,
          from: decoration.from,
          to: decoration.to,
          spec,
        };
      });
  }

  goToTracked(id: string, options?: { block?: ScrollBlock }): boolean {
    const resolved = this.resolve(id);
    if (!resolved) return false;

    const from = Math.max(0, Math.min(resolved.from, this.#editor.state.doc.content.size));
    const to = Math.max(from, Math.min(resolved.to, this.#editor.state.doc.content.size));
    const block = options?.block ?? 'center';

    if (this.#editor.commands?.setTextSelection) {
      this.#editor.commands.setTextSelection({ from, to });
    } else if (this.#editor.state) {
      const tr = this.#editor.state.tr
        .setSelection(TextSelection.create(this.#editor.state.doc, from, to))
        .scrollIntoView();
      this.#editor.dispatch(tr);
    }

    const presentationEditor = this.#editor.presentationEditor;
    const didPresentationScroll = presentationEditor?.scrollToPosition?.(from, { block }) ?? false;

    if (!didPresentationScroll) {
      Promise.resolve(presentationEditor?.scrollToPositionAsync?.(from, { block })).catch(() => {});

      try {
        const { node } = this.#editor.view?.domAtPos(from) ?? { node: null };
        if (typeof Element !== 'undefined' && node instanceof Element) {
          node.scrollIntoView({ block, inline: 'nearest' });
        } else if ((node as Node | null)?.parentElement) {
          (node as Node).parentElement?.scrollIntoView({ block, inline: 'nearest' });
        }
      } catch {
        // Ignore scroll failures in environments with incomplete DOM APIs.
      }
    }

    return true;
  }

  get generation(): number {
    return this.#getState()?.generation ?? 0;
  }
}
