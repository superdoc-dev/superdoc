import type { Editor } from '../../core/Editor.js';
import {
  executeOutOfBandMutation,
  type OutOfBandMutationOptions,
  type OutOfBandMutationResult,
} from '../out-of-band-mutation.js';
import { diffObjectPaths } from '../helpers/diff-object-paths.js';

export interface CommitXmlModelMutationResult<TMutationResult> {
  changed: boolean;
  changedPaths: string[];
  result: TMutationResult;
}

export interface CommitXmlModelMutationConfig<TConverter, TModel, TMutationResult> {
  editor: Editor;
  converter: TConverter;
  options: OutOfBandMutationOptions;
  ensureModel: (converter: TConverter) => TModel;
  mutate: (context: { model: TModel; dryRun: boolean }) => TMutationResult;
  syncXml: (context: { converter: TConverter; model: TModel; changedPaths: string[] }) => void;
  emitChanged?: (context: {
    editor: Editor;
    converter: TConverter;
    model: TModel;
    changedPaths: string[];
    result: TMutationResult;
  }) => void;
  cloneModel?: (model: TModel) => TModel;
  diffPaths?: (beforeValue: unknown, afterValue: unknown, basePath?: string) => string[];
  diffScopePaths?: readonly string[];
}

function cloneModel<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function getValueAtPath(value: unknown, path: string): unknown {
  if (!path) return value;

  let current = value;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function toStablePathList(paths: string[]): string[] {
  return [...new Set(paths)].sort();
}

function resolveChangedPaths<TModel>(
  beforeModel: TModel,
  afterModel: TModel,
  diffPaths: (beforeValue: unknown, afterValue: unknown, basePath?: string) => string[],
  diffScopePaths: readonly string[] | undefined,
): string[] {
  if (!diffScopePaths || diffScopePaths.length === 0) {
    return toStablePathList(diffPaths(beforeModel, afterModel));
  }

  const scopedPaths: string[] = [];
  for (const scopePath of diffScopePaths) {
    const beforeScope = getValueAtPath(beforeModel, scopePath);
    const afterScope = getValueAtPath(afterModel, scopePath);
    scopedPaths.push(...diffPaths(beforeScope, afterScope, scopePath));
  }

  return toStablePathList(scopedPaths);
}

/**
 * Generic mutation pipeline for part-backed JSON models.
 *
 * Flow:
 * 1) lifecycle guard + revision handling (`executeOutOfBandMutation`)
 * 2) optional dry-run cloning
 * 3) mutation callback
 * 4) changed path diff
 * 5) XML sync + single change event emit (non-dry, changed only)
 */
export function commitXmlModelMutation<TConverter, TModel, TMutationResult>(
  config: CommitXmlModelMutationConfig<TConverter, TModel, TMutationResult>,
): CommitXmlModelMutationResult<TMutationResult> {
  const clone = config.cloneModel ?? cloneModel;
  const diff = config.diffPaths ?? diffObjectPaths;

  return executeOutOfBandMutation<CommitXmlModelMutationResult<TMutationResult>>(
    config.editor,
    (dryRun): OutOfBandMutationResult<CommitXmlModelMutationResult<TMutationResult>> => {
      const liveModel = config.ensureModel(config.converter);
      const workingModel = dryRun ? clone(liveModel) : liveModel;
      const beforeModel = clone(workingModel);

      const result = config.mutate({ model: workingModel, dryRun });
      const changedPaths = resolveChangedPaths(beforeModel, workingModel, diff, config.diffScopePaths);
      const changed = changedPaths.length > 0;

      if (changed && !dryRun) {
        config.syncXml({ converter: config.converter, model: workingModel, changedPaths });
        config.emitChanged?.({
          editor: config.editor,
          converter: config.converter,
          model: workingModel,
          changedPaths,
          result,
        });
      }

      return {
        changed,
        payload: {
          changed,
          changedPaths,
          result,
        },
      };
    },
    config.options,
  );
}
