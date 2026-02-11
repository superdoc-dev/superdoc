/**
 * Migrate from old two-bucket setup to unified superdoc-visual-testing bucket.
 *
 * This script:
 * 1. Copies baselines from old baselines bucket (visual-baselines/latest/*)
 *    → new bucket (baselines/*)
 * 2. Copies documents from old corpus bucket (old paths)
 *    → new bucket (documents/<new-category-path>)
 *
 * Requires both old and new env vars to be set:
 *   OLD: SD_TESTING_R2_ACCOUNT_ID, SD_TESTING_R2_BASELINES_BUCKET_NAME,
 *        SD_TESTING_R2_BUCKET_NAME, SD_TESTING_R2_ACCESS_KEY_ID, SD_TESTING_R2_SECRET_ACCESS_KEY
 *   NEW: SD_VISUAL_TESTING_R2_BUCKET (same account + credentials)
 *
 * Usage: tsx scripts/migrate-to-unified-bucket.ts
 */
import 'dotenv/config';
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const DOCUMENT_MAPPING: Record<string, string> = {
  // rendering
  'basic/advanced-text.docx': 'documents/rendering/advanced-text.docx',
  'basic/advanced-tables.docx': 'documents/rendering/advanced-tables.docx',

  // behavior/basic-commands
  'pagination/h_f-normal-odd-even.docx': 'documents/behavior/basic-commands/h_f-normal-odd-even.docx',

  // behavior/formatting
  'other/sd-1778-apply-font.docx': 'documents/behavior/formatting/sd-1778-apply-font.docx',
  'styles/sd-1727-formatting-lost.docx': 'documents/behavior/formatting/sd-1727-formatting-lost.docx',

  // behavior/comments-tcs
  'comments-tcs/tracked-changes.docx': 'documents/behavior/comments-tcs/tracked-changes.docx',
  'comments-tcs/gdocs-comment-on-change.docx': 'documents/behavior/comments-tcs/gdocs-comment-on-change.docx',
  'comments-tcs/nested-comments-gdocs.docx': 'documents/behavior/comments-tcs/nested-comments-gdocs.docx',
  'comments-tcs/nested-comments-word.docx': 'documents/behavior/comments-tcs/nested-comments-word.docx',
  'comments-tcs/sd-tracked-style-change.docx': 'documents/behavior/comments-tcs/sd-tracked-style-change.docx',

  // behavior/lists
  'lists/sd-1543-empty-list-items.docx': 'documents/behavior/lists/sd-1543-empty-list-items.docx',
  'lists/sd-1658-lists-same-level.docx': 'documents/behavior/lists/sd-1658-lists-same-level.docx',

  // behavior/headers
  'basic/longer-header.docx': 'documents/behavior/headers/longer-header.docx',

  // behavior/importing
  'fldchar/sd-1558-fld-char-issue.docx': 'documents/behavior/importing/sd-1558-fld-char-issue.docx',
};

function createClient() {
  const accountId = process.env.SD_TESTING_R2_ACCOUNT_ID;
  const accessKeyId = process.env.SD_TESTING_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SD_TESTING_R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing R2 credentials (SD_TESTING_R2_*)');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function listAllObjects(client: S3Client, bucket: string, prefix: string) {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
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

async function copyObject(client: S3Client, srcBucket: string, srcKey: string, dstBucket: string, dstKey: string) {
  const response = await client.send(new GetObjectCommand({ Bucket: srcBucket, Key: srcKey }));
  const bytes = await response.Body!.transformToByteArray();

  await client.send(
    new PutObjectCommand({
      Bucket: dstBucket,
      Key: dstKey,
      Body: bytes,
      ContentType: response.ContentType,
    }),
  );
}

async function main() {
  const oldBaselinesBucket = process.env.SD_TESTING_R2_BASELINES_BUCKET_NAME;
  const oldCorpusBucket = process.env.SD_TESTING_R2_BUCKET_NAME;
  const newBucket = process.env.SD_VISUAL_TESTING_R2_BUCKET;

  if (!oldBaselinesBucket || !oldCorpusBucket || !newBucket) {
    throw new Error(
      'Need: SD_TESTING_R2_BASELINES_BUCKET_NAME, SD_TESTING_R2_BUCKET_NAME, SD_VISUAL_TESTING_R2_BUCKET',
    );
  }

  const client = createClient();

  // --- Migrate baselines ---
  console.log('=== Migrating baselines ===');
  const OLD_PREFIX = 'visual-baselines/latest/';
  const baselineKeys = await listAllObjects(client, oldBaselinesBucket, OLD_PREFIX);
  console.log(`Found ${baselineKeys.length} baselines.`);

  for (const key of baselineKeys) {
    const relative = key.slice(OLD_PREFIX.length);
    const newKey = `baselines/${relative}`;
    await copyObject(client, oldBaselinesBucket, key, newBucket, newKey);
    console.log(`  ✓ ${key} → ${newKey}`);
  }

  // --- Migrate documents ---
  console.log('\n=== Migrating documents ===');
  for (const [oldKey, newKey] of Object.entries(DOCUMENT_MAPPING)) {
    try {
      await copyObject(client, oldCorpusBucket, oldKey, newBucket, newKey);
      console.log(`  ✓ ${oldKey} → ${newKey}`);
    } catch (err: any) {
      console.error(`  ✗ ${oldKey}: ${err.message}`);
    }
  }

  console.log('\nMigration complete.');
  client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
