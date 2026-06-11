/**
 * Manifest of the bundled reviewed fallback pack: pure data, no binary
 * imports. The provider ({@link ./bundled}) turns each entry into a `url(...)` face
 * against a runtime base URL, so font bytes are emitted/served as SEPARATE assets and
 * never inlined into the JS bundle. Adding reviewed fallback rows extends the pack without changing
 * the resolver -> registry -> gate -> report flow.
 *
 * The `family` is the physical substitute name (must match the resolver's targets); the
 * `file` is the asset filename under `../assets/`. Family display names with spaces map
 * to space-free file prefixes (e.g. "Liberation Sans" -> `LiberationSans-*.woff2`).
 */

/** License identifier or expression for provenance and diagnostics. */
export type BundledLicense =
  | 'OFL-1.1'
  | 'Apache-2.0'
  | 'AGPL-3.0-only WITH PS-or-PDF-font-exception-20170817'
  | 'GPL-2.0-only WITH Font-exception-2.0'
  | 'LicenseRef-GUST-Font-License-1.0';

/** One shippable face of a bundled family: its style axis + the asset filename. */
export interface BundledFaceFile {
  weight: 'normal' | 'bold';
  style: 'normal' | 'italic';
  /** Asset filename under the pack's `assets/` dir, e.g. `Carlito-Regular.woff2`. */
  file: string;
}

/** A bundled substitute family modeled as its faces. */
export interface BundledFamilyManifest {
  /** Physical family name (the substitute), e.g. "Carlito", "Liberation Sans". */
  family: string;
  license: BundledLicense;
  faces: readonly BundledFaceFile[];
}

/** The standard four faces (regular/bold/italic/bold-italic) for a file prefix. */
function fourFaces(filePrefix: string): BundledFaceFile[] {
  return [
    { weight: 'normal', style: 'normal', file: `${filePrefix}-Regular.woff2` },
    { weight: 'bold', style: 'normal', file: `${filePrefix}-Bold.woff2` },
    { weight: 'normal', style: 'italic', file: `${filePrefix}-Italic.woff2` },
    { weight: 'bold', style: 'italic', file: `${filePrefix}-BoldItalic.woff2` },
  ];
}

function family(name: string, filePrefix: string, license: BundledLicense): BundledFamilyManifest {
  return { family: name, license, faces: fourFaces(filePrefix) };
}

function familyWithFaces(
  name: string,
  license: BundledLicense,
  faces: readonly BundledFaceFile[],
): BundledFamilyManifest {
  return { family: name, license, faces };
}

/**
 * The verified bundled substitutes. Adding a row extends the pack without
 * touching the provider, registry, gate, or report.
 */
export const BUNDLED_MANIFEST: readonly BundledFamilyManifest[] = Object.freeze([
  family('Carlito', 'Carlito', 'OFL-1.1'),
  family('Caladea', 'Caladea', 'Apache-2.0'),
  family('Liberation Sans', 'LiberationSans', 'OFL-1.1'),
  family('Liberation Sans Narrow', 'LiberationSansNarrow', 'GPL-2.0-only WITH Font-exception-2.0'),
  family('Liberation Serif', 'LiberationSerif', 'OFL-1.1'),
  family('Liberation Mono', 'LiberationMono', 'OFL-1.1'),
  familyWithFaces('Caprasimo', 'OFL-1.1', [{ weight: 'normal', style: 'normal', file: 'Caprasimo-Regular.woff2' }]),
  familyWithFaces('Archivo Black', 'OFL-1.1', [
    { weight: 'normal', style: 'normal', file: 'ArchivoBlack-Regular.woff2' },
  ]),
  familyWithFaces('C059', 'AGPL-3.0-only WITH PS-or-PDF-font-exception-20170817', [
    { weight: 'normal', style: 'normal', file: 'C059-Roman.woff2' },
    { weight: 'bold', style: 'normal', file: 'C059-Bold.woff2' },
    { weight: 'normal', style: 'italic', file: 'C059-Italic.woff2' },
    { weight: 'bold', style: 'italic', file: 'C059-BdIta.woff2' },
  ]),
  familyWithFaces('URW Gothic', 'AGPL-3.0-only WITH PS-or-PDF-font-exception-20170817', [
    { weight: 'normal', style: 'normal', file: 'URWGothic-Book.woff2' },
    { weight: 'bold', style: 'normal', file: 'URWGothic-Demi.woff2' },
    { weight: 'normal', style: 'italic', file: 'URWGothic-BookOblique.woff2' },
    { weight: 'bold', style: 'italic', file: 'URWGothic-DemiOblique.woff2' },
  ]),
  familyWithFaces('Bacasime Antique', 'OFL-1.1', [
    { weight: 'normal', style: 'normal', file: 'BacasimeAntique-Regular.woff2' },
  ]),
  familyWithFaces('Oregano Italic', 'OFL-1.1', [
    { weight: 'normal', style: 'normal', file: 'OreganoItalic-Regular.woff2' },
  ]),
  family('Gelasio', 'Gelasio', 'OFL-1.1'),
  familyWithFaces('Cardo', 'OFL-1.1', [
    { weight: 'normal', style: 'normal', file: 'Cardo-Regular.woff2' },
    { weight: 'bold', style: 'normal', file: 'Cardo-Bold.woff2' },
    { weight: 'normal', style: 'italic', file: 'Cardo-Italic.woff2' },
  ]),
  familyWithFaces('Comic Relief', 'OFL-1.1', [
    { weight: 'normal', style: 'normal', file: 'ComicRelief-Regular.woff2' },
    { weight: 'bold', style: 'normal', file: 'ComicRelief-Bold.woff2' },
  ]),
  family('Noto Sans', 'NotoSans', 'OFL-1.1'),
  familyWithFaces('Selawik', 'OFL-1.1', [
    { weight: 'normal', style: 'normal', file: 'Selawik-Regular.woff2' },
    { weight: 'bold', style: 'normal', file: 'Selawik-Bold.woff2' },
  ]),
  familyWithFaces('Noto Sans Mono', 'OFL-1.1', [
    { weight: 'normal', style: 'normal', file: 'NotoSansMono-Regular.woff2' },
    { weight: 'bold', style: 'normal', file: 'NotoSansMono-Bold.woff2' },
  ]),
  familyWithFaces('Inconsolata SemiExpanded', 'OFL-1.1', [
    { weight: 'normal', style: 'normal', file: 'InconsolataSemiExpanded-Regular.woff2' },
    { weight: 'bold', style: 'normal', file: 'InconsolataSemiExpanded-Bold.woff2' },
  ]),
  family('PT Sans', 'PTSans', 'OFL-1.1'),
  familyWithFaces('PT Sans Narrow', 'OFL-1.1', [
    { weight: 'normal', style: 'normal', file: 'PTSansNarrow-Regular.woff2' },
    { weight: 'bold', style: 'normal', file: 'PTSansNarrow-Bold.woff2' },
  ]),
  family('TeX Gyre Bonum', 'TeXGyreBonum', 'LicenseRef-GUST-Font-License-1.0'),
]);
