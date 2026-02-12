import fs from 'node:fs';
import path from 'node:path';
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { createR2Client, BASELINES_PREFIX } from './r2.js';

const TESTS_DIR = path.resolve(import.meta.dirname, '../tests');

async function listObjects(client: any, bucket: string) {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `${BASELINES_PREFIX}/`,
        ContinuationToken: continuationToken,
      }),
    );

    for (const item of response.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function downloadFile(client: any, bucket: string, key: string, dest: string) {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

  const bytes = await response.Body!.transformToByteArray();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes);
}

async function main() {
  const { client, bucket } = createR2Client();

  console.log('Listing baselines in R2...');
  const keys = await listObjects(client, bucket);

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
        await downloadFile(client, bucket, key, dest);
        downloaded++;
        console.log(`  ✓ ${relative}`);
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
