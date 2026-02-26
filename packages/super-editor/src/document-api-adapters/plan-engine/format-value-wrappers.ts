/**
 * Wrappers for value-based format operations: fontSize, fontFamily, color, align.
 *
 * fontSize, fontFamily, and color are inline text-style marks applied via `setMark('textStyle', ...)`.
 * align is a paragraph-level attribute applied via `updateAttributes('paragraph', ...)`.
 *
 * All four are direct-only in v1 (tracked mode rejected with CAPABILITY_UNAVAILABLE).
 * They route through `executeDomainCommand` — no plan-engine step executors are registered.
 */

import type {
  FormatFontSizeInput,
  FormatFontFamilyInput,
  FormatColorInput,
  FormatAlignInput,
  MutationOptions,
  TextAddress,
  TextMutationReceipt,
} from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { DocumentApiAdapterError } from '../errors.js';
import { resolveTextTarget } from '../helpers/adapter-utils.js';
import { buildTextMutationResolution, readTextAtResolvedRange } from '../helpers/text-mutation-resolution.js';
import { requireEditorCommand, requireSchemaMark, rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { executeDomainCommand } from './plan-wrappers.js';

// ---------------------------------------------------------------------------
// Shared: resolve target and build resolution
// ---------------------------------------------------------------------------

interface ResolvedFormat {
  target: TextAddress;
  from: number;
  to: number;
  resolution: ReturnType<typeof buildTextMutationResolution>;
}

function resolveFormatTarget(editor: Editor, target: TextAddress, operation: string): ResolvedFormat {
  const range = resolveTextTarget(editor, target);
  if (!range) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `${operation} target could not be resolved.`, { target });
  }
  const text = readTextAtResolvedRange(editor, range);
  const resolution = buildTextMutationResolution({ requestedTarget: target, target, range, text });
  return { target, from: range.from, to: range.to, resolution };
}

function collapsedTargetFailure(resolution: ResolvedFormat['resolution'], operation: string): TextMutationReceipt {
  return {
    success: false,
    resolution,
    failure: { code: 'INVALID_TARGET', message: `${operation} requires a non-collapsed target range.` },
  };
}

function noOpFailure(resolution: ResolvedFormat['resolution'], operation: string): TextMutationReceipt {
  return {
    success: false,
    resolution,
    failure: { code: 'NO_OP', message: `${operation} produced no change.` },
  };
}

// ---------------------------------------------------------------------------
// Shared: inline value format wrapper (fontSize, fontFamily, color)
// ---------------------------------------------------------------------------

interface InlineFormatConfig {
  operation: string;
  setCommand: string;
  unsetCommand: string;
}

function inlineValueFormatWrapper(
  editor: Editor,
  target: TextAddress,
  value: string | number | null,
  options: MutationOptions | undefined,
  config: InlineFormatConfig,
): TextMutationReceipt {
  rejectTrackedMode(config.operation, options);

  const resolved = resolveFormatTarget(editor, target, config.operation);
  if (resolved.from === resolved.to) {
    return collapsedTargetFailure(resolved.resolution, config.operation);
  }

  requireSchemaMark(editor, 'textStyle', config.operation);

  const setTextSelection = requireEditorCommand(
    editor.commands?.setTextSelection as ((range: { from: number; to: number }) => boolean) | undefined,
    `${config.operation} (setTextSelection)`,
  );

  const activeCommand = value !== null ? config.setCommand : config.unsetCommand;
  requireEditorCommand(
    (editor.commands as Record<string, unknown>)?.[activeCommand] as ((...args: unknown[]) => boolean) | undefined,
    `${config.operation} (${activeCommand})`,
  );

  if (options?.dryRun) {
    return { success: true, resolution: resolved.resolution };
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      setTextSelection({ from: resolved.from, to: resolved.to });
      const cmd = (editor.commands as Record<string, (...args: unknown[]) => boolean>)[activeCommand];
      return value !== null ? cmd(value) : cmd();
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return noOpFailure(resolved.resolution, config.operation);
  }

  return { success: true, resolution: resolved.resolution };
}

// ---------------------------------------------------------------------------
// format.fontSize
// ---------------------------------------------------------------------------

export function formatFontSizeWrapper(
  editor: Editor,
  input: FormatFontSizeInput,
  options?: MutationOptions,
): TextMutationReceipt {
  return inlineValueFormatWrapper(editor, input.target, input.value, options, {
    operation: 'format.fontSize',
    setCommand: 'setFontSize',
    unsetCommand: 'unsetFontSize',
  });
}

// ---------------------------------------------------------------------------
// format.fontFamily
// ---------------------------------------------------------------------------

export function formatFontFamilyWrapper(
  editor: Editor,
  input: FormatFontFamilyInput,
  options?: MutationOptions,
): TextMutationReceipt {
  return inlineValueFormatWrapper(editor, input.target, input.value, options, {
    operation: 'format.fontFamily',
    setCommand: 'setFontFamily',
    unsetCommand: 'unsetFontFamily',
  });
}

// ---------------------------------------------------------------------------
// format.color
// ---------------------------------------------------------------------------

export function formatColorWrapper(
  editor: Editor,
  input: FormatColorInput,
  options?: MutationOptions,
): TextMutationReceipt {
  return inlineValueFormatWrapper(editor, input.target, input.value, options, {
    operation: 'format.color',
    setCommand: 'setColor',
    unsetCommand: 'unsetColor',
  });
}

// ---------------------------------------------------------------------------
// format.align (paragraph-level — different execution path)
// ---------------------------------------------------------------------------

export function formatAlignWrapper(
  editor: Editor,
  input: FormatAlignInput,
  options?: MutationOptions,
): TextMutationReceipt {
  const operation = 'format.align';
  rejectTrackedMode(operation, options);

  const resolved = resolveFormatTarget(editor, input.target, operation);
  // Align allows collapsed targets — a cursor identifies the containing paragraph.

  const setTextSelection = requireEditorCommand(
    editor.commands?.setTextSelection as ((range: { from: number; to: number }) => boolean) | undefined,
    `${operation} (setTextSelection)`,
  );

  if (input.alignment !== null) {
    requireEditorCommand(
      editor.commands?.setTextAlign as ((alignment: string) => boolean) | undefined,
      `${operation} (setTextAlign)`,
    );
  } else {
    requireEditorCommand(
      editor.commands?.unsetTextAlign as (() => boolean) | undefined,
      `${operation} (unsetTextAlign)`,
    );
  }

  if (options?.dryRun) {
    return { success: true, resolution: resolved.resolution };
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      setTextSelection({ from: resolved.from, to: resolved.to });

      if (input.alignment !== null) {
        return (editor.commands as Record<string, (v: string) => boolean>).setTextAlign(input.alignment);
      }
      return (editor.commands as Record<string, () => boolean>).unsetTextAlign();
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return noOpFailure(resolved.resolution, operation);
  }

  return { success: true, resolution: resolved.resolution };
}
