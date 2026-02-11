import 'dotenv/config';
import { S3Client } from '@aws-sdk/client-s3';

export const BASELINES_PREFIX = 'baselines';
export const DOCUMENTS_PREFIX = 'documents';

export function createR2Client() {
  const accountId = process.env.SD_VISUAL_TESTING_R2_ACCOUNT_ID;
  const bucket = process.env.SD_VISUAL_TESTING_R2_BUCKET;
  const accessKeyId = process.env.SD_VISUAL_TESTING_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SD_VISUAL_TESTING_R2_SECRET_ACCESS_KEY;

  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing R2 env vars. Need: SD_VISUAL_TESTING_R2_ACCOUNT_ID, SD_VISUAL_TESTING_R2_BUCKET, SD_VISUAL_TESTING_R2_ACCESS_KEY_ID, SD_VISUAL_TESTING_R2_SECRET_ACCESS_KEY',
    );
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return { client, bucket };
}
