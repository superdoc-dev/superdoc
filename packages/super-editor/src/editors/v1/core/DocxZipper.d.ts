/**
 * Hand-written declarations for `DocxZipper`. The implementation lives in
 * the sibling `DocxZipper.js`. Earlier versions exposed
 * `constructor(...args: any[])` + `[key: string]: any`, which collapsed
 * every consumer access to `any`. SD-3213c replaced that catchall with an
 * explicit minimal surface so DocxZipper no longer contributes to the
 * audit's `tier-4-public-contract` bucket.
 *
 * Argument shapes are intentionally wide (`unknown`, `Record<string, unknown>`)
 * because the values internal callers pass are parsed OOXML JSON with no
 * closed schema. Wide-but-not-any keeps `tsc` strict mode happy without
 * pretending we have a type contract we cannot deliver.
 */
export default class DocxZipper {
  constructor(params?: { debug?: boolean });

  // Instance properties populated during read / export. Internal Editor
  // code reads these directly.
  media: Record<string, string>;
  mediaFiles: Record<string, string>;
  fonts: Record<string, Uint8Array>;
  decryptedFileData: Uint8Array | null;

  // Instance methods called by internal Editor code.
  getDocxData(
    file: unknown,
    isNode?: boolean,
    options?: { password?: string },
  ): Promise<{ name: string; content: string }[]>;
  updateContentTypes(
    docx: unknown,
    media: Record<string, unknown>,
    fromJson: boolean,
    updatedDocs?: Record<string, unknown>,
    fonts?: Record<string, unknown>,
  ): Promise<string | undefined>;
  // Return type matches JSZip.generateAsync output as consumed by the
  // internal export pipeline: Blob in the browser, Buffer in Node
  // (headless mode).
  updateZip(args: Record<string, unknown>): Promise<Blob | Buffer | string | Record<string, string>>;
}
