#!/usr/bin/env tsx

/**
 * One-time migration script: copies R2 objects from old prefixes to new ones.
 *
 *   baselines/*              → rendering/*
 *   baselines-interactions/* → behavior/*
 *
 * Does NOT delete the old prefixes — clean them up manually after migration is verified.
 *
 * Usage:
 *   pnpm exec tsx scripts/migrate-r2-prefixes.ts            # dry-run (default)
 *   pnpm exec tsx scripts/migrate-r2-prefixes.ts --apply     # actually copy
 */

import { S3Client, ListObjectsV2Command, CopyObjectCommand } from '@aws-sdk/client-s3';
import { colors } from './terminal.js';

const MIGRATIONS: Array<{ from: string; to: string }> = [
  { from: 'baselines', to: 'rendering' },
  { from: 'baselines-interactions', to: 'behavior' },
];

const CONCURRENCY = 6;

function createClient(): { client: S3Client; bucket: string } {
  const accountId = process.env.SD_TESTING_R2_ACCOUNT_ID ?? '';
  const bucket = process.env.SD_TESTING_R2_BASELINES_BUCKET_NAME ?? '';
  const accessKeyId = process.env.SD_TESTING_R2_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.SD_TESTING_R2_SECRET_ACCESS_KEY ?? '';

  if (!accountId) throw new Error('Missing SD_TESTING_R2_ACCOUNT_ID');
  if (!bucket) throw new Error('Missing SD_TESTING_R2_BASELINES_BUCKET_NAME');
  if (!accessKeyId) throw new Error('Missing SD_TESTING_R2_ACCESS_KEY_ID');
  if (!secretAccessKey) throw new Error('Missing SD_TESTING_R2_SECRET_ACCESS_KEY');

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return { client, bucket };
}

async function listAllKeys(client: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `${prefix}/`,
        ContinuationToken: token,
      }),
    );
    for (const item of res.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return keys;
}

async function copyObjects(
  client: S3Client,
  bucket: string,
  keys: string[],
  fromPrefix: string,
  toPrefix: string,
  dryRun: boolean,
): Promise<number> {
  let copied = 0;
  let index = 0;

  const work = async () => {
    while (index < keys.length) {
      const key = keys[index++];
      const newKey = `${toPrefix}${key.slice(fromPrefix.length)}`;

      if (dryRun) {
        copied++;
        continue;
      }

      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${key}`,
          Key: newKey,
        }),
      );
      copied++;

      if (copied % 50 === 0 || copied === keys.length) {
        console.log(`  Copied ${copied}/${keys.length}`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, keys.length || 1) }, work));

  return copied;
}

async function main(): Promise<void> {
  const dryRun = !process.argv.includes('--apply');

  if (dryRun) {
    console.log(colors.warning('DRY RUN — pass --apply to actually copy objects.\n'));
  }

  const { client, bucket } = createClient();

  for (const { from, to } of MIGRATIONS) {
    console.log(colors.info(`\nMigrating: ${from}/ → ${to}/`));
    const keys = await listAllKeys(client, bucket, from);

    if (keys.length === 0) {
      console.log(`  No objects found under ${from}/. Skipping.`);
      continue;
    }

    console.log(`  Found ${keys.length} object(s) under ${from}/`);
    const copied = await copyObjects(client, bucket, keys, from, to, dryRun);
    const verb = dryRun ? 'Would copy' : 'Copied';
    console.log(colors.success(`  ${verb} ${copied} object(s) to ${to}/`));
  }

  client.destroy();
  console.log(colors.info('\nDone. Old prefixes were NOT deleted — clean up manually when ready.'));
}

main().catch((error) => {
  console.error(colors.error(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
