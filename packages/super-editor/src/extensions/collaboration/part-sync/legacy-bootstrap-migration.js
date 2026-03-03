/**
 * Legacy bootstrap migration + converter hydration.
 *
 * Two responsibilities, both run before `hydrateOrSeedPart`:
 *
 * 1. **Legacy migration** — When a client joins a room that has `meta.docx`
 *    but no `bootstrapDocxParts._version`, normalize the legacy payload,
 *    write it to `bootstrapDocxParts`, reconstruct converter parts, and
 *    write an idempotency marker.
 *
 * 2. **Converter hydration** — When `bootstrapDocxParts._version` exists,
 *    reconstruct converter parts from bootstrap content so that
 *    `hydrateOrSeedPart` seeds real data instead of blank-template data.
 *    This is critical for CLI/SDK joins that open with BLANK_DOCX.
 *    On the browser path (converter already pre-populated), this overwrites
 *    with equivalent bootstrap data — harmless, since structured channels
 *    reconcile to latest state immediately after.
 *
 * Race-safe: two clients migrating simultaneously produce identical results
 * because both read the same `meta.docx` payload and `writeBootstrapContent`
 * is idempotent (first write wins via `_version` sentinel).
 *
 * @module legacy-bootstrap-migration
 */

import { writeBootstrapContent, readBootstrapContent } from './bootstrap-content.js';
import { SuperConverter } from '@core/super-converter/SuperConverter.js';
import { writePart } from '@core/super-converter/converter-parts.js';

const LOG_PREFIX = '[legacy-bootstrap-migration]';

/**
 * Per-editor guard: ensures converter hydration from bootstrap only runs
 * once per editor instance. A heuristic (e.g., checking parts.styles.docDefaults)
 * is unreliable because BLANK_DOCX also produces docDefaults after getSchema.
 *
 * @type {WeakSet<object>}
 */
const bootstrapHydratedEditors = new WeakSet();

/**
 * Run legacy migration and/or converter hydration as needed.
 *
 * Must be called **before** the `hydrateOrSeedPart` loop in
 * `handleCollaborationReady` so that the converter is populated with real
 * data before seeding begins.
 *
 * @param {object} editor — Full editor instance
 */
export function maybeRunLegacyBootstrapMigration(editor) {
  // Guard 1: editor and converter must exist
  if (!editor || !editor.converter) {
    console.debug(`${LOG_PREFIX} skip: no editor or converter`);
    return;
  }

  // Guard 2: derive ydoc — skip if absent or destroyed
  const ydoc = editor.options?.ydoc;
  if (!ydoc || ydoc.isDestroyed) {
    console.debug(`${LOG_PREFIX} skip: no ydoc or ydoc destroyed`);
    return;
  }

  // Check if bootstrap already exists (new-format room)
  const bootstrapMap = ydoc.getMap('bootstrapDocxParts');
  if (bootstrapMap.get('_version') === 1) {
    // No legacy migration needed, but the local converter may have been
    // initialized from BLANK_DOCX (CLI/SDK join). Always reconstruct from
    // bootstrap to ensure real data is available for channel seeding.
    // On the browser path this overwrites with equivalent bootstrap data
    // (harmless — structured channels reconcile to latest state after).
    ensureConverterPopulated(editor);
    return;
  }

  // Guard 4: must have legacy meta.docx to migrate from
  const metaMap = ydoc.getMap('meta');
  const legacyDocx = metaMap.get('docx');
  if (!legacyDocx) {
    console.debug(`${LOG_PREFIX} skip: meta.docx absent`);
    return;
  }

  // Guard 5: already migrated (idempotency marker)
  const ooxmlPartMeta = ydoc.getMap('ooxmlPartMeta');
  if (ooxmlPartMeta.get('_migration.bootstrap_v1')) {
    console.debug(`${LOG_PREFIX} skip: already migrated`);
    return;
  }

  // --- Normalize legacy payload ---
  const entries = normalizeLegacyPayload(legacyDocx);

  // Guard 6: empty payload after normalization
  if (entries.length === 0) {
    console.debug(`${LOG_PREFIX} skip: normalized payload is empty`);
    return;
  }

  // Guard 7: must contain word/document.xml with non-empty content
  const hasDocumentXml = entries.some(
    (e) => e.name === 'word/document.xml' && typeof e.content === 'string' && e.content.length > 0,
  );
  if (!hasDocumentXml) {
    console.debug(`${LOG_PREFIX} skip: no valid word/document.xml entry`);
    return;
  }

  // --- 1. Write bootstrap content (idempotent — first writer wins) ---
  const fonts = metaMap.get('fonts') ?? editor.options.fonts;
  const user = editor.options.user;
  writeBootstrapContent(ydoc, entries, { fonts, user });

  // --- 2. Reconstruct model-backed converter parts ---
  const result = reconstructConverterParts(editor, entries);

  // --- 3. Write migration marker (only if reconstruction produced real parts) ---
  if (result.copiedCount > 0) {
    ydoc.transact(
      () => {
        ooxmlPartMeta.set('_migration.bootstrap_v1', {
          migratedAt: new Date().toISOString(),
          partCount: entries.length,
          schemaImported: result.schemaImported,
        });
      },
      { event: 'legacy-bootstrap-migration' },
    );

    console.debug(
      `${LOG_PREFIX} migration complete — ${entries.length} parts, schemaImported=${result.schemaImported}`,
    );
  } else {
    console.debug(`${LOG_PREFIX} migration incomplete — reconstruction failed, marker not written`);
  }
}

/**
 * Ensure the active converter is populated from bootstrap content.
 *
 * Uses a WeakSet to run at most once per editor instance. No heuristic
 * on converter state — BLANK_DOCX produces docDefaults identical to a
 * real document after getSchema, making content-based heuristics unreliable.
 *
 * @param {object} editor
 */
function ensureConverterPopulated(editor) {
  if (bootstrapHydratedEditors.has(editor)) {
    console.debug(`${LOG_PREFIX} skip hydration: already hydrated this editor`);
    return;
  }
  bootstrapHydratedEditors.add(editor);

  const bootstrap = readBootstrapContent(editor.options.ydoc);
  if (!bootstrap?.content?.length) {
    console.debug(`${LOG_PREFIX} skip hydration: no bootstrap content to read`);
    return;
  }

  console.debug(`${LOG_PREFIX} hydrating converter from bootstrap (${bootstrap.content.length} parts)`);
  reconstructConverterParts(editor, bootstrap.content);
}

/**
 * Normalize a legacy `meta.docx` value into a plain array of `{ name, content }`.
 *
 * Handles:
 * - Plain Array
 * - Y.Array (has `.toArray()`)
 * - Other iterables (via `Array.from`)
 *
 * Filters to entries with valid string `name` and string `content`.
 *
 * @param {unknown} legacyDocx
 * @returns {Array<{ name: string, content: string }>}
 */
export function normalizeLegacyPayload(legacyDocx) {
  let raw;

  if (Array.isArray(legacyDocx)) {
    raw = legacyDocx;
  } else if (legacyDocx && typeof legacyDocx.toArray === 'function') {
    raw = legacyDocx.toArray();
  } else if (legacyDocx && typeof legacyDocx[Symbol.iterator] === 'function') {
    raw = Array.from(legacyDocx);
  } else {
    return [];
  }

  return raw.filter((entry) => entry != null && typeof entry.name === 'string' && typeof entry.content === 'string');
}

/**
 * Build a temporary SuperConverter from content entries, run its import
 * pipeline, then copy all parts (except word/document.xml) and legacy
 * header/footer collections into the active converter.
 *
 * This ensures both model-backed parts (styles, headers/footers, numbering)
 * AND legacy collections (headers, footers, headerIds, footerIds) are
 * available for the subsequent `hydrateOrSeedPart` seeding phase and for
 * runtime code that reads from the legacy collections.
 *
 * @param {object} editor
 * @param {Array<{ name: string, content: string }>} entries
 * @returns {{ copiedCount: number, schemaImported: boolean }}
 */
function reconstructConverterParts(editor, entries) {
  let tempConverter;
  try {
    tempConverter = new SuperConverter({ docx: entries });
  } catch (e) {
    console.debug(`${LOG_PREFIX} SuperConverter construction failed`, e);
    return { copiedCount: 0, schemaImported: false };
  }

  // Run import pipeline to produce model-backed parts.
  // getSchema() calls createDocumentJson() which produces:
  //   - parts.styles (TranslatedLinkedStylesModel)
  //   - parts['header:rId*'/'footer:rId*'] (PM-JSON)
  //   - parts.numbering (translated model)
  //   - parts.themeColors, parts.pageStyles, parts.comments, parts.footnotes
  //   - headers/footers/headerIds/footerIds (legacy collections)
  const editorStub = {
    emit: () => {},
    options: { annotations: false },
    extensionService: { extensions: [] },
  };
  let schemaImported = false;
  try {
    tempConverter.getSchema(editorStub);
    schemaImported = true;
  } catch (e) {
    console.debug(`${LOG_PREFIX} getSchema failed, falling back to raw xmljs only`, e);
  }

  // Copy ALL parts into the active converter (except word/document.xml,
  // which is owned by the Yjs XmlFragment).
  const activeConverter = editor.converter;
  let copiedCount = 0;
  for (const [key, value] of Object.entries(tempConverter.parts)) {
    if (key === 'word/document.xml') continue;
    if (value == null) continue;
    try {
      writePart(activeConverter, key, value);
      copiedCount++;
    } catch (e) {
      console.debug(`${LOG_PREFIX} writePart failed for "${key}"`, e);
    }
  }

  // Copy legacy header/footer collections.
  // Runtime code (pagination-helpers, HeaderFooterRegistry) reads from
  // converter.headers/footers/headerIds/footerIds, not from parts.
  // writePart does not update these, so copy them explicitly.
  copyHeaderFooterCollections(activeConverter, tempConverter);

  return { copiedCount, schemaImported };
}

/**
 * Copy legacy header/footer collections from source to target converter.
 *
 * @param {object} target — Active converter
 * @param {object} source — Temp converter with populated collections
 */
function copyHeaderFooterCollections(target, source) {
  if (source.headers && Object.keys(source.headers).length > 0) {
    if (!target.headers) target.headers = {};
    Object.assign(target.headers, source.headers);
  }
  if (source.footers && Object.keys(source.footers).length > 0) {
    if (!target.footers) target.footers = {};
    Object.assign(target.footers, source.footers);
  }
  if (source.headerIds) {
    if (!target.headerIds) target.headerIds = {};
    Object.assign(target.headerIds, source.headerIds);
  }
  if (source.footerIds) {
    if (!target.footerIds) target.footerIds = {};
    Object.assign(target.footerIds, source.footerIds);
  }
}
