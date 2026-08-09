'use client';

import runtime from '@/config/editor-demo-runtime.json';

/**
 * Loading the pinned SuperDoc runtime for documentation embeds.
 *
 * Extracted from `editor-demo.tsx` when a second embed needed the same thing.
 * The scope is deliberately narrow: fetch the CDN runtime, its stylesheet, the
 * engine worker, and the UI module, and hand back the constructor. Presentation,
 * fixtures, reset, and fullscreen stay with each embed, because those are where
 * the embeds actually differ.
 *
 * The module-level promises are the reason this is shared rather than copied:
 * two embeds on one page must not race to append the same script tag or build a
 * second worker object URL.
 */

const runtimePackageUrl = `${runtime.cdnOrigin}/${runtime.runtimePackage}@${runtime.runtimeVersion}`;
const runtimeBaseUrl = `${runtimePackageUrl}/dist-cdn`;
const engineBaseUrl = `${runtime.cdnOrigin}/${runtime.enginePackage}@${runtime.engineVersion}/dist-cdn`;
const uiModuleUrl = `${runtimePackageUrl}${runtime.uiModulePath}`;

export type SuperDocConstructor = typeof import('superdoc').SuperDoc;
export type SuperDocInstance = InstanceType<SuperDocConstructor>;
export type SuperDocUIModule = Pick<typeof import('superdoc/ui'), 'createSuperDocUI'>;

declare global {
  interface Window {
    SuperDoc?: SuperDocConstructor;
    __SUPERDOC_V2_BROWSER_WORKER_URL__?: string;
  }
}

let runtimePromise: Promise<SuperDocConstructor> | null = null;
let uiModulePromise: Promise<SuperDocUIModule> | null = null;
let workerObjectUrl: string | null = null;

function hasPath(value: unknown): value is { path: string } {
  return typeof value === 'object' && value !== null && 'path' in value && typeof value.path === 'string';
}

async function configureWorker() {
  if (window.__SUPERDOC_V2_BROWSER_WORKER_URL__) return;

  const response = await fetch(`${engineBaseUrl}/manifest.json`);
  if (!response.ok) throw new Error(`Engine manifest request failed with ${response.status}.`);

  const manifest: unknown = await response.json();
  if (typeof manifest !== 'object' || manifest === null || !('files' in manifest) || !Array.isArray(manifest.files)) {
    throw new Error('The engine manifest has an unsupported shape.');
  }

  const worker = manifest.files.find(
    (file: unknown) => hasPath(file) && file.path.startsWith('assets/browser-worker-entry-'),
  );
  if (!hasPath(worker)) throw new Error('The engine manifest does not include a browser worker.');

  const workerModuleUrl = new URL(worker.path, `${engineBaseUrl}/`).href;
  workerObjectUrl = URL.createObjectURL(
    new Blob([`import ${JSON.stringify(workerModuleUrl)};`], { type: 'application/javascript' }),
  );
  window.__SUPERDOC_V2_BROWSER_WORKER_URL__ = workerObjectUrl;
}

function resetConfiguredWorker() {
  if (!workerObjectUrl) return;

  URL.revokeObjectURL(workerObjectUrl);
  if (window.__SUPERDOC_V2_BROWSER_WORKER_URL__ === workerObjectUrl) {
    window.__SUPERDOC_V2_BROWSER_WORKER_URL__ = undefined;
  }
  workerObjectUrl = null;
}

function loadRuntimeAsset(element: HTMLLinkElement | HTMLScriptElement) {
  return new Promise<void>((resolve, reject) => {
    element.addEventListener('load', () => resolve(), { once: true });
    element.addEventListener('error', () => reject(new Error(`Could not load ${element.tagName.toLowerCase()}.`)), {
      once: true,
    });
    document.head.append(element);
  });
}

/** Load the pinned runtime once per page and resolve with the constructor. */
export function loadRuntime() {
  if (window.SuperDoc) return Promise.resolve(window.SuperDoc);
  if (runtimePromise) return runtimePromise;

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = `${runtimeBaseUrl}/superdoc.min.css`;

  const script = document.createElement('script');
  script.src = `${runtimeBaseUrl}/superdoc.min.js`;
  script.async = true;

  runtimePromise = Promise.all([loadRuntimeAsset(stylesheet), loadRuntimeAsset(script), configureWorker()])
    .then(() => {
      if (!window.SuperDoc) throw new Error('The SuperDoc runtime did not initialize.');
      return window.SuperDoc;
    })
    .catch((error: unknown) => {
      // Clear every cached handle so a retry re-attempts the whole load rather
      // than resolving against a half-initialized runtime.
      runtimePromise = null;
      stylesheet.remove();
      script.remove();
      window.SuperDoc = undefined;
      resetConfiguredWorker();
      throw error;
    });

  return runtimePromise;
}

/** Load the public `superdoc/ui` module from the same pinned package. */
export function loadUIModule() {
  if (uiModulePromise) return uiModulePromise;

  uiModulePromise = import(/* webpackIgnore: true */ uiModuleUrl)
    .then((module: unknown) => {
      const candidate = module as Partial<SuperDocUIModule>;
      if (typeof candidate.createSuperDocUI !== 'function') {
        throw new Error('The SuperDoc UI module did not initialize.');
      }
      return candidate as SuperDocUIModule;
    })
    .catch((error: unknown) => {
      uiModulePromise = null;
      throw error;
    });

  return uiModulePromise;
}
