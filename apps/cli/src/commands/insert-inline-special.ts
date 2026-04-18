import type { SelectionTarget, TextAddress } from '@superdoc/document-api';
import { resolveSelectionTarget, resolveDefaultInsertTarget } from 'superdoc/super-editor';
import { getBooleanOption, getStringOption, resolveDocArg } from '../lib/args';
import { assertExpectedRevision, markContextUpdated, withActiveContext, writeContextMetadata } from '../lib/context';
import {
  exportOptionalSessionOutput,
  exportToPath,
  openDocument,
  openSessionDocument,
  type EditorWithDoc,
  type OptionalExportResult,
} from '../lib/document';
import { CliError } from '../lib/errors';
import { extractInvokeInput } from '../lib/invoke-input';
import { parseOperationArgs } from '../lib/operation-args';
import { syncCollaborativeSessionSnapshot } from '../lib/session-collab';
import type { CommandContext, CommandExecution } from '../lib/types';

type InlineSpecialKind = 'tab' | 'lineBreak';

type DocumentPayload = {
  path?: string;
  source: 'path' | 'stdin' | 'blank';
  byteLength: number;
  revision: number;
};

type ResolvedInsertionPoint =
  | {
      kind: 'text-block';
      target: TextAddress;
      range: { from: number; to: number };
    }
  | {
      kind: 'structural-end';
      target: TextAddress;
      insertPos: number;
    };

type InlineSpecialChain = {
  setMeta(key: string, value: unknown): InlineSpecialChain;
  setTextSelection(position: { from: number; to: number }): InlineSpecialChain;
  insertParagraphAt(options: { pos: number; tracked?: boolean }): InlineSpecialChain;
  insertTabNode(): InlineSpecialChain;
  insertLineBreak(): InlineSpecialChain;
  run(): boolean;
};

const COMMAND_BY_KIND: Record<
  InlineSpecialKind,
  { operationId: 'doc.insertTab' | 'doc.insertLineBreak'; label: string }
> = {
  tab: { operationId: 'doc.insertTab', label: 'tab' },
  lineBreak: { operationId: 'doc.insertLineBreak', label: 'line break' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isSelectionTarget(value: unknown): value is SelectionTarget {
  return isRecord(value) && value.kind === 'selection' && isRecord(value.start) && isRecord(value.end);
}

function isCollapsedTextSelectionTarget(target: SelectionTarget): target is SelectionTarget & {
  start: { kind: 'text'; blockId: string; offset: number };
  end: { kind: 'text'; blockId: string; offset: number };
} {
  return (
    target.start.kind === 'text' &&
    target.end.kind === 'text' &&
    target.start.blockId === target.end.blockId &&
    target.start.offset === target.end.offset
  );
}

function buildPrettyOutput(kind: InlineSpecialKind, revision: number, outputPath?: string): string {
  const label = COMMAND_BY_KIND[kind].label;
  return outputPath
    ? `Revision ${revision}: inserted ${label} -> ${outputPath}`
    : `Revision ${revision}: inserted ${label}`;
}

async function resolveInsertionPoint(
  editor: EditorWithDoc,
  input: Record<string, unknown>,
  kind: InlineSpecialKind,
): Promise<ResolvedInsertionPoint> {
  const apiInput = extractInvokeInput('insert', input);
  if (!isRecord(apiInput)) {
    throw new CliError('INVALID_ARGUMENT', `insert ${COMMAND_BY_KIND[kind].label}: invalid target input.`);
  }

  const ref = typeof apiInput.ref === 'string' ? apiInput.ref : undefined;
  const rawTarget = apiInput.target;

  if (ref) {
    const resolved = editor.doc.invoke({
      operationId: 'ranges.resolve',
      input: {
        start: { kind: 'ref', ref, boundary: 'start' },
        end: { kind: 'ref', ref, boundary: 'start' },
      },
    }) as { target?: unknown };

    if (!isSelectionTarget(resolved?.target) || !isCollapsedTextSelectionTarget(resolved.target)) {
      throw new CliError(
        'INVALID_TARGET',
        `insert ${COMMAND_BY_KIND[kind].label}: ref must resolve to a collapsed text insertion point.`,
      );
    }

    const collapsedTarget: TextAddress = {
      kind: 'text',
      blockId: resolved.target.start.blockId,
      range: { start: resolved.target.start.offset, end: resolved.target.start.offset },
    };
    const resolvedRange = resolveSelectionTarget(editor, resolved.target);
    return {
      target: collapsedTarget,
      range: { from: resolvedRange.absFrom, to: resolvedRange.absTo },
    };
  }

  if (rawTarget !== undefined) {
    if (!isSelectionTarget(rawTarget)) {
      throw new CliError(
        'INVALID_TARGET',
        `insert ${COMMAND_BY_KIND[kind].label}: target must be a collapsed text selection.`,
      );
    }

    const selectionTarget = rawTarget;
    if (!isCollapsedTextSelectionTarget(selectionTarget)) {
      throw new CliError(
        'INVALID_TARGET',
        `insert ${COMMAND_BY_KIND[kind].label}: target must be a collapsed text selection.`,
      );
    }

    const resolvedRange = resolveSelectionTarget(editor, selectionTarget);
    return {
      target: {
        kind: 'text',
        blockId: selectionTarget.start.blockId,
        range: { start: selectionTarget.start.offset, end: selectionTarget.start.offset },
      },
      range: { from: resolvedRange.absFrom, to: resolvedRange.absTo },
    };
  }

  const fallback = resolveDefaultInsertTarget(editor);
  if (!fallback) {
    throw new CliError(
      'TARGET_NOT_FOUND',
      `insert ${COMMAND_BY_KIND[kind].label}: no writable text block is available. Pass an explicit collapsed text target.`,
    );
  }

  if (fallback.kind === 'structural-end') {
    return {
      kind: 'structural-end',
      target: { kind: 'text', blockId: '', range: { start: 0, end: 0 } },
      insertPos: fallback.insertPos,
    };
  }

  return {
    kind: 'text-block',
    target: fallback.target,
    range: fallback.range,
  };
}

function executeInlineSpecialInsert(
  editor: EditorWithDoc,
  kind: InlineSpecialKind,
  insertionPoint: ResolvedInsertionPoint,
): void {
  const commandName = kind === 'tab' ? 'insertTabNode' : 'insertLineBreak';
  const commands = editor.commands as
    | (Record<string, ((...args: unknown[]) => boolean) | undefined> & {
        insertParagraphAt?: (options: { pos: number; tracked?: boolean }) => boolean;
      })
    | undefined;
  const command = commands?.[commandName];
  if (typeof command !== 'function') {
    throw new CliError(
      'CAPABILITY_UNAVAILABLE',
      `insert ${COMMAND_BY_KIND[kind].label}: ${commandName} is unavailable.`,
    );
  }

  let chain = editor.chain() as InlineSpecialChain;

  if (insertionPoint.kind === 'structural-end') {
    if (typeof commands?.insertParagraphAt !== 'function') {
      throw new CliError(
        'CAPABILITY_UNAVAILABLE',
        `insert ${COMMAND_BY_KIND[kind].label}: insertParagraphAt is unavailable.`,
      );
    }

    // No top-level text block exists. Create one at doc end, then insert into it.
    chain = chain
      .insertParagraphAt({ pos: insertionPoint.insertPos, tracked: false })
      .setTextSelection({ from: insertionPoint.insertPos + 1, to: insertionPoint.insertPos + 1 });
  } else {
    const { from, to } = insertionPoint.range;
    if (from !== to) {
      throw new CliError(
        'INVALID_TARGET',
        `insert ${COMMAND_BY_KIND[kind].label}: target must be collapsed to a single insertion point.`,
      );
    }

    chain = chain.setMeta('inputType', 'programmatic').setMeta('skipTrackChanges', true).setTextSelection({ from, to });
  }

  chain = kind === 'tab' ? chain.insertTabNode() : chain.insertLineBreak();
  if (chain.run() !== true) {
    throw new CliError('COMMAND_FAILED', `insert ${COMMAND_BY_KIND[kind].label}: editor command returned false.`);
  }
}

function buildSuccessData(
  kind: InlineSpecialKind,
  document: DocumentPayload,
  target: TextAddress,
  revision: number,
  output?: OptionalExportResult,
): Record<string, unknown> {
  return {
    document,
    receipt: {
      success: true,
      resolution: {
        target,
      },
    },
    inserted: { kind },
    context: { dirty: true, revision },
    output:
      output?.output ??
      (output?.warning
        ? {
            path: output.warning.path,
            failed: true,
            error: {
              code: output.warning.code,
              message: output.warning.message,
            },
          }
        : undefined),
  };
}

async function runInsertInlineSpecial(
  kind: InlineSpecialKind,
  tokens: string[],
  context: CommandContext,
): Promise<CommandExecution> {
  const commandSpec = COMMAND_BY_KIND[kind];
  const { parsed, help } = parseOperationArgs(commandSpec.operationId, tokens, {
    commandName: `insert ${kind === 'tab' ? 'tab' : 'line-break'}`,
  });

  if (help || getBooleanOption(parsed, 'help')) {
    return {
      command: kind === 'tab' ? 'insert tab' : 'insert line-break',
      data: {
        usage: [
          `superdoc insert ${kind === 'tab' ? 'tab' : 'line-break'} [doc] [--target-json '{...}'|--block-id <id> --offset <n>]`,
          `superdoc insert ${kind === 'tab' ? 'tab' : 'line-break'} [doc] [--ref <ref>] [--out <path>]`,
        ],
      },
      pretty: [
        'Usage:',
        `  superdoc insert ${kind === 'tab' ? 'tab' : 'line-break'} [doc] [--target-json '{...}'|--block-id <id> --offset <n>]`,
        `  superdoc insert ${kind === 'tab' ? 'tab' : 'line-break'} [doc] [--ref <ref>] [--out <path>]`,
      ].join('\n'),
    };
  }

  const { doc } = resolveDocArg(parsed, `insert ${COMMAND_BY_KIND[kind].label}`);
  const outPath = getStringOption(parsed, 'out');
  const force = getBooleanOption(parsed, 'force');
  const expectedRevisionRaw = parsed.options.expectedRevision;
  const expectedRevision = typeof expectedRevisionRaw === 'number' ? expectedRevisionRaw : undefined;
  const commandName = kind === 'tab' ? 'insert tab' : 'insert line-break';
  const input = parsed.options as Record<string, unknown>;

  if (doc && expectedRevision != null) {
    throw new CliError(
      'INVALID_ARGUMENT',
      `${commandName}: --expected-revision is only supported with an active open context.`,
    );
  }

  if (doc) {
    if (!outPath) {
      throw new CliError('MISSING_REQUIRED', `${commandName}: missing required --out.`);
    }

    const source = doc === '-' ? 'stdin' : 'path';
    const opened = await openDocument(doc, context.io);
    try {
      const resolved = await resolveInsertionPoint(opened.editor, input, kind);
      executeInlineSpecialInsert(opened.editor, kind, resolved);

      const output = await exportToPath(opened.editor, outPath, force);
      const document: DocumentPayload = {
        path: source === 'path' ? doc : undefined,
        source,
        byteLength: opened.meta.byteLength,
        revision: 0,
      };

      return {
        command: commandName,
        data: buildSuccessData(kind, document, resolved.target, 0, { output }),
        pretty: buildPrettyOutput(kind, 0, output.path),
      };
    } finally {
      opened.dispose();
    }
  }

  return withActiveContext(
    context.io,
    commandName,
    async ({ metadata, paths }) => {
      assertExpectedRevision(metadata, expectedRevision);

      const isHostMode = context.executionMode === 'host' && context.sessionPool != null;
      const opened = await openSessionDocument(paths.workingDocPath, context.io, metadata, {
        sessionId: context.sessionId ?? metadata.contextId,
        executionMode: context.executionMode,
        sessionPool: context.sessionPool,
      });

      try {
        const resolved = await resolveInsertionPoint(opened.editor, input, kind);
        executeInlineSpecialInsert(opened.editor, kind, resolved);

        let updatedMetadata: typeof metadata;
        let byteLength: number;

        if (isHostMode) {
          context.sessionPool!.markDirty(metadata.contextId);
          updatedMetadata = markContextUpdated(context.io, metadata, {
            dirty: true,
            revision: metadata.revision + 1,
          });
          await writeContextMetadata(paths, updatedMetadata);
          context.sessionPool!.updateMetadataRevision(metadata.contextId, updatedMetadata.revision);
          byteLength = opened.meta.byteLength;
        } else if (metadata.sessionType === 'collab') {
          const synced = await syncCollaborativeSessionSnapshot(context.io, metadata, paths, opened.editor);
          updatedMetadata = synced.updatedMetadata;
          byteLength = synced.output.byteLength;
        } else {
          const workingOutput = await exportToPath(opened.editor, paths.workingDocPath, true);
          updatedMetadata = markContextUpdated(context.io, metadata, {
            dirty: true,
            revision: metadata.revision + 1,
          });
          await writeContextMetadata(paths, updatedMetadata);
          byteLength = workingOutput.byteLength;
        }

        const externalOutput = await exportOptionalSessionOutput(opened.editor, context.io, outPath, force);
        const document: DocumentPayload = {
          path: updatedMetadata.sourcePath,
          source: updatedMetadata.source,
          byteLength,
          revision: updatedMetadata.revision,
        };

        return {
          command: commandName,
          data: buildSuccessData(kind, document, resolved.target, updatedMetadata.revision, externalOutput),
          pretty: buildPrettyOutput(kind, updatedMetadata.revision, externalOutput?.output?.path),
        };
      } finally {
        opened.dispose();
      }
    },
    context.sessionId,
    context.executionMode,
  );
}

/** Inserts a real Word tab node at a collapsed text insertion point. */
export function runInsertTab(tokens: string[], context: CommandContext): Promise<CommandExecution> {
  return runInsertInlineSpecial('tab', tokens, context);
}

/** Inserts a real Word line-break node at a collapsed text insertion point. */
export function runInsertLineBreak(tokens: string[], context: CommandContext): Promise<CommandExecution> {
  return runInsertInlineSpecial('lineBreak', tokens, context);
}
