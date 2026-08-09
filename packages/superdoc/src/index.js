// @ts-check
import './core/v2-integration/browser-peer-runtime.js';

import { DOCX, PDF, HTML, getFileObject, compareVersions } from '@superdoc/common';
// @ts-expect-error Vite resolves DOCX asset URL imports; plain tsc does not.
import BlankDOCX from '@superdoc/common/data/blank.docx?url';

export { SuperDoc } from './core/SuperDoc.js';
export { createTheme, buildTheme } from './core/theme/create-theme.js';
// v2 extension API factory.  Types are re-exported from the typed facade
// (src/public/index.ts); this runtime re-export ships the value in the bundle.
export { defineSuperDocExtension } from './core/extensions/index.js';
export { BlankDOCX, getFileObject, compareVersions, DOCX, PDF, HTML };
