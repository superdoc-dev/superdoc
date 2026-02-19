import { DOMSerializer } from 'prosemirror-model';

export function getHTMLFromFragment(fragment, schema, domDocument) {
  const resolvedDocument = domDocument ?? (typeof document !== 'undefined' ? document : null);
  if (!resolvedDocument) {
    throw new Error(
      '[super-editor] getHTMLFromFragment() requires a DOM. Provide { document } (e.g. from JSDOM), set DOM globals, or run in a browser environment.',
    );
  }

  const documentFragment = DOMSerializer.fromSchema(schema).serializeFragment(fragment, {
    document: resolvedDocument,
  });

  const container = resolvedDocument.createElement('div');
  container.appendChild(documentFragment);

  return container.innerHTML;
}
