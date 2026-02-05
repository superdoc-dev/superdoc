/**
 * Screenshot capture helpers for SuperDoc visual testing.
 * These helpers capture per-page screenshots for layout engine documents.
 */

import type { Page, Locator } from '@playwright/test';

export interface CapturePageOptions {
  /** Animations setting (default: 'disabled') */
  animations?: 'disabled' | 'allow';
  /** Quality for JPEG screenshots (0-100) */
  quality?: number;
  /** Type of screenshot (default: 'png') */
  type?: 'png' | 'jpeg';
}

export interface CaptureResult {
  /** Page number (1-indexed) */
  pageNumber: number;
  /** The page locator that was captured */
  locator: Locator;
  /** Screenshot buffer if captured to buffer */
  buffer?: Buffer;
}

/**
 * Get all rendered page locators from a SuperDoc layout engine document.
 * @param page - Playwright page instance
 * @returns Locator matching all rendered pages
 */
export function getPageLocators(page: Page): Locator {
  return page.locator('.superdoc-page[data-page-index]');
}

/**
 * Get the count of rendered pages.
 * @param page - Playwright page instance
 * @returns The number of rendered pages
 */
export async function getPageCount(page: Page): Promise<number> {
  const pages = getPageLocators(page);
  return pages.count();
}

/**
 * Capture a specific page (1-indexed) and return the buffer.
 * @param page - Playwright page instance
 * @param pageNumber - Page number to capture (1-indexed)
 * @param options - Screenshot options
 * @returns Screenshot buffer
 */
export async function capturePage(page: Page, pageNumber: number, options: CapturePageOptions = {}): Promise<Buffer> {
  const { animations = 'disabled', ...screenshotOptions } = options;
  const pages = getPageLocators(page);
  const pageLocator = pages.nth(pageNumber - 1);

  return pageLocator.screenshot({
    animations,
    ...screenshotOptions,
  });
}

/**
 * Capture a specific page (1-indexed) and save to a file.
 * @param page - Playwright page instance
 * @param pageNumber - Page number to capture (1-indexed)
 * @param filePath - Destination file path for the screenshot
 * @param options - Screenshot options
 * @returns Resolves when the screenshot has been saved
 */
export async function capturePageToFile(
  page: Page,
  pageNumber: number,
  filePath: string,
  options: CapturePageOptions = {},
): Promise<void> {
  const { animations = 'disabled', ...screenshotOptions } = options;
  const pages = getPageLocators(page);
  const pageLocator = pages.nth(pageNumber - 1);

  await pageLocator.screenshot({
    path: filePath,
    animations,
    ...screenshotOptions,
  });
}

/**
 * Generate a screenshot filename for a specific page.
 * Format: {baseName}__p{pageNumber}.{extension}
 * @param baseName - Base name for the file (e.g., "my-document")
 * @param pageNumber - Page number (will be zero-padded to 3 digits)
 * @param extension - File extension (default: "png")
 * @returns Formatted filename (e.g., "my-document__p001.png")
 */
export function getPageFilename(baseName: string, pageNumber: number, extension = 'png'): string {
  const paddedNumber = String(pageNumber).padStart(3, '0');
  return `${baseName}__p${paddedNumber}.${extension}`;
}

/**
 * Capture all pages and return an array of results with buffers.
 * @param page - Playwright page instance
 * @param options - Screenshot options applied to each page
 * @returns Array of capture results, one per page
 */
export async function captureAllPages(page: Page, options: CapturePageOptions = {}): Promise<CaptureResult[]> {
  const pages = getPageLocators(page);
  const count = await pages.count();
  const results: CaptureResult[] = [];

  for (let i = 0; i < count; i++) {
    const pageLocator = pages.nth(i);
    const buffer = await capturePage(page, i + 1, options);

    results.push({
      pageNumber: i + 1,
      locator: pageLocator,
      buffer,
    });
  }

  return results;
}
