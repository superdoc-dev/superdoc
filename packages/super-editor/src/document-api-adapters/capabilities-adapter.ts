import type { Editor } from '../core/Editor.js';
import {
  CAPABILITY_REASON_CODES,
  COMMAND_CATALOG,
  type CapabilityReasonCode,
  type DocumentApiCapabilities,
  type OperationId,
  OPERATION_IDS,
} from '@superdoc/document-api';
import { TrackFormatMarkName } from '../extensions/track-changes/constants.js';

type EditorCommandName = string;

// Singleton write operations (insert, replace, delete) have no entry here because
// they are backed by writeAdapter which is always available when the editor exists.
// Read-only operations (find, getNode, getText, info, etc.) similarly need no commands.
const REQUIRED_COMMANDS: Partial<Record<OperationId, readonly EditorCommandName[]>> = {
  'create.paragraph': ['insertParagraphAt'],
  'create.heading': ['insertHeadingAt'],
  'lists.insert': ['insertListItemAt'],
  'lists.setType': ['setListTypeAt'],
  'lists.indent': ['setTextSelection', 'increaseListIndent'],
  'lists.outdent': ['setTextSelection', 'decreaseListIndent'],
  'lists.restart': ['setTextSelection', 'restartNumbering'],
  'lists.exit': ['exitListItemAt'],
  'comments.add': ['addComment', 'setTextSelection'],
  'comments.edit': ['editComment'],
  'comments.reply': ['addCommentReply'],
  'comments.move': ['moveComment'],
  'comments.resolve': ['resolveComment'],
  'comments.remove': ['removeComment'],
  'comments.setInternal': ['setCommentInternal'],
  'comments.setActive': ['setActiveComment'],
  'comments.goTo': ['setCursorById'],
  'trackChanges.accept': ['acceptTrackedChangeById'],
  'trackChanges.reject': ['rejectTrackedChangeById'],
  'trackChanges.acceptAll': ['acceptAllTrackedChanges'],
  'trackChanges.rejectAll': ['rejectAllTrackedChanges'],
};

/** Runtime guard — ensures only canonical reason codes are emitted even if the set grows. */
const VALID_CAPABILITY_REASON_CODES = new Set<CapabilityReasonCode>(CAPABILITY_REASON_CODES);

function hasCommand(editor: Editor, command: EditorCommandName): boolean {
  return typeof (editor.commands as Record<string, unknown> | undefined)?.[command] === 'function';
}

function hasAllCommands(editor: Editor, operationId: OperationId): boolean {
  const required = REQUIRED_COMMANDS[operationId];
  if (!required || required.length === 0) return true;
  return required.every((command) => hasCommand(editor, command));
}

function hasMarkCapability(editor: Editor, markName: string): boolean {
  return Boolean(editor.schema?.marks?.[markName]);
}

/** Map from format operation IDs to their editor mark names. */
const FORMAT_MARK_MAP: Partial<Record<OperationId, string>> = {
  'format.bold': 'bold',
  'format.italic': 'italic',
  'format.underline': 'underline',
  'format.strikethrough': 'strike',
};

function hasTrackedModeCapability(editor: Editor, operationId: OperationId): boolean {
  if (!hasCommand(editor, 'insertTrackedChange')) return false;
  // ensureTrackedCapability (mutation-helpers.ts) requires editor.options.user;
  // report tracked mode as unavailable when no user is configured so capability-
  // gated clients don't offer tracked actions that would deterministically fail.
  if (!editor.options?.user) return false;
  if (FORMAT_MARK_MAP[operationId]) {
    return Boolean(editor.schema?.marks?.[TrackFormatMarkName]);
  }
  return true;
}

function getNamespaceOperationIds(prefix: string): OperationId[] {
  return (Object.keys(REQUIRED_COMMANDS) as OperationId[]).filter((id) => id.startsWith(`${prefix}.`));
}

function isCommentsNamespaceEnabled(editor: Editor): boolean {
  return getNamespaceOperationIds('comments').every((id) => hasAllCommands(editor, id));
}

function isListsNamespaceEnabled(editor: Editor): boolean {
  return getNamespaceOperationIds('lists').every((id) => hasAllCommands(editor, id));
}

function isTrackChangesEnabled(editor: Editor): boolean {
  return (
    hasCommand(editor, 'insertTrackedChange') &&
    hasCommand(editor, 'acceptTrackedChangeById') &&
    hasCommand(editor, 'rejectTrackedChangeById') &&
    hasCommand(editor, 'acceptAllTrackedChanges') &&
    hasCommand(editor, 'rejectAllTrackedChanges')
  );
}

function getNamespaceReason(enabled: boolean): CapabilityReasonCode[] | undefined {
  return enabled ? undefined : ['NAMESPACE_UNAVAILABLE'];
}

function pushReason(reasons: CapabilityReasonCode[], reason: CapabilityReasonCode): void {
  if (!VALID_CAPABILITY_REASON_CODES.has(reason)) return;
  if (!reasons.includes(reason)) reasons.push(reason);
}

function isOperationAvailable(editor: Editor, operationId: OperationId): boolean {
  const markName = FORMAT_MARK_MAP[operationId];
  if (markName) {
    return hasMarkCapability(editor, markName);
  }

  return hasAllCommands(editor, operationId);
}

function isCommandBackedAvailability(operationId: OperationId): boolean {
  return !FORMAT_MARK_MAP[operationId];
}

function buildOperationCapabilities(editor: Editor): DocumentApiCapabilities['operations'] {
  const operations = {} as DocumentApiCapabilities['operations'];

  for (const operationId of OPERATION_IDS) {
    const metadata = COMMAND_CATALOG[operationId];
    const available = isOperationAvailable(editor, operationId);
    const tracked = available && metadata.supportsTrackedMode && hasTrackedModeCapability(editor, operationId);
    // dryRun is only meaningful for an operation that is currently executable.
    const dryRun = metadata.supportsDryRun && available;
    const reasons: CapabilityReasonCode[] = [];

    if (!available) {
      if (isCommandBackedAvailability(operationId)) {
        pushReason(reasons, 'COMMAND_UNAVAILABLE');
      }
      pushReason(reasons, 'OPERATION_UNAVAILABLE');
    }

    if (metadata.supportsTrackedMode && !tracked) {
      pushReason(reasons, 'TRACKED_MODE_UNAVAILABLE');
    }

    if (metadata.supportsDryRun && !dryRun) {
      pushReason(reasons, 'DRY_RUN_UNAVAILABLE');
    }

    operations[operationId] = {
      available,
      tracked,
      dryRun,
      reasons: reasons.length > 0 ? reasons : undefined,
    };
  }

  return operations;
}

/**
 * Builds a {@link DocumentApiCapabilities} snapshot by introspecting the editor's
 * registered commands and schema marks.
 *
 * @param editor - The ProseMirror-backed editor instance to introspect.
 * @returns A complete capability snapshot covering global flags and per-operation details.
 */
export function getDocumentApiCapabilities(editor: Editor): DocumentApiCapabilities {
  const operations = buildOperationCapabilities(editor);
  const commentsEnabled = isCommentsNamespaceEnabled(editor);
  const listsEnabled = isListsNamespaceEnabled(editor);
  const trackChangesEnabled = isTrackChangesEnabled(editor);
  const dryRunEnabled = OPERATION_IDS.some((operationId) => operations[operationId].dryRun);

  return {
    global: {
      trackChanges: {
        enabled: trackChangesEnabled,
        reasons: getNamespaceReason(trackChangesEnabled),
      },
      comments: {
        enabled: commentsEnabled,
        reasons: getNamespaceReason(commentsEnabled),
      },
      lists: {
        enabled: listsEnabled,
        reasons: getNamespaceReason(listsEnabled),
      },
      dryRun: {
        enabled: dryRunEnabled,
        reasons: dryRunEnabled ? undefined : ['DRY_RUN_UNAVAILABLE'],
      },
    },
    operations,
  };
}
