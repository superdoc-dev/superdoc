/**
 * Consumer typecheck: superdoc/file-zipper subpath.
 *
 * Pre-SD-2953 this subpath was exported at runtime but had no `.d.ts`,
 * so a strict consumer importing from it hit TS7016. SD-2953 added a
 * `types` field pointing at the existing zipper.js declaration.
 */

import { createZip } from 'superdoc/file-zipper';

type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends false> = T;

// createZip must NOT be `any`.
type _CreateZipReal = Assert<IsAny<typeof createZip>>;

// Returns a Promise<Blob> per the JSDoc.
declare const blobs: any;
declare const fileNames: any;
const _result: Promise<Blob> = createZip(blobs, fileNames);

void _result;
