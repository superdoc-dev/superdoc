/**
 * Consumer typecheck: superdoc/converter subpath.
 *
 * Pre-SD-2953 this subpath was exported at runtime but had no `.d.ts`,
 * so a strict consumer importing from it hit TS7016. SD-2953 added a
 * `types` field pointing at the existing SuperConverter declaration.
 *
 * SD-3213c tightened the static method signatures and added a typed
 * constructor. The assertions below lock that subset of the contract
 * (note: `SuperConverter` instance access still flows through the
 * retained `[key: string]: any` catchall — see SD-3235 for that work).
 */

import { SuperConverter, hasBodyNumberingReferences } from 'superdoc/converter';

type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends false> = T;

// SuperConverter must NOT be `any` (the SD-2828 contract).
type _ConverterReal = Assert<IsAny<typeof SuperConverter>>;
type _HasBodyNumberingReferencesReal = Assert<IsAny<typeof hasBodyNumberingReferences>>;

// Typed statics resolve and return the declared shapes (SD-3213c contract).
const _version: string | null = SuperConverter.getStoredSuperdocVersion([
  { name: 'docProps/custom.xml', content: '<xml />' },
]);
const _updatedVersion: string | null = SuperConverter.setStoredSuperdocVersion({}, '1.2.3');
const _v: string | null = SuperConverter.extractDocumentGuid([{ name: 'word/settings.xml', content: '<xml/>' }]);
const _hasNumberingReferences: boolean = hasBodyNumberingReferences({
  elements: [{ name: 'w:numPr' }],
});

// Each typed static must NOT be `any`.
type _GetVersionReal = Assert<IsAny<typeof SuperConverter.getStoredSuperdocVersion>>;
type _SetVersionReal = Assert<IsAny<typeof SuperConverter.setStoredSuperdocVersion>>;
type _ExtractGuidReal = Assert<IsAny<typeof SuperConverter.extractDocumentGuid>>;

// Tightened param shape: passing a raw string to a method that expects
// `readonly { name; content }[]` must error.
// @ts-expect-error extractDocumentGuid expects DOCX file entries, not raw XML.
SuperConverter.extractDocumentGuid('<xml/>');

// Constructor accepts the documented init keys the impl reads, including
// `xml` and `json` which earlier drafts of the typed constructor missed.
const _converterFromXml = new SuperConverter({ xml: '<xml/>', debug: true });
const _converterFromJson = new SuperConverter({ json: { elements: [] }, debug: true });
void _converterFromXml;
void _converterFromJson;

void _version;
void _updatedVersion;
void _v;
void _hasNumberingReferences;
