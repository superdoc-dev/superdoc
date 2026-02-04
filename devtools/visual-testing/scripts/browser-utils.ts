import fs from 'node:fs';
import path from 'node:path';
import { chromium, firefox, webkit, type BrowserType } from '@playwright/test';

export type BrowserName = 'chromium' | 'firefox' | 'webkit';

const VALID_BROWSERS: BrowserName[] = ['chromium', 'firefox', 'webkit'];

function normalizeBrowserList(value?: string): BrowserName[] {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) {
    return [];
  }
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(parts));
  const resolved = unique as BrowserName[];
  for (const name of resolved) {
    if (!VALID_BROWSERS.includes(name)) {
      throw new Error(`Invalid browser "${name}". Use one of: ${VALID_BROWSERS.join(', ')}`);
    }
  }
  return resolved;
}

/**
 * Resolve browser names from a CLI argument, environment variable, or default to all browsers.
 *
 * @param value - Comma-separated browser names (e.g., "chromium,firefox") or undefined
 * @returns Array of valid browser names. If no value provided, checks SUPERDOC_TEST_BROWSER env var,
 *          then falls back to all browsers.
 * @throws {Error} If any browser name is invalid
 */
export function resolveBrowserNames(value?: string): BrowserName[] {
  const explicit = normalizeBrowserList(value);
  if (explicit.length > 0) {
    return explicit;
  }
  const envValue = normalizeBrowserList(process.env.SUPERDOC_TEST_BROWSER);
  if (envValue.length > 0) {
    return envValue;
  }
  return [...VALID_BROWSERS];
}

/**
 * Resolve a single browser name from a CLI argument.
 *
 * @param value - Browser name (e.g., "chromium")
 * @returns The validated browser name
 * @throws {Error} If the value is invalid or resolves to multiple browsers
 */
export function resolveBrowserName(value?: string): BrowserName {
  const browsers = resolveBrowserNames(value);
  if (browsers.length !== 1) {
    throw new Error(`Expected a single browser. Use one of: ${VALID_BROWSERS.join(', ')}`);
  }
  return browsers[0];
}

/**
 * Get the Playwright BrowserType instance for a browser name.
 *
 * @param name - The browser name
 * @returns The Playwright BrowserType for launching the browser
 */
export function getBrowserType(name: BrowserName): BrowserType {
  switch (name) {
    case 'chromium':
      return chromium;
    case 'firefox':
      return firefox;
    case 'webkit':
      return webkit;
  }
}

/** List of all supported browser names. */
export const BROWSER_NAMES = VALID_BROWSERS;

/**
 * Resolve the baseline folder path for a specific browser.
 *
 * Handles legacy baselines that don't have browser subfolders by falling back
 * to the base directory for chromium when no browser folders exist.
 *
 * @param baseDir - The base baseline directory (e.g., "baselines/v.1.0.0")
 * @param browser - The browser name
 * @returns The resolved path to the browser-specific baseline folder
 */
export function resolveBaselineFolderForBrowser(baseDir: string, browser: BrowserName): string {
  const browserDir = path.join(baseDir, browser);
  if (fs.existsSync(browserDir)) {
    return browserDir;
  }
  if (!fs.existsSync(baseDir)) {
    return browserDir;
  }
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const hasBrowserDirs = entries.some(
    (entry) => entry.isDirectory() && VALID_BROWSERS.includes(entry.name as BrowserName),
  );
  if (!hasBrowserDirs && browser === 'chromium') {
    return baseDir;
  }
  return browserDir;
}
