/**
 * Feature Flags Module
 *
 * Centralized feature flag configuration for headers/footers page-number parity.
 * All flags are enabled by default but can be toggled via environment variables.
 *
 * Environment variables:
 * - SD_NUMBERING_SECTION_AWARE: Enable section-aware numbering (restarts, formats)
 * - SD_BODY_PAGE_TOKENS: Enable body page token resolution (PAGE/NUMPAGES)
 * - SD_HEADER_FOOTER_PAGE_TOKENS: Enable header/footer page token resolution
 * - SD_HF_DIGIT_BUCKETING: Enable digit bucketing for large documents
 * - SD_DEBUG_PAGE_TOKENS: Enable debug logging for page token resolution
 * - SD_DEBUG_HF_CACHE: Enable debug logging for header/footer cache operations
 * - SD_DEBUG_LAYOUT_VERSION: Enable debug logging for layout version tracking
 *
 * Each flag can be set to:
 * - "true" or "1": Explicitly enabled
 * - "false" or "0": Explicitly disabled
 * - undefined: Use default value (all default to true)
 */

/**
 * Checks if an environment variable is explicitly set to a truthy value.
 *
 * @param envVar - Environment variable name
 * @param defaultValue - Default value when environment variable is not set
 * @returns True if enabled, false otherwise
 */
function isEnabled(envVar: string, defaultValue: boolean): boolean {
  if (typeof process === 'undefined' || typeof process.env === 'undefined') {
    return defaultValue;
  }

  const value = process.env[envVar];

  // Explicit true
  if (value === 'true' || value === '1') {
    return true;
  }

  // Explicit false
  if (value === 'false' || value === '0') {
    return false;
  }

  // Not set - use default
  return defaultValue;
}

/**
 * Feature flag configuration object.
 * All flags are checked once at module load time for performance.
 */
export const FeatureFlags = {
  /**
   * Enable section-aware numbering with restarts and format changes.
   * When disabled, falls back to simple 1-N sequential numbering.
   */
  NUMBERING_SECTION_AWARE: isEnabled('SD_NUMBERING_SECTION_AWARE', true),

  /**
   * Enable body page token resolution (PAGE/NUMPAGES in document content).
   * When disabled, tokens remain as placeholders in body content.
   */
  BODY_PAGE_TOKENS: isEnabled('SD_BODY_PAGE_TOKENS', true),

  /**
   * Enable header/footer page token resolution.
   * When disabled, headers/footers use painter-time token rendering fallback.
   */
  HEADER_FOOTER_PAGE_TOKENS: isEnabled('SD_HEADER_FOOTER_PAGE_TOKENS', true),

  /**
   * Enable digit bucketing for header/footer caching in large documents.
   * When disabled, creates per-page layouts for all documents (no bucketing).
   * Recommended to keep enabled for documents with 100+ pages.
   */
  HF_DIGIT_BUCKETING: isEnabled('SD_HF_DIGIT_BUCKETING', true),

  /**
   * Enable debug logging for page token resolution.
   * Logs token resolution details, affected blocks, and convergence iteration info.
   * Should be disabled in production (only enabled for debugging).
   */
  DEBUG_PAGE_TOKENS: isEnabled('SD_DEBUG_PAGE_TOKENS', false),

  /**
   * Enable debug logging for header/footer cache operations.
   * Logs cache hits, misses, invalidations, and bucket selection.
   * Should be disabled in production (only enabled for debugging).
   */
  DEBUG_HF_CACHE: isEnabled('SD_DEBUG_HF_CACHE', false),

  /**
   * Enable debug logging for layout version tracking.
   * Logs stale layout reads, geometry fallbacks, PM transactions, and layout completions.
   * Should be disabled in production (only enabled for debugging).
   */
  DEBUG_LAYOUT_VERSION: isEnabled('SD_DEBUG_LAYOUT_VERSION', false),
} as const;

/**
 * Type-safe feature flag keys for programmatic access.
 */
export type FeatureFlagKey = keyof typeof FeatureFlags;

/**
 * Checks if a specific feature flag is enabled.
 *
 * @param flag - Feature flag key
 * @returns True if the flag is enabled
 *
 * @example
 * ```typescript
 * if (isFeatureEnabled('BODY_PAGE_TOKENS')) {
 *   // Execute body token resolution
 * }
 * ```
 */
export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return FeatureFlags[flag];
}

/**
 * Gets all feature flag values as an object.
 * Useful for logging and debugging.
 *
 * @returns Object with all feature flag values
 *
 * @example
 * ```typescript
 * console.log('Feature flags:', getAllFeatureFlags());
 * ```
 */
export function getAllFeatureFlags(): Record<FeatureFlagKey, boolean> {
  return { ...FeatureFlags };
}
