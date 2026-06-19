/**
 * Engine-specific adapter for `templates.apply` (SD-3247).
 *
 * Source-authoritative template adoption: applies a SOURCE package's template
 * style system and reusable template assets onto the CURRENTLY OPEN document
 * while preserving body/story content (`word/document.xml` story is never
 * replaced).
 *
 * Adoption semantics (see `@superdoc/document-api` `templates.apply` docs and
 * `proofing/requirements/specs/document-api/templates-and-substrate.md`):
 *
 * - `styles`   — source-authoritative overlap for shared `styleId`s (no
 *                `*-tmpl` rename), source `docDefaults` + `latentStyles`
 *                replace the target's, full source style set imported,
 *                target-only styles retained for preserved content.
 * - `numbering`— reconciled as a dependency graph: source `w:num`/`w:abstractNum`
 *                imported, colliding ids remapped deterministically, references
 *                rewritten coherently in both numbering.xml and styles.xml.
 * - `settings` — bounded reconciliation: layout/style-affecting settings adopted,
 *                identity/workflow settings preserved.
 * - `theme` / `fontTable` / `webSettings` — whole-part adoption.
 * - `headersFooters` — all source header/footer parts imported as reusable
 *                assets, with `.rels` + transitive media closure; collisions
 *                reallocated and references rewritten.
 * - `sectionDefaults` — source page-1 governing `w:sectPr` adopted via the
 *                section mutation path as the active/final section defaults;
 *                its header/footer visibility model is also projected across
 *                earlier target sections without overwriting their own page
 *                geometry. Intermediate source sections are not imported.
 *
 * `customXml` and other out-of-scope content is reported, never applied.
 *
 * Parts that own a parts descriptor (styles, numbering, settings) are mutated
 * through the centralized `mutatePart` pipeline (source `'templates.apply'`),
 * so the descriptors rebuild the live runtime caches (`translatedLinkedStyles`,
 * `converter.numbering` + `translatedNumbering`). Descriptor-less substrate
 * parts (theme, fontTable, webSettings) are written directly and registered in
 * package companions. Header/footer assets and the page-1 governing sectPr use
 * the asset import + section-mutation paths.
 */

import type {
  TemplatesApplyInput,
  TemplatesApplyReceipt,
  TemplatesApplyReceiptSuccess,
  TemplatesApplyReceiptFailure,
  TemplatesApplyFailureCode,
  NormalizedTemplatesApplyOptions,
  TemplateScope,
  TemplateScopeReport,
  TemplateScopeSkip,
  TemplateUnsupportedItem,
  TemplateChangedPart,
  TemplateIdMapping,
  TemplateApplyWarning,
} from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { mutatePart } from '../../core/parts/mutation/mutate-part.js';
import { checkRevision } from '../plan-engine/revision-tracker.js';
import { DocumentApiAdapterError } from '../errors.js';
import { readOpcPackage, decodeText } from '../../core/opc/read-package.js';
import {
  type XmlElement,
  mergeStylesAuthoritative,
  rewriteImportedStyleNumbering,
  mergeNumberingGraph,
  reconcileSettings,
  rootElement,
  xmlDeepEqual,
} from './template-xml.js';
import { importHeaderFooterAssets, applyPageOneSectionDefaults } from './template-assets.js';

interface ConverterForTemplates {
  convertedXml: Record<string, XmlElement>;
  parseXmlToJson(xml: string): XmlElement;
  documentModified?: boolean;
}

// ---------------------------------------------------------------------------
// Scope / part mapping
// ---------------------------------------------------------------------------

/** Deterministic report order for scopes. */
const SCOPE_ORDER: TemplateScope[] = [
  'styles',
  'numbering',
  'settings',
  'theme',
  'fontTable',
  'webSettings',
  'headersFooters',
  'sectionDefaults',
];

/** Substrate scopes that flow through detection-with-xml. */
const SUBSTRATE_SCOPE_ORDER: TemplateScope[] = ['styles', 'numbering', 'settings', 'theme', 'fontTable', 'webSettings'];

const CONTENT_TYPE_BY_SCOPE: Partial<Record<TemplateScope, string>> = {
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
  fontTable: 'application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml',
  webSettings: 'application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml',
};

const REL_TYPE_BY_PART: Partial<Record<TemplateScope, string>> = {
  theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
  fontTable: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable',
};

const CONTENT_TYPES_PART = '[Content_Types].xml';
const DOCUMENT_RELS_PART = 'word/_rels/document.xml.rels';

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

interface DetectedScope {
  scope: TemplateScope;
  part: string;
  xml: string;
}

function categorizeOutOfScope(name: string): { category: string } | undefined {
  if (name.startsWith('customXml/')) return { category: 'customXml' };
  if (name.startsWith('docProps/')) return { category: 'docProps' };
  if (name.startsWith('word/glossary/')) return { category: 'glossary' };
  if (name.startsWith('_xmlsignatures/') || name.includes('/_xmlsignatures/') || /signatures/i.test(name)) {
    return { category: 'signatures' };
  }
  if (name.startsWith('word/embeddings/')) return { category: 'embeddings' };
  return undefined;
}

interface DetectionResult {
  substrate: DetectedScope[];
  headersFooters: { detected: boolean; part: string };
  sectionDefaults: { detected: boolean; documentXml?: string };
  unsupported: TemplateUnsupportedItem[];
}

function detectScopes(byName: Map<string, Uint8Array>): DetectionResult {
  const substrate: DetectedScope[] = [];
  const unsupported: TemplateUnsupportedItem[] = [];

  const has = (p: string) => byName.has(p);
  const text = (p: string) => decodeText(byName.get(p) as Uint8Array);

  if (has('word/styles.xml')) {
    substrate.push({ scope: 'styles', part: 'word/styles.xml', xml: text('word/styles.xml') });
  }
  if (has('word/numbering.xml')) {
    substrate.push({ scope: 'numbering', part: 'word/numbering.xml', xml: text('word/numbering.xml') });
  }
  if (has('word/settings.xml')) {
    substrate.push({ scope: 'settings', part: 'word/settings.xml', xml: text('word/settings.xml') });
  }
  const themeParts = [...byName.keys()].filter((n) => /^word\/theme\/[^/]+\.xml$/.test(n)).sort();
  if (themeParts.length > 0) {
    substrate.push({ scope: 'theme', part: 'word/theme/theme1.xml', xml: text(themeParts[0]) });
  }
  if (has('word/fontTable.xml')) {
    substrate.push({ scope: 'fontTable', part: 'word/fontTable.xml', xml: text('word/fontTable.xml') });
  }
  if (has('word/webSettings.xml')) {
    substrate.push({ scope: 'webSettings', part: 'word/webSettings.xml', xml: text('word/webSettings.xml') });
  }

  // Header/footer assets.
  const hfParts = [...byName.keys()].filter((n) => /^word\/(header|footer)\d+\.xml$/.test(n)).sort();
  const headersFooters = { detected: hfParts.length > 0, part: hfParts[0] ?? 'word/header1.xml' };

  // Page-1 governing section defaults (from source document.xml).
  const sectionDefaults = has('word/document.xml')
    ? { detected: true, documentXml: text('word/document.xml') }
    : { detected: false };

  for (const name of [...byName.keys()].sort()) {
    const cat = categorizeOutOfScope(name);
    if (cat) {
      unsupported.push({ part: name, category: cat.category, reason: 'out of initial apply scope' });
    }
  }

  substrate.sort((a, b) => {
    const sa = SUBSTRATE_SCOPE_ORDER.indexOf(a.scope);
    const sb = SUBSTRATE_SCOPE_ORDER.indexOf(b.scope);
    return sa !== sb ? sa - sb : a.part.localeCompare(b.part);
  });

  return { substrate, headersFooters, sectionDefaults, unsupported };
}

// ---------------------------------------------------------------------------
// Fingerprint (FNV-1a over raw bytes)
// ---------------------------------------------------------------------------

function fnv1aHex(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// Source byte resolution
// ---------------------------------------------------------------------------

interface ByteResult {
  bytes?: Uint8Array;
  failure?: { code: TemplatesApplyFailureCode; message: string };
}

interface FsLike {
  readFileSync(path: string): Uint8Array;
}

function getBuiltinModule<T>(id: string): T | undefined {
  const proc = (
    globalThis as unknown as {
      process?: { getBuiltinModule?: (moduleId: string) => unknown };
    }
  ).process;
  if (typeof proc?.getBuiltinModule !== 'function') {
    return undefined;
  }
  const direct = proc.getBuiltinModule(id);
  if (direct != null) {
    return direct as T;
  }
  if (id.startsWith('node:')) {
    const bare = proc.getBuiltinModule(id.slice('node:'.length));
    if (bare != null) {
      return bare as T;
    }
  }
  return undefined;
}

function getNodeRequire(): ((id: string) => unknown) | undefined {
  const req = (globalThis as unknown as { require?: (id: string) => unknown }).require;
  if (typeof req === 'function') {
    return req;
  }

  try {
    return Function('try { return require; } catch { return undefined; }')() as ((id: string) => unknown) | undefined;
  } catch {
    return undefined;
  }
}

function getNodeFs(): FsLike | undefined {
  const builtin = getBuiltinModule<FsLike>('node:fs');
  if (builtin && typeof builtin.readFileSync === 'function') {
    return builtin;
  }

  const req = getNodeRequire();
  try {
    const fs = req?.('node:fs') as FsLike | undefined;
    if (fs && typeof fs.readFileSync === 'function') {
      return fs;
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

function resolveSourceBytes(input: TemplatesApplyInput): ByteResult {
  const source = input.source;
  if (source.kind === 'path') {
    const fs = getNodeFs();
    if (!fs) {
      return { failure: { code: 'CAPABILITY_UNAVAILABLE', message: 'templates.apply path source requires Node fs.' } };
    }
    try {
      const buf = fs.readFileSync(source.path);
      return { bytes: new Uint8Array(buf) };
    } catch {
      return {
        failure: {
          code: 'UNSUPPORTED_SOURCE',
          message: 'templates.apply could not read source path.',
        },
      };
    }
  }
  try {
    let bytes: Uint8Array;
    const g = globalThis as unknown as {
      Buffer?: { from(s: string, enc: string): Uint8Array };
      atob?: (s: string) => string;
    };
    if (g.Buffer && typeof g.Buffer.from === 'function') {
      bytes = new Uint8Array(g.Buffer.from(source.data, 'base64'));
    } else if (typeof g.atob === 'function') {
      const bin = g.atob(source.data);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      return {
        failure: { code: 'CAPABILITY_UNAVAILABLE', message: 'templates.apply base64 source requires Buffer or atob.' },
      };
    }
    return { bytes };
  } catch {
    return { failure: { code: 'INVALID_PACKAGE', message: 'templates.apply could not decode base64 source.' } };
  }
}

function failure(code: TemplatesApplyFailureCode, message: string): TemplatesApplyReceiptFailure {
  return { success: false, failure: { code, message } };
}

function pushNoChangeSkip(
  skippedScopes: TemplateScopeSkip[],
  scope: TemplateScope,
  part: string,
  message: string,
): void {
  skippedScopes.push({
    scope,
    part,
    reason: 'NO_CHANGE',
    message,
  });
}

// ---------------------------------------------------------------------------
// Adapter entry point
// ---------------------------------------------------------------------------

/**
 * Adapter entry point for `templates.apply`.
 *
 * The synchronous guard prologue (converter availability, `expectedRevision`
 * preflight) is preserved here so those `throws.preApply` cases still throw
 * synchronously before any Promise is created. Everything after the guard —
 * source acquisition, async OPC/ZIP package loading, and the substrate
 * mutation — runs in {@link applyTemplateAsync} and resolves a receipt.
 */
export function templatesApplyAdapter(
  editor: Editor,
  input: TemplatesApplyInput,
  options: NormalizedTemplatesApplyOptions,
): Promise<TemplatesApplyReceipt> {
  const converter = (editor as unknown as { converter?: ConverterForTemplates }).converter;
  if (!converter || !converter.convertedXml || typeof converter.parseXmlToJson !== 'function') {
    throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', 'templates.apply requires a document converter.', {
      reason: 'converter_missing',
    });
  }

  // Revision guard (fail closed before any mutation). Synchronous pre-apply throw.
  checkRevision(editor, options.expectedRevision);

  return applyTemplateAsync(editor, converter, input, options);
}

async function applyTemplateAsync(
  editor: Editor,
  converter: ConverterForTemplates,
  input: TemplatesApplyInput,
  options: NormalizedTemplatesApplyOptions,
): Promise<TemplatesApplyReceipt> {
  // Resolve + unzip source.
  const resolved = resolveSourceBytes(input);
  if (resolved.failure) return failure(resolved.failure.code, resolved.failure.message);
  const bytes = resolved.bytes as Uint8Array;

  let byName: Map<string, Uint8Array>;
  try {
    ({ byName } = await readOpcPackage(bytes));
  } catch (err) {
    const msg = (err as Error).message ?? 'invalid package';
    return failure('INVALID_PACKAGE', `templates.apply source is not a valid DOCX package: ${msg}`);
  }

  const partCount = byName.size;

  if (!byName.has(CONTENT_TYPES_PART)) {
    return failure('INVALID_PACKAGE', 'templates.apply source is missing [Content_Types].xml.');
  }

  const fingerprint = fnv1aHex(bytes);
  const sourceInfo = { kind: input.source.kind, fingerprint, partCount };

  const detection = detectScopes(byName);
  const dryRun = options.dryRun;

  const detectedScopes: TemplateScopeReport[] = [];
  const appliedScopes: TemplateScopeReport[] = [];
  const skippedScopes: TemplateScopeSkip[] = [];
  const changedParts: TemplateChangedPart[] = [];
  const warnings: TemplateApplyWarning[] = [];
  const idMappings: TemplatesApplyReceiptSuccess['idMappings'] = {};
  const styleMappings: TemplateIdMapping[] = [];
  const numberingMappings: TemplateIdMapping[] = [];
  const relationshipMappings: TemplateIdMapping[] = [];

  // Detected scopes (report).
  for (const d of detection.substrate) detectedScopes.push({ scope: d.scope, part: d.part });
  if (detection.headersFooters.detected) {
    detectedScopes.push({ scope: 'headersFooters', part: detection.headersFooters.part });
  }
  if (detection.sectionDefaults.detected) {
    detectedScopes.push({ scope: 'sectionDefaults', part: 'word/document.xml' });
  }

  // NOT_PRESENT_IN_SOURCE skips for substrate scopes absent from the source.
  const presentSubstrate = new Set(detection.substrate.map((d) => d.scope));
  for (const scope of SUBSTRATE_SCOPE_ORDER) {
    if (!presentSubstrate.has(scope)) {
      skippedScopes.push({
        scope,
        reason: 'NOT_PRESENT_IN_SOURCE',
        message: `Source package does not contain a ${scope} part.`,
      });
    }
  }

  // Out-of-scope content -> skippedScopes (e.g. customXml) so callers can audit.
  for (const item of detection.unsupported) {
    if (item.category === 'customXml') {
      if (!skippedScopes.some((s) => s.scope === 'customXml')) {
        skippedScopes.push({
          scope: 'customXml',
          part: item.part,
          reason: 'OUT_OF_SCOPE',
          message: 'customXml is not part of the supported template surface and was not applied.',
        });
      }
    }
  }

  // Parse substrate parts up front so a parse error fails closed.
  const parsedByPart = new Map<string, XmlElement>();
  for (const d of detection.substrate) {
    try {
      parsedByPart.set(d.part, converter.parseXmlToJson(d.xml));
    } catch {
      return failure('UNSUPPORTED_TEMPLATE_CONTENT', `templates.apply could not parse source part ${d.part}.`);
    }
  }

  const substrateByScope = new Map<TemplateScope, DetectedScope>();
  for (const d of detection.substrate) substrateByScope.set(d.scope, d);

  const applyDescriptorPart = (partId: string, mutateFn: () => void): boolean => {
    const result = mutatePart({
      editor,
      partId: partId as `${string}.xml`,
      operation: 'mutate',
      source: 'templates.apply',
      dryRun,
      mutate() {
        mutateFn();
        return undefined;
      },
    });
    return result.changed;
  };

  // -------------------------------------------------------------------------
  // 1. Numbering (before styles, so imported style numId refs can be rewritten).
  // -------------------------------------------------------------------------
  let numRemap = new Map<string, string>();
  const numbering = substrateByScope.get('numbering');
  if (numbering) {
    const parsed = parsedByPart.get(numbering.part)!;
    const hadCurrent = !!converter.convertedXml['word/numbering.xml'];
    const changed = applyDescriptorPart('word/numbering.xml', () => {
      const res = mergeNumberingGraph(converter.convertedXml['word/numbering.xml'] as XmlElement, parsed);
      numRemap = res.numRemap;
      numberingMappings.push(...res.mappings);
    });
    if (changed) {
      appliedScopes.push({ scope: 'numbering', part: 'word/numbering.xml' });
      changedParts.push({ part: 'word/numbering.xml', scope: 'numbering', change: hadCurrent ? 'merged' : 'created' });
    } else {
      pushNoChangeSkip(
        skippedScopes,
        'numbering',
        'word/numbering.xml',
        'Source numbering graph does not change the current numbering definitions.',
      );
    }
  }

  // -------------------------------------------------------------------------
  // 2. Styles (source-authoritative) + numbering ref rewrite.
  // -------------------------------------------------------------------------
  const styles = substrateByScope.get('styles');
  if (styles) {
    const parsed = parsedByPart.get(styles.part)!;
    const hadCurrent = !!converter.convertedXml['word/styles.xml'];
    let docDefaultsAdopted = false;
    let latentStylesAdopted = false;
    const runMerge = (target: XmlElement): void => {
      const res = mergeStylesAuthoritative(target, parsed);
      rewriteImportedStyleNumbering(res.importedStyleEls, numRemap);
      docDefaultsAdopted = res.docDefaultsAdopted;
      latentStylesAdopted = res.latentStylesAdopted;
    };
    const changed = applyDescriptorPart('word/styles.xml', () => {
      runMerge(converter.convertedXml['word/styles.xml'] as XmlElement);
    });
    if (changed) {
      if (docDefaultsAdopted) {
        warnings.push({ code: 'DOC_DEFAULTS_ADOPTED', message: 'Adopted source w:docDefaults (style baseline).' });
      }
      if (latentStylesAdopted) {
        warnings.push({ code: 'LATENT_STYLES_ADOPTED', message: 'Adopted source w:latentStyles.' });
      }
      appliedScopes.push({ scope: 'styles', part: 'word/styles.xml' });
      changedParts.push({ part: 'word/styles.xml', scope: 'styles', change: hadCurrent ? 'merged' : 'created' });
    } else {
      pushNoChangeSkip(
        skippedScopes,
        'styles',
        'word/styles.xml',
        'Source styles already match the current style system.',
      );
    }
  }

  // -------------------------------------------------------------------------
  // 3. Settings (bounded reconciliation).
  // -------------------------------------------------------------------------
  const settings = substrateByScope.get('settings');
  if (settings) {
    const parsed = parsedByPart.get(settings.part)!;
    const hadCurrent = !!converter.convertedXml['word/settings.xml'];
    const changed = applyDescriptorPart('word/settings.xml', () => {
      reconcileSettings(converter.convertedXml['word/settings.xml'] as XmlElement, parsed);
    });
    if (changed) {
      appliedScopes.push({ scope: 'settings', part: 'word/settings.xml' });
      changedParts.push({ part: 'word/settings.xml', scope: 'settings', change: hadCurrent ? 'merged' : 'created' });
    } else {
      pushNoChangeSkip(
        skippedScopes,
        'settings',
        'word/settings.xml',
        'Source settings do not change the current layout-affecting settings.',
      );
    }
  }

  // -------------------------------------------------------------------------
  // 4. Descriptor-less substrate parts: theme, fontTable, webSettings.
  // -------------------------------------------------------------------------
  for (const scope of ['theme', 'fontTable', 'webSettings'] as TemplateScope[]) {
    const d = substrateByScope.get(scope);
    if (!d) continue;
    const parsed = parsedByPart.get(d.part)!;
    const currentPart = converter.convertedXml[d.part] as XmlElement | undefined;
    const hadCurrent = !!currentPart;
    const partChanged = !currentPart || !xmlDeepEqual(currentPart, parsed);
    const contentType = CONTENT_TYPE_BY_SCOPE[scope];
    const relType = REL_TYPE_BY_PART[scope];
    const target = d.part.replace(/^word\//, '');
    const willRegisterContentType = Boolean(contentType && canRegisterContentTypeOverride(converter, d.part));
    const willRegisterDocumentRelationship = Boolean(relType && canRegisterDocumentRelationship(converter, relType));
    const changed = partChanged || willRegisterContentType || willRegisterDocumentRelationship;

    if (!changed) {
      pushNoChangeSkip(skippedScopes, scope, d.part, `Source ${scope} part already matches the current package state.`);
      continue;
    }

    if (!dryRun && partChanged) {
      converter.convertedXml[d.part] = parsed;
    }
    appliedScopes.push({ scope, part: d.part });

    if (partChanged) {
      changedParts.push({ part: d.part, scope, change: hadCurrent ? 'replaced' : 'created' });
    }

    if (contentType) {
      if (dryRun) {
        if (willRegisterContentType) {
          changedParts.push({ part: CONTENT_TYPES_PART, scope: 'package', change: 'merged' });
        }
      } else if (ensureContentTypeOverride(converter, d.part, contentType)) {
        changedParts.push({ part: CONTENT_TYPES_PART, scope: 'package', change: 'merged' });
      } else if (!converter.convertedXml[CONTENT_TYPES_PART]) {
        warnings.push({
          code: 'CONTENT_TYPE_NOT_REGISTERED',
          message: `Could not register content-type override for ${d.part}; [Content_Types].xml not present.`,
        });
      }
    }

    if (relType) {
      if (dryRun) {
        if (willRegisterDocumentRelationship) {
          changedParts.push({ part: DOCUMENT_RELS_PART, scope: 'package', change: 'merged' });
        }
      } else if (ensureDocumentRelationship(converter, relType, target)) {
        changedParts.push({ part: DOCUMENT_RELS_PART, scope: 'package', change: 'merged' });
      } else if (!converter.convertedXml[DOCUMENT_RELS_PART]) {
        warnings.push({
          code: 'RELATIONSHIP_NOT_REGISTERED',
          message: `Could not register document relationship for ${d.part}; ${DOCUMENT_RELS_PART} not present.`,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. Header/footer template assets (+ rel/media closure).
  // -------------------------------------------------------------------------
  let relIdRemap = new Map<string, string>();
  if (detection.headersFooters.detected) {
    const hf = importHeaderFooterAssets(
      editor,
      converter as unknown as Parameters<typeof importHeaderFooterAssets>[1],
      byName,
      dryRun,
    );
    relIdRemap = hf.relIdRemap;
    changedParts.push(...hf.changedParts);
    relationshipMappings.push(...hf.mappings);
    warnings.push(...hf.warnings);
    if (hf.changedParts.length > 0) {
      appliedScopes.push({ scope: 'headersFooters', part: detection.headersFooters.part });
    } else {
      pushNoChangeSkip(
        skippedScopes,
        'headersFooters',
        detection.headersFooters.part,
        'Source headers and footers do not produce any importable changes.',
      );
    }
  }

  // -------------------------------------------------------------------------
  // 6. Page-1 section-default adoption.
  // -------------------------------------------------------------------------
  if (detection.sectionDefaults.detected && detection.sectionDefaults.documentXml) {
    const sec = applyPageOneSectionDefaults(
      editor,
      detection.sectionDefaults.documentXml,
      relIdRemap,
      (xml) => converter.parseXmlToJson(xml),
      dryRun,
    );
    if (sec.changed) {
      changedParts.push(...sec.changedParts);
      warnings.push(...sec.warnings);
      appliedScopes.push({ scope: 'sectionDefaults', part: 'word/document.xml' });
    } else if (sec.detected) {
      warnings.push(...sec.warnings);
      pushNoChangeSkip(
        skippedScopes,
        'sectionDefaults',
        'word/document.xml',
        sec.warnings.length > 0
          ? 'Source page-1 section defaults could not be applied.'
          : "Source page-1 section defaults already match the current document's active section defaults and section header/footer visibility model.",
      );
    }
  }

  if (styleMappings.length > 0) idMappings.styles = styleMappings;
  if (numberingMappings.length > 0) idMappings.numbering = numberingMappings;
  if (relationshipMappings.length > 0) idMappings.relationships = relationshipMappings;

  const changed = appliedScopes.length > 0;
  if (!dryRun && changed) {
    converter.documentModified = true;
  }

  const receipt: TemplatesApplyReceiptSuccess = {
    success: true,
    changed,
    dryRun,
    bodyPolicy: 'preserve',
    source: sourceInfo,
    detectedScopes,
    appliedScopes,
    skippedScopes,
    unsupportedItems: detection.unsupported,
    changedParts,
    idMappings,
    warnings,
  };
  return receipt;
}

function ensureContentTypeOverride(converter: ConverterForTemplates, partPath: string, contentType: string): boolean {
  const ct = converter.convertedXml[CONTENT_TYPES_PART];
  const types = ct ? rootElement(ct, 'Types') : undefined;
  if (!types) return false;
  if (!types.elements) types.elements = [];
  const partName = `/${partPath}`;
  const exists = types.elements.some((el) => el.name === 'Override' && el.attributes?.PartName === partName);
  if (exists) return false;
  types.elements.push({
    type: 'element',
    name: 'Override',
    attributes: { PartName: partName, ContentType: contentType },
  });
  return true;
}

function canRegisterContentTypeOverride(converter: ConverterForTemplates, partPath: string): boolean {
  const ct = converter.convertedXml[CONTENT_TYPES_PART];
  const types = ct ? rootElement(ct as XmlElement, 'Types') : undefined;
  if (!types) return false;
  const partName = `/${partPath}`;
  return !types.elements?.some((el) => el.name === 'Override' && el.attributes?.PartName === partName);
}

function ensureDocumentRelationship(converter: ConverterForTemplates, relType: string, target: string): boolean {
  const rels = converter.convertedXml[DOCUMENT_RELS_PART];
  const relsRoot = rels ? rootElement(rels, 'Relationships') : undefined;
  if (!relsRoot) return false;
  if (!relsRoot.elements) relsRoot.elements = [];
  const exists = relsRoot.elements.some((el) => el.name === 'Relationship' && el.attributes?.Type === relType);
  if (exists) return false;
  let max = 0;
  for (const el of relsRoot.elements) {
    const m = el.attributes?.Id?.match(/^rId(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  relsRoot.elements.push({
    type: 'element',
    name: 'Relationship',
    attributes: { Id: `rId${max + 1}`, Type: relType, Target: target },
  });
  return true;
}

function canRegisterDocumentRelationship(converter: ConverterForTemplates, relType: string): boolean {
  const rels = converter.convertedXml[DOCUMENT_RELS_PART];
  const relsRoot = rels ? rootElement(rels as XmlElement, 'Relationships') : undefined;
  if (!relsRoot) return false;
  return !relsRoot.elements?.some((el) => el.name === 'Relationship' && el.attributes?.Type === relType);
}
