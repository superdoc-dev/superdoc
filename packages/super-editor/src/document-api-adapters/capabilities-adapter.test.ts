import { describe, expect, it, vi } from 'vitest';
import type { Editor } from '../core/Editor.js';
import { OPERATION_IDS } from '@superdoc/document-api';
import { TrackFormatMarkName } from '../extensions/track-changes/constants.js';
import { getDocumentApiCapabilities } from './capabilities-adapter.js';

function makeEditor(overrides: Partial<Editor> = {}): Editor {
  const defaultCommands = {
    insertParagraphAt: vi.fn(() => true),
    insertHeadingAt: vi.fn(() => true),
    insertListItemAt: vi.fn(() => true),
    setListTypeAt: vi.fn(() => true),
    setTextSelection: vi.fn(() => true),
    increaseListIndent: vi.fn(() => true),
    decreaseListIndent: vi.fn(() => true),
    restartNumbering: vi.fn(() => true),
    exitListItemAt: vi.fn(() => true),
    addComment: vi.fn(() => true),
    editComment: vi.fn(() => true),
    addCommentReply: vi.fn(() => true),
    moveComment: vi.fn(() => true),
    resolveComment: vi.fn(() => true),
    removeComment: vi.fn(() => true),
    setCommentInternal: vi.fn(() => true),
    setActiveComment: vi.fn(() => true),
    setCursorById: vi.fn(() => true),
    insertTrackedChange: vi.fn(() => true),
    acceptTrackedChangeById: vi.fn(() => true),
    rejectTrackedChangeById: vi.fn(() => true),
    acceptAllTrackedChanges: vi.fn(() => true),
    rejectAllTrackedChanges: vi.fn(() => true),
  };

  const defaultMarks = {
    bold: {
      create: vi.fn(() => ({ type: 'bold' })),
    },
    [TrackFormatMarkName]: {
      create: vi.fn(() => ({ type: TrackFormatMarkName })),
    },
  };

  const overrideCommands = (overrides.commands ?? {}) as Partial<Editor['commands']>;

  const commands = {
    ...defaultCommands,
    ...overrideCommands,
  };

  // When the caller explicitly passes `schema: undefined`, respect that instead
  // of constructing a default schema with marks.
  const explicitUndefinedSchema = 'schema' in overrides && overrides.schema === undefined;
  const overrideSchema = (overrides.schema ?? {}) as Partial<Editor['schema']>;
  const overrideMarks = (overrideSchema.marks ?? {}) as Record<string, unknown>;

  const schema = explicitUndefinedSchema
    ? undefined
    : {
        ...overrideSchema,
        marks: {
          ...defaultMarks,
          ...overrideMarks,
        },
      };

  const defaultOptions = {
    user: { name: 'Test User', email: 'test@example.com' },
  };

  return {
    options: defaultOptions,
    ...overrides,
    commands,
    schema,
  } as unknown as Editor;
}

describe('getDocumentApiCapabilities', () => {
  it('returns deterministic per-operation coverage for the full operation inventory', () => {
    const capabilities = getDocumentApiCapabilities(makeEditor());
    const operationKeys = Object.keys(capabilities.operations).sort();
    expect(operationKeys).toEqual([...OPERATION_IDS].sort());
  });

  it('marks namespaces as unavailable when required commands are missing', () => {
    const editor = makeEditor({
      commands: {
        addComment: undefined,
        setListTypeAt: undefined,
        insertTrackedChange: undefined,
      } as unknown as Editor['commands'],
      schema: {
        marks: {
          bold: undefined,
          [TrackFormatMarkName]: {},
        },
      } as unknown as Editor['schema'],
    });

    const capabilities = getDocumentApiCapabilities(editor);

    expect(capabilities.global.comments.enabled).toBe(false);
    expect(capabilities.global.lists.enabled).toBe(false);
    expect(capabilities.global.trackChanges.enabled).toBe(false);
    expect(capabilities.operations['comments.add'].available).toBe(false);
    expect(capabilities.operations['lists.setType'].available).toBe(false);
    expect(capabilities.operations.insert.tracked).toBe(false);
    expect(capabilities.operations['format.bold'].available).toBe(false);
  });

  it('exposes tracked + dryRun flags in line with command catalog capabilities', () => {
    const capabilities = getDocumentApiCapabilities(makeEditor());

    expect(capabilities.operations.insert.tracked).toBe(true);
    expect(capabilities.operations.insert.dryRun).toBe(true);
    expect(capabilities.operations['lists.setType'].tracked).toBe(false);
    expect(capabilities.operations['lists.setType'].dryRun).toBe(true);
    expect(capabilities.operations['trackChanges.accept'].dryRun).toBe(false);
    expect(capabilities.operations['create.paragraph'].dryRun).toBe(true);
    expect(capabilities.operations['create.heading'].available).toBe(true);
    expect(capabilities.operations['create.heading'].tracked).toBe(true);
    expect(capabilities.operations['create.heading'].dryRun).toBe(true);
  });

  it('advertises dryRun for list mutators that implement dry-run behavior', () => {
    const capabilities = getDocumentApiCapabilities(makeEditor());
    const listMutations = [
      'lists.insert',
      'lists.setType',
      'lists.indent',
      'lists.outdent',
      'lists.restart',
      'lists.exit',
    ] as const;

    for (const operationId of listMutations) {
      expect(capabilities.operations[operationId].dryRun, `${operationId} should advertise dryRun support`).toBe(true);
    }
  });

  it('reports tracked mode unavailable when no editor user is configured', () => {
    const capabilities = getDocumentApiCapabilities(
      makeEditor({
        options: { user: null } as unknown as Editor['options'],
      }),
    );

    expect(capabilities.operations.insert.available).toBe(true);
    expect(capabilities.operations.insert.tracked).toBe(false);
    expect(capabilities.operations.insert.reasons).toContain('TRACKED_MODE_UNAVAILABLE');
    expect(capabilities.operations['create.paragraph'].tracked).toBe(false);
    expect(capabilities.operations['create.paragraph'].reasons).toContain('TRACKED_MODE_UNAVAILABLE');
    expect(capabilities.operations['create.heading'].tracked).toBe(false);
    expect(capabilities.operations['create.heading'].reasons).toContain('TRACKED_MODE_UNAVAILABLE');
  });

  it('never reports tracked=true when the operation is unavailable', () => {
    const capabilities = getDocumentApiCapabilities(
      makeEditor({
        commands: {
          insertTrackedChange: vi.fn(() => true),
          insertParagraphAt: undefined,
        } as unknown as Editor['commands'],
      }),
    );

    expect(capabilities.operations['create.paragraph'].available).toBe(false);
    expect(capabilities.operations['create.paragraph'].tracked).toBe(false);
  });

  it('marks create.heading as unavailable when insertHeadingAt command is missing', () => {
    const capabilities = getDocumentApiCapabilities(
      makeEditor({
        commands: {
          insertHeadingAt: undefined,
        } as unknown as Editor['commands'],
      }),
    );

    expect(capabilities.operations['create.heading'].available).toBe(false);
    expect(capabilities.operations['create.heading'].tracked).toBe(false);
    expect(capabilities.operations['create.heading'].reasons).toContain('COMMAND_UNAVAILABLE');
  });

  it('does not emit unavailable reasons for modes that are unsupported by design', () => {
    const capabilities = getDocumentApiCapabilities(makeEditor());
    const setTypeReasons = capabilities.operations['lists.setType'].reasons ?? [];
    const acceptAllReasons = capabilities.operations['trackChanges.acceptAll'].reasons ?? [];

    expect(setTypeReasons).not.toContain('TRACKED_MODE_UNAVAILABLE');
    expect(setTypeReasons).not.toContain('DRY_RUN_UNAVAILABLE');
    expect(acceptAllReasons).not.toContain('DRY_RUN_UNAVAILABLE');
  });

  it('handles an editor with undefined schema gracefully', () => {
    const editor = makeEditor({
      schema: undefined as unknown as Editor['schema'],
    });

    const capabilities = getDocumentApiCapabilities(editor);

    expect(capabilities.operations['format.bold'].available).toBe(false);
    // insert.tracked remains true because the default insertTrackedChange command
    // is still present — tracked mode for insert depends on commands, not schema.
    expect(capabilities.operations.insert.tracked).toBe(true);
    // Smoke-test: every operation has a defined entry
    for (const id of OPERATION_IDS) {
      expect(capabilities.operations[id]).toBeDefined();
    }
  });

  it('uses OPERATION_UNAVAILABLE without COMMAND_UNAVAILABLE for non-command-backed availability failures', () => {
    const capabilities = getDocumentApiCapabilities(
      makeEditor({
        schema: {
          marks: {
            bold: undefined,
            [TrackFormatMarkName]: {},
          },
        } as unknown as Editor['schema'],
      }),
    );

    const formatReasons = capabilities.operations['format.bold'].reasons ?? [];
    expect(formatReasons).toContain('OPERATION_UNAVAILABLE');
    expect(formatReasons).not.toContain('COMMAND_UNAVAILABLE');
  });
});
