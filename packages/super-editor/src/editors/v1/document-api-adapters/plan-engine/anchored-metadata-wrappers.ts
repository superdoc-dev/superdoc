import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { v4 as uuidv4 } from 'uuid';
import type {
  AnchoredMetadataAdapter,
  AnchoredMetadataAttachInput,
  AnchoredMetadataAttachResult,
  AnchoredMetadataGetInput,
  AnchoredMetadataInfo,
  AnchoredMetadataListInput,
  AnchoredMetadataListResult,
  AnchoredMetadataMutationResult,
  AnchoredMetadataRemoveInput,
  AnchoredMetadataResolveInfo,
  AnchoredMetadataResolveInput,
  AnchoredMetadataSummary,
  AnchoredMetadataUpdateInput,
  MutationOptions,
  SelectionPoint,
  SelectionTarget,
} from '@superdoc/document-api';
import { buildDiscoveryItem, buildDiscoveryResult, buildResolvedHandle } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { generateRandomSigned32BitIntStrId } from '../../core/helpers/generateDocxRandomId.js';
import {
  createCustomXmlPart,
  listCustomXmlParts,
  nextCustomXmlItemIndex,
  parseStoragePartRootNamespace,
  patchCustomXmlPart,
  removeCustomXmlPart,
} from '../../core/super-converter/custom-xml-parts.js';
import { DocumentApiAdapterError } from '../errors.js';
import { getBlockIndex, clearIndexCache } from '../helpers/index-cache.js';
import { isTextBlockCandidate } from '../helpers/node-address-resolver.js';
import { resolveSelectionTarget } from '../helpers/selection-target-resolver.js';
import { pmPositionToTextOffset } from '../helpers/text-offset-resolver.js';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { paginate } from '../helpers/adapter-utils.js';
import { findAllSdtNodes, SDT_INLINE_NAME } from '../helpers/content-controls/index.js';
import { executeOutOfBandMutation } from '../out-of-band-mutation.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { checkRevision, getRevision } from './revision-tracker.js';

type XmlNode = {
  type?: string;
  name?: string;
  attributes?: Record<string, string>;
  elements?: XmlNode[];
  text?: string;
  cdata?: string;
};

type XmlDocument = {
  elements?: XmlNode[];
};

type ConverterWithConvertedXml = {
  convertedXml?: Record<string, unknown>;
  documentModified?: boolean;
  documentGuid?: string | null;
  promoteToGuid?: () => string;
};

type MetadataEntry = AnchoredMetadataInfo;

type MetadataPart = {
  namespace: string;
  partName: string;
  entries: MetadataEntry[];
};

type FailureCode = 'INVALID_INPUT' | 'INVALID_TARGET' | 'TARGET_NOT_FOUND';

type FailureResult = {
  success: false;
  failure: { code: FailureCode; message: string };
};

function failure(code: FailureCode, message: string): FailureResult {
  return { success: false, failure: { code, message } };
}

function getConverter(editor: Editor): ConverterWithConvertedXml | null {
  return (editor as unknown as { converter?: ConverterWithConvertedXml }).converter ?? null;
}

function getConvertedXml(editor: Editor): Record<string, unknown> {
  return getConverter(editor)?.convertedXml ?? {};
}

function markConverterDirty(editor: Editor): void {
  const converter = getConverter(editor);
  if (!converter) return;
  converter.documentModified = true;
  if (!converter.documentGuid && typeof converter.promoteToGuid === 'function') {
    converter.promoteToGuid();
  }
}

function getRootElement(doc: unknown): XmlNode | null {
  const xmlDoc = doc as XmlDocument | undefined;
  return xmlDoc?.elements?.find((el) => el?.type === 'element') ?? null;
}

function localName(name: string | undefined): string {
  if (!name) return '';
  const idx = name.indexOf(':');
  return idx >= 0 ? name.slice(idx + 1) : name;
}

function getTextContent(node: XmlNode | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'cdata') return node.cdata ?? '';
  return (node.elements ?? []).map((child) => getTextContent(child)).join('');
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildEnvelopeXml(namespace: string, entries: MetadataEntry[]): string {
  const children = entries
    .map((entry) => {
      const json = JSON.stringify(entry.payload);
      return `<ref id="${escapeXmlAttribute(entry.id)}" encoding="json">${escapeXmlText(json)}</ref>`;
    })
    .join('');
  return `<refs xmlns="${escapeXmlAttribute(namespace)}">${children}</refs>`;
}

function parseMetadataPart(convertedXml: Record<string, unknown>, partName: string): MetadataPart | null {
  const root = getRootElement(convertedXml[partName]);
  if (!root || localName(root.name) !== 'refs') return null;

  const namespace = parseStoragePartRootNamespace(convertedXml[partName]);
  if (typeof namespace !== 'string' || namespace.length === 0) return null;

  const entries: MetadataEntry[] = [];
  for (const child of root.elements ?? []) {
    if (child?.type !== 'element' || localName(child.name) !== 'ref') continue;
    if (child.attributes?.encoding !== 'json') continue;
    const id = child.attributes?.id;
    if (typeof id !== 'string' || id.length === 0) continue;
    try {
      entries.push({
        id,
        namespace,
        partName,
        payload: JSON.parse(getTextContent(child)),
      });
    } catch {
      continue;
    }
  }

  return { namespace, partName, entries };
}

function listMetadataParts(convertedXml: Record<string, unknown>): MetadataPart[] {
  return listCustomXmlParts(convertedXml)
    .map((part) => parseMetadataPart(convertedXml, part.partName))
    .filter((part): part is MetadataPart => part !== null);
}

function findPartByNamespace(convertedXml: Record<string, unknown>, namespace: string): MetadataPart | null {
  return listMetadataParts(convertedXml).find((part) => part.namespace === namespace) ?? null;
}

function findEntry(convertedXml: Record<string, unknown>, id: string): MetadataEntry | null {
  for (const part of listMetadataParts(convertedXml)) {
    const entry = part.entries.find((candidate) => candidate.id === id);
    if (entry) return entry;
  }
  return null;
}

function hasPayloadEntry(convertedXml: Record<string, unknown>, id: string): boolean {
  return findEntry(convertedXml, id) !== null;
}

function predictPartName(convertedXml: Record<string, unknown>, converter: ConverterWithConvertedXml | null): string {
  return `customXml/item${nextCustomXmlItemIndex(convertedXml, converter)}.xml`;
}

function buildAnchorAttrs(id: string): Record<string, unknown> {
  return {
    id: generateRandomSigned32BitIntStrId(),
    tag: id,
    alias: 'Anchored metadata',
    appearance: 'hidden',
    controlType: 'richText',
    type: 'richText',
    sdtPr: {
      name: 'w:sdtPr',
      type: 'element',
      elements: [
        { name: 'w:richText', type: 'element' },
        { name: 'w15:appearance', type: 'element', attributes: { 'w15:val': 'hidden' } },
      ],
    },
  };
}

function dispatchTransaction(editor: Editor, tr: Editor['state']['tr']): void {
  if (editor.view?.dispatch) {
    editor.view.dispatch(tr);
    return;
  }

  if (typeof editor.dispatch === 'function') {
    editor.dispatch(tr);
    return;
  }

  throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', 'metadata.* requires an editor dispatch function.');
}

function findAnchorsById(editor: Editor, id: string) {
  return findAllSdtNodes(editor.state.doc).filter((sdt) => sdt.kind === 'inline' && sdt.node.attrs?.tag === id);
}

function hasAnchor(editor: Editor, id: string): boolean {
  return findAllSdtNodes(editor.state.doc).some((sdt) => sdt.node.attrs?.tag === id);
}

function wrapRangeInAnchor(editor: Editor, target: SelectionTarget, id: string): boolean {
  const { absFrom, absTo } = resolveSelectionTarget(editor, target);
  if (absFrom >= absTo) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'metadata.attach requires a non-empty text range.');
  }

  const nodeType = editor.schema.nodes[SDT_INLINE_NAME];
  if (!nodeType) {
    throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', 'Inline content-control node is not available.');
  }

  const { tr } = editor.state;
  const attrs = buildAnchorAttrs(id);
  const runType = editor.schema.nodes.run;
  const $from = tr.doc.resolve(absFrom);
  const $to = tr.doc.resolve(absTo);
  const sameRun = runType && $from.parent.type === runType && $from.parent === $to.parent;

  if (sameRun) {
    const runDepth = $from.depth;
    const runStart = $from.before(runDepth);
    const runEnd = $from.after(runDepth);
    const parentRun = $from.parent;
    const selectedContent = parentRun.content.cut($from.parentOffset, $to.parentOffset);
    const leftContent = parentRun.content.cut(0, $from.parentOffset);
    const rightContent = parentRun.content.cut($to.parentOffset);
    const sdtNode = nodeType.create(attrs, selectedContent);
    const replacement: ProseMirrorNode[] = [];
    if (leftContent.size > 0) replacement.push(runType.create(parentRun.attrs, leftContent, parentRun.marks));
    replacement.push(sdtNode);
    if (rightContent.size > 0) replacement.push(runType.create(parentRun.attrs, rightContent, parentRun.marks));
    tr.replaceWith(runStart, runEnd, replacement);
  } else {
    const selected = tr.doc.slice(absFrom, absTo);
    const sdtNode = nodeType.create(attrs, selected.content);
    tr.replaceWith(absFrom, absTo, sdtNode);
  }

  dispatchTransaction(editor, tr);
  clearIndexCache(editor);
  return true;
}

function unwrapAnchor(editor: Editor, id: string): boolean {
  const anchor = findAnchorsById(editor, id)[0];
  if (!anchor) return false;
  const { tr } = editor.state;
  tr.replaceWith(anchor.pos, anchor.pos + anchor.node.nodeSize, anchor.node.content);
  dispatchTransaction(editor, tr);
  clearIndexCache(editor);
  return true;
}

function pointFromPmPosition(editor: Editor, pos: number): SelectionPoint {
  const index = getBlockIndex(editor);
  for (const candidate of index.candidates) {
    if (!isTextBlockCandidate(candidate)) continue;
    const contentStart = candidate.pos + 1;
    const contentEnd = candidate.end - 1;
    if (pos >= contentStart && pos <= contentEnd) {
      return {
        kind: 'text',
        blockId: candidate.nodeId,
        offset: pmPositionToTextOffset(candidate.node, candidate.pos, pos),
      };
    }
  }

  throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Could not resolve metadata anchor to a text range.');
}

function resolveAnchorTarget(editor: Editor, id: string): SelectionTarget | null {
  const anchor = findAnchorsById(editor, id)[0];
  if (!anchor) return null;
  return {
    kind: 'selection',
    start: pointFromPmPosition(editor, anchor.pos + 1),
    end: pointFromPmPosition(editor, anchor.pos + anchor.node.nodeSize - 1),
  };
}

function rangesOverlap(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  if (aFrom === aTo || bFrom === bTo) {
    return aFrom <= bTo && bFrom <= aTo;
  }
  return aFrom < bTo && bFrom < aTo;
}

function anchorOverlaps(editor: Editor, id: string, within: SelectionTarget): boolean {
  const anchor = findAnchorsById(editor, id)[0];
  if (!anchor) return false;
  const query = resolveSelectionTarget(editor, within);
  const anchorFrom = anchor.pos + 1;
  const anchorTo = anchor.pos + anchor.node.nodeSize - 1;
  return rangesOverlap(anchorFrom, anchorTo, query.absFrom, query.absTo);
}

function writeEntry(
  editor: Editor,
  namespace: string,
  id: string,
  payload: unknown,
  dryRun: boolean,
): { partName: string } {
  const convertedXml = getConvertedXml(editor);
  const converter = getConverter(editor);
  const existing = findPartByNamespace(convertedXml, namespace);
  const entries = existing?.entries.filter((entry) => entry.id !== id) ?? [];
  const next: MetadataEntry = {
    id,
    namespace,
    partName: existing?.partName ?? predictPartName(convertedXml, converter),
    payload,
  };
  const xml = buildEnvelopeXml(namespace, [...entries, next]);

  if (dryRun) {
    return { partName: next.partName };
  }

  if (existing) {
    patchCustomXmlPart(
      convertedXml,
      { partName: existing.partName },
      { content: xml, schemaRefs: undefined },
      converter ?? undefined,
    );
    markConverterDirty(editor);
    return { partName: existing.partName };
  }

  const created = createCustomXmlPart(convertedXml, { content: xml, schemaRefs: undefined }, converter ?? undefined);
  markConverterDirty(editor);
  return { partName: created.partName };
}

function removeEntry(editor: Editor, id: string, dryRun: boolean): boolean {
  const convertedXml = getConvertedXml(editor);
  const converter = getConverter(editor);
  const part = listMetadataParts(convertedXml).find((candidate) => candidate.entries.some((entry) => entry.id === id));
  if (!part) return false;

  if (dryRun) return true;

  const remaining = part.entries.filter((entry) => entry.id !== id);
  if (remaining.length === 0) {
    removeCustomXmlPart(convertedXml, { partName: part.partName }, converter ?? undefined);
  } else {
    patchCustomXmlPart(
      convertedXml,
      { partName: part.partName },
      { content: buildEnvelopeXml(part.namespace, remaining), schemaRefs: undefined },
      converter ?? undefined,
    );
  }
  markConverterDirty(editor);
  return true;
}

function toSummary(entry: MetadataEntry): AnchoredMetadataSummary {
  return {
    id: entry.id,
    namespace: entry.namespace,
    partName: entry.partName,
  };
}

function listEntries(editor: Editor, query?: AnchoredMetadataListInput): MetadataEntry[] {
  let entries = listMetadataParts(getConvertedXml(editor)).flatMap((part) => part.entries);
  if (query?.namespace !== undefined) {
    entries = entries.filter((entry) => entry.namespace === query.namespace);
  }
  if (query?.within !== undefined) {
    entries = entries.filter((entry) => anchorOverlaps(editor, entry.id, query.within as SelectionTarget));
  }
  return entries;
}

export function metadataListWrapper(editor: Editor, query?: AnchoredMetadataListInput): AnchoredMetadataListResult {
  const allItems = listEntries(editor, query).map((entry) => {
    const summary = toSummary(entry);
    return buildDiscoveryItem(
      summary.id,
      buildResolvedHandle(`metadata:${summary.id}`, 'ephemeral', 'ext:anchoredMetadata'),
      summary,
    );
  });

  const { total, items } = paginate(allItems, query?.offset, query?.limit);
  return buildDiscoveryResult({
    evaluatedRevision: getRevision(editor),
    total,
    items,
    page: {
      limit: query?.limit ?? total,
      offset: query?.offset ?? 0,
      returned: items.length,
    },
  });
}

export function metadataGetWrapper(editor: Editor, input: AnchoredMetadataGetInput): AnchoredMetadataInfo | null {
  return findEntry(getConvertedXml(editor), input.id);
}

export function metadataResolveWrapper(
  editor: Editor,
  input: AnchoredMetadataResolveInput,
): AnchoredMetadataResolveInfo | null {
  // An inline SDT's `w:tag` is not reserved for anchored metadata —
  // an imported DOCX can carry foreign content controls whose tag
  // happens to match a metadata id. Require both halves of the
  // anchor (the SDT in the body and the payload entry in a customXml
  // part) to agree before reporting the id resolves, so callers that
  // trust `resolve` (including `ui.metadata.*`) cannot be steered at
  // an unrelated control. Mirrors what `metadata.get` already does
  // for payload reads.
  if (!hasPayloadEntry(getConvertedXml(editor), input.id)) return null;
  const target = resolveAnchorTarget(editor, input.id);
  return target ? { id: input.id, target } : null;
}

export function metadataAttachWrapper(
  editor: Editor,
  input: AnchoredMetadataAttachInput,
  options?: MutationOptions,
): AnchoredMetadataAttachResult {
  rejectTrackedMode('metadata.attach', options);
  const id = input.id ?? uuidv4();
  const convertedXml = getConvertedXml(editor);

  try {
    resolveSelectionTarget(editor, input.target);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failure('INVALID_TARGET', message);
  }

  if (hasPayloadEntry(convertedXml, id) || hasAnchor(editor, id)) {
    return failure('INVALID_INPUT', `Anchored metadata id "${id}" already exists.`);
  }

  const preview = writeEntry(editor, input.namespace, id, input.payload, true);
  if (options?.dryRun) {
    // Mirror the revision guard that the live path runs inside
    // executeDomainCommand, so previews against stale revisions throw
    // REVISION_MISMATCH instead of falsely reporting success.
    checkRevision(editor, options.expectedRevision);
    return { success: true, id, namespace: input.namespace, partName: preview.partName };
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      wrapRangeInAnchor(editor, input.target, id);
      writeEntry(editor, input.namespace, id, input.payload, false);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return failure('INVALID_TARGET', 'metadata.attach did not change the document.');
  }

  const entry = findEntry(getConvertedXml(editor), id);
  return { success: true, id, namespace: input.namespace, partName: entry?.partName ?? preview.partName };
}

export function metadataUpdateWrapper(
  editor: Editor,
  input: AnchoredMetadataUpdateInput,
  options?: MutationOptions,
): AnchoredMetadataMutationResult {
  rejectTrackedMode('metadata.update', options);
  const existing = findEntry(getConvertedXml(editor), input.id);
  if (!existing) {
    return failure('TARGET_NOT_FOUND', `Anchored metadata entry "${input.id}" not found.`);
  }

  return executeOutOfBandMutation<AnchoredMetadataMutationResult>(
    editor,
    (dryRun) => {
      if (!dryRun) {
        writeEntry(editor, existing.namespace, input.id, input.payload, false);
      }
      return { changed: true, payload: { success: true, id: input.id } };
    },
    { dryRun: options?.dryRun ?? false, expectedRevision: options?.expectedRevision },
  );
}

export function metadataRemoveWrapper(
  editor: Editor,
  input: AnchoredMetadataRemoveInput,
  options?: MutationOptions,
): AnchoredMetadataMutationResult {
  rejectTrackedMode('metadata.remove', options);
  const payloadExists = hasPayloadEntry(getConvertedXml(editor), input.id);
  const anchorExists = hasAnchor(editor, input.id);
  if (!payloadExists && !anchorExists) {
    return failure('TARGET_NOT_FOUND', `Anchored metadata entry "${input.id}" not found.`);
  }

  if (options?.dryRun) {
    // Same revision guard as the live executeOutOfBandMutation /
    // executeDomainCommand paths. Throws PlanError(REVISION_MISMATCH).
    checkRevision(editor, options.expectedRevision);
    return { success: true, id: input.id };
  }

  if (!anchorExists) {
    return executeOutOfBandMutation<AnchoredMetadataMutationResult>(
      editor,
      (dryRun) => {
        const changed = removeEntry(editor, input.id, dryRun);
        return { changed, payload: { success: true, id: input.id } };
      },
      { dryRun: false, expectedRevision: options?.expectedRevision },
    );
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      unwrapAnchor(editor, input.id);
      removeEntry(editor, input.id, false);
      markConverterDirty(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return failure('TARGET_NOT_FOUND', `Anchored metadata entry "${input.id}" not found.`);
  }
  return { success: true, id: input.id };
}

export function createAnchoredMetadataAdapter(editor: Editor): AnchoredMetadataAdapter {
  return {
    attach: (input, options) => metadataAttachWrapper(editor, input, options),
    list: (query) => metadataListWrapper(editor, query),
    get: (input) => metadataGetWrapper(editor, input),
    update: (input, options) => metadataUpdateWrapper(editor, input, options),
    remove: (input, options) => metadataRemoveWrapper(editor, input, options),
    resolve: (input) => metadataResolveWrapper(editor, input),
  };
}
