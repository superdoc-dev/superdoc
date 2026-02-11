import fs from 'node:fs';
import path from 'node:path';
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { createR2Client, R2_PREFIX } from './r2.js';

const TESTS_DIR = path.resolve(import.meta.dirname, '../tests');

async function listObjects(client: any, bucketName: string) {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: `${R2_PREFIX}/`,
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

async function downloadFile(client: any, bucketName: string, key: string, dest: string) {
  const response = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));

  const bytes = await response.Body!.transformToByteArray();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes);
}

async function main() {
  const { client, bucketName } = createR2Client();

  console.log('Listing baselines in R2...');
  const keys = await listObjects(client, bucketName);

  if (keys.length === 0) {
    console.log('No baselines found in R2. Run upload-baselines first.');
    process.exit(1);
  }

  console.log(`Downloading ${keys.length} snapshots...`);

  for (const key of keys) {
    const relative = key.slice(`${R2_PREFIX}/`.length);
    const dest = path.join(TESTS_DIR, relative);

    await downloadFile(client, bucketName, key, dest);
    console.log(`  ✓ ${relative}`);
  }

  console.log('\nDone.');
  client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
