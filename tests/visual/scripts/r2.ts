import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

export const BASELINES_PREFIX = 'baselines';
export const DOCUMENTS_PREFIX = 'documents';

const ACCOUNT_ID = 'afc2655a510195709ae6fa06772d73f2';
const BUCKET = 'superdoc-visual-testing';

export interface R2Client {
  listObjects(prefix: string): Promise<string[]>;
  getObject(key: string, dest: string): Promise<void>;
  putObject(key: string, filePath: string, contentType: string): Promise<void>;
  copyObject(sourceKey: string, destKey: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  destroy(): void;
}

// --- S3 backend (CI / explicit credentials) ---

async function createS3Client(): Promise<R2Client> {
  const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } =
    await import('@aws-sdk/client-s3');

  const accessKeyId = process.env.SD_VISUAL_TESTING_R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.SD_VISUAL_TESTING_R2_SECRET_ACCESS_KEY!;

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return {
    async listObjects(prefix: string) {
      const keys: string[] = [];
      let continuationToken: string | undefined;

      do {
        const response = await s3.send(
          new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: `${prefix}/`,
            ContinuationToken: continuationToken,
          }),
        );

        for (const item of response.Contents ?? []) {
          if (item.Key) keys.push(item.Key);
        }

        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
      } while (continuationToken);

      return keys;
    },

    async getObject(key: string, dest: string) {
      const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      const bytes = await response.Body!.transformToByteArray();
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, bytes);
    },

    async putObject(key: string, filePath: string, contentType: string) {
      const body = fs.readFileSync(filePath);
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
    },

    async copyObject(sourceKey: string, destKey: string) {
      await s3.send(new CopyObjectCommand({ Bucket: BUCKET, CopySource: `${BUCKET}/${sourceKey}`, Key: destKey }));
    },

    async deleteObject(key: string) {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    },

    destroy() {
      s3.destroy();
    },
  };
}

// --- Wrangler backend (local dev via `wrangler login`) ---

function getWranglerOAuthToken(): string {
  const configPaths =
    process.platform === 'darwin'
      ? [path.join(os.homedir(), 'Library/Preferences/.wrangler/config/default.toml')]
      : [path.join(os.homedir(), '.config/.wrangler/config/default.toml')];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const match = content.match(/^oauth_token\s*=\s*"(.+)"/m);
      if (match) return match[1];
    }
  }

  throw new Error(
    'No wrangler OAuth token found. Run `npx wrangler login` to authenticate, or set R2 credentials in .env.',
  );
}

async function wranglerExec(args: string[]): Promise<string> {
  const { stdout } = await execFile('npx', ['wrangler', ...args], {
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
    maxBuffer: 50 * 1024 * 1024,
  });
  return stdout;
}

async function createWranglerClient(): Promise<R2Client> {
  const token = getWranglerOAuthToken();

  return {
    async listObjects(prefix: string) {
      const keys: string[] = [];
      let cursor: string | undefined;

      do {
        const params = new URLSearchParams({ prefix: `${prefix}/` });
        if (cursor) params.set('cursor', cursor);

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects?${params}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Cloudflare API error (${response.status}): ${body}`);
        }

        const data = (await response.json()) as {
          result: { key: string }[];
          result_info?: { cursor?: string };
        };

        for (const item of data.result ?? []) {
          keys.push(item.key);
        }

        cursor = data.result_info?.cursor;
      } while (cursor);

      return keys;
    },

    async getObject(key: string, dest: string) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await wranglerExec(['r2', 'object', 'get', `${BUCKET}/${key}`, '--file', dest, '--remote']);
    },

    async putObject(key: string, filePath: string, contentType: string) {
      await wranglerExec([
        'r2',
        'object',
        'put',
        `${BUCKET}/${key}`,
        '--file',
        filePath,
        '--content-type',
        contentType,
        '--remote',
      ]);
    },

    async copyObject(sourceKey: string, destKey: string) {
      // Wrangler doesn't have a copy command — download then re-upload
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-copy-'));
      const tmpFile = path.join(tmpDir, 'tmp');
      try {
        await wranglerExec(['r2', 'object', 'get', `${BUCKET}/${sourceKey}`, '--file', tmpFile, '--remote']);
        await wranglerExec(['r2', 'object', 'put', `${BUCKET}/${destKey}`, '--file', tmpFile, '--remote']);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },

    async deleteObject(key: string) {
      await wranglerExec(['r2', 'object', 'delete', `${BUCKET}/${key}`, '--remote']);
    },

    destroy() {},
  };
}

// --- Factory ---

/**
 * Check R2 auth before running interactive prompts.
 * Throws with a helpful message if neither S3 creds nor wrangler login are available.
 */
export function ensureR2Auth(): void {
  if (process.env.SD_VISUAL_TESTING_R2_ACCESS_KEY_ID) return;
  // Will throw if no wrangler token is found
  getWranglerOAuthToken();
}

export async function createR2Client(): Promise<R2Client> {
  if (process.env.SD_VISUAL_TESTING_R2_ACCESS_KEY_ID) {
    return createS3Client();
  }

  return createWranglerClient();
}
