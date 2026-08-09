import type { SuperDoc } from 'superdoc';

declare const superdoc: SuperDoc;

// Keep both public inputs callable after BrowserDocumentApi maps synchronous
// Document API methods to their async-capable browser equivalents.
if (superdoc.activeEditor?.doc) {
  void superdoc.activeEditor.doc.query.match({
    select: { type: 'text', pattern: 'Confidential Information' },
    require: 'exactlyOne',
  });

  void superdoc.activeEditor.doc.query.match({ type: 'text', pattern: 'Confidential Information' });
}
