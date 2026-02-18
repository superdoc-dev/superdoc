import type { Editor } from '../core/Editor.js';
import type {
  Receipt,
  TrackChangeInfo,
  TrackChangesAcceptAllInput,
  TrackChangesAcceptInput,
  TrackChangesGetInput,
  TrackChangesListInput,
  TrackChangesRejectAllInput,
  TrackChangesRejectInput,
  TrackChangeType,
  TrackChangesListResult,
} from '@superdoc/document-api';
import { DocumentApiAdapterError } from './errors.js';
import { requireEditorCommand } from './helpers/mutation-helpers.js';
import { paginate } from './helpers/adapter-utils.js';
import {
  groupTrackedChanges,
  resolveTrackedChange,
  resolveTrackedChangeType,
  type GroupedTrackedChange,
} from './helpers/tracked-change-resolver.js';
import { normalizeExcerpt, toNonEmptyString } from './helpers/value-utils.js';

function buildTrackChangeInfo(editor: Editor, change: GroupedTrackedChange): TrackChangeInfo {
  const excerpt = normalizeExcerpt(editor.state.doc.textBetween(change.from, change.to, ' ', '\ufffc'));
  const type = resolveTrackedChangeType(change);

  return {
    address: {
      kind: 'entity',
      entityType: 'trackedChange',
      entityId: change.id,
    },
    id: change.id,
    type,
    author: toNonEmptyString(change.attrs.author),
    authorEmail: toNonEmptyString(change.attrs.authorEmail),
    authorImage: toNonEmptyString(change.attrs.authorImage),
    date: toNonEmptyString(change.attrs.date),
    excerpt,
  };
}

function filterByType(changes: GroupedTrackedChange[], requestedType?: TrackChangeType): GroupedTrackedChange[] {
  if (!requestedType) return changes;
  return changes.filter((change) => resolveTrackedChangeType(change) === requestedType);
}

function requireTrackChangeById(editor: Editor, id: string): GroupedTrackedChange {
  const change = resolveTrackedChange(editor, id);
  if (change) return change;

  throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Tracked change "${id}" was not found.`, {
    id,
  });
}

function toNoOpReceipt(message: string, details?: unknown): Receipt {
  return {
    success: false,
    failure: {
      code: 'NO_OP',
      message,
      details,
    },
  };
}

export function trackChangesListAdapter(editor: Editor, input?: TrackChangesListInput): TrackChangesListResult {
  const query = input;
  const grouped = filterByType(groupTrackedChanges(editor), query?.type);
  const paged = paginate(grouped, query?.offset, query?.limit);
  const changes = paged.items.map((item) => buildTrackChangeInfo(editor, item));
  const matches = changes.map((change) => change.address);

  return {
    matches,
    total: paged.total,
    changes: changes.length ? changes : undefined,
  };
}

export function trackChangesGetAdapter(editor: Editor, input: TrackChangesGetInput): TrackChangeInfo {
  const { id } = input;
  return buildTrackChangeInfo(editor, requireTrackChangeById(editor, id));
}

export function trackChangesAcceptAdapter(editor: Editor, input: TrackChangesAcceptInput): Receipt {
  const { id } = input;
  const change = requireTrackChangeById(editor, id);

  const acceptById = requireEditorCommand(editor.commands?.acceptTrackedChangeById, 'Accept tracked change');
  const didAccept = Boolean(acceptById(change.rawId));
  if (didAccept) return { success: true };

  return toNoOpReceipt(`Accept tracked change "${id}" produced no change.`, { id });
}

export function trackChangesRejectAdapter(editor: Editor, input: TrackChangesRejectInput): Receipt {
  const { id } = input;
  const change = requireTrackChangeById(editor, id);

  const rejectById = requireEditorCommand(editor.commands?.rejectTrackedChangeById, 'Reject tracked change');
  const didReject = Boolean(rejectById(change.rawId));
  if (didReject) return { success: true };

  return toNoOpReceipt(`Reject tracked change "${id}" produced no change.`, { id });
}

export function trackChangesAcceptAllAdapter(editor: Editor, _input: TrackChangesAcceptAllInput): Receipt {
  const acceptAll = requireEditorCommand(editor.commands?.acceptAllTrackedChanges, 'Accept all tracked changes');

  if (groupTrackedChanges(editor).length === 0) {
    return toNoOpReceipt('Accept all tracked changes produced no change.');
  }

  const didAcceptAll = Boolean(acceptAll());
  if (didAcceptAll) return { success: true };

  return toNoOpReceipt('Accept all tracked changes produced no change.');
}

export function trackChangesRejectAllAdapter(editor: Editor, _input: TrackChangesRejectAllInput): Receipt {
  const rejectAll = requireEditorCommand(editor.commands?.rejectAllTrackedChanges, 'Reject all tracked changes');

  if (groupTrackedChanges(editor).length === 0) {
    return toNoOpReceipt('Reject all tracked changes produced no change.');
  }

  const didRejectAll = Boolean(rejectAll());
  if (didRejectAll) return { success: true };

  return toNoOpReceipt('Reject all tracked changes produced no change.');
}
