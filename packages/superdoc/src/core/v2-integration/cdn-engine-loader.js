import { configureDefaultV2IntegrationLoader } from './v2-integration.js';

const ENGINE_CDN_OVERRIDE = 'SUPERDOC_ENGINE_CDN_BASE_URL';
const ENGINE_CDN_LOAD_STATE = Symbol.for('superdoc.docx-engine.cdn-load-state');
const ENGINE_STYLESHEET_STATUS = 'superdocDocxEngineStatus';

/**
 * @param {typeof globalThis} globalObject
 * @param {string} engineVersion
 * @param {string | null} buildOverride
 */
export function resolveDocxEngineCdnBaseUrl(globalObject, engineVersion, buildOverride = null) {
  const runtimeOverride = globalObject?.[ENGINE_CDN_OVERRIDE];
  const override = typeof runtimeOverride === 'string' && runtimeOverride.trim() ? runtimeOverride : buildOverride;
  if (typeof override === 'string' && override.trim()) return normalizeCdnBaseUrl(override);
  if (!engineVersion) throw new Error('SuperDoc: the CDN build is missing its exact DOCX Engine version');
  return `https://cdn.jsdelivr.net/npm/@superdoc/docx-engine@${engineVersion}`;
}

function normalizeCdnBaseUrl(value) {
  const normalized = value.trim().replace(/\/+$/, '');
  const scheme = normalized.match(/^([a-z][a-z\d+.-]*):/iu)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') {
    throw new TypeError(`SuperDoc: unsupported DOCX Engine CDN URL scheme ${scheme}:`);
  }
  return normalized;
}

/** @param {{ engineVersion: string, buildBaseUrl: string | null }} options */
export function configureCdnEngineLoader({ engineVersion, buildBaseUrl }) {
  configureDefaultV2IntegrationLoader(() => {
    const baseUrl = resolveDocxEngineCdnBaseUrl(globalThis, engineVersion, buildBaseUrl);
    const existingState = globalThis[ENGINE_CDN_LOAD_STATE];
    const state = existingState instanceof Map ? existingState : new Map();
    globalThis[ENGINE_CDN_LOAD_STATE] = state;
    if (!state.has(baseUrl)) {
      const load = Promise.all([
        import(/* @vite-ignore */ `${baseUrl}/dist-cdn/docx-engine.es.js`),
        loadStylesheetOnce(`${baseUrl}/dist-cdn/style.css`),
      ]).then(([engineModule]) => engineModule);
      state.set(baseUrl, load);
      void load.catch(() => {
        if (state.get(baseUrl) === load) state.delete(baseUrl);
      });
    }
    return state.get(baseUrl);
  });
}

/**
 * @param {string} url
 * @returns {Promise<void>}
 */
export function loadStylesheetOnce(url) {
  if (typeof document === 'undefined') return Promise.resolve();
  const absoluteUrl = new URL(url, document.baseURI).href;
  const existing = Array.from(document.querySelectorAll('link[rel~="stylesheet"]')).find(
    (link) => link.href === absoluteUrl,
  );
  if (existing?.sheet || existing?.dataset[ENGINE_STYLESHEET_STATUS] === 'loaded') {
    return Promise.resolve();
  }
  const canReuseExisting = existing?.dataset[ENGINE_STYLESHEET_STATUS] === 'loading';
  if (existing && !canReuseExisting) existing.remove();

  return new Promise((resolve, reject) => {
    const link = canReuseExisting ? existing : document.createElement('link');
    let settled = false;
    let observer;
    const settle = (status, callback) => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      link.dataset[ENGINE_STYLESHEET_STATUS] = status;
      callback();
    };
    const handleLoad = () => settle('loaded', resolve);
    const handleError = () =>
      settle('error', () => reject(new Error(`SuperDoc: failed to load DOCX Engine styles from ${absoluteUrl}`)));
    const handleRemoval = () => {
      if (!link.isConnected) {
        settle('error', () =>
          reject(new Error(`SuperDoc: DOCX Engine stylesheet was removed while loading from ${absoluteUrl}`)),
        );
      }
    };
    link.addEventListener('load', handleLoad, { once: true });
    link.addEventListener('error', handleError, { once: true });
    if (typeof globalThis.MutationObserver === 'function') {
      observer = new globalThis.MutationObserver(handleRemoval);
      observer.observe(document.head, { childList: true });
    }
    if (!canReuseExisting) {
      link.rel = 'stylesheet';
      link.href = absoluteUrl;
      link.dataset.superdocDocxEngine = 'true';
      link.dataset[ENGINE_STYLESHEET_STATUS] = 'loading';
      document.head.appendChild(link);
    }
  });
}
