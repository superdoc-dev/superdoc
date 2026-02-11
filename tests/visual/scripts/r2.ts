import 'dotenv/config';
import { S3Client } from '@aws-sdk/client-s3';

const R2_PREFIX = 'visual-baselines/latest';

export function createR2Client() {
  const accountId = process.env.SD_TESTING_R2_ACCOUNT_ID;
  const bucketName = process.env.SD_TESTING_R2_BASELINES_BUCKET_NAME;
  const accessKeyId = process.env.SD_TESTING_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SD_TESTING_R2_SECRET_ACCESS_KEY;

  if (!accountId || !bucketName || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing R2 env vars. Need: SD_TESTING_R2_ACCOUNT_ID, SD_TESTING_R2_BASELINES_BUCKET_NAME, SD_TESTING_R2_ACCESS_KEY_ID, SD_TESTING_R2_SECRET_ACCESS_KEY',
    );
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return { client, bucketName };
}

export { R2_PREFIX };
