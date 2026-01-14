import type { Transaction } from 'prosemirror-state';
import { Plugin, PluginKey } from 'prosemirror-state';
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

export type PositionTrackerState = {
  decorations: DecorationSet;
  generation: number;
};

type PositionTrackerMeta =
  | { action: 'add'; decorations: Decoration[] }
  | { action: 'remove'; ids: string[] }
  | { action: 'removeByType'; type: string };

export const positionTrackerKey = new PluginKey<PositionTrackerState>('positionTracker');

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
        return DecorationSet.empty;
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

  get generation(): number {
    return this.#getState()?.generation ?? 0;
  }
}
