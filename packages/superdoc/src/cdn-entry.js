// Entry point for the CDN IIFE build (vite.config.cdn.js → superdoc.min.js).
// Exposes the SuperDoc class as `window.SuperDoc` directly (so consumers write
// `new SuperDoc({...})`) while still attaching every named export as a static
// property (`SuperDoc.createTheme`, `SuperDoc.DOCX`, etc.). Pattern borrowed
// from Quill / Chart.js.

import { SuperDoc } from './core/SuperDoc.js';
import * as namespace from './index.js';

for (const [key, value] of Object.entries(namespace)) {
  if (key === 'SuperDoc' || key === 'default') continue;
  if (!Object.prototype.hasOwnProperty.call(SuperDoc, key)) {
    SuperDoc[key] = value;
  }
}

export default SuperDoc;
