/**
 * R2 baseline storage utilities.
 * Handles uploading and downloading visual testing baselines to/from Cloudflare R2.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

/** Content-Type mapping for baseline file uploads. */
const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.json': 'application/json',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.txt': 'text/plain',
};

/** Default local cache directory for downloaded baselines. */
const DEFAULT_BASELINES_CACHE_DIR = path.join(os.tmpdir(), 'superdoc-baselines-cache');

/**
 * Normalize a file path to use forward slashes and remove leading ./ or /.
 *
 * @param value - Path to normalize
 * @returns Normalized path string
 */
function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
}

/**
 * Normalize an S3 prefix by removing trailing slashes.
 *
 * @param value - Prefix to normalize
 * @returns Normalized prefix without trailing slashes
 */
function normalizePrefix(value: string): string {
  return normalizePath(value).replace(/\/+$/, '');
}

/**
 * Recursively walk a directory and call a callback for each file.
 *
 * @param dir - Directory to walk
 * @param onFile - Callback invoked with each file's absolute path
 */
function walk(dir: string, onFile: (filePath: string) => void): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, onFile);
    } else if (entry.isFile()) {
      onFile(fullPath);
    }
  }
}

/**
 * Write an S3 response body to a local file.
 * Handles various body types returned by AWS SDK.
 *
 * @param body - S3 response body
 * @param destination - Local file path to write to
 * @throws {Error} If body is empty or unsupported type
 */
async function writeBodyToFile(body: unknown, destination: string): Promise<void> {
  if (!body) {
    throw new Error('Empty response body');
  }

  if (Buffer.isBuffer(body)) {
    fs.writeFileSync(destination, body);
    return;
  }

  if (body instanceof Uint8Array) {
    fs.writeFileSync(destination, body);
    return;
  }

  if (typeof body === 'string') {
    fs.writeFileSync(destination, body);
    return;
  }

  const maybeTransform = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof maybeTransform.transformToByteArray === 'function') {
    const bytes = await maybeTransform.transformToByteArray();
    fs.writeFileSync(destination, Buffer.from(bytes));
    return;
  }

  const asyncBody = body as AsyncIterable<Uint8Array>;
  if (typeof asyncBody[Symbol.asyncIterator] === 'function') {
    const stream = Readable.from(asyncBody);
    await pipeline(stream, fs.createWriteStream(destination));
    return;
  }

  throw new Error('Unsupported response body type');
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 *
 * @param pathName - Directory path to ensure
 */
function ensureDir(pathName: string): void {
  if (!fs.existsSync(pathName)) {
    fs.mkdirSync(pathName, { recursive: true });
  }
}

/**
 * Resolve the baseline cache root directory.
 * Uses cacheRoot if provided, otherwise checks R2_BASELINES_CACHE_DIR env var,
 * otherwise uses system temp directory.
 *
 * @param cacheRoot - Optional custom cache root
 * @returns Resolved cache root directory path
 */
function resolveBaselineCacheRoot(cacheRoot?: string): string {
  return cacheRoot ?? process.env.R2_BASELINES_CACHE_DIR ?? DEFAULT_BASELINES_CACHE_DIR;
}

/**
 * Get the local root directory for a baseline prefix.
 *
 * @param prefix - Baseline prefix (e.g., 'baselines' or 'baselines-interactions')
 * @param cacheRoot - Optional custom cache root
 * @returns Local directory path for the baseline
 */
export function getBaselineLocalRoot(prefix: string, cacheRoot?: string): string {
  const resolvedPrefix = normalizePrefix(prefix);
  const root = resolveBaselineCacheRoot(cacheRoot);
  return path.join(root, resolvedPrefix);
}

/**
 * Create an R2 S3 client configured from environment variables.
 * Requires SD_TESTING_R2_ACCOUNT_ID, SD_TESTING_R2_BASELINES_BUCKET_NAME,
 * SD_TESTING_R2_ACCESS_KEY_ID, and SD_TESTING_R2_SECRET_ACCESS_KEY.
 *
 * @returns Object with S3 client and bucket name
 * @throws {Error} If required environment variables are missing
 */
export function createR2Client(): { client: S3Client; bucketName: string } {
  const accountId = process.env.SD_TESTING_R2_ACCOUNT_ID ?? '';
  const bucketName = process.env.SD_TESTING_R2_BASELINES_BUCKET_NAME ?? '';
  const accessKeyId = process.env.SD_TESTING_R2_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.SD_TESTING_R2_SECRET_ACCESS_KEY ?? '';

  if (!accountId) throw new Error('Missing SD_TESTING_R2_ACCOUNT_ID');
  if (!bucketName) throw new Error('Missing SD_TESTING_R2_BASELINES_BUCKET_NAME');
  if (!accessKeyId) throw new Error('Missing SD_TESTING_R2_ACCESS_KEY_ID');
  if (!secretAccessKey) throw new Error('Missing SD_TESTING_R2_SECRET_ACCESS_KEY');

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return { client, bucketName };
}

/**
 * List all baseline versions available in R2 for a given prefix.
 *
 * @param prefix - Baseline prefix (e.g., 'baselines')
 * @returns Array of version strings (e.g., ['v.1.5.0', 'v.1.4.0']), sorted newest first
 */
export async function listBaselineVersions(prefix: string): Promise<string[]> {
  const { client, bucketName } = createR2Client();
  const normalizedPrefix = normalizePrefix(prefix);
  const listPrefix = normalizedPrefix ? `${normalizedPrefix}/` : '';
  const versions = new Set<string>();

  let continuationToken: string | undefined;
  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: listPrefix,
        Delimiter: '/',
        ContinuationToken: continuationToken,
      }),
    );

    for (const common of response.CommonPrefixes ?? []) {
      const value = common.Prefix ?? '';
      if (!value.startsWith(listPrefix)) continue;
      const remainder = value.slice(listPrefix.length).replace(/\/$/, '');
      if (remainder.startsWith('v.')) {
        versions.add(remainder);
      }
    }

    if (response.Contents && response.Contents.length > 0) {
      for (const item of response.Contents) {
        const key = item.Key ?? '';
        if (!key.startsWith(listPrefix)) continue;
        const remainder = key.slice(listPrefix.length);
        const [version] = remainder.split('/');
        if (version && version.startsWith('v.')) {
          versions.add(version);
        }
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return Array.from(versions).sort().reverse();
}

/**
 * Get the latest baseline version available in R2.
 *
 * @param prefix - Baseline prefix (e.g., 'baselines')
 * @returns Latest version string, or null if no baselines exist
 */
export async function getLatestBaselineVersion(prefix: string): Promise<string | null> {
  const versions = await listBaselineVersions(prefix);
  return versions.length > 0 ? versions[0] : null;
}

/**
 * List all objects under an S3 prefix, handling pagination.
 *
 * @param prefix - S3 prefix to list
 * @param client - S3 client instance
 * @param bucketName - Bucket name
 * @returns Array of object keys
 */
async function listObjects(prefix: string, client: S3Client, bucketName: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const item of response.Contents ?? []) {
      if (item.Key) {
        keys.push(item.Key);
      }
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

/**
 * Download a single S3 object to a local file.
 *
 * @param client - S3 client instance
 * @param bucketName - Bucket name
 * @param key - Object key
 * @param destination - Local file path to write to
 * @throws {Error} If the object has no body
 */
async function downloadObject(client: S3Client, bucketName: string, key: string, destination: string): Promise<void> {
  const response = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
  if (!response.Body) {
    throw new Error(`Missing body for s3://${bucketName}/${key}`);
  }
  await writeBodyToFile(response.Body, destination);
}

/**
 * Run an async worker function over items with limited concurrency.
 *
 * @param items - Items to process
 * @param limit - Maximum concurrent workers
 * @param worker - Async function to run for each item
 */
async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const runners = Array.from({ length: Math.max(1, limit) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await worker(current);
    }
  });
  await Promise.all(runners);
}

/**
 * Ensure a baseline version is downloaded locally, fetching from R2 if needed.
 *
 * @param options.prefix - Baseline prefix (e.g., 'baselines')
 * @param options.version - Version to download (e.g., 'v.1.5.0')
 * @param options.localRoot - Optional custom local root directory
 * @param options.cacheRoot - Optional custom cache root directory
 * @param options.force - If true, re-download even if already cached
 * @returns Object with baselineRoot, localVersionDir, downloaded count, and fromCache flag
 * @throws {Error} If no baseline objects found at the specified prefix/version
 */
export async function ensureBaselineDownloaded(options: {
  prefix: string;
  version: string;
  localRoot?: string;
  cacheRoot?: string;
  force?: boolean;
}): Promise<{ baselineRoot: string; localVersionDir: string; downloaded: number; fromCache: boolean }> {
  const normalizedPrefix = normalizePrefix(options.prefix);
  const localRoot = options.localRoot ?? getBaselineLocalRoot(normalizedPrefix, options.cacheRoot);
  const version = options.version;
  const localVersionDir = path.join(localRoot, version);
  const markerPath = path.join(localVersionDir, '.r2complete');
  const force = options.force || process.env.R2_BASELINES_FORCE_DOWNLOAD === '1';
  const { client, bucketName } = createR2Client();

  if (!force && fs.existsSync(markerPath)) {
    return { baselineRoot: localRoot, localVersionDir, downloaded: 0, fromCache: true };
  }

  if (fs.existsSync(localVersionDir)) {
    fs.rmSync(localVersionDir, { recursive: true, force: true });
  }
  ensureDir(localVersionDir);

  const remotePrefix = `${normalizedPrefix}/${version}/`;
  const keys = await listObjects(remotePrefix, client, bucketName);

  if (keys.length === 0) {
    throw new Error(`No baseline objects found at ${remotePrefix}`);
  }

  let downloaded = 0;
  await runWithConcurrency(keys, 6, async (key) => {
    const relative = key.startsWith(`${normalizedPrefix}/`) ? key.slice(normalizedPrefix.length + 1) : key;
    const destination = path.join(localRoot, relative);
    ensureDir(path.dirname(destination));
    await downloadObject(client, bucketName, key, destination);
    downloaded += 1;
  });

  fs.writeFileSync(
    markerPath,
    JSON.stringify(
      {
        version,
        prefix: normalizedPrefix,
        downloadedAt: new Date().toISOString(),
        files: downloaded,
      },
      null,
      2,
    ),
  );

  return { baselineRoot: localRoot, localVersionDir, downloaded, fromCache: false };
}

/**
 * Upload a local directory to R2, preserving folder structure.
 *
 * @param options.localDir - Local directory to upload
 * @param options.remotePrefix - R2 prefix to upload to
 * @returns Number of files uploaded
 * @throws {Error} If the local directory does not exist
 */
export async function uploadDirectoryToR2(options: { localDir: string; remotePrefix: string }): Promise<number> {
  const { client, bucketName } = createR2Client();
  const { localDir, remotePrefix } = options;

  if (!fs.existsSync(localDir)) {
    throw new Error(`Baseline directory not found: ${localDir}`);
  }

  const normalizedPrefix = normalizePath(remotePrefix);
  let uploaded = 0;
  const files: string[] = [];

  walk(localDir, (filePath) => files.push(filePath));

  for (const filePath of files) {
    const relative = normalizePath(path.relative(localDir, filePath));
    const key = normalizedPrefix ? `${normalizedPrefix}/${relative}` : relative;
    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
    const body = fs.readFileSync(filePath);

    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    uploaded += 1;
  }

  return uploaded;
}
