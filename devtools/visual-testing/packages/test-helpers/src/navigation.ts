/**
 * Navigation helpers for visual testing.
 * These help navigate to the harness and wait for it to be ready.
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { buildUrl, type HarnessConfig } from '@superdoc-testing/harness/src/config-parser';

// Import centralized Window type augmentation
import './types.js';

/** Default base URL for the harness */
export const DEFAULT_BASE_URL = 'http://localhost:9989';

export interface GoToHarnessOptions extends Partial<HarnessConfig> {
  /** Base URL for the harness (default: http://localhost:9989) */
  baseUrl?: string;
  /** Timeout for waiting for editor to be visible (default: 5000) */
  timeout?: number;
}

/**
 * Navigate to the harness and wait for the editor to be ready.
 * @param page - Playwright page instance
 * @param options - Navigation and harness configuration options
 * @returns The editor locator for further interactions
 */
export async function goToHarness(page: Page, options: GoToHarnessOptions = {}): Promise<Locator> {
  const { baseUrl = DEFAULT_BASE_URL, timeout = 5_000, ...config } = options;

  const url = buildUrl(baseUrl, config);
  await page.goto(url);

  return waitForEditor(page, { timeout });
}

export interface WaitForEditorOptions {
  /** Timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Selector for the editor (default: 'div.super-editor') */
  selector?: string;
}

/**
 * Wait for the SuperDoc editor to be visible.
 * @param page - Playwright page instance
 * @param options - Configuration options
 * @returns The editor locator
 */
export async function waitForEditor(page: Page, options: WaitForEditorOptions = {}): Promise<Locator> {
  const { timeout = 5_000, selector = 'div.super-editor' } = options;

  await page.waitForSelector(selector, { timeout });
  const editor = page.locator(selector).first();
  await expect(editor).toBeVisible({ timeout: 1_000 });

  return editor;
}

export interface WaitForSuperdocReadyOptions {
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
}

/**
 * Wait for SuperDoc to be fully initialized.
 * This waits for window.superdoc to be set.
 * @param page - Playwright page instance
 * @param options - Configuration options
 * @returns Resolves when SuperDoc is ready
 */
export async function waitForSuperdocReady(page: Page, options: WaitForSuperdocReadyOptions = {}): Promise<void> {
  const { timeout = 10_000 } = options;

  await page.waitForFunction(() => window.superdoc !== null && window.superdoc !== undefined, null, { timeout });
}

export interface UploadDocumentOptions {
  /** Wait for layout to stabilize after upload (default: true) */
  waitForStable?: boolean;
  /** Timeout for waiting (default: 30000) */
  timeout?: number;
}

/**
 * Upload a document to the harness via the file input.
 * @param page - Playwright page instance
 * @param filePath - Path to the document file to upload
 * @param options - Configuration options
 * @returns Resolves when the document has been uploaded (and optionally processed)
 */
export async function uploadDocument(page: Page, filePath: string, options: UploadDocumentOptions = {}): Promise<void> {
  const { waitForStable = true, timeout = 30_000 } = options;

  const fileInput = page.locator('[data-testid="file-input"]');
  await fileInput.setInputFiles(filePath);

  if (waitForStable) {
    // Wait for SuperDoc to process the document
    await page.waitForFunction(() => window.superdoc !== null, null, { timeout });
  }
}
