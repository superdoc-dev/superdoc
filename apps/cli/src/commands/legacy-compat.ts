import type { SelectionTarget, TextAddress } from '@superdoc/document-api';
import { glob } from 'fast-glob';
import { resolveSelectionTarget, resolveDefaultInsertTarget } from 'superdoc/super-editor';
import { getBooleanOption, getStringOption, resolveDocArg } from '../lib/args';
import { assertExpectedRevision, markContextUpdated, withActiveContext, writeContextMetadata } from '../lib/context';
import {
  exportOptionalSessionOutput,
  exportToPath,
  openDocument,
  openSessionDocument,
  type EditorWithDoc,
  type OpenedDocument,
  type OpenedRuntimeDocument,
  type OptionalExportResult,
} from '../lib/document';
import { CliError } from '../lib/errors';
import { extractInvokeInput } from '../lib/invoke-input';
import { parseOperationArgs } from '../lib/operation-args';
import { syncCollaborativeSessionSnapshot } from '../lib/session-collab';
import type { CliIO, CommandContext, CommandExecution } from '../lib/types';

type LegacyCommand = 'search' | 'read' | 'replace-legacy';

interface LegacySearchMatch {
  from: number;
  to: number;
  text: string;
  context?: string;
}

interface LegacySearchFileResult {
  path: string;
  matches: LegacySearchMatch[];
}

interface LegacySearchResult {
  pattern: string;
  files: LegacySearchFileResult[];
  totalMatches: number;
}

interface LegacyReadResult {
  path: string;
  content: string;
}

interface LegacyReplaceFileResult {
  path: string;
  replacements: number;
}

interface LegacyReplaceResult {
  find: string;
  replace: string;
  files: LegacyReplaceFileResult[];
  totalReplacements: number;
}

type LegacyCompatHandled = {
  handled: true;
  exitCode: number;
};

type LegacyCompatNotHandled = {
  handled: false;
};

/** Discriminated result of a legacy compatibility command attempt. */
export type LegacyCompatResult = LegacyCompatHandled | LegacyCompatNotHandled;

type RawSearchMatch = {
  from: number;
  to: number;
  text: string;
};

function getMatchContext(fullText: string, from: number, to: number, contextChars = 40): string {
  const start = Math.max(0, from - contextChars);
  const end = Math.min(fullText.length, to + contextChars);

  let context = fullText.slice(start, end);
  if (start > 0) context = `...${context}`;
  if (end < fullText.length) context = `${context}...`;

  return context.replace(/\n/g, ' ');
}

async function expandGlobs(patterns: string[]): Promise<string[]> {
  const files: string[] = [];

  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      const matches = await glob(pattern, { absolute: true });
      for (const file of matches) {
        if (file.endsWith('.docx')) {
          files.push(file);
        }
      }
    } else {
      files.push(pattern);
    }
  }

  return files;
}

async function searchSingleFile(filePath: string, pattern: string, io: CliIO): Promise<LegacySearchFileResult> {
  const opened = await openDocument(filePath, io);
  try {
    const matches =
      (opened.editor.commands.search?.(pattern, {
        highlight: false,
      }) as RawSearchMatch[] | undefined) ?? [];
    const fullText = opened.editor.state.doc.textContent;

    return {
      path: filePath,
      matches: matches.map((match) => ({
        ...match,
        context: getMatchContext(fullText, match.from, match.to),
      })),
    };
  } finally {
    opened.dispose();
  }
}

async function runLegacySearch(pattern: string, files: string[], io: CliIO): Promise<LegacySearchResult> {
  const results = await Promise.all(files.map((filePath) => searchSingleFile(filePath, pattern, io)));
  const filesWithMatches = results.filter((entry) => entry.matches.length > 0);
  const totalMatches = filesWithMatches.reduce((sum, entry) => sum + entry.matches.length, 0);

  return {
    pattern,
    files: filesWithMatches,
    totalMatches,
  };
}

async function runLegacyRead(filePath: string, io: CliIO): Promise<LegacyReadResult> {
  const opened = await openDocument(filePath, io);
  try {
    return {
      path: filePath,
      content: opened.editor.state.doc.textContent,
    };
  } finally {
    opened.dispose();
  }
}

type DocRange = { from: number; to: number };
type RawSearchMatchWithRanges = RawSearchMatch & { ranges?: DocRange[] };

/**
 * Replace all occurrences of a pattern in a document with replacement text.
 *
 * Handles cross-paragraph matches by replacing each range individually
 * (back-to-front) to preserve document structure and positions.
 */
function applyReplacements(editor: import('../lib/document').EditorWithDoc, find: string, replaceWith: string): number {
  const matches =
    (editor.commands.search?.(find, { highlight: false }) as RawSearchMatchWithRanges[] | undefined) ?? [];
  if (matches.length === 0) return 0;

  // Collect all ranges, marking the first range of each match for replacement text
  const allRanges: Array<{ from: number; to: number; isFirst: boolean }> = [];

  for (const match of matches) {
    if (match.ranges && match.ranges.length > 0) {
      match.ranges.forEach((range, index) => {
        allRanges.push({ from: range.from, to: range.to, isFirst: index === 0 });
      });
    } else {
      allRanges.push({ from: match.from, to: match.to, isFirst: true });
    }
  }

  // Sort descending so replacements don't shift earlier positions
  allRanges.sort((a, b) => b.from - a.from);

  for (const range of allRanges) {
    const content = range.isFirst ? replaceWith : '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editor.chain() as any).setTextSelection({ from: range.from, to: range.to }).insertContent(content).run();
  }

  return matches.length;
}

async function replaceInFile(
  filePath: string,
  find: string,
  replaceWith: string,
  io: CliIO,
): Promise<LegacyReplaceFileResult> {
  const opened = await openDocument(filePath, io);
  try {
    const replacements = applyReplacements(opened.editor, find, replaceWith);
    if (replacements > 0) {
      await exportToPath(opened.editor, filePath, true);
    }
    return { path: filePath, replacements };
  } finally {
    opened.dispose();
  }
}

async function runLegacyReplace(
  find: string,
  replaceWith: string,
  files: string[],
  io: CliIO,
): Promise<LegacyReplaceResult> {
  const results = await Promise.all(files.map((fp) => replaceInFile(fp, find, replaceWith, io)));
  const filesWithReplacements = results.filter((r) => r.replacements > 0);
  const totalReplacements = results.reduce((sum, r) => sum + r.replacements, 0);

  return {
    find,
    replace: replaceWith,
    files: filesWithReplacements,
    totalReplacements,
  };
}

function formatLegacyReplaceResult(result: LegacyReplaceResult): string {
  const lines: string[] = [];
  lines.push(`Replaced ${result.totalReplacements} occurrences across ${result.files.length} files`);
  lines.push('');

  for (const file of result.files) {
    lines.push(`  ${file.path}: ${file.replacements} replacements`);
  }

  return lines.join('\n');
}

function formatLegacySearchResult(result: LegacySearchResult): string {
  const lines: string[] = [];

  lines.push(`Found ${result.totalMatches} matches in ${result.files.length} files`);
  lines.push('');

  for (const file of result.files) {
    lines.push(`  ${file.path}: ${file.matches.length} matches`);
    for (const match of file.matches.slice(0, 3)) {
      lines.push(`    "${match.context}"`);
    }
    if (file.matches.length > 3) {
      lines.push(`    ... and ${file.matches.length - 3} more`);
    }
  }

  return lines.join('\n');
}

function resolveLegacyJsonOutput(argv: string[]): boolean {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') return true;
    if (token === '--pretty') return false;
    if (token.startsWith('--output=')) {
      return token.slice('--output='.length) === 'json';
    }
    if (token === '--output') {
      return argv[index + 1] === 'json';
    }
  }

  // Legacy default: pretty output unless JSON is explicitly requested.
  return false;
}

function writeLegacySuccess(
  io: CliIO,
  payload: LegacySearchResult | LegacyReadResult | LegacyReplaceResult,
  jsonOutput: boolean,
): void {
  if (jsonOutput) {
    io.stdout(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if ('pattern' in payload) {
    io.stdout(`${formatLegacySearchResult(payload)}\n`);
    return;
  }

  if ('totalReplacements' in payload) {
    io.stdout(`${formatLegacyReplaceResult(payload)}\n`);
    return;
  }

  io.stdout(`${payload.content}\n`);
}

function usageFor(command: LegacyCommand): string {
  if (command === 'search') return 'Usage: superdoc search <pattern> <files...>';
  if (command === 'replace-legacy') return 'Usage: superdoc replace-legacy <find> <to> <files...>';
  return 'Usage: superdoc read <file>';
}

/**
 * Attempts to handle a CLI invocation as a legacy v0.x command (`search`, `read`, or `replace-legacy`).
 *
 * @param argv - Raw process arguments (used to detect `--json` / `--output` flags).
 * @param rest - Remaining tokens after global flag extraction.
 * @param io - CLI I/O streams.
 * @returns `{ handled: true, exitCode }` if the command was a legacy command, otherwise `{ handled: false }`.
 */
export async function tryRunLegacyCompatCommand(
  argv: string[],
  rest: string[],
  io: CliIO,
): Promise<LegacyCompatResult> {
  const [command, ...args] = rest;
  if (command !== 'search' && command !== 'read' && command !== 'replace-legacy') {
    return { handled: false };
  }

  const jsonOutput = resolveLegacyJsonOutput(argv);

  try {
    if (command === 'search') {
      if (args.length < 2) {
        io.stderr(`${usageFor('search')}\n`);
        return { handled: true, exitCode: 1 };
      }

      const [pattern, ...filePatterns] = args;
      const files = await expandGlobs(filePatterns);
      if (files.length === 0) {
        io.stderr('No .docx files found matching the pattern.\n');
        return { handled: true, exitCode: 1 };
      }

      const payload = await runLegacySearch(pattern, files, io);
      writeLegacySuccess(io, payload, jsonOutput);
      return { handled: true, exitCode: 0 };
    }

    if (command === 'replace-legacy') {
      if (args.length < 3) {
        io.stderr(`${usageFor('replace-legacy')}\n`);
        return { handled: true, exitCode: 1 };
      }

      const [find, to, ...filePatterns] = args;
      const files = await expandGlobs(filePatterns);
      if (files.length === 0) {
        io.stderr('No .docx files found matching the pattern.\n');
        return { handled: true, exitCode: 1 };
      }

      const payload = await runLegacyReplace(find, to, files, io);
      writeLegacySuccess(io, payload, jsonOutput);
      return { handled: true, exitCode: 0 };
    }

    if (args.length < 1) {
      io.stderr(`${usageFor('read')}\n`);
      return { handled: true, exitCode: 1 };
    }

    const payload = await runLegacyRead(args[0], io);
    writeLegacySuccess(io, payload, jsonOutput);
    return { handled: true, exitCode: 0 };
  } catch (error) {
    io.stderr(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return { handled: true, exitCode: 1 };
  }
}

function assertV1Opened(opened: OpenedRuntimeDocument, label: string): OpenedDocument {
  if (opened.runtime !== 'v1') {
    throw new CliError('RUNTIME_V2_UNAVAILABLE', `${label}: this command is not available in the v2 runtime.`, {
      runtime: opened.runtime,
      command: label,
    });
  }
  return opened as OpenedDocument;
}

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

function isInlineSpecialRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isSelectionTarget(value: unknown): value is SelectionTarget {
  return (
    isInlineSpecialRecord(value) &&
    value.kind === 'selection' &&
    isInlineSpecialRecord(value.start) &&
    isInlineSpecialRecord(value.end)
  );
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
  if (!isInlineSpecialRecord(apiInput)) {
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
      kind: 'text-block',
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

    if (!isCollapsedTextSelectionTarget(rawTarget)) {
      throw new CliError(
        'INVALID_TARGET',
        `insert ${COMMAND_BY_KIND[kind].label}: target must be a collapsed text selection.`,
      );
    }

    const resolvedRange = resolveSelectionTarget(editor, rawTarget);
    return {
      kind: 'text-block',
      target: {
        kind: 'text',
        blockId: rawTarget.start.blockId,
        range: { start: rawTarget.start.offset, end: rawTarget.start.offset },
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

async function runLegacyInsertInlineSpecial(
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
    const opened = assertV1Opened(await openDocument(doc, context.io), commandName);
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
      const opened = assertV1Opened(
        await openSessionDocument(paths.workingDocPath, context.io, metadata, {
          sessionId: context.sessionId ?? metadata.contextId,
          executionMode: context.executionMode,
          sessionPool: context.sessionPool,
        }),
        commandName,
      );

      try {
        const resolved = await resolveInsertionPoint(opened.editor, input, kind);
        executeInlineSpecialInsert(opened.editor, kind, resolved);

        let updatedMetadata: typeof metadata;
        let byteLength: number;
        const sessionPool = context.sessionPool;

        if (isHostMode && sessionPool) {
          sessionPool.markDirty(metadata.contextId);
          updatedMetadata = markContextUpdated(context.io, metadata, {
            dirty: true,
            revision: metadata.revision + 1,
          });
          await writeContextMetadata(paths, updatedMetadata);
          sessionPool.updateMetadataRevision(metadata.contextId, updatedMetadata.revision);
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

        const externalOutput = await exportOptionalSessionOutput(opened, context.io, outPath, force);
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

export function runLegacyInsertTab(tokens: string[], context: CommandContext): Promise<CommandExecution> {
  return runLegacyInsertInlineSpecial('tab', tokens, context);
}

export function runLegacyInsertLineBreak(tokens: string[], context: CommandContext): Promise<CommandExecution> {
  return runLegacyInsertInlineSpecial('lineBreak', tokens, context);
}
