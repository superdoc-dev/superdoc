/**
 * Generic part mutation pipeline.
 *
 * Wraps `commitXmlModelMutation` to provide unified mutation + event emission
 * for any part in `converter.parts`. After mutation, emits `partChanged` so
 * all consumers (PresentationEditor, collaboration, etc.) can react to one event.
 *
 * For parts that also have legacy domain events (e.g., `stylesChanged`),
 * callers should emit those alongside `partChanged` during the transition.
 */

import type { Editor } from '../../core/Editor.js';
import type { PartChangedPayload } from '../../core/types/EditorEvents.js';
import { readPart, PART_XML_SYNC } from '../../core/super-converter/converter-parts.js';
import { commitXmlModelMutation, type CommitXmlModelMutationResult } from './commit-xml-model-mutation.js';
import type { OutOfBandMutationOptions } from '../out-of-band-mutation.js';

interface ConverterWithParts {
  parts: Record<string, unknown>;
  convertedXml: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CommitPartMutationConfig<TModel, TMutationResult> {
  editor: Editor;
  partId: string;
  options: OutOfBandMutationOptions;
  source: string;
  ensureModel?: (converter: ConverterWithParts) => TModel;
  mutate: (context: { model: TModel; dryRun: boolean }) => TMutationResult;
  syncXml?: (context: { converter: ConverterWithParts; model: TModel; changedPaths: string[] }) => void;
  diffScopePaths?: readonly string[];
}

/**
 * Generic part mutation pipeline.
 *
 * Flow:
 * 1. Read/normalize model from `converter.parts[partId]`
 * 2. Clone + mutate + diff (via `commitXmlModelMutation`)
 * 3. Sync XML if applicable
 * 4. Emit `partChanged`
 */
export function commitPartMutation<TModel, TMutationResult>(
  config: CommitPartMutationConfig<TModel, TMutationResult>,
): CommitXmlModelMutationResult<TMutationResult> {
  const converter = (config.editor as unknown as { converter?: ConverterWithParts }).converter;
  if (!converter) {
    throw new Error('[commitPartMutation] Editor has no converter');
  }

  const defaultEnsureModel = (conv: ConverterWithParts) => readPart(conv, config.partId) as TModel;

  const defaultSyncXml = PART_XML_SYNC[config.partId]
    ? ({ converter: conv }: { converter: ConverterWithParts }) => {
        PART_XML_SYNC[config.partId](conv);
      }
    : undefined;

  return commitXmlModelMutation<ConverterWithParts, TModel, TMutationResult>({
    editor: config.editor,
    converter,
    options: config.options,
    ensureModel: config.ensureModel ?? defaultEnsureModel,
    mutate: config.mutate,
    syncXml: config.syncXml ?? defaultSyncXml ?? (() => {}),
    emitChanged: ({ editor, changedPaths }) => {
      const payload: PartChangedPayload = {
        partId: config.partId,
        changedPaths,
        source: config.source,
      };
      editor.emit('partChanged', payload);
    },
    diffScopePaths: config.diffScopePaths,
  });
}
