/**
 * Operation catalog derived from the generated contract.
 *
 * This module turns every `doc.*` operation in `generated/contract.ts` into a
 * row classified by domain, mutating vs read, target shape, change-mode
 * support, dry-run support, atomicity, verification hints, exposure status,
 * and action eligibility. The classification is built deterministically from
 * the contract so the catalog cannot silently drift out of sync.
 *
 * The catalog is the source of truth used by:
 * - the IR validator (every IR operation must resolve to a catalog row)
 * - anti-overfit gates (tests that assert every generated operation is
 *   classified)
 * - holdout-style conformance checks
 *
 * Do not hand-classify operations here. Add rules to the derivation pass.
 */
import { CONTRACT, type ContractOperationEntry, type ContractParamEntry } from '../generated/contract.js';

export type OperationDomain =
  | 'session'
  | 'meta'
  | 'document-read'
  | 'document-write'
  | 'blocks'
  | 'text'
  | 'format'
  | 'styles'
  | 'lists'
  | 'tables'
  | 'images'
  | 'comments'
  | 'tracked-changes'
  | 'sections'
  | 'fields'
  | 'hyperlinks'
  | 'bookmarks'
  | 'cross-refs'
  | 'footnotes'
  | 'header-footer'
  | 'content-controls'
  | 'permission-ranges'
  | 'protection'
  | 'toc'
  | 'authorities'
  | 'captions'
  | 'citations'
  | 'mutations'
  | 'selection'
  | 'history'
  | 'index'
  | 'query'
  | 'ranges'
  | 'diff';

export type OperationMode = 'read' | 'write' | 'session';

export type TargetShape =
  | 'none'
  | 'block'
  | 'range'
  | 'entity'
  | 'paragraph'
  | 'table'
  | 'list'
  | 'document'
  | 'image'
  | 'comment'
  | 'mixed';

export type ExposureStatus = 'stable' | 'experimental' | 'benchmark-only' | 'internal';

export type OperationCatalogEntry = {
  operationId: string;
  domain: OperationDomain;
  mode: OperationMode;
  isMutating: boolean;
  targetShape: TargetShape;
  storyHints: readonly string[];
  domainHints: readonly string[];
  supportsChangeMode: boolean;
  supportsDryRun: boolean;
  atomic: boolean;
  verificationHints: readonly string[];
  exposure: ExposureStatus;
  actionEligible: boolean;
  description: string;
};

const MUTATING_VERBS = new Set([
  'insert',
  'create',
  'delete',
  'remove',
  'patch',
  'update',
  'set',
  'apply',
  'replace',
  'rewrite',
  'merge',
  'split',
  'attach',
  'detach',
  'rebuild',
  'configure',
  'rename',
  'clear',
  'clearcontent',
  'append',
  'appendcontent',
  'indent',
  'outdent',
  'decide',
  'continueprevious',
  'setlevel',
  'setvalue',
  'settype',
  'setstate',
  'undo',
  'redo',
  'insertlinebreak',
  'inserttab',
  'mutations',
  'commit',
  'rollback',
  'transact',
]);

const READ_VERBS = new Set([
  'get',
  'list',
  'find',
  'info',
  'capabilities',
  'extract',
  'gettext',
  'gethtml',
  'getmarkdown',
  'getnode',
  'getnodebyid',
  'diff',
  'history',
  'describe',
  'describecommand',
  'status',
  'query',
  'markdowntofragment',
  'getstate',
]);

const SESSION_OP_IDS = new Set(['doc.open', 'doc.close', 'doc.save', 'doc.session']);
const META_OP_IDS = new Set(['doc.describe', 'doc.describeCommand', 'doc.capabilities.get', 'doc.status']);

const BENCHMARK_ONLY_HINTS: ReadonlyArray<string> = [
  // Anything we explicitly mark as not for product-default coverage. Empty
  // for now — concrete benchmark surfaces live in profile config, not the
  // contract-derived catalog.
];

function tokensFromOperationId(operationId: string): string[] {
  return operationId.split('.').slice(1);
}

function lastToken(operationId: string): string {
  const tokens = tokensFromOperationId(operationId);
  return (tokens[tokens.length - 1] ?? '').toLowerCase();
}

function deriveDomain(operationId: string): OperationDomain {
  const tokens = tokensFromOperationId(operationId);
  const first = (tokens[0] ?? '').toLowerCase();
  switch (first) {
    case 'open':
    case 'close':
    case 'save':
    case 'session':
      return 'session';
    case 'describe':
    case 'describecommand':
    case 'capabilities':
    case 'status':
      return 'meta';
    case 'gettext':
    case 'getmarkdown':
    case 'gethtml':
    case 'getnode':
    case 'getnodebyid':
    case 'info':
    case 'extract':
    case 'find':
    case 'markdowntofragment':
      return 'document-read';
    case 'create':
      // create.* domain-specific; classify by sub-domain
      switch ((tokens[1] ?? '').toLowerCase()) {
        case 'table':
          return 'tables';
        case 'image':
          return 'images';
        case 'paragraph':
        case 'heading':
        case 'sectionbreak':
        case 'tableofcontents':
          return 'blocks';
        default:
          return 'document-write';
      }
    case 'blocks':
      return 'blocks';
    case 'text':
    case 'replace':
    case 'delete':
    case 'insert':
    case 'insertlinebreak':
    case 'inserttab':
    case 'clearcontent':
      return 'text';
    case 'format':
      return 'format';
    case 'styles':
      return 'styles';
    case 'lists':
      return 'lists';
    case 'tables':
      return 'tables';
    case 'images':
      return 'images';
    case 'comments':
      return 'comments';
    case 'trackchanges':
      return 'tracked-changes';
    case 'sections':
      return 'sections';
    case 'fields':
      return 'fields';
    case 'hyperlinks':
      return 'hyperlinks';
    case 'bookmarks':
      return 'bookmarks';
    case 'crossrefs':
      return 'cross-refs';
    case 'footnotes':
      return 'footnotes';
    case 'headerfooters':
      return 'header-footer';
    case 'contentcontrols':
      return 'content-controls';
    case 'permissionranges':
      return 'permission-ranges';
    case 'protection':
      return 'protection';
    case 'toc':
      return 'toc';
    case 'authorities':
      return 'authorities';
    case 'captions':
      return 'captions';
    case 'citations':
      return 'citations';
    case 'mutations':
      return 'mutations';
    case 'selection':
      return 'selection';
    case 'history':
      return 'history';
    case 'index':
      return 'index';
    case 'query':
      return 'query';
    case 'ranges':
      return 'ranges';
    case 'diff':
      return 'diff';
    case 'get':
      return 'document-read';
    default:
      return 'document-write';
  }
}

function deriveMode(operationId: string, entry?: ContractOperationEntry): OperationMode {
  if (SESSION_OP_IDS.has(operationId)) return 'session';
  const last = lastToken(operationId);
  if (READ_VERBS.has(last)) return 'read';
  if (entry?.mutates === true) return 'write';
  if (MUTATING_VERBS.has(last)) return 'write';
  // Operations that don't end with a mutating verb but still mutate (e.g.
  // doc.replace, doc.delete) are caught by the verb sets above or by the
  // generated contract's `mutates` flag; the rest default to read.
  if (last === 'replace' || last === 'delete' || last === 'insert') return 'write';
  return 'read';
}

function deriveTargetShape(operationId: string): TargetShape {
  const tokens = tokensFromOperationId(operationId).map((t) => t.toLowerCase());
  if (tokens.length === 0) return 'document';
  if (tokens[0] === 'blocks') return 'block';
  if (tokens[0] === 'tables') return 'table';
  if (tokens[0] === 'lists') return 'list';
  if (tokens[0] === 'images') return 'image';
  if (tokens[0] === 'comments') return 'comment';
  if (tokens[0] === 'sections' || tokens[0] === 'headerfooters') return 'document';
  if (tokens[0] === 'find' || tokens[0] === 'query') return 'range';
  if (tokens[0] === 'selection' || tokens[0] === 'ranges') return 'range';
  if (tokens[0] === 'mutations') return 'mixed';
  if (tokens[0] === 'create') return 'document';
  if (
    tokens[0] === 'trackchanges' ||
    tokens[0] === 'bookmarks' ||
    tokens[0] === 'hyperlinks' ||
    tokens[0] === 'crossrefs' ||
    tokens[0] === 'footnotes' ||
    tokens[0] === 'fields' ||
    tokens[0] === 'permissionranges' ||
    tokens[0] === 'contentcontrols' ||
    tokens[0] === 'captions' ||
    tokens[0] === 'authorities' ||
    tokens[0] === 'citations'
  ) {
    return 'entity';
  }
  if (tokens[0] === 'format' || tokens[0] === 'styles') return 'range';
  if (tokens[0] === 'index') return 'document';
  return 'none';
}

function hasParam(params: ContractParamEntry[] | undefined, name: string): boolean {
  if (!params) return false;
  return params.some((p) => p?.name === name);
}

function deriveSupportsChangeMode(entry: ContractOperationEntry): boolean {
  return hasParam(entry.params, 'changeMode');
}

function deriveSupportsDryRun(entry: ContractOperationEntry): boolean {
  return hasParam(entry.params, 'dryRun');
}

function deriveAtomic(operationId: string, entry: ContractOperationEntry): boolean {
  // All mutating operations are atomic by contract: each operation either
  // succeeds end-to-end or fails. doc.mutations.apply is the only batched
  // form and is explicitly atomic when its `atomic` flag is set.
  if (operationId === 'doc.mutations.apply') return hasParam(entry.params, 'atomic');
  return deriveMode(operationId, entry) === 'write';
}

function deriveVerificationHints(operationId: string): readonly string[] {
  const domain = deriveDomain(operationId);
  const hints: string[] = [];
  switch (domain) {
    case 'blocks':
    case 'text':
      hints.push('reread-block-text', 'verify-revision');
      break;
    case 'tables':
      hints.push('reread-table-shape', 'verify-cell-text');
      break;
    case 'lists':
      hints.push('reread-list-items', 'verify-list-count');
      break;
    case 'images':
      hints.push('reread-image-anchor', 'verify-image-id');
      break;
    case 'comments':
      hints.push('list-comments', 'verify-anchor-text');
      break;
    case 'tracked-changes':
      hints.push('list-tracked-changes', 'verify-counts');
      break;
    case 'format':
    case 'styles':
      hints.push('reread-resolved-style', 'verify-revision');
      break;
    case 'sections':
    case 'header-footer':
      hints.push('reread-section-shape', 'save-reopen');
      break;
    case 'protection':
    case 'permission-ranges':
      hints.push('save-reopen', 'verify-xml-shape');
      break;
    case 'document-write':
    case 'mutations':
      hints.push('verify-revision', 'verify-text-snapshot');
      break;
    default:
      hints.push('verify-revision');
  }
  return hints;
}

function deriveStoryHints(entry: ContractOperationEntry): readonly string[] {
  const hints: string[] = [];
  if (hasParam(entry.params, 'in')) hints.push('story-scoped');
  if (hasParam(entry.params, 'story')) hints.push('story-scoped');
  if (hasParam(entry.params, 'sectionId')) hints.push('section-scoped');
  return hints;
}

function deriveDomainHints(entry: ContractOperationEntry): readonly string[] {
  const hints = new Set<string>();
  for (const param of entry.params ?? []) {
    if (!param?.name) continue;
    if (param.name === 'changeMode') hints.add('change-mode');
    if (param.name === 'dryRun') hints.add('dry-run');
    if (param.name === 'atomic') hints.add('atomic-batch');
    if (param.name === 'force') hints.add('force-allowed');
    if (param.name === 'preserveStyle') hints.add('preserve-style');
    if (param.name === 'caseSensitive') hints.add('case-sensitive');
  }
  if (typeof (entry as { category?: string }).category === 'string') {
    hints.add(`category:${(entry as { category?: string }).category}`);
  }
  return [...hints];
}

function deriveExposure(operationId: string): ExposureStatus {
  if (META_OP_IDS.has(operationId)) return 'internal';
  if (BENCHMARK_ONLY_HINTS.includes(operationId)) return 'benchmark-only';
  if (operationId.startsWith('doc.session.')) return 'internal';
  return 'stable';
}

function deriveActionEligible(operationId: string): boolean {
  if (SESSION_OP_IDS.has(operationId)) return false;
  if (META_OP_IDS.has(operationId)) return false;
  if (deriveExposure(operationId) === 'internal') return false;
  return true;
}

function classifyEntry(operationId: string, entry: ContractOperationEntry): OperationCatalogEntry {
  const mode = deriveMode(operationId, entry);
  return {
    operationId,
    domain: deriveDomain(operationId),
    mode,
    isMutating: mode === 'write',
    targetShape: deriveTargetShape(operationId),
    storyHints: deriveStoryHints(entry),
    domainHints: deriveDomainHints(entry),
    supportsChangeMode: deriveSupportsChangeMode(entry),
    supportsDryRun: deriveSupportsDryRun(entry),
    atomic: deriveAtomic(operationId, entry),
    verificationHints: deriveVerificationHints(operationId),
    exposure: deriveExposure(operationId),
    actionEligible: deriveActionEligible(operationId),
    description:
      typeof (entry as unknown as { description?: unknown }).description === 'string'
        ? (entry as unknown as { description: string }).description
        : '',
  };
}

function buildCatalog(): OperationCatalogEntry[] {
  const entries: OperationCatalogEntry[] = [];
  for (const [operationId, entry] of Object.entries(CONTRACT.operations)) {
    entries.push(classifyEntry(operationId, entry as ContractOperationEntry));
  }
  entries.sort((a, b) => a.operationId.localeCompare(b.operationId));
  return entries;
}

/** Full operation catalog derived from the generated contract. */
export const OPERATION_CATALOG: readonly OperationCatalogEntry[] = Object.freeze(buildCatalog());

const CATALOG_BY_ID: ReadonlyMap<string, OperationCatalogEntry> = new Map(
  OPERATION_CATALOG.map((entry) => [entry.operationId, entry]),
);

export function getOperationCatalogEntry(operationId: string): OperationCatalogEntry | undefined {
  return CATALOG_BY_ID.get(operationId);
}

export function listOperationsByDomain(domain: OperationDomain): readonly OperationCatalogEntry[] {
  return OPERATION_CATALOG.filter((entry) => entry.domain === domain);
}

export function listMutatingOperations(): readonly OperationCatalogEntry[] {
  return OPERATION_CATALOG.filter((entry) => entry.isMutating);
}

/** Returns operations that are classified but have no specific verification hint other than verify-revision. */
export function listOperationsMissingStructuralVerification(): readonly OperationCatalogEntry[] {
  return OPERATION_CATALOG.filter(
    (entry) =>
      entry.isMutating && entry.verificationHints.length === 1 && entry.verificationHints[0] === 'verify-revision',
  );
}

export function getOperationCatalogSummary(): {
  total: number;
  byDomain: Record<string, number>;
  byMode: Record<string, number>;
  byExposure: Record<string, number>;
  mutatingCount: number;
  actionEligibleCount: number;
} {
  const byDomain: Record<string, number> = {};
  const byMode: Record<string, number> = {};
  const byExposure: Record<string, number> = {};
  let mutatingCount = 0;
  let actionEligibleCount = 0;
  for (const entry of OPERATION_CATALOG) {
    byDomain[entry.domain] = (byDomain[entry.domain] ?? 0) + 1;
    byMode[entry.mode] = (byMode[entry.mode] ?? 0) + 1;
    byExposure[entry.exposure] = (byExposure[entry.exposure] ?? 0) + 1;
    if (entry.isMutating) mutatingCount += 1;
    if (entry.actionEligible) actionEligibleCount += 1;
  }
  return {
    total: OPERATION_CATALOG.length,
    byDomain,
    byMode,
    byExposure,
    mutatingCount,
    actionEligibleCount,
  };
}
