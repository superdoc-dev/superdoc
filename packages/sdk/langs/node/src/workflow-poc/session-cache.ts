import type { BoundDocApi } from '../generated/client.js';
import type { WorkflowDocIndex } from './doc-index.js';

export type WorkflowSessionState = {
  documentKey: string;
  createdAtMs: number;
  updatedAtMs: number;
  latestIndex?: WorkflowDocIndex;
  indexesByRevision: Map<string, WorkflowDocIndex>;
};

export class WorkflowSessionCache {
  private readonly states = new WeakMap<BoundDocApi, WorkflowSessionState>();
  private nextId = 1;

  getState(documentHandle: BoundDocApi): WorkflowSessionState {
    const cached = this.states.get(documentHandle);
    if (cached != null) {
      return cached;
    }

    const now = Date.now();
    const created: WorkflowSessionState = {
      documentKey: `workflow-doc-${this.nextId++}`,
      createdAtMs: now,
      updatedAtMs: now,
      indexesByRevision: new Map<string, WorkflowDocIndex>(),
    };
    this.states.set(documentHandle, created);
    return created;
  }

  getCachedIndex(documentHandle: BoundDocApi, revision?: string): WorkflowDocIndex | undefined {
    const state = this.getState(documentHandle);
    if (revision == null) {
      return state.latestIndex;
    }
    return state.indexesByRevision.get(revision);
  }

  setCachedIndex(documentHandle: BoundDocApi, index: WorkflowDocIndex): WorkflowSessionState {
    const state = this.getState(documentHandle);
    state.indexesByRevision.set(index.revision, index);
    state.latestIndex = index;
    state.updatedAtMs = Date.now();
    return state;
  }
}

export function createWorkflowSessionCache(): WorkflowSessionCache {
  return new WorkflowSessionCache();
}

export const workflowPocSessionCache = createWorkflowSessionCache();
