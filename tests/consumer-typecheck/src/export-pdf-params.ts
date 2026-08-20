/**
 * Consumer typecheck: client-side PDF export via `superdoc.export()`.
 *
 * Pins the public shape of the PDF export surface so a regression fails CI:
 *   - `ExportType` includes `'pdf'`, so `exportType: ['pdf']` type-checks;
 *   - `ExportParams.pdfOptions` is optional and carries `fontBaseUrl`, `fonts`,
 *     `embeddedFonts`, `onProgress`, and `mode` ('word' vector | 'pixel'
 *     pixel-exact raster).
 *
 * Mirrors the documented call from the feature brief:
 *   await superdoc.export({ exportType: ['pdf'], triggerDownload: true });
 */
import type { ExportParams, ExportType } from 'superdoc';

// `'pdf'` (and the other output formats) must remain assignable to ExportType.
const docx: ExportType = 'docx';
const pdf: ExportType = 'pdf';
const html: ExportType = 'html';

// The canonical PDF export call shape from the brief.
const pdfExport: ExportParams = {
  exportType: ['pdf'],
  triggerDownload: true,
  exportedName: 'my-document',
};

// Combined DOCX + PDF export (multi-format) still type-checks.
const bothFormats: ExportParams = { exportType: ['docx', 'pdf'] };

// The full pdfOptions bag a consumer may pass.
const withPdfOptions: ExportParams = {
  exportType: ['pdf'],
  pdfOptions: {
    fontBaseUrl: '/fonts',
    fonts: { 'sans:regular': new ArrayBuffer(0) },
    embeddedFonts: { Ubuntu: { regular: new Uint8Array(0), bold: new Uint8Array(0) } },
    onProgress: (message: string) => void message,
    mode: 'word',
  },
};

// Pixel-exact raster mode is a valid rendering strategy.
const pixelMode: ExportParams = {
  exportType: ['pdf'],
  pdfOptions: { mode: 'pixel' },
};

// pdfOptions is optional (omitting it is valid).
const noPdfOptions: ExportParams = { exportType: ['pdf'] };

// Strict type-equality: a re-narrowing of `pdfOptions` (or dropping a field)
// would leave the assignments above compiling, so pin the exact field type.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

const _pdfOptionsTypeIsExact: AssertEqual<
  ExportParams['pdfOptions'],
  | {
      fontBaseUrl?: string;
      fonts?: Record<string, ArrayBuffer>;
      embeddedFonts?: Record<string, Partial<Record<'regular' | 'bold' | 'italic' | 'bolditalic', Uint8Array>>>;
      onProgress?: (message: string) => void;
      mode?: 'word' | 'pixel';
    }
  | undefined
> = true;

void [docx, pdf, html, pdfExport, bothFormats, withPdfOptions, noPdfOptions, pixelMode, _pdfOptionsTypeIsExact];
