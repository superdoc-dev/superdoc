import { resolveFontFamily, type FontResolutionReason } from './resolver';
import type { FontRegistry } from './registry';
import { isSettled, type FontLoadStatus } from './types';

/**
 * One row of the font report: what the document asked for, what SuperDoc actually
 * renders, why, whether it was ready before measurement, and what export preserves.
 *
 * This is the observable answer to "what font did SuperDoc use, and is that faithful?"
 * e.g. requested Calibri -> rendered Carlito (bundled_substitute), loaded before measure,
 * export still Calibri.
 */
export interface FontResolutionRecord {
  /** The family the document requested (e.g. "Calibri"). */
  logicalFamily: string;
  /** The physical family actually measured and painted (e.g. "Carlito"). */
  physicalFamily: string;
  /** Why the physical family differs from the logical one. */
  reason: FontResolutionReason;
  /** Load state of the physical face at report time (`loaded` = ready before measurement). */
  loadStatus: FontLoadStatus;
  /** The family export writes back - always the logical name, so intent is preserved. */
  exportFamily: string;
  /**
   * True when the physical face reached a SETTLED state that is not `loaded` - the user
   * sees a generic fallback, not the intended font. This covers BOTH a font with no known
   * substitute (`reason: 'as_requested'`, e.g. Aptos) AND a substitute whose asset failed
   * to load (`reason: 'bundled_substitute'`, `loadStatus: 'failed'`, e.g. a misconfigured
   * `assetBaseUrl` that 404s). Transient states (`unloaded` / `loading`) are NOT missing,
   * so an early `getReport()` pull before the gate settles does not over-report. The
   * `reason` and `loadStatus` fields distinguish the cause (unsupported vs failed vs timed out).
   */
  missing: boolean;
}

/**
 * Build the per-font resolution report for a document's logical fonts. Pure given the
 * resolver map and the registry's current load state, so it reflects exactly what was
 * resolved and loaded for the last measurement pass.
 *
 * This is the diagnostics seam: the public `superdoc.fonts.getReport()` (T7) and the
 * upgraded `onFontsResolved` payload are thin wrappers over this - they must not compute
 * resolution independently, or the report could disagree with what actually painted.
 */
export function buildFontReport(logicalFamilies: Iterable<string>, registry: FontRegistry): FontResolutionRecord[] {
  const seen = new Set<string>();
  const report: FontResolutionRecord[] = [];
  for (const logical of logicalFamilies) {
    if (!logical || seen.has(logical)) continue;
    seen.add(logical);
    const { physicalFamily, reason } = resolveFontFamily(logical);
    const loadStatus = registry.getStatus(physicalFamily);
    report.push({
      logicalFamily: logical,
      physicalFamily,
      reason,
      loadStatus,
      exportFamily: logical,
      missing: isSettled(loadStatus) && loadStatus !== 'loaded',
    });
  }
  return report;
}
