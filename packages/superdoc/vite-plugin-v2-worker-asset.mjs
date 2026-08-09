import path from 'node:path';
import { createHash } from 'node:crypto';

const WORKER_DATA_URL_RE = /(["'])data:text\/javascript(?:;charset=utf-8)?;base64,([A-Za-z0-9+/=]+)\1/g;
// The protected engine carries three worker assets —
// the default kernel worker (`browser-worker-entry-*`) and the shell-owned
// collaboration worker (`collaboration-worker-entry-*`), plus the dormant
// isolated review worker (`review-index-worker-entry-*`). All must survive
// library re-bundling as real package-relative assets.
const WORKER_ASSET_FILE_RE = /^assets\/(?:browser|collaboration|review-index)-worker-entry-[A-Za-z0-9_-]+\.js$/;
const WORKER_URL_GLOBAL = '__SUPERDOC_V2_BROWSER_WORKER_URL__';
const WORKER_URL_PRELUDE_MARKER = '__SUPERDOC_V2_BROWSER_WORKER_URL_PRELUDE__';
// The IIFE prelude configures the DEFAULT kernel worker URL global only; the
// collaboration worker is constructed through its own static URL reference.
const BROWSER_WORKER_ASSET_SPECIFIER_RE = /(["'])([^"']*browser-worker-entry-[A-Za-z0-9_-]+\.js)\1/g;
// `import.meta.url` has no meaning in IIFE output: Rollup's IIFE code generator
// substitutes it with a non-functional placeholder (observed as `{}.url`) rather
// than leaving the literal text, because `import.meta` itself is rewritten to an
// empty object for that format. That substitution happens as part of Rollup's own
// chunk rendering, so by the time this plugin's generateBundle hook runs, the
// `import.meta.url` occurrences inside the nested worker-URL wrapper may already be
// gone. The two bases in the wrapper must therefore accept either the literal
// source text or Rollup's substituted form; either is collapsed to `document.baseURI`,
// which (unlike `import.meta.url`) resolves in every output format.
const IMPORT_META_URL_OR_SUBSTITUTED_RE = /import\.meta\.url|\{\}\.url/;
// esbuild/Rollup do not emit a consistent number of spaces around the `+` in the
// `"" + <base>` string-coercion (compare the outer `""+new URL(...)` to the inner
// `"" + import.meta.url`/`"" + {}.url` in real output); match either spacing.
const OPTIONAL_STRING_COERCION = '(?:""\\s*\\+\\s*)?';
const VITE_NESTED_WORKER_ASSET_RE = new RegExp(
  'new Worker\\(\\s*new URL\\(\\s*(?:\\/\\* @vite-ignore \\*\\/\\s*)?' +
    OPTIONAL_STRING_COERCION +
    'new URL\\(\\s*(["\'])([^"\']*(?:browser|collaboration|review-index)-worker-entry-[^"\']+\\.js)\\1\\s*,' +
    `\\s*${OPTIONAL_STRING_COERCION}(?:${IMPORT_META_URL_OR_SUBSTITUTED_RE.source})\\s*\\)\\.href\\s*,` +
    `\\s*${OPTIONAL_STRING_COERCION}(?:${IMPORT_META_URL_OR_SUBSTITUTED_RE.source})\\s*\\)\\s*,\\s*` +
    `(\\{\\s*type\\s*:\\s*(["'])module\\4(?:\\s*,\\s*name\\s*:\\s*(["'])[^"']+\\5)?\\s*\\})\\s*\\)`,
  'g',
);
const VITE_STATIC_WORKER_ASSET_RE =
  /new Worker\(\s*new URL\(\s*(?:\/\* @vite-ignore \*\/\s*)?(["'])([^"']*(?:browser|collaboration|review-index)-worker-entry-[^"']+\.js)\1\s*,/g;
const VITE_STATIC_WORKER_IMPORT_META_BASE_RE = new RegExp(
  '(new Worker\\(\\s*new URL\\(\\s*(?:\\/\\* @vite-ignore \\*\\/\\s*)?' +
    '["\'][^"\']*(?:browser|collaboration|review-index)-worker-entry-[^"\']+\\.js["\']\\s*,\\s*)' +
    `(?:${IMPORT_META_URL_OR_SUBSTITUTED_RE.source})`,
  'g',
);
const V2_WORKER_REALM_MARKER = 'v2-worker-realm';
const V2_WORKER_HELLO_MARKER = 'type:"hello"';
// Survives minification (string literal in the one-shot registration error):
// present only in the collaboration-capable worker entry.
const V2_COLLABORATION_WORKER_MARKER = 'one-shot per worker realm';
const REVIEW_INDEX_WORKER_MARKER = 'superdoc-review-index-worker';

function decodeBase64Worker(match) {
  try {
    return Buffer.from(match, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function buildWorkerFileName(source) {
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 8);
  const kind = source.includes(REVIEW_INDEX_WORKER_MARKER)
    ? 'review-index'
    : source.includes(V2_COLLABORATION_WORKER_MARKER)
      ? 'collaboration'
      : 'browser';
  return `assets/${kind}-worker-entry-${hash}.js`;
}

function relativeAssetSpecifier(chunkFileName, assetFileName) {
  const relative = path.posix.relative(path.posix.dirname(chunkFileName), assetFileName);
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function createIifeWorkerUrlPrelude(assetSpecifier) {
  return [
    ';(() => {',
    'try {',
    'const g = globalThis;',
    `const m = ${JSON.stringify(WORKER_URL_PRELUDE_MARKER)};`,
    'if (g[m]) return;',
    'g[m] = true;',
    `const k = ${JSON.stringify(WORKER_URL_GLOBAL)};`,
    'if (!g[k]) {',
    'const d = typeof document !== "undefined" ? document : null;',
    'const s = d && d.currentScript && "src" in d.currentScript ? d.currentScript : null;',
    'const b = s && s.src ? s.src : (typeof location !== "undefined" ? location.href : undefined);',
    `if (b) g[k] = new URL(${JSON.stringify(assetSpecifier)}, b).href;`,
    '}',
    '} catch {}',
    '})();',
  ].join('');
}

function findWorkerAssetSpecifier(source) {
  for (const match of source.matchAll(BROWSER_WORKER_ASSET_SPECIFIER_RE)) {
    const specifier = match[2];
    if (specifier) return specifier;
  }
  return null;
}

function normalizeWorkerAssetFileName(chunkFileName, assetSpecifier) {
  if (/^[a-z]+:/i.test(assetSpecifier) || assetSpecifier.startsWith('//')) return null;
  const normalized = assetSpecifier.startsWith('/')
    ? assetSpecifier.slice(1)
    : path.posix.normalize(path.posix.join(path.posix.dirname(chunkFileName), assetSpecifier));
  const fileName = normalized.startsWith('./') ? normalized.slice(2) : normalized;
  return WORKER_ASSET_FILE_RE.test(fileName) ? fileName : null;
}

function workerAssetUrlBase(format) {
  // Worker construction is browser-only. `import.meta.url` is valid only in
  // ESM; script and CommonJS outputs use the same browser-safe URL base as the
  // CDN build so every emitted file remains parseable in its declared format.
  return format === 'es' ? 'import.meta.url' : 'document.baseURI';
}

function collapseNestedWorkerAssetUrls(source, chunkFileName, format) {
  const urlBase = workerAssetUrlBase(format);
  return source.replace(VITE_NESTED_WORKER_ASSET_RE, (_full, quote, assetSpecifier, workerOptions) => {
    const assetFileName = normalizeWorkerAssetFileName(chunkFileName, assetSpecifier);
    const replacement = assetFileName ? relativeAssetSpecifier(chunkFileName, assetFileName) : assetSpecifier;
    return `new Worker(new URL(${quote}${replacement}${quote}, ${urlBase}), ${workerOptions})`;
  });
}

function normalizeStaticWorkerAssetUrls(source, chunkFileName, format) {
  const urlBase = workerAssetUrlBase(format);
  const normalizedSource = source.replace(VITE_STATIC_WORKER_ASSET_RE, (full, quote, assetSpecifier) => {
    const assetFileName = normalizeWorkerAssetFileName(chunkFileName, assetSpecifier);
    if (!assetFileName) return full;
    const replacement = relativeAssetSpecifier(chunkFileName, assetFileName);
    return `new Worker(new URL(${quote}${replacement}${quote},`;
  });
  return normalizedSource.replace(VITE_STATIC_WORKER_IMPORT_META_BASE_RE, (_full, prefix) => `${prefix}${urlBase}`);
}

/**
 * Vite library builds inline all URL assets regardless of assetsInlineLimit.
 * That breaks the V2 browser worker because the compiled worker is ~2.2 MB,
 * which becomes a ~3 MB data URL that Chromium rejects as a module worker.
 *
 * The private @superdoc/docx-engine build already emits a real worker asset. This plugin
 * restores that invariant after the public superdoc library build re-bundles
 * the private runtime.
 */
export function preserveV2WorkerAssetPlugin() {
  const emitted = new Map();

  return {
    name: 'superdoc-preserve-v2-worker-asset',
    enforce: 'post',
    generateBundle(outputOptions, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;

        let nextCode = output.code;
        let changed = false;
        let workerAssetForChunk = null;
        nextCode = nextCode.replace(WORKER_DATA_URL_RE, (full, quote, base64) => {
          const workerSource = decodeBase64Worker(base64);
          if (
            !workerSource ||
            (!workerSource.includes(REVIEW_INDEX_WORKER_MARKER) &&
              (!workerSource.includes(V2_WORKER_REALM_MARKER) || !workerSource.includes(V2_WORKER_HELLO_MARKER)))
          ) {
            return full;
          }

          const fileName = buildWorkerFileName(workerSource);
          if (!emitted.has(fileName)) {
            emitted.set(fileName, workerSource);
            this.emitFile({
              type: 'asset',
              fileName,
              source: workerSource,
            });
          }

          changed = true;
          // Only the default kernel worker feeds the IIFE URL-global prelude;
          // collaboration/review workers resolve through their own static URLs.
          if (fileName.includes('/browser-worker-entry-')) {
            workerAssetForChunk = fileName;
          }
          const replacement = relativeAssetSpecifier(output.fileName, fileName);
          return `${quote}${replacement}${quote}`;
        });

        const collapsedCode = collapseNestedWorkerAssetUrls(nextCode, output.fileName, outputOptions.format);
        if (collapsedCode !== nextCode) {
          nextCode = collapsedCode;
          changed = true;
        }

        const normalizedCode = normalizeStaticWorkerAssetUrls(nextCode, output.fileName, outputOptions.format);
        if (normalizedCode !== nextCode) {
          nextCode = normalizedCode;
          changed = true;
        }

        if (outputOptions.format === 'iife') {
          const relativeWorkerAsset = workerAssetForChunk
            ? relativeAssetSpecifier(output.fileName, workerAssetForChunk)
            : findWorkerAssetSpecifier(nextCode);
          if (relativeWorkerAsset && !nextCode.includes(WORKER_URL_PRELUDE_MARKER)) {
            nextCode = `${createIifeWorkerUrlPrelude(relativeWorkerAsset)}${nextCode}`;
            changed = true;
          }
        }

        if (changed) output.code = nextCode;
      }
    },
  };
}
