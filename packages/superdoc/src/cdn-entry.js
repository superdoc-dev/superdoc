// Entry point for the CDN IIFE build (vite.config.cdn.js → superdoc.min.js).
// Exposes the SuperDoc class as `window.SuperDoc` directly (so consumers write
// `new SuperDoc({...})`) while still attaching every named export as a static
// property (`SuperDoc.createTheme`, `SuperDoc.DOCX`, etc.). Pattern borrowed
// from Quill / Chart.js.

import { SuperDoc } from './core/SuperDoc.js';
import { setBundledFontAssetBase } from '@superdoc/font-system';
import * as namespace from './index.js';

// Default the bundled-font asset base to `./fonts/` relative to THIS script - the CDN
// package layout ships `superdoc.min.js` next to `fonts/*.woff2`. `document.currentScript`
// is valid while the script is executing (this top-level runs then), and null later in
// callbacks, so we must capture it here, not inside font loading. Consumer config
// (`fonts.assetBaseUrl` / `fonts.resolveAssetUrl`) takes precedence over this default.
try {
  const script = typeof document !== 'undefined' ? document.currentScript : null;
  if (script && script.src) {
    setBundledFontAssetBase(new URL('./fonts/', script.src).href);
  }
} catch {
  /* best-effort; explicit config + the /fonts/ fallback remain */
}

for (const [key, value] of Object.entries(namespace)) {
  if (key === 'SuperDoc' || key === 'default') continue;
  if (!Object.prototype.hasOwnProperty.call(SuperDoc, key)) {
    SuperDoc[key] = value;
  }
}

export default SuperDoc;
