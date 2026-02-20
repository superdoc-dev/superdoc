/**
 * R2 baseline storage utilities.
 * Handles uploading and downloading visual testing baselines to/from Cloudflare R2.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
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

/** Default local cache directory for downloaded Word baselines. */
const DEFAULT_WORD_BASELINES_CACHE_DIR = path.join(os.tmpdir(), 'superdoc-word-baselines-cache');

/** Maximum concurrent S3 operations for downloads/uploads. */
const S3_CONCURRENCY_LIMIT = 6;

/** Width of the progress bar in characters. */
const PROGRESS_BAR_WIDTH = 24;

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

function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function formatKeyForLog(key: string): string {
  if (process.env.SUPERDOC_R2_LOG_KEYS === '1') {
    return key;
  }
  return `hash:${hashKey(key)}`;
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

function formatBytes(value: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)}${units[unitIndex]}`;
}

function renderProgressLine(options: {
  label: string;
  uploaded: number;
  total: number;
  uploadedBytes: number;
  totalBytes: number;
  lastLineLength: number;
}): number {
  const percent = options.total === 0 ? 100 : Math.round((options.uploaded / options.total) * 100);
  const barWidth = PROGRESS_BAR_WIDTH;
  const filled = Math.min(barWidth, Math.round((percent / 100) * barWidth));
  const bar = `${'='.repeat(filled)}${'-'.repeat(barWidth - filled)}`;
  const bytesInfo =
    options.totalBytes > 0 ? ` ${formatBytes(options.uploadedBytes)}/${formatBytes(options.totalBytes)}` : '';
  const line = `${options.label} [${bar}] ${options.uploaded}/${options.total} (${percent}%)${bytesInfo}`;
  const padded = line.padEnd(options.lastLineLength, ' ');
  process.stdout.write(`\r${padded}`);
  return padded.length;
}

function shouldRenderProgress(): boolean {
  return Boolean(process.stdout.isTTY);
}

/** Browser names that can appear as top-level folders in baseline directories. */
const KNOWN_BROWSERS = new Set(['chromium', 'firefox', 'webkit']);

type BaselineFilterOptions = {
  filters?: string[];
  matches?: string[];
  excludes?: string[];
  browsers?: string[];
};

function normalizeFilterList(values?: string[]): string[] {
  if (!values) return [];
  return Array.from(new Set(values.map((value) => value.toLowerCase()).filter(Boolean)));
}

function shouldIncludeBaselineKey(relativePath: string, options: BaselineFilterOptions): boolean {
  const filters = normalizeFilterList(options.filters);
  const matches = normalizeFilterList(options.matches);
  const excludes = normalizeFilterList(options.excludes);
  const normalized = relativePath.toLowerCase();

  const matchesFilter = filters.length === 0 || filters.some((value) => normalized.startsWith(value));
  const matchesMatch = matches.length === 0 || matches.some((value) => normalized.includes(value));
  const isExcluded = excludes.some((value) => normalized.startsWith(value));

  return matchesFilter && matchesMatch && !isExcluded;
}

function splitBrowserPrefix(relative: string): { browser?: string; path: string } {
  const parts = relative.split('/');
  if (parts.length === 0) {
    return { path: relative };
  }
  const first = parts[0];
  if (KNOWN_BROWSERS.has(first)) {
    return { browser: first, path: parts.slice(1).join('/') };
  }
  return { path: relative };
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
 * @param prefix - Baseline prefix (e.g., 'baselines')
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
async function listObjects(
  prefix: string,
  client: S3Client,
  bucketName: string,
): Promise<Array<{ key: string; size: number }>> {
  const keys: Array<{ key: string; size: number }> = [];
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
        keys.push({ key: item.Key, size: item.Size ?? 0 });
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
  const objects = await listObjects(remotePrefix, client, bucketName);

  if (objects.length === 0) {
    throw new Error(`No baseline objects found at ${remotePrefix}`);
  }

  let downloaded = 0;
  let downloadedBytes = 0;
  const totalBytes = objects.reduce((sum, item) => sum + item.size, 0);
  const showProgress = shouldRenderProgress();
  let lastUpdate = 0;
  let lastLineLength = 0;

  if (showProgress) {
    lastLineLength = renderProgressLine({
      label: 'Downloading',
      uploaded: 0,
      total: objects.length,
      uploadedBytes: 0,
      totalBytes,
      lastLineLength: 0,
    });
  } else {
    console.log(`Downloading ${objects.length} baseline file(s)...`);
  }

  await runWithConcurrency(objects, S3_CONCURRENCY_LIMIT, async (item) => {
    const key = item.key;
    const relative = key.startsWith(`${normalizedPrefix}/`) ? key.slice(normalizedPrefix.length + 1) : key;
    const destination = path.join(localRoot, relative);
    ensureDir(path.dirname(destination));
    await downloadObject(client, bucketName, key, destination);
    downloaded += 1;
    downloadedBytes += item.size;

    if (showProgress) {
      const now = Date.now();
      if (now - lastUpdate > 100 || downloaded === objects.length) {
        lastLineLength = renderProgressLine({
          label: 'Downloading',
          uploaded: downloaded,
          total: objects.length,
          uploadedBytes: downloadedBytes,
          totalBytes,
          lastLineLength,
        });
        lastUpdate = now;
      }
    } else if (downloaded === objects.length || downloaded % 25 === 0) {
      console.log(`Downloaded ${downloaded}/${objects.length} files...`);
    }
  });

  if (showProgress) {
    process.stdout.write('\n');
  }

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
 * Refresh a subset of baseline files from R2 (filtered by path and/or browser).
 * Downloads only the files matching the provided filters, overwriting local copies.
 *
 * @param options - Configuration options
 * @param options.prefix - Baseline prefix (e.g., 'baselines')
 * @param options.version - Version to refresh (e.g., 'v.1.5.0')
 * @param options.localRoot - Optional custom local root directory
 * @param options.cacheRoot - Optional custom cache root directory
 * @param options.filters - Prefix filters for doc/story paths
 * @param options.matches - Substring filters for doc/story paths
 * @param options.excludes - Exclusion prefix filters
 * @param options.browsers - Optional list of browsers to refresh (e.g., ['chromium', 'firefox'])
 * @returns Object with baselineRoot, localVersionDir, downloaded count, and matched count
 * @throws {Error} If no baseline objects found at the specified prefix/version in R2
 */
export async function refreshBaselineSubset(options: {
  prefix: string;
  version: string;
  localRoot?: string;
  cacheRoot?: string;
  filters?: string[];
  matches?: string[];
  excludes?: string[];
  browsers?: string[];
}): Promise<{ baselineRoot: string; localVersionDir: string; downloaded: number; matched: number }> {
  const normalizedPrefix = normalizePrefix(options.prefix);
  const localRoot = options.localRoot ?? getBaselineLocalRoot(normalizedPrefix, options.cacheRoot);
  const version = options.version;
  const localVersionDir = path.join(localRoot, version);
  const { client, bucketName } = createR2Client();

  ensureDir(localVersionDir);

  const remotePrefix = `${normalizedPrefix}/${version}/`;
  const objects = await listObjects(remotePrefix, client, bucketName);

  if (objects.length === 0) {
    throw new Error(`No baseline objects found at ${remotePrefix}`);
  }

  const browserFilters = normalizeFilterList(options.browsers);
  const matched = objects.filter((item) => {
    const relative = item.key.startsWith(remotePrefix) ? item.key.slice(remotePrefix.length) : item.key;
    const { browser, path: docPath } = splitBrowserPrefix(relative);

    if (browserFilters.length > 0) {
      if (browser) {
        if (!browserFilters.includes(browser)) {
          return false;
        }
      } else if (!browserFilters.includes('chromium')) {
        return false;
      }
    }

    return shouldIncludeBaselineKey(docPath, options);
  });

  if (matched.length === 0) {
    return { baselineRoot: localRoot, localVersionDir, downloaded: 0, matched: 0 };
  }

  let downloaded = 0;
  let downloadedBytes = 0;
  const totalBytes = matched.reduce((sum, item) => sum + item.size, 0);
  const showProgress = shouldRenderProgress();
  let lastUpdate = 0;
  let lastLineLength = 0;

  if (showProgress) {
    lastLineLength = renderProgressLine({
      label: 'Refreshing',
      uploaded: 0,
      total: matched.length,
      uploadedBytes: 0,
      totalBytes,
      lastLineLength: 0,
    });
  } else {
    console.log(`Refreshing ${matched.length} baseline file(s)...`);
  }

  await runWithConcurrency(matched, S3_CONCURRENCY_LIMIT, async (item) => {
    const key = item.key;
    const relative = key.startsWith(`${normalizedPrefix}/`) ? key.slice(normalizedPrefix.length + 1) : key;
    const destination = path.join(localRoot, relative);
    ensureDir(path.dirname(destination));
    await downloadObject(client, bucketName, key, destination);
    downloaded += 1;
    downloadedBytes += item.size;

    if (showProgress) {
      const now = Date.now();
      if (now - lastUpdate > 100 || downloaded === matched.length) {
        lastLineLength = renderProgressLine({
          label: 'Refreshing',
          uploaded: downloaded,
          total: matched.length,
          uploadedBytes: downloadedBytes,
          totalBytes,
          lastLineLength,
        });
        lastUpdate = now;
      }
    } else if (downloaded === matched.length || downloaded % 25 === 0) {
      console.log(`Refreshed ${downloaded}/${matched.length} files...`);
    }
  });

  if (showProgress) {
    process.stdout.write('\n');
  }

  return { baselineRoot: localRoot, localVersionDir, downloaded, matched: matched.length };
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
  const shouldVerify = process.env.SUPERDOC_TEST_CI === '1' || process.env.SUPERDOC_R2_VERIFY_UPLOAD === '1';
  let uploaded = 0;
  const files: string[] = [];

  walk(localDir, (filePath) => files.push(filePath));
  const verboseUploads =
    process.env.SUPERDOC_R2_VERBOSE_UPLOAD === '1' || (process.env.SUPERDOC_TEST_CI === '1' && files.length <= 200);

  if (files.length === 0) {
    return 0;
  }

  let totalBytes = 0;
  for (const filePath of files) {
    totalBytes += fs.statSync(filePath).size;
  }

  if (shouldVerify) {
    const accountId = process.env.SD_TESTING_R2_ACCOUNT_ID ?? '';
    const accountTag = accountId ? accountId.slice(-6) : 'unknown';
    console.log(`R2 account: ***${accountTag}`);
    console.log(`R2 bucket: ${bucketName}`);
    console.log(`R2 prefix: ${normalizedPrefix || '(root)'}`);
  }

  const showProgress = shouldRenderProgress();
  console.log(`Uploading ${files.length} baseline file(s) to R2...`);
  if (totalBytes > 0) {
    console.log(`Total size: ${formatBytes(totalBytes)}`);
  }
  if (!showProgress) {
    console.log('Starting upload...');
  }
  let lastUpdate = 0;
  let lastLineLength = 0;
  let uploadedBytes = 0;

  for (const filePath of files) {
    if (!showProgress) {
      const announceEvery = verboseUploads ? 1 : files.length <= 50 ? 1 : 25;
      if (uploaded % announceEvery === 0) {
        console.log(`Uploading file ${uploaded + 1}/${files.length}...`);
      }
    }
    const relative = normalizePath(path.relative(localDir, filePath));
    const key = normalizedPrefix ? `${normalizedPrefix}/${relative}` : relative;
    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
    const body = fs.readFileSync(filePath);

    const response = await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    uploaded += 1;
    uploadedBytes += body.length;

    if (!showProgress && verboseUploads) {
      const etag = response.ETag ? response.ETag.replace(/"/g, '') : 'n/a';
      const requestId = response.$metadata?.requestId ?? 'n/a';
      const status = response.$metadata?.httpStatusCode ?? 'n/a';
      const keyLabel = formatKeyForLog(key);
      console.log(
        `Uploaded ${uploaded}/${files.length} (${formatBytes(body.length)}) ${keyLabel} status=${status} etag=${etag} req=${requestId}`,
      );
    }

    if (showProgress) {
      const now = Date.now();
      if (now - lastUpdate > 100 || uploaded === files.length) {
        lastLineLength = renderProgressLine({
          label: 'Uploading',
          uploaded,
          total: files.length,
          uploadedBytes,
          totalBytes,
          lastLineLength,
        });
        lastUpdate = now;
      }
    } else if (uploaded === files.length || uploaded % 25 === 0) {
      console.log(`Uploaded ${uploaded}/${files.length} files...`);
    }
  }

  if (showProgress) {
    process.stdout.write('\n');
  }

  if (shouldVerify) {
    const verifyPrefix = normalizedPrefix ? `${normalizedPrefix}/` : '';
    console.log(`Verifying upload at prefix: ${verifyPrefix || '(root)'}`);
    const objects = await listObjects(verifyPrefix, client, bucketName);
    console.log(`R2 objects found at prefix: ${objects.length}`);
    if (objects.length === 0) {
      throw new Error(`Upload verification failed: no objects found at ${verifyPrefix || '(root)'}`);
    }
  }

  client.destroy();
  return uploaded;
}

/**
 * Create an R2 S3 client configured for the Word baselines bucket.
 * Uses SD_TESTING_R2_WORD_BUCKET_NAME for the bucket, with shared credentials.
 *
 * @returns Object with S3 client and bucket name
 * @throws {Error} If required environment variables are missing
 */
export function createWordR2Client(): { client: S3Client; bucketName: string } {
  const accountId = process.env.SD_TESTING_R2_ACCOUNT_ID ?? '';
  const bucketName = process.env.SD_TESTING_R2_WORD_BUCKET_NAME ?? '';
  const accessKeyId = process.env.SD_TESTING_R2_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.SD_TESTING_R2_SECRET_ACCESS_KEY ?? '';

  if (!accountId) throw new Error('Missing SD_TESTING_R2_ACCOUNT_ID');
  if (!bucketName) throw new Error('Missing SD_TESTING_R2_WORD_BUCKET_NAME');
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
 * Check whether all environment variables required for Word R2 baselines are set.
 *
 * @returns True if SD_TESTING_R2_ACCOUNT_ID, SD_TESTING_R2_WORD_BUCKET_NAME,
 *   SD_TESTING_R2_ACCESS_KEY_ID, and SD_TESTING_R2_SECRET_ACCESS_KEY are all set.
 */
export function isWordR2Available(): boolean {
  return Boolean(
    process.env.SD_TESTING_R2_ACCOUNT_ID &&
      process.env.SD_TESTING_R2_WORD_BUCKET_NAME &&
      process.env.SD_TESTING_R2_ACCESS_KEY_ID &&
      process.env.SD_TESTING_R2_SECRET_ACCESS_KEY,
  );
}

/**
 * Read cached Word baseline page PNGs from a directory, sorted by name.
 *
 * @param dir - Directory containing page_NNNN.png files
 * @returns Sorted array of absolute paths to page PNG files
 */
function readCachedWordPages(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /^page_\d+\.png$/i.test(name))
    .sort()
    .map((name) => path.join(dir, name));
}

/**
 * Download Word baselines from R2 for a set of documents.
 *
 * For each document, downloads page_NNNN.png files from the R2 bucket under
 * the document's relative path prefix. Results are cached locally with an
 * `.r2complete` marker to avoid re-downloading.
 *
 * @param options.docPaths - Map of docKey -> relativePath (e.g., "rendering/sd-1679.docx")
 * @param options.cacheRoot - Optional custom cache root directory
 * @param options.force - If true, re-download even if already cached
 * @returns Map of docKey -> { relativePath, pages: [absolutePaths sorted by name] }
 */
export async function downloadWordBaselines(options: {
  docPaths: Map<string, string>;
  cacheRoot?: string;
  force?: boolean;
}): Promise<Map<string, { relativePath: string; pages: string[] }>> {
  const { client, bucketName } = createWordR2Client();
  const cacheRoot = options.cacheRoot ?? DEFAULT_WORD_BASELINES_CACHE_DIR;
  const force = options.force ?? false;
  const result = new Map<string, { relativePath: string; pages: string[] }>();

  const entries = Array.from(options.docPaths.entries());
  let downloadedDocs = 0;

  await runWithConcurrency(entries, S3_CONCURRENCY_LIMIT, async ([docKey, relativePath]) => {
    const localDir = path.join(cacheRoot, relativePath);
    const markerPath = path.join(localDir, '.r2complete');

    if (!force && fs.existsSync(markerPath)) {
      const pages = readCachedWordPages(localDir);
      if (pages.length > 0) {
        result.set(docKey, { relativePath, pages });
        return;
      }
    }

    const remotePrefix = `${relativePath}/`;
    const objects = await listObjects(remotePrefix, client, bucketName);
    const pngObjects = objects.filter((obj) => obj.key.endsWith('.png'));

    if (pngObjects.length === 0) {
      return;
    }

    ensureDir(localDir);

    await runWithConcurrency(pngObjects, 4, async (obj) => {
      const fileName = path.posix.basename(obj.key);
      const destination = path.join(localDir, fileName);
      await downloadObject(client, bucketName, obj.key, destination);
    });

    fs.writeFileSync(
      markerPath,
      JSON.stringify({
        relativePath,
        downloadedAt: new Date().toISOString(),
        files: pngObjects.length,
      }),
    );

    const pages = readCachedWordPages(localDir);
    if (pages.length > 0) {
      result.set(docKey, { relativePath, pages });
      downloadedDocs += 1;
    }
  });

  if (downloadedDocs > 0) {
    console.log(`Downloaded Word baselines for ${downloadedDocs} document(s) from R2.`);
  }

  client.destroy();
  return result;
}
