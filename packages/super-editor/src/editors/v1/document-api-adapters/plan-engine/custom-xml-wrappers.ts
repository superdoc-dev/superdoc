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
import {
  listCustomXmlParts,
  readCustomXmlPart,
} from '../../core/super-converter/custom-xml-parts.js';

// ---------------------------------------------------------------------------
// Converter access
// ---------------------------------------------------------------------------

type ConverterWithConvertedXml = {
  convertedXml?: Record<string, unknown>;
};

function getConvertedXml(editor: Editor): Record<string, unknown> {
  const converter = (editor as unknown as { converter?: ConverterWithConvertedXml }).converter;
  return converter?.convertedXml ?? {};
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

export function customXmlPartsListWrapper(
  editor: Editor,
  query?: CustomXmlPartsListInput,
): CustomXmlPartsListResult {
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

export function customXmlPartsGetWrapper(
  editor: Editor,
  input: CustomXmlPartsGetInput,
): CustomXmlPartInfo | null {
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
// Write operations (placeholder until SD-3105 Phase B)
// ---------------------------------------------------------------------------

function notImplemented(op: string): CustomXmlPartsMutationResult {
  return {
    success: false,
    failure: {
      code: 'CAPABILITY_UNAVAILABLE',
      message: `${op} is not yet implemented on this adapter.`,
    },
  };
}

export function customXmlPartsCreateWrapper(
  _editor: Editor,
  _input: CustomXmlPartsCreateInput,
  _options?: MutationOptions,
): CustomXmlPartsCreateResult {
  return {
    success: false,
    failure: {
      code: 'CAPABILITY_UNAVAILABLE',
      message: 'customXml.parts.create is not yet implemented on this adapter.',
    },
  };
}

export function customXmlPartsPatchWrapper(
  _editor: Editor,
  _input: CustomXmlPartsPatchInput,
  _options?: MutationOptions,
): CustomXmlPartsMutationResult {
  return notImplemented('customXml.parts.patch');
}

export function customXmlPartsRemoveWrapper(
  _editor: Editor,
  _input: CustomXmlPartsRemoveInput,
  _options?: MutationOptions,
): CustomXmlPartsMutationResult {
  return notImplemented('customXml.parts.remove');
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
