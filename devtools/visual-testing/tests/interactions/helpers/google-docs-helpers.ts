import { Browser, BrowserContext, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOOGLE_COOKIES_PATH = resolve(__dirname, '..', '..', '..', 'google-cookies.json');

async function loadGoogleCookies(page: Page) {
  try {
    const googleCookies = JSON.parse(readFileSync(GOOGLE_COOKIES_PATH, 'utf-8'));
    await page.context().addCookies(googleCookies);
  } catch (e) {
    console.log(`Failed to load Google cookies from ${GOOGLE_COOKIES_PATH}: ${e}`);
  }
}

async function saveGoogleCookies(context: BrowserContext) {
  await writeFile(GOOGLE_COOKIES_PATH, JSON.stringify(await context.cookies()));
}

/**
 * Open Google Docs in a new playwright Page, and call the specified action
 */
export async function withGoogleDocs<T>(
  browser: Browser,
  action: ({ page }: { page: Page }) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext();

  try {
    const page = await context.newPage();
    await loadGoogleCookies(page);
    await page.goto('https://docs.google.com/');
    if (page.url().startsWith('https://accounts.google.com/')) {
      throw new Error('No Google session available. Log in first by running `pnpm google-login`.');
    }

    return await action({ page });
  } finally {
    await context.close();
  }
}

type LoginToGoogleOptions = {
  force?: boolean;
};

/**
 * Navigate to https://docs.google.com/, let the user manually log in to their
 * Google account, and then store the resulting cookies in the persistent
 * cookie store.
 *
 * @param browser Playwright Browser instance
 * @param force Don't attempt to load existing cookies
 */
export async function loginToGoogle(browser: Browser, { force }: LoginToGoogleOptions = {}) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    if (!force) {
      await loadGoogleCookies(page);
    }
    await page.goto('https://docs.google.com/');
    if (!page.url().startsWith('https://docs.google.com/')) {
      console.log('Log in to your Google account to proceed.');
      console.log('Waiting...');
      while (!page.url().startsWith('https://docs.google.com/')) {
        await page.waitForTimeout(1000);
      }
    }
    console.log('Success! Storing Google cookies.');
    saveGoogleCookies(context);
  } finally {
    await context.close();
  }
}

/**
 * Import a docx file into Google Docs. Call this function with the page
 * provided by withGoogleDocs().
 */
async function importDocxToGoogleDocs(page: Page, docxPath: string) {
  await page.getByLabel('Blank document').click();
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Open' }).click();

  const dialog = page.getByRole('dialog', { name: 'Open a file' }).frameLocator('iframe');
  await dialog.getByRole('tab', { name: 'Upload' }).click();

  const fileChooserPromise = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Browse' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(docxPath);

  await page.waitForTimeout(10000);
}
