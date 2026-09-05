import type { DocumentApi } from 'superdoc';

declare const api: DocumentApi;

// Parameter shape: a paragraph style, including the run properties that are
// reachable only on a named style (`w:rtl`, `w:cs`) and not in docDefaults.
const receipt = api.styles.create(
  {
    id: 'Kushya',
    name: 'Kushya',
    type: 'paragraph',
    basedOn: 'Normal',
    next: 'Terutz',
    aliases: ['Question'],
    priority: 21,
    qFormat: true,
    custom: true,
    conflictPolicy: 'replace',
    paragraph: { keepNext: true, rightToLeft: true },
    run: { bold: true, rtl: true, cs: true },
  },
  { dryRun: true },
);

// Return shape.
if (receipt.success) {
  const changed: boolean = receipt.changed;
  const created: boolean = receipt.created;
  const scope: 'style' = receipt.resolution.scope;
  const styleId: string = receipt.resolution.id;
  const styleType: 'paragraph' | 'character' = receipt.resolution.type;
  const xmlPart: string = receipt.resolution.xmlPart;
  // Per channel, so a style carrying both `w:pPr` and `w:rPr` stays readable.
  const runState = receipt.after.run;
  const paragraphState = receipt.before?.paragraph ?? null;
  void [changed, created, scope, styleId, styleType, xmlPart, runState, paragraphState];
} else {
  const code: string = receipt.failure.code;
  void code;
}

// A character style takes run properties and nothing paragraph-shaped.
const characterReceipt = api.styles.create({
  id: 'Emphasis2',
  name: 'Emphasis 2',
  type: 'character',
  run: { italic: true, highlight: 'yellow' },
});

void characterReceipt;
