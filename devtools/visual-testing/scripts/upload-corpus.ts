#!/usr/bin/env tsx

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { colors } from './terminal.js';

const VALID_EXTENSIONS = new Set(['.docx']);
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

async function createClient(): Promise<{ client: S3Client; bucketName: string }> {
  const accountId = process.env.SD_TESTING_R2_ACCOUNT_ID ?? '';
  const bucketName = process.env.SD_TESTING_R2_BUCKET_NAME ?? '';
  const accessKeyId = process.env.SD_TESTING_R2_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.SD_TESTING_R2_SECRET_ACCESS_KEY ?? '';

  if (!accountId) {
    throw new Error('Missing SD_TESTING_R2_ACCOUNT_ID');
  }

  if (!bucketName) {
    throw new Error('Missing SD_TESTING_R2_BUCKET_NAME');
  }

  if (!accessKeyId) {
    throw new Error('Missing SD_TESTING_R2_ACCESS_KEY_ID');
  }

  if (!secretAccessKey) {
    throw new Error('Missing SD_TESTING_R2_SECRET_ACCESS_KEY');
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return { client, bucketName };
}

async function main(): Promise<void> {
  const rootArg = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
  const rootPath = rootArg
    ? path.resolve(process.cwd(), rootArg)
    : process.env.SUPERDOC_CORPUS_ROOT
      ? path.resolve(process.cwd(), process.env.SUPERDOC_CORPUS_ROOT)
      : path.resolve(process.cwd(), 'test-docs');

  if (!fs.existsSync(rootPath)) {
    throw new Error(`Missing corpus source directory: ${rootPath}`);
  }

  const { client, bucketName } = await createClient();

  const docs: Array<{
    doc_id: string;
    doc_rev: string;
    filename: string;
    group?: string;
    relative_path: string;
  }> = [];

  const files: string[] = [];
  walk(rootPath, (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!VALID_EXTENSIONS.has(ext)) return;
    const baseName = path.basename(filePath);
    if (baseName.startsWith('~$')) return;
    files.push(filePath);
  });

  if (files.length === 0) {
    console.log(colors.warning('No .docx files found in source directory.'));
    return;
  }

  console.log(colors.info(`Uploading ${files.length} document(s) to R2...`));

  for (const filePath of files) {
    const buffer = fs.readFileSync(filePath);
    const relative = normalizePath(path.relative(rootPath, filePath));
    const filename = path.basename(filePath);
    const group = relative.includes('/') ? relative.split('/')[0] : undefined;
    const relativeStem = relative.replace(path.extname(relative), '');
    const doc_id = normalizeSegment(relativeStem.replace(/\//g, '-'));
    const doc_rev = sha256Buffer(buffer);

    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: relative,
        Body: buffer,
        ContentType: DOCX_CONTENT_TYPE,
      }),
    );

    docs.push({
      doc_id,
      doc_rev,
      filename,
      group,
      relative_path: relative,
    });

    console.log(colors.muted(`- ${relative}`));
  }

  docs.sort((a, b) => a.relative_path.localeCompare(b.relative_path, undefined, { sensitivity: 'base' }));

  const registry = {
    updated_at: new Date().toISOString(),
    docs,
  };

  const registryBody = Buffer.from(`${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: 'registry.json',
      Body: registryBody,
      ContentType: 'application/json',
    }),
  );

  console.log(colors.success('✅ Uploaded registry.json'));
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error(colors.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`));
    process.exitCode = 1;
  });
}
