import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../../test-config.js';
import { goToPageAndWaitForEditor } from '../helpers.js';
import { isValidDocxFilename, loadDocumentsFromFolders } from './doc-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fileArg = process.env.VISUAL_FILE || process.env.LAYOUT_FILE || process.env.FILE;
const compareAll = process.env.LAYOUT_COMPARE === '1';

const ignore = new Set(config.ignoreDocuments || []);
const folders = [
  { key: 'basic-documents', folder: config.basicDocumentsFolder },
  { key: 'comments-documents', folder: config.commentsDocumentsFolder },
];

const loadDocs = () => loadDocumentsFromFolders(folders, ignore);

let docsToRun = [];

if (fileArg) {
  const fileBaseName = path.basename(fileArg);
  if (!isValidDocxFilename(fileBaseName, ignore)) {
    throw new Error(`Invalid document file "${fileArg}". Only .docx files that do not start with "." are supported.`);
  }
  docsToRun = [
    {
      id: path.basename(fileArg, path.extname(fileArg)),
      filePath: fileArg,
    },
  ];
} else if (compareAll) {
  docsToRun = loadDocs();
}

if (!docsToRun.length) {
  test.describe.skip('layout compare (layout=1)', () => {
    test('skipped: set LAYOUT_COMPARE=1 or provide VISUAL_FILE', () => {});
  });
} else {
  test.describe('layout compare (layout=1)', () => {
    docsToRun.forEach(({ id, filePath }) => {
      const resolvedFilePath = path.resolve(process.cwd(), filePath);
      const fileName = path.basename(resolvedFilePath);
      const folderName = path.basename(path.dirname(resolvedFilePath));

      if (!fs.existsSync(resolvedFilePath)) {
        throw new Error(`File not found: ${resolvedFilePath}`);
      }

      const specSnapshotMap = {
        'basic-documents': 'basic-documents.spec.js-snapshots',
        'comments-documents': 'comments.spec.js-snapshots',
      };

      const sourceSnapshotFolder = specSnapshotMap[folderName];
      if (!sourceSnapshotFolder) {
        throw new Error(
          `No snapshot mapping for folder "${folderName}". Add it to specSnapshotMap in layout-compare.spec.js.`,
        );
      }

      const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
      const baseName = `${folderName}-${fileName.replace(/\./g, '-')}-1`;
      const sourceSnapshot = path.resolve(__dirname, sourceSnapshotFolder, `${baseName}-chromium-${platform}.png`);
      const targetSnapshotDir = path.resolve(__dirname, 'layout-compare.spec.js-snapshots');
      const targetSnapshot = path.join(targetSnapshotDir, `${baseName}-chromium-${platform}.png`);

      if (!fs.existsSync(sourceSnapshot)) {
        throw new Error(`Baseline snapshot not found at ${sourceSnapshot}. Run the main suite to generate it first.`);
      }

      if (!fs.existsSync(targetSnapshot)) {
        fs.mkdirSync(targetSnapshotDir, { recursive: true });
        fs.copyFileSync(sourceSnapshot, targetSnapshot);
      }

      test(id || fileName, async ({ page }) => {
        test.setTimeout(60_000);

        await goToPageAndWaitForEditor(page, { layout: 1 });
        await page.locator('input[type="file"]').setInputFiles(resolvedFilePath);

        await page.waitForFunction(() => window.superdoc !== undefined && window.editor !== undefined, null, {
          polling: 100,
          timeout: 10_000,
        });

        await expect(page).toHaveScreenshot({
          name: `${baseName}.png`,
          fullPage: true,
          timeout: 30_000,
        });
      });
    });
  });
}
