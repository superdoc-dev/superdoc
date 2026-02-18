/**
 * Purpose: Enforce parity between operation IDs, operation/member maps, and runtime API surface.
 * Caller: Contract maintenance check (local or CI).
 * Reads: `../src/index.js` contract metadata and runtime API shape.
 * Writes: None (exit code + console output only).
 * Fails when: Any catalog/map/member-path parity rule is violated.
 */
import {
  COMMAND_CATALOG,
  DOCUMENT_API_MEMBER_PATHS,
  OPERATION_IDS,
  OPERATION_MEMBER_PATH_MAP,
  createDocumentApi,
  isValidOperationIdFormat,
  type DocumentApiAdapters,
} from '../src/index.js';
import { OPERATION_DEFINITIONS } from '../src/contract/operation-definitions.js';
import { OPERATION_REFERENCE_DOC_PATH_MAP } from '../src/contract/reference-doc-map.js';
import { buildDispatchTable } from '../src/invoke/invoke.js';

/**
 * Meta-methods on DocumentApi that are not operations.
 * These are excluded from operation-to-member-path parity checks.
 */
const META_MEMBER_PATHS = ['invoke'] as const;

function collectFunctionMemberPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [];

  const paths: string[] = [];
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));

  for (const [key, member] of entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof member === 'function') {
      paths.push(path);
      continue;
    }
    if (member && typeof member === 'object') {
      paths.push(...collectFunctionMemberPaths(member, path));
    }
  }

  return paths;
}

function createNoopAdapters(): DocumentApiAdapters {
  return {
    find: {
      find: () => ({ matches: [], total: 0 }),
    },
    getNode: {
      getNode: () => ({ kind: 'block', nodeType: 'paragraph', properties: {} }),
      getNodeById: () => ({ kind: 'block', nodeType: 'paragraph', properties: {} }),
    },
    getText: {
      getText: () => '',
    },
    info: {
      info: () => ({
        counts: { words: 0, paragraphs: 0, headings: 0, tables: 0, images: 0, comments: 0 },
        outline: [],
        capabilities: { canFind: true, canGetNode: true, canComment: true, canReplace: true },
      }),
    },
    capabilities: {
      get: () => ({
        global: {
          trackChanges: { enabled: false },
          comments: { enabled: false },
          lists: { enabled: false },
          dryRun: { enabled: false },
        },
        operations: {} as ReturnType<DocumentApiAdapters['capabilities']['get']>['operations'],
      }),
    },
    comments: {
      add: () => ({ success: true }),
      edit: () => ({ success: true }),
      reply: () => ({ success: true }),
      move: () => ({ success: true }),
      resolve: () => ({ success: true }),
      remove: () => ({ success: true }),
      setInternal: () => ({ success: true }),
      setActive: () => ({ success: true }),
      goTo: () => ({ success: true }),
      get: () => ({
        address: { kind: 'entity', entityType: 'comment', entityId: 'comment-1' },
        commentId: 'comment-1',
        status: 'open',
      }),
      list: () => ({ matches: [], total: 0 }),
    },
    write: {
      write: () => ({
        success: true,
        resolution: {
          target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 0 } },
          range: { from: 1, to: 1 },
          text: '',
        },
      }),
    },
    format: {
      bold: () => ({
        success: true,
        resolution: {
          target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 1 } },
          range: { from: 1, to: 2 },
          text: 'x',
        },
      }),
    },
    trackChanges: {
      list: () => ({ matches: [], total: 0 }),
      get: ({ id }) => ({
        address: { kind: 'entity', entityType: 'trackedChange', entityId: id },
        id,
        type: 'insert',
      }),
      accept: () => ({ success: true }),
      reject: () => ({ success: true }),
      acceptAll: () => ({ success: true }),
      rejectAll: () => ({ success: true }),
    },
    create: {
      paragraph: () => ({
        success: true,
        paragraph: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
        insertionPoint: { kind: 'text', blockId: 'p2', range: { start: 0, end: 0 } },
      }),
    },
    lists: {
      list: () => ({ matches: [], total: 0, items: [] }),
      get: () => ({
        address: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
      }),
      insert: () => ({
        success: true,
        item: { kind: 'block', nodeType: 'listItem', nodeId: 'li-2' },
        insertionPoint: { kind: 'text', blockId: 'li-2', range: { start: 0, end: 0 } },
      }),
      setType: () => ({
        success: true,
        item: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
      }),
      indent: () => ({
        success: true,
        item: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
      }),
      outdent: () => ({
        success: true,
        item: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
      }),
      restart: () => ({
        success: true,
        item: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
      }),
      exit: () => ({
        success: true,
        paragraph: { kind: 'block', nodeType: 'paragraph', nodeId: 'p3' },
      }),
    },
  };
}

function diff(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function run(): void {
  const errors: string[] = [];
  const operationIds = [...OPERATION_IDS];
  const catalogKeys = Object.keys(COMMAND_CATALOG);
  const mappedKeys = Object.keys(OPERATION_MEMBER_PATH_MAP);

  const invalidFormatIds = operationIds.filter((operationId) => !isValidOperationIdFormat(operationId));
  if (invalidFormatIds.length > 0) {
    errors.push(`Invalid operationId format: ${invalidFormatIds.join(', ')}`);
  }

  const missingFromCatalog = diff(operationIds, catalogKeys);
  const extraInCatalog = diff(catalogKeys, operationIds);
  if (missingFromCatalog.length > 0 || extraInCatalog.length > 0) {
    errors.push(
      `COMMAND_CATALOG parity failed (missing: ${missingFromCatalog.join(', ') || 'none'}, extra: ${extraInCatalog.join(', ') || 'none'})`,
    );
  }

  const missingFromMap = diff(operationIds, mappedKeys);
  const extraInMap = diff(mappedKeys, operationIds);
  if (missingFromMap.length > 0 || extraInMap.length > 0) {
    errors.push(
      `operation-map key parity failed (missing: ${missingFromMap.join(', ') || 'none'}, extra: ${extraInMap.join(', ') || 'none'})`,
    );
  }

  const api = createDocumentApi(createNoopAdapters());
  const metaPathSet = new Set<string>(META_MEMBER_PATHS);
  const runtimeMemberPaths = collectFunctionMemberPaths(api)
    .filter((path) => !metaPathSet.has(path))
    .sort();
  const declaredMemberPaths = [...DOCUMENT_API_MEMBER_PATHS].sort();

  const missingRuntimeMembers = diff(declaredMemberPaths, runtimeMemberPaths);
  const extraRuntimeMembers = diff(runtimeMemberPaths, declaredMemberPaths);
  if (missingRuntimeMembers.length > 0 || extraRuntimeMembers.length > 0) {
    errors.push(
      `DocumentApi member-path parity failed (missing runtime: ${missingRuntimeMembers.join(', ') || 'none'}, extra runtime: ${extraRuntimeMembers.join(', ') || 'none'})`,
    );
  }

  // Verify invoke dispatch table keys match OPERATION_IDS exactly.
  const dispatchKeys = Object.keys(buildDispatchTable(api)).sort();
  const missingDispatch = diff(operationIds, dispatchKeys);
  const extraDispatch = diff(dispatchKeys, operationIds);
  if (missingDispatch.length > 0 || extraDispatch.length > 0) {
    errors.push(
      `invoke dispatch table parity failed (missing: ${missingDispatch.join(', ') || 'none'}, extra: ${extraDispatch.join(', ') || 'none'})`,
    );
  }

  const mappedMemberPaths = Object.values(OPERATION_MEMBER_PATH_MAP).sort();
  const missingMapMembers = diff(declaredMemberPaths, mappedMemberPaths);
  const extraMapMembers = diff(mappedMemberPaths, declaredMemberPaths);
  if (missingMapMembers.length > 0 || extraMapMembers.length > 0) {
    errors.push(
      `operation-map value parity failed (missing map values: ${missingMapMembers.join(', ') || 'none'}, extra map values: ${extraMapMembers.join(', ') || 'none'})`,
    );
  }

  for (const operationId of operationIds) {
    const memberPath = OPERATION_MEMBER_PATH_MAP[operationId];
    if (!declaredMemberPaths.includes(memberPath)) {
      errors.push(`operationId "${operationId}" maps to undeclared member path "${memberPath}".`);
    }
    if (!runtimeMemberPaths.includes(memberPath)) {
      errors.push(`operationId "${operationId}" maps to runtime-missing member path "${memberPath}".`);
    }
  }

  // Verify OPERATION_DEFINITIONS keys match OPERATION_IDS exactly.
  const definitionKeys = Object.keys(OPERATION_DEFINITIONS).sort();
  const sortedOperationIds = [...operationIds].sort();
  if (definitionKeys.join('|') !== sortedOperationIds.join('|')) {
    errors.push(
      `OPERATION_DEFINITIONS keys do not match OPERATION_IDS (definitions: ${definitionKeys.length}, ops: ${sortedOperationIds.length})`,
    );
  }

  // Value-level projection checks — catches projection bugs, not just key bugs.
  for (const id of operationIds) {
    const defEntry = OPERATION_DEFINITIONS[id];
    if (COMMAND_CATALOG[id] !== defEntry.metadata) {
      errors.push(`COMMAND_CATALOG['${id}'] is not the same object as OPERATION_DEFINITIONS['${id}'].metadata`);
    }
    if (OPERATION_MEMBER_PATH_MAP[id] !== defEntry.memberPath) {
      errors.push(`OPERATION_MEMBER_PATH_MAP['${id}'] !== OPERATION_DEFINITIONS['${id}'].memberPath`);
    }
    if (OPERATION_REFERENCE_DOC_PATH_MAP[id] !== defEntry.referenceDocPath) {
      errors.push(`OPERATION_REFERENCE_DOC_PATH_MAP['${id}'] !== OPERATION_DEFINITIONS['${id}'].referenceDocPath`);
    }
  }

  if (errors.length > 0) {
    console.error('contract parity check failed:\n');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `contract parity check passed (${operationIds.length} operations, ${declaredMemberPaths.length} API members).`,
  );
}

run();
