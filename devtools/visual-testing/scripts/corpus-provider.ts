/**
 * Corpus provider for visual testing documents.
 * Fetches test documents from R2 cloud storage with local caching,
 * or from a local docs folder when running in local mode.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { colors } from './terminal.js';

/** Default local cache directory for downloaded corpus documents. */
const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.cache', 'superdoc-corpus');

/** R2 object key for the corpus registry JSON file. */
const REGISTRY_OBJECT_KEY = 'registry.json';

/**
 * A document in the test corpus.
 */
export type CorpusDoc = {
  /** Unique document identifier */
  doc_id: string;
  /** Document revision (for cache invalidation) */
  doc_rev: string;
  /** Original filename */
  filename: string;
  /** Optional group/folder name */
  group?: string;
  /** Optional tags for filtering */
  tags?: string[];
  /** Optional relative path override */
  relative_path?: string;
};

/**
 * The corpus registry containing all available test documents.
 */
export type CorpusRegistry = {
  /** ISO timestamp of last registry update */
  updated_at?: string;
  /** Array of all documents in the corpus */
  docs: CorpusDoc[];
};

/**
 * Filters for selecting documents from the corpus.
 */
export type CorpusFilters = {
  /** Path prefix filters (document must start with one of these) */
  filters: string[];
  /** Substring matches (document path must contain one of these) */
  matches: string[];
  /** Exclusion filters (document must not match any of these) */
  excludes: string[];
};

/**
 * Interface for accessing corpus documents.
 */
export type CorpusProvider = {
  /**
   * List documents matching the given filters.
   * @param filters - Filters to apply
   * @returns Array of matching documents
   */
  listDocs: (filters: CorpusFilters) => Promise<CorpusDoc[]>;
  /**
   * Fetch a document by ID and revision, downloading if needed.
   * @param doc_id - Document identifier
   * @param doc_rev - Document revision
   * @returns Local file path to the downloaded document
   */
  fetchDoc: (doc_id: string, doc_rev: string) => Promise<string>;
};

/**
 * Options for creating a corpus provider.
 */
type ProviderOptions = {
  /** Custom cache directory for downloaded documents */
  cacheDir?: string;
  /** Storage mode */
  mode?: 'cloud' | 'local';
  /** Local docs root (required for local mode) */
  docsDir?: string;
};

/** Default empty filters. */
const DEFAULT_FILTERS: CorpusFilters = {
  filters: [],
  matches: [],
  excludes: [],
};

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
 * Build the relative path for a corpus document.
 * Uses relative_path if set, otherwise combines group and filename.
 *
 * @param doc - Corpus document
 * @returns Normalized relative path (e.g., 'basic/simple.docx')
 */
export function buildDocRelativePath(doc: CorpusDoc): string {
  if (doc.relative_path) return normalizePath(doc.relative_path);
  if (doc.group) return normalizePath(`${doc.group}/${doc.filename}`);
  return normalizePath(doc.filename);
}

/**
 * Find a document by its ID.
 *
 * @param docs - Array of documents to search
 * @param docId - Document ID to find
 * @returns The matching document, or undefined if not found
 */
export function findDocById(docs: CorpusDoc[], docId: string): CorpusDoc | undefined {
  const normalized = docId.trim();
  return docs.find((doc) => doc.doc_id === normalized);
}

/**
 * Find a document by its relative path.
 *
 * @param docs - Array of documents to search
 * @param relativePath - Relative path to find (case-insensitive)
 * @returns The matching document, or undefined if not found
 */
export function findDocByRelativePath(docs: CorpusDoc[], relativePath: string): CorpusDoc | undefined {
  const normalized = normalizePath(relativePath).toLowerCase();
  return docs.find((doc) => buildDocRelativePath(doc).toLowerCase() === normalized);
}

/**
 * Apply filters to a list of documents.
 *
 * @param docs - Documents to filter
 * @param filters - Filter criteria
 * @returns Filtered array of documents
 */
function applyFilters(docs: CorpusDoc[], filters: CorpusFilters): CorpusDoc[] {
  const normalizedFilters = Array.from(new Set(filters.filters.map((value) => value.toLowerCase())));
  const normalizedMatches = Array.from(new Set(filters.matches.map((value) => value.toLowerCase())));
  const normalizedExcludes = Array.from(new Set(filters.excludes.map((value) => value.toLowerCase())));

  const matchesFilter = (doc: CorpusDoc, needle: string): boolean => {
    const group = (doc.group ?? '').toLowerCase();
    const filename = doc.filename.toLowerCase();
    const docId = doc.doc_id.toLowerCase();
    const tags = (doc.tags ?? []).map((tag) => tag.toLowerCase());
    const relative = buildDocRelativePath(doc).toLowerCase();

    if (group && group.startsWith(needle)) return true;
    if (relative.startsWith(needle)) return true;
    if (filename.includes(needle)) return true;
    if (docId.includes(needle)) return true;
    if (tags.some((tag) => tag.includes(needle))) return true;
    return false;
  };

  const matchesSubstring = (doc: CorpusDoc, needle: string): boolean => {
    const group = (doc.group ?? '').toLowerCase();
    const filename = doc.filename.toLowerCase();
    const docId = doc.doc_id.toLowerCase();
    const tags = (doc.tags ?? []).map((tag) => tag.toLowerCase());
    const relative = buildDocRelativePath(doc).toLowerCase();

    return (
      group.includes(needle) ||
      filename.includes(needle) ||
      docId.includes(needle) ||
      relative.includes(needle) ||
      tags.some((tag) => tag.includes(needle))
    );
  };

  const shouldInclude = (doc: CorpusDoc): boolean => {
    const matchesPrefix =
      normalizedFilters.length === 0 || normalizedFilters.some((value) => matchesFilter(doc, value));
    const matchesMatch =
      normalizedMatches.length === 0 || normalizedMatches.some((value) => matchesSubstring(doc, value));
    const isExcluded = normalizedExcludes.some((value) => matchesFilter(doc, value));
    return matchesPrefix && matchesMatch && !isExcluded;
  };

  return docs.filter(shouldInclude);
}

function isDocxFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.docx';
}

function walkLocalDocs(rootDir: string, onFile: (filePath: string) => void): void {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkLocalDocs(fullPath, onFile);
    } else if (entry.isFile() && isDocxFile(fullPath)) {
      onFile(fullPath);
    }
  }
}

function buildLocalDocsIndex(rootDir: string): {
  docs: CorpusDoc[];
  byId: Map<string, { path: string; rev: string }>;
} {
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    throw new Error(`Docs path not found or not a directory: ${rootDir}`);
  }

  const docs: CorpusDoc[] = [];
  const byId = new Map<string, { path: string; rev: string }>();

  walkLocalDocs(rootDir, (filePath) => {
    const relativePath = normalizePath(path.relative(rootDir, filePath));
    if (!relativePath || relativePath.startsWith('..')) return;

    const filename = path.basename(filePath);
    const group = relativePath.includes('/') ? relativePath.split('/')[0] : undefined;
    const stat = fs.statSync(filePath);
    const rev = `${stat.mtimeMs}-${stat.size}`;

    const doc: CorpusDoc = {
      doc_id: relativePath,
      doc_rev: rev,
      filename,
      group,
      relative_path: relativePath,
    };

    docs.push(doc);
    byId.set(relativePath, { path: filePath, rev });
  });

  docs.sort((a, b) =>
    buildDocRelativePath(a).localeCompare(buildDocRelativePath(b), undefined, { sensitivity: 'base' }),
  );

  return { docs, byId };
}

/**
 * Convert an S3 response body to a Buffer.
 * Handles various body types returned by AWS SDK.
 *
 * @param body - S3 response body
 * @returns Buffer containing the body data
 * @throws {Error} If body is empty or unsupported type
 */
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

/**
 * Fetch an S3 object and return its contents as a Buffer.
 *
 * @param client - S3 client instance
 * @param bucket - Bucket name
 * @param key - Object key
 * @returns Buffer containing the object data
 * @throws {Error} If the object has no body
 */
async function fetchObjectBuffer(client: S3Client, bucket: string, key: string): Promise<Buffer> {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) {
    throw new Error(`Missing body for s3://${bucket}/${key}`);
  }
  return bodyToBuffer(response.Body);
}

/**
 * Create an R2-backed corpus provider.
 * Requires SD_TESTING_R2_ACCOUNT_ID, SD_TESTING_R2_BUCKET_NAME,
 * SD_TESTING_R2_ACCESS_KEY_ID, and SD_TESTING_R2_SECRET_ACCESS_KEY env vars.
 *
 * @param options - Provider options
 * @returns CorpusProvider instance
 * @throws {Error} If required environment variables are missing
 */
async function createR2Provider(options: ProviderOptions): Promise<CorpusProvider> {
  const accountId = process.env.SD_TESTING_R2_ACCOUNT_ID ?? '';
  const bucketName = process.env.SD_TESTING_R2_BUCKET_NAME ?? '';
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;

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

  let registryPromise: Promise<CorpusRegistry> | null = null;
  const getRegistry = async (): Promise<CorpusRegistry> => {
    if (!registryPromise) {
      registryPromise = (async () => {
        const buffer = await fetchObjectBuffer(client, bucketName, REGISTRY_OBJECT_KEY);
        const parsed = JSON.parse(buffer.toString('utf8')) as CorpusRegistry;
        if (!parsed || !Array.isArray(parsed.docs)) {
          throw new Error('Invalid corpus registry format');
        }
        return parsed;
      })();
    }
    return registryPromise;
  };

  const downloadDoc = async (doc_id: string, doc_rev: string): Promise<string> => {
    const registry = await getRegistry();
    const doc = findDocById(registry.docs, doc_id);
    if (!doc) {
      throw new Error(`Corpus doc not found for doc_id=${doc_id}`);
    }
    if (doc.doc_rev !== doc_rev) {
      console.warn(colors.warning(`⚠ doc_rev mismatch for ${doc_id}: expected ${doc.doc_rev}, got ${doc_rev}`));
    }

    const objectKey = buildDocRelativePath(doc);
    const targetDir = path.join(cacheDir, doc_id, doc.doc_rev);
    const targetPath = path.join(targetDir, 'source.docx');
    const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
    fs.mkdirSync(targetDir, { recursive: true });

    if (fs.existsSync(targetPath)) {
      return targetPath;
    }

    const buffer = await fetchObjectBuffer(client, bucketName, objectKey);
    fs.writeFileSync(tempPath, buffer);

    if (fs.existsSync(targetPath)) {
      fs.rmSync(tempPath, { force: true });
      return targetPath;
    }

    fs.renameSync(tempPath, targetPath);
    return targetPath;
  };

  return {
    listDocs: async (filters: CorpusFilters = DEFAULT_FILTERS) => {
      const registry = await getRegistry();
      const docs = Array.isArray(registry.docs) ? registry.docs : [];
      return applyFilters(docs, filters);
    },
    fetchDoc: downloadDoc,
  };
}

async function createLocalProvider(options: ProviderOptions): Promise<CorpusProvider> {
  const docsDir = options.docsDir;
  if (!docsDir) {
    throw new Error('Missing --docs <path> (required for --local mode).');
  }

  const resolvedRoot = path.resolve(docsDir);
  const { docs, byId } = buildLocalDocsIndex(resolvedRoot);

  return {
    listDocs: async (filters: CorpusFilters = DEFAULT_FILTERS) => applyFilters(docs, filters),
    fetchDoc: async (doc_id: string, doc_rev: string) => {
      const entry = byId.get(doc_id);
      if (!entry) {
        throw new Error(`Local doc not found for doc_id=${doc_id}`);
      }
      if (doc_rev && entry.rev !== doc_rev) {
        console.warn(colors.warning(`⚠ doc_rev mismatch for ${doc_id}: expected ${entry.rev}, got ${doc_rev}`));
      }
      return entry.path;
    },
  };
}

/**
 * Create a corpus provider for accessing test documents.
 * Supports R2 (cloud) and local folders (local mode).
 *
 * @param options - Provider options
 * @returns CorpusProvider instance
 */
export async function createCorpusProvider(options: ProviderOptions = {}): Promise<CorpusProvider> {
  if (options.mode === 'local') {
    return createLocalProvider(options);
  }
  return createR2Provider(options);
}

/**
 * Resolve a document path or ID to a local file path.
 * Downloads the document if not already cached.
 *
 * @param provider - Corpus provider to use
 * @param pathOrId - Relative path or document ID
 * @returns Local file path to the document
 * @throws {Error} If document is not found or path is absolute
 */
export async function resolveDocumentPath(provider: CorpusProvider, pathOrId: string): Promise<string> {
  if (!pathOrId) {
    throw new Error('Document path is required');
  }

  if (path.isAbsolute(pathOrId)) {
    throw new Error(`Local document paths are not allowed: ${pathOrId}`);
  }

  const relativePath = pathOrId.replace(/^test-docs\//, '');
  const docs = await provider.listDocs({ filters: [], matches: [], excludes: [] });
  const doc = findDocByRelativePath(docs, relativePath);
  if (!doc) throw new Error(`Document not found in corpus: ${pathOrId}`);

  return provider.fetchDoc(doc.doc_id, doc.doc_rev);
}
