/**
 * Configuration parser for SuperDoc test harness.
 *
 * All configuration is passed via URL parameters for easy testing and debugging.
 * This makes test definitions readable and self-documenting.
 *
 * Defaults:
 *   - Layout engine: ON (use ?layout=0 to disable)
 *   - Port: 9989
 *
 * Example URLs:
 *   http://localhost:9989               - Default (layout engine on)
 *   ?layout=0                           - Disable layout engine
 *   ?comments=panel                     - Comments panel open
 *   ?toolbar=full&comments=on           - Full toolbar with comments
 *   ?width=1200&height=800              - Custom viewport
 */

/** Toolbar display mode options */
export type ToolbarMode = 'none' | 'minimal' | 'full';

/** Comments module mode options */
export type CommentsMode = 'off' | 'on' | 'panel' | 'readonly';

/** Viewport dimensions for the test harness */
export interface Viewport {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

/** Complete harness configuration parsed from URL parameters */
export interface HarnessConfig {
  /** Enable layout engine (pagination mode). Default: true */
  layout: boolean;
  /** Toolbar display mode. Default: 'none' */
  toolbar: ToolbarMode;
  /** Comments module mode. Default: 'off' */
  comments: CommentsMode;
  /** Enable track changes. Default: false */
  trackChanges: boolean;
  /** Viewport dimensions. Default: 1600x1200 */
  viewport: Viewport;
  /** Wait for fonts to resolve before ready. Default: false */
  waitForFonts: boolean;
  /** Hide cursor/caret for visual testing. Default: true */
  hideCaret: boolean;
  /** Hide selection overlays for visual testing. Default: true */
  hideSelection: boolean;
  /** Enable caret blink animation. Default: false (disabled for visual testing) */
  caretBlink: boolean;
  /** Custom extensions to load (comma-separated in URL) */
  extensions: string[];
}

/**
 * Parse URL search params into harness configuration.
 *
 * @param search - URL search string (e.g., window.location.search)
 * @returns Fully resolved HarnessConfig with defaults applied
 *
 * @example
 * ```ts
 * const config = parseConfig('?layout=0&comments=panel');
 * // { layout: false, comments: 'panel', ... }
 * ```
 */
export function parseConfig(search: string): HarnessConfig {
  const params = new URLSearchParams(search);

  return {
    // Core rendering (default: layout engine ON)
    layout: params.get('layout') !== '0',

    // Toolbar: none (default), minimal, full
    toolbar: parseToolbar(params.get('toolbar')),

    // Comments: off (default), on, panel (open), readonly
    comments: parseComments(params.get('comments')),

    // Track changes
    trackChanges: params.get('trackChanges') === '1',

    // Viewport dimensions
    viewport: {
      width: parseInt(params.get('width') || '1600', 10),
      height: parseInt(params.get('height') || '1200', 10),
    },

    // Font handling (default: don't wait)
    waitForFonts: params.get('fonts') === '1',

    // Visual testing helpers - hide dynamic elements by default
    hideCaret: params.get('hideCaret') !== '0',
    hideSelection: params.get('hideSelection') !== '0',

    // Caret blink disabled by default for visual testing stability
    caretBlink: params.get('caretBlink') === '1',

    // Custom extensions (comma-separated)
    extensions: parseExtensions(params.get('extensions')),
  };
}

/**
 * Parse toolbar parameter into a valid ToolbarMode.
 *
 * @param value - Raw URL parameter value
 * @returns Validated ToolbarMode, defaults to 'none'
 */
function parseToolbar(value: string | null): ToolbarMode {
  if (value === 'full' || value === 'minimal') {
    return value;
  }
  return 'none';
}

/**
 * Parse comments parameter into a valid CommentsMode.
 *
 * @param value - Raw URL parameter value
 * @returns Validated CommentsMode, defaults to 'off'
 */
function parseComments(value: string | null): CommentsMode {
  if (value === 'on' || value === 'panel' || value === 'readonly') {
    return value;
  }
  return 'off';
}

/**
 * Parse extensions parameter into an array of extension names.
 *
 * @param value - Comma-separated string of extension names
 * @returns Array of trimmed, non-empty extension names
 */
function parseExtensions(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build a URL with the given configuration.
 * Only includes parameters that differ from defaults to keep URLs clean.
 *
 * @param baseUrl - Base URL (e.g., 'http://localhost:9989')
 * @param config - Partial configuration options to encode
 * @returns Complete URL with query parameters
 *
 * @example
 * ```ts
 * const url = buildUrl('http://localhost:9989', { layout: false, comments: 'panel' });
 * // 'http://localhost:9989?layout=0&comments=panel'
 * ```
 */
export function buildUrl(baseUrl: string, config: Partial<HarnessConfig>): string {
  const params = new URLSearchParams();

  // Layout is ON by default, so only set param if explicitly false
  if (config.layout === false) {
    params.set('layout', '0');
  }

  if (config.toolbar && config.toolbar !== 'none') {
    params.set('toolbar', config.toolbar);
  }

  if (config.comments && config.comments !== 'off') {
    params.set('comments', config.comments);
  }

  if (config.trackChanges) {
    params.set('trackChanges', '1');
  }

  if (config.viewport) {
    if (config.viewport.width !== 1600) {
      params.set('width', String(config.viewport.width));
    }
    if (config.viewport.height !== 1200) {
      params.set('height', String(config.viewport.height));
    }
  }

  if (config.waitForFonts) {
    params.set('fonts', '1');
  }

  // Only set these if explicitly different from defaults
  if (config.hideCaret === false) {
    params.set('hideCaret', '0');
  }
  if (config.hideSelection === false) {
    params.set('hideSelection', '0');
  }
  if (config.caretBlink === true) {
    params.set('caretBlink', '1');
  }

  if (config.extensions && config.extensions.length > 0) {
    params.set('extensions', config.extensions.join(','));
  }

  const queryString = params.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

/**
 * Get a human-readable description of the current config.
 * Useful for test naming and debugging output.
 *
 * @param config - Harness configuration to describe
 * @returns Underscore-separated description string (e.g., 'no-layout_comments-panel')
 *
 * @example
 * ```ts
 * const desc = describeConfig({ layout: false, comments: 'panel', ... });
 * // 'no-layout_comments-panel'
 * ```
 */
export function describeConfig(config: HarnessConfig): string {
  const parts: string[] = [];

  // Layout engine is default, so only note if disabled
  if (config.layout === false) {
    parts.push('no-layout');
  }

  if (config.toolbar !== 'none') {
    parts.push(`toolbar-${config.toolbar}`);
  }

  if (config.comments !== 'off') {
    parts.push(`comments-${config.comments}`);
  }

  if (config.trackChanges) {
    parts.push('track-changes');
  }

  return parts.join('_') || 'default';
}
