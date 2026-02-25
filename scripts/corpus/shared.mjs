import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { execFile as execFileCb } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const execFile = promisify(execFileCb);

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
export const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
export const DEFAULT_CORPUS_ROOT = path.join(REPO_ROOT, 'test-corpus');
export const REGISTRY_KEY = 'registry.json';
export const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const CORPUS_BUCKET_NAME = 'docx-test-corpus';

const WRANGLER_CONFIG_PATHS =
  process.platform === 'darwin'
    ? [path.join(os.homedir(), 'Library/Preferences/.wrangler/config/default.toml')]
    : [path.join(os.homedir(), '.config/.wrangler/config/default.toml')];

const ACCOUNT_ID_ENV_KEYS = ['SUPERDOC_CORPUS_R2_ACCOUNT_ID', 'SD_TESTING_R2_ACCOUNT_ID'];
const ACCESS_KEY_ID_ENV_KEYS = ['SUPERDOC_CORPUS_R2_ACCESS_KEY_ID', 'SD_TESTING_R2_ACCESS_KEY_ID'];
const SECRET_ACCESS_KEY_ENV_KEYS = [
  'SUPERDOC_CORPUS_R2_SECRET_ACCESS_KEY',
  'SD_TESTING_R2_SECRET_ACCESS_KEY',
];

function firstEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

export function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

export function normalizeSegment(value) {
  return String(value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .toLowerCase();
}

export function buildDocRelativePath(doc) {
  if (doc?.relative_path) return normalizePath(doc.relative_path);
  if (doc?.group) return normalizePath(`${doc.group}/${doc.filename}`);
  return normalizePath(doc?.filename ?? '');
}

export function sha256Buffer(buffer) {
  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  return `sha256:${hash.digest('hex')}`;
}

function readWranglerConfig() {
  for (const configPath of WRANGLER_CONFIG_PATHS) {
    if (!fs.existsSync(configPath)) continue;
    const content = fs.readFileSync(configPath, 'utf8');
    const tokenMatch = content.match(/^oauth_token\s*=\s*"(.+)"/m);
    const expiryMatch = content.match(/^expiration_time\s*=\s*"(.+)"/m);
    return {
      path: configPath,
      oauthToken: tokenMatch?.[1] ?? '',
      expirationTime: expiryMatch?.[1] ?? '',
    };
  }
  return null;
}

function assertWranglerToken() {
  const config = readWranglerConfig();
  if (!config?.oauthToken) {
    throw new Error(
      'No wrangler OAuth token found. Run `npx wrangler login` (or set SUPERDOC_CORPUS_R2_* / SD_TESTING_R2_* credentials).',
    );
  }

  if (config.expirationTime) {
    const expiryMs = Date.parse(config.expirationTime);
    if (Number.isFinite(expiryMs) && Date.now() >= expiryMs - 30_000) {
      throw new Error(
        `Wrangler OAuth token is expired (config: ${config.path}). Run \`npx wrangler login\` to refresh it.`,
      );
    }
  }

  return config.oauthToken;
}

async function fetchCloudflareJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const bodyText = await response.text();
  let parsed;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new Error(`Cloudflare API ${response.status} for ${url}: ${bodyText || '<empty>'}`);
  }
  if (!parsed || parsed.success !== true) {
    const errors = Array.isArray(parsed?.errors) ? parsed.errors.map((item) => item?.message).filter(Boolean) : [];
    throw new Error(`Cloudflare API failed for ${url}: ${errors.join('; ') || bodyText || 'unknown error'}`);
  }

  return parsed;
}

async function resolveAccountId(token) {
  const explicit = firstEnv(ACCOUNT_ID_ENV_KEYS);
  if (explicit) return explicit;

  const memberships = await fetchCloudflareJson('https://api.cloudflare.com/client/v4/memberships', token);
  const accountId = memberships?.result?.[0]?.account?.id;
  if (!accountId) {
    throw new Error('Unable to resolve Cloudflare account ID from memberships. Set SUPERDOC_CORPUS_R2_ACCOUNT_ID.');
  }
  return accountId;
}

async function resolveBucketName() {
  return CORPUS_BUCKET_NAME;
}

function isMissingWranglerBinary(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /ENOENT|not found|command not found/i.test(message);
}

async function runWrangler(args, { accountId }) {
  const attempts = [
    { cmd: 'wrangler', args },
    { cmd: 'pnpm', args: ['exec', 'wrangler', ...args] },
    { cmd: 'npx', args: ['wrangler', ...args] },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    try {
      const result = await execFile(attempt.cmd, attempt.args, {
        env: {
          ...process.env,
          ...(accountId ? { CLOUDFLARE_ACCOUNT_ID: accountId } : {}),
        },
        maxBuffer: 64 * 1024 * 1024,
      });
      return result.stdout;
    } catch (error) {
      if (isMissingWranglerBinary(error)) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `Unable to run wrangler CLI for R2 operations. Install wrangler (or fix PATH). Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

function resolveS3Credentials() {
  const accessKeyId = firstEnv(ACCESS_KEY_ID_ENV_KEYS);
  const secretAccessKey = firstEnv(SECRET_ACCESS_KEY_ENV_KEYS);

  if (!accessKeyId && !secretAccessKey) return null;

  const accountId = firstEnv(ACCOUNT_ID_ENV_KEYS);
  const bucketName = CORPUS_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Incomplete S3 credential configuration. Set account, access key ID, and secret access key (SUPERDOC_CORPUS_R2_* or SD_TESTING_R2_*).',
    );
  }

  return {
    accountId,
    bucketName,
    accessKeyId,
    secretAccessKey,
  };
}

async function importAwsSdkClient() {
  const candidates = [
    createRequire(import.meta.url),
    createRequire(path.join(REPO_ROOT, 'tests/visual/package.json')),
  ];

  for (const req of candidates) {
    try {
      const resolvedPath = req.resolve('@aws-sdk/client-s3');
      return import(pathToFileURL(resolvedPath).href);
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    'Unable to resolve @aws-sdk/client-s3. Run `pnpm install` at repo root (or in tests/visual workspace package).',
  );
}

async function createS3R2Client(config) {
  const sdk = await importAwsSdkClient();
  const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = sdk;

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const bucketName = config.bucketName;

  return {
    accountId: config.accountId,
    bucketName,
    mode: 's3',
    async listObjects(prefix = '') {
      const keys = [];
      let continuationToken;
      do {
        const response = await s3.send(
          new ListObjectsV2Command({
            Bucket: bucketName,
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
    },
    async getObjectBuffer(key) {
      const response = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
      if (!response.Body) throw new Error(`Missing body for s3://${bucketName}/${key}`);
      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    },
    async getObjectToFile(key, destinationPath) {
      const buffer = await this.getObjectBuffer(key);
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.writeFileSync(destinationPath, buffer);
    },
    async putObjectBuffer(key, body, contentType) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
    async putObjectFromFile(key, filePath, contentType) {
      const body = fs.readFileSync(filePath);
      await this.putObjectBuffer(key, body, contentType);
    },
    destroy() {
      s3.destroy();
    },
  };
}

async function createWranglerR2Client() {
  const token = assertWranglerToken();
  const accountId = await resolveAccountId(token);
  const bucketName = await resolveBucketName();

  const listObjects = async (prefix = '') => {
    const keys = [];
    let cursor = '';

    do {
      const params = new URLSearchParams();
      if (prefix) params.set('prefix', prefix);
      if (cursor) params.set('cursor', cursor);
      const payload = await fetchCloudflareJson(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects?${params}`,
        token,
      );

      const result = Array.isArray(payload?.result) ? payload.result : [];
      for (const item of result) {
        if (item?.key) keys.push(item.key);
      }

      cursor = payload?.result_info?.cursor ?? '';
    } while (cursor);

    return keys;
  };

  const getObjectToFile = async (key, destinationPath) => {
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    await runWrangler(['r2', 'object', 'get', `${bucketName}/${key}`, '--file', destinationPath, '--remote'], {
      accountId,
    });
  };

  const putObjectFromFile = async (key, filePath, contentType) => {
    const args = ['r2', 'object', 'put', `${bucketName}/${key}`, '--file', filePath, '--remote'];
    if (contentType) {
      args.push('--content-type', contentType);
    }
    await runWrangler(args, { accountId });
  };

  return {
    accountId,
    bucketName,
    mode: 'wrangler',
    listObjects,
    async getObjectToFile(key, destinationPath) {
      return getObjectToFile(key, destinationPath);
    },
    async getObjectBuffer(key) {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-get-'));
      const tmpFile = path.join(tmpDir, 'object.bin');
      try {
        await getObjectToFile(key, tmpFile);
        return fs.readFileSync(tmpFile);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },
    async putObjectFromFile(key, filePath, contentType) {
      return putObjectFromFile(key, filePath, contentType);
    },
    async putObjectBuffer(key, body, contentType) {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-put-'));
      const tmpFile = path.join(tmpDir, 'object.bin');
      try {
        fs.writeFileSync(tmpFile, body);
        await putObjectFromFile(key, tmpFile, contentType);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },
    destroy() {
      // no-op
    },
  };
}

export async function createCorpusR2Client() {
  const s3Config = resolveS3Credentials();
  if (s3Config) {
    return createS3R2Client(s3Config);
  }
  return createWranglerR2Client();
}

export async function loadRegistryOrNull(client) {
  try {
    const raw = await client.getObjectBuffer(REGISTRY_KEY);
    const parsed = JSON.parse(raw.toString('utf8'));
    if (!parsed || !Array.isArray(parsed.docs)) {
      throw new Error('Invalid registry.json format (missing docs array).');
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveRegistry(client, registry) {
  const body = Buffer.from(`${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  await client.putObjectBuffer(REGISTRY_KEY, body, 'application/json');
}

export function ensureVisualTestDataSymlink(corpusRoot) {
  const visualDataPath = path.join(REPO_ROOT, 'tests', 'visual', 'test-data');
  const absoluteCorpusRoot = path.resolve(corpusRoot);
  const symlinkTarget = path.relative(path.dirname(visualDataPath), absoluteCorpusRoot);

  let stat = null;
  try {
    // lstat() detects existing symlink entries even if their targets are missing.
    stat = fs.lstatSync(visualDataPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  if (stat) {
    if (stat.isSymbolicLink()) {
      const existingTarget = fs.readlinkSync(visualDataPath);
      const existingResolved = path.resolve(path.dirname(visualDataPath), existingTarget);
      if (existingResolved === absoluteCorpusRoot) {
        return { linked: true, changed: false, backupPath: null };
      }
      fs.rmSync(visualDataPath, { recursive: true, force: true });
    } else {
      const backupPath = `${visualDataPath}.backup-${Date.now()}`;
      fs.renameSync(visualDataPath, backupPath);
      fs.symlinkSync(symlinkTarget, visualDataPath, 'dir');
      return { linked: true, changed: true, backupPath };
    }
  }

  fs.mkdirSync(path.dirname(visualDataPath), { recursive: true });
  fs.symlinkSync(symlinkTarget, visualDataPath, 'dir');
  return { linked: true, changed: true, backupPath: null };
}

export function applyPathFilters(paths, { filters = [], matches = [], excludes = [] } = {}) {
  const normalizedFilters = filters.map((value) => String(value).toLowerCase()).filter(Boolean);
  const normalizedMatches = matches.map((value) => String(value).toLowerCase()).filter(Boolean);
  const normalizedExcludes = excludes.map((value) => String(value).toLowerCase()).filter(Boolean);

  return paths.filter((candidate) => {
    const value = candidate.toLowerCase();
    const matchesPrefix = normalizedFilters.length === 0 || normalizedFilters.some((filter) => value.startsWith(filter));
    const matchesSubstring = normalizedMatches.length === 0 || normalizedMatches.some((match) => value.includes(match));
    const excluded = normalizedExcludes.some((exclude) => value.startsWith(exclude) || value.includes(exclude));
    return matchesPrefix && matchesSubstring && !excluded;
  });
}

export function printCorpusEnvHint() {
  const lines = [
    'Auth options:',
    '- Local (recommended): `npx wrangler login`',
    '- CI / explicit creds: set SUPERDOC_CORPUS_R2_* (or SD_TESTING_R2_*)',
    `- Corpus bucket is fixed to: ${CORPUS_BUCKET_NAME}`,
  ];
  return lines.join('\n');
}

export function formatDurationMs(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

export function sortRegistryDocs(docs) {
  return [...docs].sort((a, b) =>
    buildDocRelativePath(a).localeCompare(buildDocRelativePath(b), undefined, {
      sensitivity: 'base',
    }),
  );
}

export function coerceDocEntryFromRelativePath(relativePath) {
  const filename = path.basename(relativePath);
  const group = relativePath.includes('/') ? relativePath.split('/')[0] : undefined;
  const relativeStem = relativePath.replace(/\.docx$/i, '');
  return {
    doc_id: normalizeSegment(relativeStem.replace(/\//g, '-')),
    filename,
    group,
    relative_path: relativePath,
  };
}
