/**
 * Downloads all test documents from R2.
 * Auto-discovers everything under the documents/ prefix — no hardcoded list.
 * Downloads to test-data/ preserving the folder structure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { createR2Client, DOCUMENTS_PREFIX } from './r2.js';

const TEST_DATA_DIR = path.resolve(import.meta.dirname, '../test-data');

async function listDocuments(client: any, bucket: string) {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `${DOCUMENTS_PREFIX}/`,
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

  console.log('Listing documents in R2...');
  const keys = await listDocuments(client, bucket);

  if (keys.length === 0) {
    console.log('No documents found in R2.');
    process.exit(0);
  }

  console.log(`Found ${keys.length} documents.`);

  let downloaded = 0;
  let skipped = 0;

  for (const key of keys) {
    const relative = key.slice(`${DOCUMENTS_PREFIX}/`.length);
    const dest = path.join(TEST_DATA_DIR, relative);

    if (fs.existsSync(dest)) {
      skipped++;
      continue;
    }

    try {
      await downloadFile(client, bucket, key, dest);
      downloaded++;
      console.log(`  ✓ ${relative}`);
    } catch (err: any) {
      console.error(`  ✗ ${relative}: ${err.message}`);
    }
  }

  console.log(`\nDone. Downloaded: ${downloaded}, Cached: ${skipped}`);
  client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
