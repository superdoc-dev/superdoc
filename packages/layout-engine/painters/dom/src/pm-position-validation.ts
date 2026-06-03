/**
 * PM Position Validation Module
 *
 * Part of Phase 0 instrumentation for typing performance optimization.
 * Validates that all rendered text spans have proper pmStart/pmEnd attributes
 * to ensure cursor positioning can always fall back to PM DOM coordinates.
 *
 * Key principles:
 * 1. All text-containing elements must have data-pm-start and data-pm-end
 * 2. Missing attributes indicate a gap in position mapping
 * 3. Warnings are dev-mode only (zero overhead in production)
 * 4. Provides fallback guidance when positions are missing
 */

import { createLogger } from '@superdoc/common/logger';

const log = createLogger('painter-dom:pm-position-validation');

/**
 * Environment check for dev-mode warnings.
 * Only emit warnings when explicitly in development to keep test output clean.
 */
const isDevelopment = (): boolean => {
  if (typeof process !== 'undefined' && typeof process.env !== 'undefined') {
    return process.env.NODE_ENV === 'development';
  }
  // Assume production if environment is not available
  return false;
};

/**
 * Validation statistics for monitoring position coverage.
 */
export interface PmPositionValidationStats {
  /** Total text spans checked */
  totalSpans: number;
  /** Spans with complete pmStart/pmEnd */
  validSpans: number;
  /** Spans missing pmStart */
  missingPmStart: number;
  /** Spans missing pmEnd */
  missingPmEnd: number;
  /** Spans missing both */
  missingBoth: number;
}

/**
 * Global validation statistics collector.
 */
class ValidationStatsCollector {
  private stats: PmPositionValidationStats = {
    totalSpans: 0,
    validSpans: 0,
    missingPmStart: 0,
    missingPmEnd: 0,
    missingBoth: 0,
  };

  record(hasPmStart: boolean, hasPmEnd: boolean): void {
    this.stats.totalSpans++;

    if (hasPmStart && hasPmEnd) {
      this.stats.validSpans++;
    } else if (!hasPmStart && !hasPmEnd) {
      this.stats.missingBoth++;
    } else if (!hasPmStart) {
      this.stats.missingPmStart++;
    } else {
      this.stats.missingPmEnd++;
    }
  }

  getStats(): Readonly<PmPositionValidationStats> {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = {
      totalSpans: 0,
      validSpans: 0,
      missingPmStart: 0,
      missingPmEnd: 0,
      missingBoth: 0,
    };
  }

  getCoveragePercent(): number {
    if (this.stats.totalSpans === 0) return 100;
    return (this.stats.validSpans / this.stats.totalSpans) * 100;
  }

  logSummary(): void {
    if (!isDevelopment()) return;

    const coverage = this.getCoveragePercent();
    const s = this.stats;

    if (coverage < 100) {
      log.warn('[PmPositionValidation] PM position coverage:', {
        coverage: `${coverage.toFixed(1)}%`,
        totalSpans: s.totalSpans,
        validSpans: s.validSpans,
        missingPmStart: s.missingPmStart,
        missingPmEnd: s.missingPmEnd,
        missingBoth: s.missingBoth,
      });
    }
  }
}

/**
 * Global stats collector instance.
 */
export const globalValidationStats = new ValidationStatsCollector();

/**
 * Asserts that a rendered text run has pmStart and pmEnd positions.
 *
 * Used during DOM rendering to validate that all text content has position markers.
 * In dev mode, logs a warning if positions are missing. In production, silent no-op.
 *
 * @param run - The text run being rendered
 * @param context - Context string for debugging (e.g., "paragraph text run", "list marker")
 *
 * @example
 * ```typescript
 * const span = document.createElement('span');
 * span.textContent = run.text;
 * assertPmPositions(run, 'paragraph text run');
 * if (run.pmStart != null) span.dataset.pmStart = String(run.pmStart);
 * if (run.pmEnd != null) span.dataset.pmEnd = String(run.pmEnd);
 * ```
 */
export function assertPmPositions(
  run: { pmStart?: number | null; pmEnd?: number | null; text?: string },
  context: string,
): void {
  const hasPmStart = run.pmStart != null;
  const hasPmEnd = run.pmEnd != null;

  // Record stats regardless of dev mode (for metrics)
  globalValidationStats.record(hasPmStart, hasPmEnd);

  // Only warn in development
  if (!isDevelopment()) return;

  if (!hasPmStart || !hasPmEnd) {
    const textPreview = run.text ? run.text.substring(0, 20) + (run.text.length > 20 ? '...' : '') : '(no text)';

    log.warn(`[PmPositionValidation] Missing PM positions in ${context}:`, {
      hasPmStart,
      hasPmEnd,
      textPreview,
      fallback: 'Will use PM DOM coordinates for cursor positioning',
    });
  }
}

/**
 * Asserts that a rendered fragment has pmStart and pmEnd positions.
 *
 * Used for paragraph fragments and other block-level elements.
 *
 * **Note on validation warnings:** This function only records statistics and does not emit
 * warnings for missing PM positions. Fragment-level position validation warnings were removed
 * because certain fragment types (e.g., inline SDT wrappers) intentionally have PM positions
 * on wrapper elements for selection highlighting, while their child spans are used for
 * accurate click-to-position mapping. The presence of wrapper PM positions is valid for
 * rendering purposes, but warning about them creates noise without indicating an actual issue.
 * Text run validation (via `assertPmPositions`) remains active to catch genuine position gaps.
 *
 * @param fragment - The fragment being rendered
 * @param context - Context string for debugging
 */
export function assertFragmentPmPositions(
  fragment: { pmStart?: number | null; pmEnd?: number | null; kind?: string },
  _context: string,
): void {
  const hasPmStart = fragment.pmStart != null;
  const hasPmEnd = fragment.pmEnd != null;

  // Record stats for monitoring coverage, but do not emit warnings.
  // See function JSDoc for rationale on why warnings were removed.
  globalValidationStats.record(hasPmStart, hasPmEnd);
}

/**
 * Validates PM positions on a rendered DOM element.
 *
 * Checks that the element has data-pm-start and data-pm-end attributes.
 * Useful for validating elements after they've been rendered.
 *
 * @param element - The rendered DOM element
 * @param context - Context string for debugging
 */
export function validateRenderedElement(element: HTMLElement, context: string): void {
  const hasPmStart = element.dataset.pmStart != null;
  const hasPmEnd = element.dataset.pmEnd != null;

  // Record stats
  globalValidationStats.record(hasPmStart, hasPmEnd);

  // Only warn in development
  if (!isDevelopment()) return;

  if (!hasPmStart || !hasPmEnd) {
    log.warn(`[PmPositionValidation] Rendered element missing PM attributes in ${context}:`, {
      element: element.tagName,
      className: element.className,
      hasPmStart,
      hasPmEnd,
      fallback: 'Cursor positioning may use PM DOM fallback',
    });
  }
}

/**
 * Logs a summary of PM position validation statistics.
 * Call this periodically (e.g., after each render) to monitor coverage.
 *
 * Only logs in development mode and only if coverage is < 100%.
 */
export function logValidationSummary(): void {
  globalValidationStats.logSummary();
}

/**
 * Resets validation statistics.
 * Useful for testing or when starting a new document.
 */
export function resetValidationStats(): void {
  globalValidationStats.reset();
}

/**
 * Gets current validation statistics.
 *
 * @returns Current validation stats (readonly copy)
 */
export function getValidationStats(): Readonly<PmPositionValidationStats> {
  return globalValidationStats.getStats();
}
