/**
 * Consumer typecheck: superdoc/converter subpath.
 *
 * Pre-SD-2953 this subpath was exported at runtime but had no `.d.ts`,
 * so a strict consumer importing from it hit TS7016. SD-2953 added a
 * `types` field pointing at the existing SuperConverter declaration.
 */

import { SuperConverter, hasBodyNumberingReferences } from 'superdoc/converter';

type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends false> = T;

// SuperConverter must NOT be `any` (the SD-2828 contract).
type _ConverterReal = Assert<IsAny<typeof SuperConverter>>;
type _HasBodyNumberingReferencesReal = Assert<IsAny<typeof hasBodyNumberingReferences>>;

// Static methods documented in the .d.ts must resolve.
const _v: string | null = SuperConverter.extractDocumentGuid('<xml/>');
const _hasNumberingReferences: boolean = hasBodyNumberingReferences({
  elements: [{ name: 'w:numPr' }],
});

void _v;
void _hasNumberingReferences;
