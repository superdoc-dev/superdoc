import { registerLayoutDocumentAdapter } from '@superdoc/layout-adapter';

import { pmLayoutDocumentAdapter } from './layout-document-adapter.js';

registerLayoutDocumentAdapter(pmLayoutDocumentAdapter);
