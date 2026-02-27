import type { Editor } from '../core/Editor.js';
import {
  CAPABILITY_REASON_CODES,
  COMMAND_CATALOG,
  INLINE_PROPERTY_BY_KEY,
  INLINE_PROPERTY_KEY_SET,
  INLINE_PROPERTY_REGISTRY,
  type CapabilityReasonCode,
  type DocumentApiCapabilities,
  type InlinePropertyRegistryEntry,
  type InlineRunPatchKey,
  type PlanEngineCapabilities,
  type FormatCapabilities,
  type OperationId,
  OPERATION_IDS,
} from '@superdoc/document-api';
import { TrackFormatMarkName } from '../extensions/track-changes/constants.js';
import { isCollaborationActive } from './collaboration-detection.js';

type EditorCommandName = string;
type EditorWithBlockNodeHelper = Editor & {
  helpers?: {
    blockNode?: {
      getBlockNodeById?: unknown;
    };
  };
};

// Singleton write operations (insert, replace, delete) have no entry here because
// they are backed by writeAdapter which is always available when the editor exists.
// Read-only operations (find, getNode, getText, info, etc.) similarly need no commands.
const REQUIRED_COMMANDS: Partial<Record<OperationId, readonly EditorCommandName[]>> = {
  'format.align': ['setTextSelection', 'setTextAlign', 'unsetTextAlign'],
  'create.paragraph': ['insertParagraphAt'],
  'create.heading': ['insertHeadingAt'],
  'lists.insert': ['insertListItemAt'],
  'lists.setType': ['setListTypeAt'],
  'lists.indent': ['setTextSelection', 'increaseListIndent'],
  'lists.outdent': ['setTextSelection', 'decreaseListIndent'],
  'lists.restart': ['setTextSelection', 'restartNumbering'],
  'lists.exit': ['exitListItemAt'],
  'blocks.delete': ['deleteBlockNodeById'],
  'comments.create': ['addComment', 'setTextSelection', 'addCommentReply'],
  'comments.patch': ['editComment', 'moveComment', 'resolveComment', 'setCommentInternal'],
  'comments.delete': ['removeComment'],
  'trackChanges.decide': [
    'acceptTrackedChangeById',
    'rejectTrackedChangeById',
    'acceptAllTrackedChanges',
    'rejectAllTrackedChanges',
  ],
  // Table operations — implemented (insertTableAt proves the table extension is loaded):
  'create.table': ['insertTableAt'],
  'tables.delete': ['insertTableAt'],
  'tables.clearContents': ['insertTableAt'],
  'tables.move': ['insertTableAt'],
  'tables.setLayout': ['insertTableAt'],
  'tables.setAltText': ['insertTableAt'],
  'tables.insertRow': ['insertTableAt'],
  'tables.deleteRow': ['insertTableAt'],
  'tables.setRowHeight': ['insertTableAt'],
  'tables.distributeRows': ['insertTableAt'],
  'tables.setRowOptions': ['insertTableAt'],
  'tables.insertColumn': ['insertTableAt'],
  'tables.deleteColumn': ['insertTableAt'],
  'tables.setColumnWidth': ['insertTableAt'],
  'tables.distributeColumns': ['insertTableAt'],
  'tables.insertCell': ['insertTableAt'],
  'tables.deleteCell': ['insertTableAt'],
  'tables.mergeCells': ['insertTableAt'],
  'tables.unmergeCells': ['insertTableAt'],
  'tables.splitCell': ['insertTableAt'],
  'tables.setCellProperties': ['insertTableAt'],
  'tables.convertFromText': ['insertTableAt'],
  'tables.split': ['insertTableAt'],
  'tables.convertToText': ['insertTableAt'],
  'tables.sort': ['insertTableAt'],
  'tables.setStyle': ['insertTableAt'],
  'tables.clearStyle': ['insertTableAt'],
  'tables.setStyleOption': ['insertTableAt'],
  'tables.setBorder': ['insertTableAt'],
  'tables.clearBorder': ['insertTableAt'],
  'tables.applyBorderPreset': ['insertTableAt'],
  'tables.setShading': ['insertTableAt'],
  'tables.clearShading': ['insertTableAt'],
  'tables.setTablePadding': ['insertTableAt'],
  'tables.setCellPadding': ['insertTableAt'],
  'tables.setCellSpacing': ['insertTableAt'],
  'tables.clearCellSpacing': ['insertTableAt'],
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

/**
 * Operations that require specific editor helpers beyond commands.
 * Each entry maps an operation to a predicate that checks helper availability.
 */
const REQUIRED_HELPERS: Partial<Record<OperationId, (editor: Editor) => boolean>> = {
  'blocks.delete': (editor) =>
    typeof (editor as unknown as EditorWithBlockNodeHelper).helpers?.blockNode?.getBlockNodeById === 'function',
  'sections.setOddEvenHeadersFooters': (editor) => Boolean((editor as unknown as { converter?: unknown }).converter),
  'sections.setHeaderFooterRef': (editor) => Boolean((editor as unknown as { converter?: unknown }).converter),
};

function hasRequiredHelpers(editor: Editor, operationId: OperationId): boolean {
  const check = REQUIRED_HELPERS[operationId];
  if (!check) return true;
  return check(editor);
}

function hasMarkCapability(editor: Editor, markName: string): boolean {
  return Boolean(editor.schema?.marks?.[markName]);
}

/** Operation IDs whose availability is determined by schema mark presence, not editor commands. */
function isMarkBackedOperation(operationId: OperationId): boolean {
  return operationId === 'format.apply' || getInlineAliasKey(operationId) !== undefined;
}

/**
 * If `operationId` is a `format.<inlineKey>` alias, returns the corresponding
 * inline-property registry entry. Returns `undefined` otherwise.
 */
function getInlineAliasKey(operationId: OperationId): InlineRunPatchKey | undefined {
  if (!operationId.startsWith('format.')) return undefined;
  const key = operationId.slice('format.'.length);
  if (INLINE_PROPERTY_KEY_SET.has(key)) return key as InlineRunPatchKey;
  return undefined;
}

function isInlinePropertyAvailable(editor: Editor, property: InlinePropertyRegistryEntry): boolean {
  if (property.storage === 'mark') {
    if (property.carrier.storage !== 'mark') return false;
    const markName = property.carrier.markName === 'textStyle' ? 'textStyle' : property.carrier.markName;
    return hasMarkCapability(editor, markName);
  }
  return Boolean(editor.schema?.nodes?.run);
}

function hasTrackedModeCapability(editor: Editor, operationId: OperationId): boolean {
  if (!hasCommand(editor, 'insertTrackedChange')) return false;
  // ensureTrackedCapability (mutation-helpers.ts) requires editor.options.user;
  // report tracked mode as unavailable when no user is configured so capability-
  // gated clients don't offer tracked actions that would deterministically fail.
  if (!editor.options?.user) return false;

  // Inline alias operations additionally require the per-property tracked flag.
  const inlineKey = getInlineAliasKey(operationId);
  if (inlineKey !== undefined) {
    if (!INLINE_PROPERTY_BY_KEY[inlineKey].tracked) return false;
    return Boolean(editor.schema?.marks?.[TrackFormatMarkName]);
  }

  if (operationId === 'format.apply') {
    if (!editor.schema?.marks?.[TrackFormatMarkName]) return false;
    // Only report tracked if at least one tracked inline property is available.
    return INLINE_PROPERTY_REGISTRY.some((property) => property.tracked && isInlinePropertyAvailable(editor, property));
  }

  if (isMarkBackedOperation(operationId)) {
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

/** Operations that determine availability through non-command mechanisms. */
function isNonCommandBackedOperation(operationId: OperationId): boolean {
  return (
    operationId === 'format.apply' || operationId === 'styles.apply' || getInlineAliasKey(operationId) !== undefined
  );
}

/** Checks whether the styles part has a valid w:styles root element. */
function hasStylesRoot(stylesPart: unknown): boolean {
  const part = stylesPart as { elements?: Array<{ name?: string }> } | undefined;
  return part?.elements?.some((el) => el.name === 'w:styles') === true;
}

function isStylesApplyAvailable(editor: Editor): boolean {
  const converter = (editor as unknown as { converter?: { convertedXml?: Record<string, unknown> } }).converter;
  if (!converter?.convertedXml?.['word/styles.xml']) return false;
  if (!hasStylesRoot(converter.convertedXml['word/styles.xml'])) return false;
  if (isCollaborationActive(editor)) return false;
  return true;
}

/**
 * Returns the reason code when `styles.apply` is unavailable, or `undefined` if available.
 */
function getStylesApplyUnavailableReason(editor: Editor): CapabilityReasonCode | undefined {
  const converter = (editor as unknown as { converter?: { convertedXml?: Record<string, unknown> } }).converter;
  if (!converter) return 'OPERATION_UNAVAILABLE';
  if (!converter.convertedXml?.['word/styles.xml']) return 'STYLES_PART_MISSING';
  if (!hasStylesRoot(converter.convertedXml['word/styles.xml'])) return 'STYLES_PART_MISSING';
  if (isCollaborationActive(editor)) return 'COLLABORATION_ACTIVE';
  return undefined;
}

function isOperationAvailable(editor: Editor, operationId: OperationId): boolean {
  // format.apply is available when at least one inline property can be executed.
  if (operationId === 'format.apply') {
    return INLINE_PROPERTY_REGISTRY.some((property) => isInlinePropertyAvailable(editor, property));
  }

  // format.<inlineKey> aliases derive availability from the corresponding inline property.
  const inlineKey = getInlineAliasKey(operationId);
  if (inlineKey !== undefined) {
    return isInlinePropertyAvailable(editor, INLINE_PROPERTY_BY_KEY[inlineKey]);
  }

  // styles.apply requires converter + styles part + no collaboration
  if (operationId === 'styles.apply') {
    return isStylesApplyAvailable(editor);
  }

  return hasAllCommands(editor, operationId) && hasRequiredHelpers(editor, operationId);
}

function isCommandBackedAvailability(operationId: OperationId): boolean {
  return !isNonCommandBackedOperation(operationId);
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
      if (operationId === 'styles.apply') {
        const stylesReason = getStylesApplyUnavailableReason(editor);
        if (stylesReason) pushReason(reasons, stylesReason);
      } else if (isCommandBackedAvailability(operationId)) {
        if (!hasAllCommands(editor, operationId)) {
          pushReason(reasons, 'COMMAND_UNAVAILABLE');
        }
        if (!hasRequiredHelpers(editor, operationId)) {
          pushReason(reasons, 'HELPER_UNAVAILABLE');
        }
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

// ---------------------------------------------------------------------------
// Plan engine capabilities
// ---------------------------------------------------------------------------

const SUPPORTED_STEP_OPS = [
  'text.rewrite',
  'text.insert',
  'text.delete',
  'format.apply',
  'assert',
  'create.paragraph',
  'create.heading',
  'create.sectionBreak',
  'domain.command',
  'sections.setBreakType',
  'sections.setPageMargins',
  'sections.setHeaderFooterMargins',
  'sections.setPageSetup',
  'sections.setColumns',
  'sections.setLineNumbering',
  'sections.setPageNumbering',
  'sections.setTitlePage',
  'sections.setOddEvenHeadersFooters',
  'sections.setVerticalAlign',
  'sections.setSectionDirection',
  'sections.setHeaderFooterRef',
  'sections.clearHeaderFooterRef',
  'sections.setLinkToPrevious',
  'sections.setPageBorders',
  'sections.clearPageBorders',
  'create.table',
  'tables.delete',
  'tables.clearContents',
  'tables.move',
  'tables.split',
  'tables.convertFromText',
  'tables.convertToText',
  'tables.setLayout',
  'tables.insertRow',
  'tables.deleteRow',
  'tables.setRowHeight',
  'tables.distributeRows',
  'tables.setRowOptions',
  'tables.insertColumn',
  'tables.deleteColumn',
  'tables.setColumnWidth',
  'tables.distributeColumns',
  'tables.insertCell',
  'tables.deleteCell',
  'tables.mergeCells',
  'tables.unmergeCells',
  'tables.splitCell',
  'tables.setCellProperties',
  'tables.sort',
  'tables.setAltText',
  'tables.setStyle',
  'tables.clearStyle',
  'tables.setStyleOption',
  'tables.setBorder',
  'tables.clearBorder',
  'tables.applyBorderPreset',
  'tables.setShading',
  'tables.clearShading',
  'tables.setTablePadding',
  'tables.setCellPadding',
  'tables.setCellSpacing',
  'tables.clearCellSpacing',
] as const;
const SUPPORTED_NON_UNIFORM_STRATEGIES = ['error', 'useLeadingRun', 'majority', 'union'] as const;
const SUPPORTED_SET_MARKS = ['bold', 'italic', 'underline', 'strike'] as const;
const REGEX_MAX_PATTERN_LENGTH = 1024;

function buildFormatCapabilities(editor: Editor): FormatCapabilities {
  const trackedInlinePropertiesSupported = hasTrackedModeCapability(editor, 'format.apply');
  const supportedInlineProperties = {} as FormatCapabilities['supportedInlineProperties'];

  for (const property of INLINE_PROPERTY_REGISTRY) {
    const available = isInlinePropertyAvailable(editor, property);
    supportedInlineProperties[property.key] = {
      available,
      tracked: available && property.tracked && trackedInlinePropertiesSupported,
      type: property.type,
      storage: property.storage,
    };
  }

  return { supportedInlineProperties };
}

function buildPlanEngineCapabilities(): PlanEngineCapabilities {
  return {
    supportedStepOps: SUPPORTED_STEP_OPS,
    supportedNonUniformStrategies: SUPPORTED_NON_UNIFORM_STRATEGIES,
    supportedSetMarks: SUPPORTED_SET_MARKS,
    regex: {
      maxPatternLength: REGEX_MAX_PATTERN_LENGTH,
    },
  };
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
    format: buildFormatCapabilities(editor),
    operations,
    planEngine: buildPlanEngineCapabilities(),
  };
}
