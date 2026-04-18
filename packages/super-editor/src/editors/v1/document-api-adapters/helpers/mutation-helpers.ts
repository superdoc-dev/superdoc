import type { MarkType } from 'prosemirror-model';
import type { MutationOptions } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { DocumentApiAdapterError } from '../errors.js';

/**
 * Validates that an editor command exists and returns it.
 *
 * @throws {DocumentApiAdapterError} `CAPABILITY_UNAVAILABLE` with `reason: 'missing_command'`.
 */
export function requireEditorCommand<T>(command: T | undefined, operationName: string): NonNullable<T> {
  if (typeof command === 'function') return command as NonNullable<T>;
  throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', `${operationName} command is not available.`, {
    reason: 'missing_command',
  });
}

/**
 * Validates that a schema mark exists and returns it.
 *
 * @throws {DocumentApiAdapterError} `CAPABILITY_UNAVAILABLE` with `reason: 'missing_mark'`.
 */
export function requireSchemaMark(editor: Editor, markName: string, operationName: string): MarkType {
  const mark = editor.schema?.marks?.[markName];
  if (mark) return mark;
  throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', `${operationName} requires the "${markName}" mark.`, {
    reason: 'missing_mark',
    markName,
  });
}

/**
 * Validates all tracked-mode prerequisites: insertTrackedChange command,
 * optional required marks, and a configured user.
 *
 * @throws {DocumentApiAdapterError} `CAPABILITY_UNAVAILABLE` with a `reason` detail
 *   of `'missing_command'`, `'missing_mark'`, or `'missing_user'`.
 */
export function ensureTrackedCapability(editor: Editor, config: { operation: string; requireMarks?: string[] }): void {
  if (typeof editor.commands?.insertTrackedChange !== 'function') {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      `${config.operation} requires the insertTrackedChange command.`,
      { reason: 'missing_command' },
    );
  }

  if (config.requireMarks) {
    for (const markName of config.requireMarks) {
      if (!editor.schema?.marks?.[markName]) {
        throw new DocumentApiAdapterError(
          'CAPABILITY_UNAVAILABLE',
          `${config.operation} requires the "${markName}" mark in the schema.`,
          { reason: 'missing_mark', markName },
        );
      }
    }
  }

  if (!editor.options.user) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      `${config.operation} requires a user to be configured on the editor instance.`,
      { reason: 'missing_user' },
    );
  }
}

/**
 * Rejects tracked mode for adapters that do not support it yet.
 *
 * @throws {DocumentApiAdapterError} `CAPABILITY_UNAVAILABLE` with `reason: 'tracked_mode_unsupported'`.
 */
export function rejectTrackedMode(operation: string, options?: MutationOptions): void {
  if ((options?.changeMode ?? 'direct') === 'direct') return;
  throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', `${operation} does not support tracked mode.`, {
    reason: 'tracked_mode_unsupported',
  });
}
