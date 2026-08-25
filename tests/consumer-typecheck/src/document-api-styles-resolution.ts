import type { DocumentApi } from 'superdoc';

declare const api: DocumentApi;

const receipt = api.styles.apply({
  target: { scope: 'docDefaults', channel: 'run' },
  patch: { bold: true },
});
const xmlPart: string = receipt.resolution.xmlPart;
const relationshipBackedResolution: typeof receipt.resolution = {
  scope: 'docDefaults',
  channel: 'run',
  xmlPart: 'word/catalog/style-set.xml',
  xmlPath: 'w:styles/w:docDefaults/w:rPrDefault/w:rPr',
};

void [xmlPart, relationshipBackedResolution];
