import type { Editor } from '../../core/Editor.js';
import type { PartId, PartOperation } from '../../core/parts/types.js';
import { compoundMutation } from '../../core/parts/mutation/compound-mutation.js';
import { mutateParts } from '../../core/parts/mutation/mutate-part.js';
import { checkRevision } from './revision-tracker.js';

type ConverterWithCustomXmlState = {
  convertedXml?: Record<string, unknown>;
  removedCustomXmlPaths?: Set<string>;
  bibliographyPart?: unknown;
};

type SandboxConverter = {
  convertedXml: Record<string, unknown>;
  removedCustomXmlPaths?: Set<string>;
  bibliographyPart?: unknown;
};

export type PreparedCustomXmlPartMutation<TResult> = {
  result: TResult;
  operations: PartOperation[];
  affectedParts: PartId[];
  removedCustomXmlPaths?: Set<string>;
  bibliographyPart?: unknown;
  hasBibliographyPart: boolean;
};

export type CustomXmlPartMutationOptions = {
  source: string;
  expectedRevision?: string;
};

function getConverter(editor: Editor): ConverterWithCustomXmlState {
  const converter = (editor as unknown as { converter?: ConverterWithCustomXmlState }).converter;
  if (!converter?.convertedXml) {
    throw new Error('Custom XML part mutation requires editor.converter.convertedXml.');
  }
  return converter;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function toPartId(path: string): PartId {
  return path as PartId;
}

function replacePartData(target: unknown, source: unknown): void {
  if (!target || typeof target !== 'object' || !source || typeof source !== 'object') {
    throw new Error('Custom XML part mutation can only replace object-shaped XML parts.');
  }

  const targetRecord = target as Record<string, unknown>;
  const sourceRecord = source as Record<string, unknown>;

  for (const key of Object.keys(targetRecord)) {
    if (!hasOwn(sourceRecord, key)) delete targetRecord[key];
  }
  for (const [key, value] of Object.entries(sourceRecord)) {
    targetRecord[key] = cloneValue(value);
  }
}

function createSandboxConverter(converter: ConverterWithCustomXmlState): SandboxConverter {
  const sandbox: SandboxConverter = {
    convertedXml: cloneValue(converter.convertedXml ?? {}),
  };

  if (converter.removedCustomXmlPaths instanceof Set) {
    sandbox.removedCustomXmlPaths = new Set(converter.removedCustomXmlPaths);
  }
  if (converter.bibliographyPart !== undefined) {
    sandbox.bibliographyPart = cloneValue(converter.bibliographyPart);
  }

  return sandbox;
}

function createDeltaOperations(
  editor: Editor,
  source: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): PartOperation[] {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  const operations: PartOperation[] = [];

  for (const path of paths) {
    const existedBefore = hasOwn(before, path);
    const existsAfter = hasOwn(after, path);
    const partId = toPartId(path);

    if (!existedBefore && existsAfter) {
      operations.push({
        editor,
        partId,
        operation: 'create',
        source,
        initial: cloneValue(after[path]),
      });
      continue;
    }

    if (existedBefore && !existsAfter) {
      operations.push({
        editor,
        partId,
        operation: 'delete',
        source,
      });
      continue;
    }

    if (existedBefore && existsAfter && !valuesEqual(before[path], after[path])) {
      const nextPart = cloneValue(after[path]);
      operations.push({
        editor,
        partId,
        operation: 'mutate',
        source,
        mutate: ({ part }) => replacePartData(part, nextPart),
      });
    }
  }

  return operations;
}

function applyConverterState(editor: Editor, prepared: PreparedCustomXmlPartMutation<unknown>): void {
  const converter = getConverter(editor);
  const nextRemovedCustomXmlPaths = prepared.removedCustomXmlPaths
    ? new Set(prepared.removedCustomXmlPaths)
    : undefined;
  const nextBibliographyPart = prepared.hasBibliographyPart ? cloneValue(prepared.bibliographyPart) : undefined;

  if (nextRemovedCustomXmlPaths) {
    converter.removedCustomXmlPaths = nextRemovedCustomXmlPaths;
  }
  if (prepared.hasBibliographyPart) {
    converter.bibliographyPart = nextBibliographyPart;
  }
}

export function prepareCustomXmlPartMutation<TResult>(
  editor: Editor,
  mutate: (convertedXml: Record<string, unknown>, converter: SandboxConverter) => TResult,
  source = 'customXml.parts',
): PreparedCustomXmlPartMutation<TResult> {
  const converter = getConverter(editor);
  const before = converter.convertedXml ?? {};
  const sandbox = createSandboxConverter(converter);
  const result = mutate(sandbox.convertedXml, sandbox);
  const operations = createDeltaOperations(editor, source, before, sandbox.convertedXml);

  return {
    result,
    operations,
    affectedParts: operations.map((operation) => operation.partId),
    removedCustomXmlPaths: sandbox.removedCustomXmlPaths,
    bibliographyPart: sandbox.bibliographyPart,
    hasBibliographyPart: Object.prototype.hasOwnProperty.call(sandbox, 'bibliographyPart'),
  };
}

export function commitPreparedCustomXmlPartMutation<TResult>(
  editor: Editor,
  prepared: PreparedCustomXmlPartMutation<TResult>,
  options: CustomXmlPartMutationOptions,
): TResult {
  if (prepared.operations.length === 0) {
    checkRevision(editor, options.expectedRevision);
    applyConverterState(editor, prepared);
    return prepared.result;
  }

  const result = compoundMutation({
    editor,
    source: options.source,
    affectedParts: prepared.affectedParts,
    execute() {
      const mutation = mutateParts({
        editor,
        source: options.source,
        expectedRevision: options.expectedRevision,
        operations: prepared.operations.map((operation) => ({ ...operation, source: options.source })),
      });
      return mutation.changed;
    },
  });
  if (result.success) {
    applyConverterState(editor, prepared);
  }

  return prepared.result;
}

export function mutateCustomXmlParts<TResult>(
  editor: Editor,
  source: string,
  mutate: (convertedXml: Record<string, unknown>, converter: SandboxConverter) => TResult,
  options?: { expectedRevision?: string },
): TResult {
  const prepared = prepareCustomXmlPartMutation(editor, mutate, source);
  return commitPreparedCustomXmlPartMutation(editor, prepared, {
    source,
    expectedRevision: options?.expectedRevision,
  });
}
