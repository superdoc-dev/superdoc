/**
 * Document-scoped font options for the toolbar: one option per logical family a loaded document
 * actually uses. Distinct from the static {@link ./font-offerings} (the bundled choices): this is
 * runtime and document-scoped because it needs the document's registry and resolver.
 *
 * Fallback diagnostics are intentionally not part of this surface. The toolbar lists document fonts as
 * plain picker rows; internal fallback/reporting details stay in SuperDoc's runtime font report.
 */
import { buildFaceReport, type FontResolutionRecord, type UsedFace } from './report';
import { getBuiltInToolbarFontOfferings } from './font-offerings';
import type { FontRegistry } from './registry';
import type { FontResolver } from './resolver';

/**
 * One document font for the toolbar: the logical name (the dropdown label and the value stored and
 * exported) and the family to render its preview in.
 */
export interface DocumentFontOption {
  /** The Word-facing logical family: the dropdown label and the value stored + exported (e.g. "Aptos"). */
  logicalFamily: string;
  /**
   * The physical family to render the dropdown PREVIEW in (Calibri previews as Carlito; a document-
   * provided font previews as itself). The regular face is used as the representative when present.
   */
  previewFamily: string;
}

/** Normalize a family for dedupe: trim, strip surrounding quotes, lowercase (matches the resolver key). */
function normalizeKey(family: string): string {
  return family
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
}

function isRegularFace(rec: FontResolutionRecord): boolean {
  return rec.face?.weight === '400' && rec.face?.style === 'normal';
}

/**
 * The document-specific font options for the toolbar: one per LOGICAL family the document renders,
 * deduped, each with the family that actually paints its preview. Resolved FACE-aware (via
 * {@link buildFaceReport}) so an embedded / customer font the document supplies is detected even when
 * no bundled clone exists.
 */
export function buildDocumentFontOptions(
  usedFaces: Iterable<UsedFace>,
  registry: FontRegistry,
  resolver?: FontResolver,
): DocumentFontOption[] {
  const faceRecords = buildFaceReport(usedFaces, registry, resolver);
  const agg = new Map<string, FontResolutionRecord>();
  for (const rec of faceRecords) {
    const key = normalizeKey(rec.logicalFamily);
    const existing = agg.get(key);
    if (!existing) {
      agg.set(key, rec);
      continue;
    }
    if (isRegularFace(rec) && !isRegularFace(existing)) agg.set(key, rec);
  }
  const options: DocumentFontOption[] = [];
  for (const rep of agg.values()) {
    options.push({ logicalFamily: rep.logicalFamily, previewFamily: rep.physicalFamily });
  }
  return options;
}

/**
 * Final, dropdown-ready font family option. `label` and `value` are the logical family; `previewFamily`
 * is only for rendering the row preview.
 */
export interface FontFamilyOption {
  /** Display text: the Word-facing logical family (e.g. "Calibri"). */
  label: string;
  /** Value to apply with the font-family command. */
  value: string;
  /** Physical family used to render the option preview. */
  previewFamily: string;
}

function compareByLabel(a: FontFamilyOption, b: FontFamilyOption): number {
  return a.label.localeCompare(b.label, 'en', { sensitivity: 'base' });
}

/**
 * Compose the final font-family picker list from bundled toolbar choices plus active document fonts.
 * The result is sorted alphabetically and deduped by logical family.
 */
export function buildFontFamilyOptions(documentOptions: ReadonlyArray<DocumentFontOption>): FontFamilyOption[] {
  const seen = new Set<string>();
  const options: FontFamilyOption[] = [];
  for (const offering of getBuiltInToolbarFontOfferings()) {
    const key = normalizeKey(offering.logicalFamily);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      label: offering.logicalFamily,
      value: offering.logicalFamily,
      previewFamily: offering.physicalFamily || offering.logicalFamily,
    });
  }
  for (const option of documentOptions) {
    const key = normalizeKey(option.logicalFamily);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      label: option.logicalFamily,
      value: option.logicalFamily,
      previewFamily: option.previewFamily || option.logicalFamily,
    });
  }
  return options.sort(compareByLabel);
}
