/**
 * Consumer typecheck: superdoc/docx-zipper subpath.
 *
 * Pre-SD-2953 this subpath was exported at runtime but had no `.d.ts`,
 * so a strict consumer importing from it hit TS7016. SD-2953 added a
 * `types` field pointing at the existing DocxZipper declaration.
 *
 * SD-3213c drained the `[key: string]: any` catchall from
 * `DocxZipper.d.ts` and added typed instance properties + methods. The
 * assertions below lock that contract so a future PR cannot silently
 * reintroduce `any` while still passing the broad matrix.
 */

import DocxZipper from 'superdoc/docx-zipper';

type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends false> = T;

// DocxZipper must NOT be `any`.
type _ZipperReal = Assert<IsAny<typeof DocxZipper>>;

// Constructable as a class with the typed params object.
const _zipper = new DocxZipper({ debug: true });

// Instance properties must NOT be `any` (SD-3213c contract).
type _MediaReal = Assert<IsAny<typeof _zipper.media>>;
type _MediaFilesReal = Assert<IsAny<typeof _zipper.mediaFiles>>;
type _FontsReal = Assert<IsAny<typeof _zipper.fonts>>;
type _DecryptedReal = Assert<IsAny<typeof _zipper.decryptedFileData>>;

// Instance methods must NOT be `any` (SD-3213c contract).
type _GetDocxDataReal = Assert<IsAny<typeof _zipper.getDocxData>>;
type _UpdateContentTypesReal = Assert<IsAny<typeof _zipper.updateContentTypes>>;
type _UpdateZipReal = Assert<IsAny<typeof _zipper.updateZip>>;

// Declared properties and methods must be callable with the public shapes.
const _media: Record<string, string> = _zipper.media;
const _mediaFiles: Record<string, string> = _zipper.mediaFiles;
const _fonts: Record<string, Uint8Array> = _zipper.fonts;
const _decryptedFileData: Uint8Array | null = _zipper.decryptedFileData;
const _docxData: Promise<{ name: string; content: string }[]> = _zipper.getDocxData(new Uint8Array(), true, {
  password: 'secret',
});
const _contentTypes: Promise<string | undefined> = _zipper.updateContentTypes({}, {}, false);
const _zip: Promise<Blob | Buffer | string | Record<string, string>> = _zipper.updateZip({});

// The `[key: string]: any` catchall is gone; arbitrary access must error.
// @ts-expect-error DocxZipper no longer exposes arbitrary `any` members.
_zipper.notARealMember;

void _zipper;
void _media;
void _mediaFiles;
void _fonts;
void _decryptedFileData;
void _docxData;
void _contentTypes;
void _zip;
