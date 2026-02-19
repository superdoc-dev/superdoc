/**
 * Stability helpers for visual testing.
 * These ensure the page is in a consistent state before taking screenshots.
 */

import type { Page } from '@playwright/test';

// Import centralized Window type augmentation
import './types.js';

/**
 * Sleep for a given number of milliseconds.
 * @param ms - Duration to sleep in milliseconds
 * @returns Resolves after the specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert points to pixels.
 * @param pt - Value in points
 * @returns CSS pixel string (e.g., "16px")
 */
export function ptToPx(pt: number): string {
  return `${pt * 1.3333333333333333}px`;
}

export interface WaitForFontsOptions {
  /** Timeout in milliseconds (default: 12000) */
  timeout?: number;
}

/**
 * Wait for all web fonts to finish loading.
 * @param page - Playwright page instance
 * @param options - Configuration options
 * @returns Resolves when all fonts have loaded
 */
export async function waitForFontsReady(page: Page, options: WaitForFontsOptions = {}): Promise<void> {
  const { timeout = 12_000 } = options;

  await page.waitForFunction(() => !document.fonts || document.fonts.status === 'loaded', null, {
    polling: 100,
    timeout,
  });
}

export interface WaitForLayoutStableOptions {
  /** CSS selector for the layout container (default: '.superdoc-layout') */
  selector?: string;
  /** Milliseconds the layout must be stable (default: 800) */
  stableMs?: number;
  /** Timeout in milliseconds (default: 15000) */
  timeout?: number;
}

/**
 * Wait for the layout to stabilize (no size changes for stableMs).
 * This is crucial for visual testing to avoid flaky screenshots.
 * @param page - Playwright page instance
 * @param options - Configuration options
 * @returns Resolves when the layout has been stable for the specified duration
 */
export async function waitForLayoutStable(page: Page, options: WaitForLayoutStableOptions = {}): Promise<void> {
  const { selector = '.superdoc-layout', stableMs = 800, timeout = 15_000 } = options;

  await page.waitForFunction(
    ({ selector, stableMs }) => {
      const root = document.querySelector(selector) || document.querySelector('div.super-editor');
      if (!root) return false;

      const rect = root.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50) return false;

      const current = {
        w: rect.width,
        h: rect.height,
        scrollW: root.scrollWidth,
        scrollH: root.scrollHeight,
      };

      const prev = window.__layoutPrevState || current;
      const now = performance.now();
      const delta =
        Math.abs(prev.w - current.w) +
        Math.abs(prev.h - current.h) +
        Math.abs(prev.scrollW - current.scrollW) +
        Math.abs(prev.scrollH - current.scrollH);

      if (delta > 1) {
        window.__layoutPrevState = current;
        window.__layoutStableSince = now;
        return false;
      }

      window.__layoutPrevState = current;
      if (!window.__layoutStableSince) window.__layoutStableSince = now;

      return now - window.__layoutStableSince > stableMs;
    },
    { selector, stableMs },
    { polling: 100, timeout },
  );
}

/**
 * Wait for the editor to be idle after an operation.
 * Use this after interactions to let the editor settle.
 * @param page - Playwright page instance
 * @param ms - Milliseconds to wait (default: 500)
 * @returns Resolves after the wait period
 */
export async function waitForEditorIdle(page: Page, ms = 500): Promise<void> {
  await page.waitForTimeout(ms);
}
