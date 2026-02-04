#!/usr/bin/env tsx

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { colors } from './terminal.js';
import { buildDocRelativePath, type CorpusRegistry } from './corpus-provider.js';

const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function normalizeSegment(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .toLowerCase();
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
}

function sha256Buffer(buffer: Buffer): string {
  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  return `sha256:${hash.digest('hex')}`;
}

function parseArgs(): { filePath: string; folder?: string; relativePath?: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let folder: string | undefined;
  let relativePath: string | undefined;
  let filePath: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--folder' && args[i + 1]) {
      folder = args[i + 1];
      i += 1;
    } else if (arg === '--path' && args[i + 1]) {
      relativePath = args[i + 1];
      i += 1;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('--') && !filePath) {
      filePath = arg;
    }
  }

  if (!filePath) {
    printHelp();
    throw new Error('Missing file path.');
  }

  return { filePath, folder, relativePath, dryRun };
}

function printHelp(): void {
  console.log(
    `\nUsage: pnpm upload [--folder <name>] [--path <relative>] <file>\n\nOptions:\n  --folder <name>  Upload under a folder in R2 (e.g., lists)\n  --path <relative>  Full relative object key in R2 (overrides --folder)\n  --dry-run         Print actions without uploading\n`,
  );
}

async function createClient(): Promise<{ client: S3Client; bucketName: string }> {
  const accountId = process.env.SD_TESTING_R2_ACCOUNT_ID ?? '';
  const bucketName = process.env.SD_TESTING_R2_BUCKET_NAME ?? '';
  const accessKeyId = process.env.SD_TESTING_R2_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.SD_TESTING_R2_SECRET_ACCESS_KEY ?? '';

  if (!accountId) throw new Error('Missing SD_TESTING_R2_ACCOUNT_ID');
  if (!bucketName) throw new Error('Missing SD_TESTING_R2_BUCKET_NAME');
  if (!accessKeyId) throw new Error('Missing SD_TESTING_R2_ACCESS_KEY_ID');
  if (!secretAccessKey) throw new Error('Missing SD_TESTING_R2_SECRET_ACCESS_KEY');

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return { client, bucketName };
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) throw new Error('Empty response body');
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === 'string') return Buffer.from(body);

  const maybeTransform = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof maybeTransform.transformToByteArray === 'function') {
    const bytes = await maybeTransform.transformToByteArray();
    return Buffer.from(bytes);
  }

  const asyncBody = body as AsyncIterable<Uint8Array>;
  if (typeof asyncBody[Symbol.asyncIterator] === 'function') {
    const chunks: Buffer[] = [];
    for await (const chunk of asyncBody) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error('Unsupported response body type');
}

async function fetchRegistry(client: S3Client, bucket: string): Promise<CorpusRegistry> {
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: 'registry.json' }));
    const buffer = await bodyToBuffer(response.Body);
    const parsed = JSON.parse(buffer.toString('utf8')) as CorpusRegistry;
    if (!parsed || !Array.isArray(parsed.docs)) {
      throw new Error('Invalid corpus registry format');
    }
    return parsed;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || (error as Error).name === 'NoSuchKey') {
      throw new Error('registry.json not found. Run pnpm sync-corpus first.');
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const { filePath, folder, relativePath: relativeOverride, dryRun } = parseArgs();
  const resolvedPath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  if (ext !== '.docx') {
    throw new Error('Only .docx files are supported.');
  }

  let relativePath: string;
  if (relativeOverride) {
    if (path.isAbsolute(relativeOverride)) {
      throw new Error('--path must be a relative object key (e.g., lists/my.docx)');
    }
    relativePath = normalizePath(relativeOverride);
  } else {
    const baseName = path.basename(resolvedPath);
    if (folder) {
      relativePath = normalizePath(path.posix.join(folder, baseName));
    } else {
      relativePath = normalizePath(baseName);
    }
  }

  if (!relativePath.endsWith('.docx')) {
    throw new Error('Target path must end with .docx.');
  }

  const buffer = fs.readFileSync(resolvedPath);
  const doc_rev = sha256Buffer(buffer);
  const relativeStem = relativePath.replace(/\.docx$/i, '');
  const doc_id = normalizeSegment(relativeStem.replace(/\//g, '-'));
  const group = relativePath.includes('/') ? relativePath.split('/')[0] : undefined;
  const filename = path.basename(relativePath);

  const { client, bucketName } = await createClient();
  const registry = await fetchRegistry(client, bucketName);

  const normalizedTarget = normalizePath(relativePath).toLowerCase();
  const docs = [...registry.docs];
  const indexById = docs.findIndex((doc) => doc.doc_id === doc_id);
  const indexByPath = docs.findIndex((doc) => buildDocRelativePath(doc).toLowerCase() === normalizedTarget);

  const existing = indexById >= 0 ? docs[indexById] : indexByPath >= 0 ? docs[indexByPath] : undefined;
  const tags = existing?.tags;

  const updatedDoc = {
    doc_id,
    doc_rev,
    filename,
    group,
    relative_path: relativePath,
    tags,
  };

  if (indexById >= 0) {
    docs[indexById] = updatedDoc;
    if (indexByPath >= 0 && indexByPath !== indexById) {
      docs.splice(indexByPath, 1);
    }
  } else if (indexByPath >= 0) {
    docs[indexByPath] = updatedDoc;
  } else {
    docs.push(updatedDoc);
  }

  docs.sort((a, b) =>
    buildDocRelativePath(a).localeCompare(buildDocRelativePath(b), undefined, { sensitivity: 'base' }),
  );

  const nextRegistry: CorpusRegistry = {
    updated_at: new Date().toISOString(),
    docs,
  };

  console.log(colors.info(`Uploading ${relativePath} (doc_id=${doc_id})`));

  if (!dryRun) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: relativePath,
        Body: buffer,
        ContentType: DOCX_CONTENT_TYPE,
      }),
    );

    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: 'registry.json',
        Body: Buffer.from(`${JSON.stringify(nextRegistry, null, 2)}\n`, 'utf8'),
        ContentType: 'application/json',
      }),
    );
  }

  console.log(colors.success('✅ Upload complete'));
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error(colors.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`));
    process.exitCode = 1;
  });
}
