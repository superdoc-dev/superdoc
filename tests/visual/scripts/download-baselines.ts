import path from 'node:path';
import { createR2Client, BASELINES_PREFIX } from './r2.js';

const TESTS_DIR = path.resolve(import.meta.dirname, '../tests');

async function main() {
  const client = await createR2Client();

  console.log('Listing baselines in R2...');
  const keys = await client.listObjects(BASELINES_PREFIX);

  if (keys.length === 0) {
    console.log('No baselines found in R2. Run upload-baselines first.');
    process.exit(1);
  }

  console.log(`Downloading ${keys.length} snapshots...`);

  const CONCURRENCY = 10;
  let downloaded = 0;

  const items = keys.map((key) => ({
    key,
    relative: key.slice(`${BASELINES_PREFIX}/`.length),
    dest: path.join(TESTS_DIR, key.slice(`${BASELINES_PREFIX}/`.length)),
  }));

  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async ({ key, relative, dest }) => {
        await client.getObject(key, dest);
        downloaded++;
        console.log(`  \u2713 ${relative}`);
      }),
    );
  }

  console.log(`\nDone. Downloaded: ${downloaded} snapshots.`);
  client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
