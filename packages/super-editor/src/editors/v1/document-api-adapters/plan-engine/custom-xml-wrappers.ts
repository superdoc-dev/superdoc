import type { Editor } from '../../core/Editor.js';
import type {
  CustomXmlPartsListInput,
  CustomXmlPartsListResult,
  CustomXmlPartsGetInput,
  CustomXmlPartInfo,
  CustomXmlPartSummary,
  CustomXmlPartsCreateInput,
  CustomXmlPartsCreateResult,
  CustomXmlPartsPatchInput,
  CustomXmlPartsRemoveInput,
  CustomXmlPartsMutationResult,
  CustomXmlPartsAdapter,
  MutationOptions,
} from '@superdoc/document-api';
import { buildDiscoveryItem, buildDiscoveryResult, buildResolvedHandle } from '@superdoc/document-api';
import { paginate } from '../helpers/adapter-utils.js';
import { getRevision } from './revision-tracker.js';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { executeOutOfBandMutation } from '../out-of-band-mutation.js';
import {
  listCustomXmlParts,
  readCustomXmlPart,
  createCustomXmlPart,
  patchCustomXmlPart,
  removeCustomXmlPart,
  resolveTargetPartName,
} from '../../core/super-converter/custom-xml-parts.js';
import { commitPreparedCustomXmlPartMutation, prepareCustomXmlPartMutation } from './custom-xml-part-mutation.js';

// ---------------------------------------------------------------------------
// Converter access
// ---------------------------------------------------------------------------

type ConverterWithConvertedXml = {
  convertedXml?: Record<string, unknown>;
  removedCustomXmlPaths?: Set<string>;
};

function getConverter(editor: Editor): ConverterWithConvertedXml | null {
  return (editor as unknown as { converter?: ConverterWithConvertedXml }).converter ?? null;
}

function getConvertedXml(editor: Editor): Record<string, unknown> {
  return getConverter(editor)?.convertedXml ?? {};
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

function toSummary(record: ReturnType<typeof listCustomXmlParts>[number]): CustomXmlPartSummary {
  const summary: CustomXmlPartSummary = {
    partName: record.partName,
    schemaRefs: record.schemaRefs,
  };
  if (record.id) summary.id = record.id;
  if (record.propsPartName) summary.propsPartName = record.propsPartName;
  if (record.rootNamespace) summary.rootNamespace = record.rootNamespace;
  return summary;
}

export function customXmlPartsListWrapper(editor: Editor, query?: CustomXmlPartsListInput): CustomXmlPartsListResult {
  const revision = getRevision(editor);
  const all = listCustomXmlParts(getConvertedXml(editor));

  let filtered = all;
  if (query?.rootNamespace !== undefined) {
    filtered = filtered.filter((p) => p.rootNamespace === query.rootNamespace);
  }
  if (query?.schemaRef !== undefined) {
    filtered = filtered.filter((p) => p.schemaRefs.includes(query.schemaRef as string));
  }

  const allItems = filtered.map((record) => {
    const summary = toSummary(record);
    // Stable identifier for the discovery item: itemID GUID when present,
    // partName otherwise (foreign parts without a Properties Part).
    const stableId = summary.id ?? summary.partName;
    return buildDiscoveryItem(
      stableId,
      buildResolvedHandle(`customXml:${stableId}`, 'ephemeral', 'ext:customXmlPart'),
      summary,
    );
  });

  const { total, items: paged } = paginate(allItems, query?.offset, query?.limit);
  const effectiveLimit = query?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: revision,
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: query?.offset ?? 0, returned: paged.length },
  });
}

export function customXmlPartsGetWrapper(editor: Editor, input: CustomXmlPartsGetInput): CustomXmlPartInfo | null {
  const record = readCustomXmlPart(getConvertedXml(editor), input.target);
  if (!record) return null;
  // Normalize null fields to match CustomXmlPartInfo shape (optional, not null).
  const info: CustomXmlPartInfo = {
    partName: record.partName,
    rootNamespace: record.rootNamespace ?? undefined,
    schemaRefs: record.schemaRefs,
    content: record.content,
  };
  if (record.id) info.id = record.id;
  if (record.propsPartName) info.propsPartName = record.propsPartName;
  return info;
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

type FailureCode = 'INVALID_INPUT' | 'TARGET_NOT_FOUND';

function failure(
  code: FailureCode,
  message: string,
): { success: false; failure: { code: FailureCode; message: string } } {
  return { success: false, failure: { code, message } };
}

type WriteFailure = { ok: false; code: FailureCode; message: string };
type WriteOutcome<T> = { ok: true; payload: T } | WriteFailure;

function isWriteFailure<T>(outcome: WriteOutcome<T>): outcome is WriteFailure {
  return outcome.ok === false;
}

function targetNotFound(): WriteOutcome<never> {
  return { ok: false, code: 'TARGET_NOT_FOUND', message: 'No custom XML part matched the supplied target.' };
}

/**
 * Wraps a synchronous block that can throw on well-formedness / parsing.
 * Lifecycle errors (REVISION_MISMATCH from checkRevision, PlanError) MUST
 * NOT pass through this — that's why the catch is scoped to just the
 * content-validation block, not the whole executeOutOfBandMutation call.
 */
function safeValidate<T>(fn: () => T): WriteOutcome<T> {
  try {
    return { ok: true, payload: fn() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, code: 'INVALID_INPUT', message: msg };
  }
}

export function customXmlPartsCreateWrapper(
  editor: Editor,
  input: CustomXmlPartsCreateInput,
  options?: MutationOptions,
): CustomXmlPartsCreateResult {
  rejectTrackedMode('customXml.parts.create', options);
  const outcome = executeOutOfBandMutation<WriteOutcome<{ id: string; partName: string; propsPartName: string }>>(
    editor,
    (dryRun) => {
      if (dryRun) {
        // Read-only preview: validate well-formedness without writing.
        const probe = safeValidate(() =>
          createCustomXmlPart({}, { content: input.content, schemaRefs: input.schemaRefs }),
        );
        if (isWriteFailure(probe)) return { changed: false, payload: probe };
        return {
          changed: false,
          payload: { ok: true, payload: { id: '{DRY-RUN}', partName: '', propsPartName: '' } },
        };
      }
      const probe = safeValidate(() =>
        prepareCustomXmlPartMutation(
          editor,
          (convertedXml, converter) =>
            createCustomXmlPart(convertedXml, { content: input.content, schemaRefs: input.schemaRefs }, converter),
          'customXml.parts.create',
        ),
      );
      if (isWriteFailure(probe)) return { changed: false, payload: probe };
      const created = commitPreparedCustomXmlPartMutation(editor, probe.payload, { source: 'customXml.parts.create' });
      return { changed: false, payload: { ok: true, payload: created } };
    },
    { dryRun: options?.dryRun === true, expectedRevision: options?.expectedRevision },
  );
  if (isWriteFailure(outcome)) return failure(outcome.code, outcome.message);
  return {
    success: true,
    id: outcome.payload.id,
    partName: outcome.payload.partName,
    propsPartName: outcome.payload.propsPartName,
  };
}

export function customXmlPartsPatchWrapper(
  editor: Editor,
  input: CustomXmlPartsPatchInput,
  options?: MutationOptions,
): CustomXmlPartsMutationResult {
  rejectTrackedMode('customXml.parts.patch', options);
  const outcome = executeOutOfBandMutation<WriteOutcome<{ id: string | null }>>(
    editor,
    (dryRun) => {
      if (dryRun) {
        const partName = resolveTargetPartName(getConvertedXml(editor), input.target);
        if (!partName) return { changed: false, payload: targetNotFound() };
        if (input.content !== undefined) {
          const probe = safeValidate(() => createCustomXmlPart({}, { content: input.content, schemaRefs: undefined }));
          if (isWriteFailure(probe)) return { changed: false, payload: probe };
        }
        return { changed: false, payload: { ok: true, payload: { id: null } } };
      }
      // Resolve first so a missing target doesn't get reported as INVALID_INPUT.
      const partName = resolveTargetPartName(getConvertedXml(editor), input.target);
      if (!partName) return { changed: false, payload: targetNotFound() };
      const probe = safeValidate(() =>
        prepareCustomXmlPartMutation(
          editor,
          (convertedXml, converter) =>
            patchCustomXmlPart(
              convertedXml,
              input.target,
              { content: input.content, schemaRefs: input.schemaRefs },
              converter,
            ),
          'customXml.parts.patch',
        ),
      );
      if (isWriteFailure(probe)) return { changed: false, payload: probe };
      if (!probe.payload.result) return { changed: false, payload: targetNotFound() };
      const patched = commitPreparedCustomXmlPartMutation(editor, probe.payload, { source: 'customXml.parts.patch' });
      return { changed: false, payload: { ok: true, payload: { id: patched.id ?? null } } };
    },
    { dryRun: options?.dryRun === true, expectedRevision: options?.expectedRevision },
  );
  if (isWriteFailure(outcome)) return failure(outcome.code, outcome.message);
  const result: CustomXmlPartsMutationResult = { success: true, target: input.target };
  if (outcome.payload.id) result.id = outcome.payload.id;
  return result;
}

export function customXmlPartsRemoveWrapper(
  editor: Editor,
  input: CustomXmlPartsRemoveInput,
  options?: MutationOptions,
): CustomXmlPartsMutationResult {
  rejectTrackedMode('customXml.parts.remove', options);
  const outcome = executeOutOfBandMutation<WriteOutcome<true>>(
    editor,
    (dryRun) => {
      if (dryRun) {
        const partName = resolveTargetPartName(getConvertedXml(editor), input.target);
        return partName
          ? { changed: false, payload: { ok: true, payload: true } }
          : { changed: false, payload: targetNotFound() };
      }
      const probe = prepareCustomXmlPartMutation(
        editor,
        (convertedXml, converter) => removeCustomXmlPart(convertedXml, input.target, converter),
        'customXml.parts.remove',
      );
      if (!probe.result) return { changed: false, payload: targetNotFound() };
      commitPreparedCustomXmlPartMutation(editor, probe, { source: 'customXml.parts.remove' });
      return { changed: false, payload: { ok: true, payload: true } };
    },
    { dryRun: options?.dryRun === true, expectedRevision: options?.expectedRevision },
  );
  if (isWriteFailure(outcome)) return failure(outcome.code, outcome.message);
  return { success: true, target: input.target };
}

// ---------------------------------------------------------------------------
// Adapter assembly
// ---------------------------------------------------------------------------

export function createCustomXmlPartsAdapter(editor: Editor): CustomXmlPartsAdapter {
  return {
    list: (query) => customXmlPartsListWrapper(editor, query),
    get: (input) => customXmlPartsGetWrapper(editor, input),
    create: (input, options) => customXmlPartsCreateWrapper(editor, input, options),
    patch: (input, options) => customXmlPartsPatchWrapper(editor, input, options),
    remove: (input, options) => customXmlPartsRemoveWrapper(editor, input, options),
  };
}
