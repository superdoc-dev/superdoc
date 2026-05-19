/**
 * Consumer typecheck: superdoc/docx-zipper subpath.
 *
 * Pre-SD-2953 this subpath was exported at runtime but had no `.d.ts`,
 * so a strict consumer importing from it hit TS7016. SD-2953 added a
 * `types` field pointing at the existing DocxZipper declaration.
 */

import DocxZipper from 'superdoc/docx-zipper';

type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends false> = T;

// DocxZipper must NOT be `any`.
type _ZipperReal = Assert<IsAny<typeof DocxZipper>>;

// Constructable as a class.
const _zipper = new DocxZipper();

void _zipper;
