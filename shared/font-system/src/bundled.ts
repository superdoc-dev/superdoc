import type { FontRegistry } from './registry';
import type { FontAssetUrlContext, FontAssetUrlResolver } from './types';
import { BUNDLED_MANIFEST } from './bundled-manifest';

export type { BundledLicense, BundledFaceFile, BundledFamilyManifest } from './bundled-manifest';
export type { FontAssetUrlContext, FontAssetUrlResolver } from './types';
export { BUNDLED_MANIFEST } from './bundled-manifest';

/**
 * Last-resort base URL the bundled `.woff2` are served from. Used only when neither a
 * `resolveAssetUrl` nor an `assetBaseUrl` is configured and no build target set a default.
 * A dev / simple-self-host fallback, NOT the product deploy assumption.
 */
export const DEFAULT_BUNDLED_FONT_BASE = '/fonts/';

// Module-level default base. The CDN/IIFE entry overrides it with a script-relative URL
// at load (see cdn-entry). The editor's config (resolveAssetUrl / assetBaseUrl) takes
// precedence over this; it is only the floor of the resolution chain.
let defaultAssetBase = DEFAULT_BUNDLED_FONT_BASE;

/** Override the default asset base (e.g. the CDN entry sets a script-relative URL). */
export function setBundledFontAssetBase(base: string): void {
  defaultAssetBase = base;
}

/** The current default asset base (script-relative on CDN, else {@link DEFAULT_BUNDLED_FONT_BASE}). */
export function getBundledFontAssetBase(): string {
  return defaultAssetBase;
}

// Whether the bundled pack is served WITHOUT per-instance config. The CDN `<script>` build ships
// `fonts/*.woff2` next to `superdoc.min.js`, so its entry marks the pack present; npm consumers
// signal it per instance via `fonts.resolveAssetUrl` / `fonts.assetBaseUrl` instead. Drives the
// config-presence gate (`deriveBundledActivation`) so the toolbar/resolver light up the rich pack
// only when it will actually be served.
let bundledPackPresent = false;

/** Mark the bundled pack as served page-globally (the CDN build calls this beside its base setter). */
export function markBundledPackPresent(): void {
  bundledPackPresent = true;
}

/** Whether the bundled pack is served page-globally (set by the CDN build). */
export function isBundledPackPresent(): boolean {
  return bundledPackPresent;
}

/** Reset the page-global pack-present flag. Test-only; not part of the public surface. */
export function __resetBundledPackPresent(): void {
  bundledPackPresent = false;
}

export interface InstallBundledOptions {
  /** Highest-precedence per-face URL resolver (consumer `fonts.resolveAssetUrl`). */
  resolveAssetUrl?: FontAssetUrlResolver;
  /** Base URL the `.woff2` are served from (consumer `fonts.assetBaseUrl`). */
  assetBaseUrl?: string;
}

function withTrailingSlash(base: string): string {
  return base.endsWith('/') ? base : `${base}/`;
}

function joinUrl(base: string, file: string): string {
  return `${withTrailingSlash(base)}${file}`;
}

function weightToken(weight: 'normal' | 'bold'): string {
  return weight === 'bold' ? '700' : '400';
}

// Per-registry install record: the resolved asset signature of the FIRST install. A
// registry is shared per `FontFaceSet` (per document), so two SuperDoc instances on one
// page share it. The first config wins (the common case is one font config per document);
// a later install resolving to a DIFFERENT location is reported, not silently dropped.
const installedRegistries = new WeakMap<FontRegistry, string>();

/** Resolved URL of the first manifest face - a cheap signature of the asset location. */
function bundledAssetSignature(resolve: FontAssetUrlResolver): string {
  const family = BUNDLED_MANIFEST[0];
  const face = family?.faces[0];
  if (!family || !face) return '';
  return resolve({
    file: face.file,
    family: family.family,
    weight: weightToken(face.weight),
    style: face.style,
    source: 'bundled-substitute',
  });
}

/**
 * Register the bundled substitute pack into a registry, once, as URL-sourced faces.
 *
 * The pack is one font PROVIDER - it registers `url(...)` faces through the same
 * `registry.register` path as customer/embedded fonts, never importing font binaries
 * into shared runtime, so the bytes are emitted as separate assets and never inlined.
 *
 * URL resolution precedence (per face): `resolveAssetUrl` -> `assetBaseUrl` -> the module
 * default base (script-relative on CDN, else `/fonts/`). Loading stays lazy at the binary
 * level: a `.woff2` is fetched only when the load gate awaits the family a document
 * declares. Idempotent per registry. Physical family names MUST match the resolver's
 * substitute targets.
 */
export function installBundledSubstitutes(registry: FontRegistry, options: InstallBundledOptions = {}): void {
  const resolve: FontAssetUrlResolver =
    options.resolveAssetUrl ?? ((context) => joinUrl(options.assetBaseUrl ?? defaultAssetBase, context.file));
  const signature = bundledAssetSignature(resolve);
  const installed = installedRegistries.get(registry);
  if (installed !== undefined) {
    if (installed !== signature) {
      console.warn(
        `[superdoc] bundled fonts are already registered for this document from "${installed}"; ` +
          `a later fonts config resolving to "${signature}" is ignored. ` +
          `Use one fonts.assetBaseUrl / fonts.resolveAssetUrl per document.`,
      );
    }
    return;
  }
  installedRegistries.set(registry, signature);
  for (const family of BUNDLED_MANIFEST) {
    for (const face of family.faces) {
      const context: FontAssetUrlContext = {
        file: face.file,
        family: family.family,
        weight: weightToken(face.weight),
        style: face.style,
        source: 'bundled-substitute',
      };
      registry.register({
        family: family.family,
        source: `url(${resolve(context)})`,
        descriptors: { weight: face.weight, style: face.style },
      });
    }
  }
}
