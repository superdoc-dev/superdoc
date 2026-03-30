/**
 * Track-changes convenience wrappers — bridge track-change operations to
 * the plan engine's revision management and execution path.
 *
 * Read operations (list, get) are pure queries.
 * Mutating operations (accept, reject, acceptAll, rejectAll) delegate to
 * editor commands with plan-engine revision tracking.
 */

import type { Editor } from '../../core/Editor.js';
import type {
  Receipt,
  RevisionGuardOptions,
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
import { buildResolvedHandle, buildDiscoveryItem, buildDiscoveryResult } from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../errors.js';
import { requireEditorCommand } from '../helpers/mutation-helpers.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { paginate, validatePaginationInput } from '../helpers/adapter-utils.js';
import { getRevision } from './revision-tracker.js';
import {
  groupTrackedChanges,
  resolveTrackedChange,
  resolveTrackedChangeType,
  type GroupedTrackedChange,
} from '../helpers/tracked-change-resolver.js';
import { normalizeExcerpt, toNonEmptyString } from '../helpers/value-utils.js';

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

// ---------------------------------------------------------------------------
// Read operations (queries)
// ---------------------------------------------------------------------------

export function trackChangesListWrapper(editor: Editor, input?: TrackChangesListInput): TrackChangesListResult {
  const query = input;
  validatePaginationInput(query?.offset, query?.limit);
  const grouped = filterByType(groupTrackedChanges(editor), query?.type);
  const paged = paginate(grouped, query?.offset, query?.limit);
  const evaluatedRevision = getRevision(editor);

  const items = paged.items.map((change) => {
    const info = buildTrackChangeInfo(editor, change);
    const handle = buildResolvedHandle(`tc:${info.id}`, 'stable', 'trackedChange');
    const { address, type, author, authorEmail, authorImage, date, excerpt } = info;
    return buildDiscoveryItem(info.id, handle, { address, type, author, authorEmail, authorImage, date, excerpt });
  });

  return buildDiscoveryResult({
    evaluatedRevision,
    total: paged.total,
    items,
    page: { limit: query?.limit ?? paged.total, offset: query?.offset ?? 0, returned: items.length },
  });
}

export function trackChangesGetWrapper(editor: Editor, input: TrackChangesGetInput): TrackChangeInfo {
  const { id } = input;
  return buildTrackChangeInfo(editor, requireTrackChangeById(editor, id));
}

// ---------------------------------------------------------------------------
// Mutating operations (wrappers)
// ---------------------------------------------------------------------------

export function trackChangesAcceptWrapper(
  editor: Editor,
  input: TrackChangesAcceptInput,
  options?: RevisionGuardOptions,
): Receipt {
  const { id } = input;
  const change = requireTrackChangeById(editor, id);
  const acceptById = requireEditorCommand(editor.commands?.acceptTrackedChangeById, 'Accept tracked change');

  const receipt = executeDomainCommand(editor, () => Boolean(acceptById(change.rawId)), {
    expectedRevision: options?.expectedRevision,
  });

  if (receipt.steps[0]?.effect !== 'changed') {
    return toNoOpReceipt(`Accept tracked change "${id}" produced no change.`, { id });
  }

  return { success: true };
}

export function trackChangesRejectWrapper(
  editor: Editor,
  input: TrackChangesRejectInput,
  options?: RevisionGuardOptions,
): Receipt {
  const { id } = input;
  const change = requireTrackChangeById(editor, id);
  const rejectById = requireEditorCommand(editor.commands?.rejectTrackedChangeById, 'Reject tracked change');

  const receipt = executeDomainCommand(editor, () => Boolean(rejectById(change.rawId)), {
    expectedRevision: options?.expectedRevision,
  });

  if (receipt.steps[0]?.effect !== 'changed') {
    return toNoOpReceipt(`Reject tracked change "${id}" produced no change.`, { id });
  }

  return { success: true };
}

export function trackChangesAcceptAllWrapper(
  editor: Editor,
  _input: TrackChangesAcceptAllInput,
  options?: RevisionGuardOptions,
): Receipt {
  const acceptAll = requireEditorCommand(editor.commands?.acceptAllTrackedChanges, 'Accept all tracked changes');

  if (groupTrackedChanges(editor).length === 0) {
    return toNoOpReceipt('Accept all tracked changes produced no change.');
  }

  const receipt = executeDomainCommand(editor, () => Boolean(acceptAll()), {
    expectedRevision: options?.expectedRevision,
  });

  if (receipt.steps[0]?.effect !== 'changed') {
    return toNoOpReceipt('Accept all tracked changes produced no change.');
  }

  return { success: true };
}

export function trackChangesRejectAllWrapper(
  editor: Editor,
  _input: TrackChangesRejectAllInput,
  options?: RevisionGuardOptions,
): Receipt {
  const rejectAll = requireEditorCommand(editor.commands?.rejectAllTrackedChanges, 'Reject all tracked changes');

  if (groupTrackedChanges(editor).length === 0) {
    return toNoOpReceipt('Reject all tracked changes produced no change.');
  }

  const receipt = executeDomainCommand(editor, () => Boolean(rejectAll()), {
    expectedRevision: options?.expectedRevision,
  });

  if (receipt.steps[0]?.effect !== 'changed') {
    return toNoOpReceipt('Reject all tracked changes produced no change.');
  }

  return { success: true };
}
