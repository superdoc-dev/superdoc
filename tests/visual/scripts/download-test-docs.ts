/**
 * Downloads test documents from R2 corpus bucket for visual tests.
 * Uses SD_TESTING_R2_BUCKET_NAME (corpus bucket, separate from baselines bucket).
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const TEST_DATA_DIR = path.resolve(import.meta.dirname, '../test-data');

/**
 * Documents needed by visual tests.
 * Keys match the R2 object paths in the corpus bucket.
 */
const DOCUMENTS = [
  // rendering + basic-commands
  'basic/advanced-text.docx',
  'basic/advanced-tables.docx',
  'pagination/h_f-normal-odd-even.docx',

  // formatting
  'other/sd-1778-apply-font.docx',
  'styles/sd-1727-formatting-lost.docx',

  // comments-tcs
  'comments-tcs/tracked-changes.docx',
  'comments-tcs/gdocs-comment-on-change.docx',
  'comments-tcs/nested-comments-gdocs.docx',
  'comments-tcs/nested-comments-word.docx',
  'comments-tcs/sd-tracked-style-change.docx',

  // lists
  'lists/sd-1543-empty-list-items.docx',
  'lists/sd-1658-lists-same-level.docx',

  // headers / search
  'basic/longer-header.docx',

  // importing
  'fldchar/sd-1558-fld-char-issue.docx',
];

function createCorpusClient() {
  const accountId = process.env.SD_TESTING_R2_ACCOUNT_ID;
  const bucketName = process.env.SD_TESTING_R2_BUCKET_NAME;
  const accessKeyId = process.env.SD_TESTING_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SD_TESTING_R2_SECRET_ACCESS_KEY;

  if (!accountId || !bucketName || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing R2 env vars. Need: SD_TESTING_R2_ACCOUNT_ID, SD_TESTING_R2_BUCKET_NAME, SD_TESTING_R2_ACCESS_KEY_ID, SD_TESTING_R2_SECRET_ACCESS_KEY',
    );
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return { client, bucketName };
}

async function downloadFile(client: S3Client, bucketName: string, key: string, dest: string) {
  const response = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
  const bytes = await response.Body!.transformToByteArray();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes);
}

async function main() {
  const { client, bucketName } = createCorpusClient();

  console.log(`Downloading ${DOCUMENTS.length} test documents from R2...`);

  let downloaded = 0;
  let skipped = 0;

  for (const docPath of DOCUMENTS) {
    const dest = path.join(TEST_DATA_DIR, docPath);

    if (fs.existsSync(dest)) {
      skipped++;
      continue;
    }

    try {
      await downloadFile(client, bucketName, docPath, dest);
      downloaded++;
      console.log(`  ✓ ${docPath}`);
    } catch (err: any) {
      console.error(`  ✗ ${docPath}: ${err.message}`);
    }
  }

  console.log(`\nDone. Downloaded: ${downloaded}, Skipped (cached): ${skipped}`);
  client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
