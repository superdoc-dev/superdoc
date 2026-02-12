/**
 * Downloads all test documents from R2.
 * Auto-discovers everything under the documents/ prefix — no hardcoded list.
 * Downloads to test-data/ preserving the folder structure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createR2Client, ensureR2Auth, DOCUMENTS_PREFIX } from './r2.js';

const TEST_DATA_DIR = path.resolve(import.meta.dirname, '../test-data');

async function main() {
  ensureR2Auth();

  const client = await createR2Client();

  console.log('Listing documents in R2...');
  const keys = await client.listObjects(DOCUMENTS_PREFIX);

  if (keys.length === 0) {
    console.log('No documents found in R2.');
    process.exit(0);
  }

  const quiet = !!process.env.CI;
  console.log(`Found ${keys.length} documents.`);

  const toDownload: { key: string; relative: string; dest: string }[] = [];
  let skipped = 0;

  for (const key of keys) {
    const relative = key.slice(`${DOCUMENTS_PREFIX}/`.length);
    const dest = path.join(TEST_DATA_DIR, relative);

    if (fs.existsSync(dest)) {
      skipped++;
    } else {
      toDownload.push({ key, relative, dest });
    }
  }

  console.log(`Downloading ${toDownload.length} files (${skipped} cached)...`);

  const CONCURRENCY = 10;
  let downloaded = 0;
  let failed = 0;

  for (let i = 0; i < toDownload.length; i += CONCURRENCY) {
    const batch = toDownload.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async ({ key, relative, dest }) => {
        await client.getObject(key, dest);
        downloaded++;
        if (!quiet) console.log(`  ✓ ${relative}`);
      }),
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'rejected') {
        failed++;
        if (!quiet) console.error(`  ✗ ${batch[j].relative}: ${(results[j] as PromiseRejectedResult).reason?.message}`);
      }
    }
  }

  console.log(`\nDone. Downloaded: ${downloaded}, Cached: ${skipped}, Failed: ${failed}`);
  client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
