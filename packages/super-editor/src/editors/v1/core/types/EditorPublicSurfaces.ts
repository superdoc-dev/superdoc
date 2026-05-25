/**
 * Public no-`any` surface interfaces for `Editor.converter` and
 * `Editor.extensionService` (SD-3240).
 *
 * The raw `SuperConverter` / `ExtensionService` classes keep a
 * `[key: string]: any` catchall in their `.d.ts` shims for internal-
 * implementation members. The `Editor` class fields are typed as
 * these surface interfaces (not the raw classes), so the public
 * type graph stops here and does not leak `any` through any
 * `editor.converter.X` or `editor.extensionService.X` reach path.
 *
 * The runtime instance is still the raw class; a single `as unknown
 * as <Surface>` cast lives at the assignment boundary in `Editor.ts`
 * `#createConverter` / `#initServiceExtensions`. Internal code that
 * needs deeper member access uses a local narrow interface and a
 * cast at the call site (no `any`).
 */
import type { Plugin } from 'prosemirror-state';
import type { Schema } from 'prosemirror-model';
import type { NodeViewConstructor } from 'prosemirror-view';
import type { EditorHelpers } from './EditorTypes.js';
import type { Comment } from './EditorEvents.js';
import type { EditorExtension } from './EditorConfig.js';
import type { CommandProps } from './ChainedCommands.js';
import type { ExtensionAttribute } from '../Attribute.js';
import type { NumberingModel } from '../parts/adapters/numbering-transforms.js';

/**
 * Loosely-typed OOXML part as held in `convertedXml`. Element trees
 * are recursive (each `elements[]` entry is another `ConvertedXmlPart`)
 * and mutable (internal callers do `part.elements = [...]` rewrites).
 */
export interface ConvertedXmlPart {
  name?: string;
  type?: string;
  attributes?: Record<string, unknown>;
  elements?: ConvertedXmlPart[];
  [key: string]: unknown;
}

/**
 * Header/footer rels-ID map keyed by section variant
 * (`default` / `first` / `even`). Values can be string, array of
 * strings, boolean flag, or absent depending on the section's state.
 */
export type HeaderFooterIdMap = Record<string, string | string[] | boolean | null | undefined>;

/** Item shape for `headerEditors` / `footerEditors` arrays. */
export interface HeaderFooterEditorEntry {
  editor?: { destroy?: () => void } & Record<string, unknown>;
  [key: string]: unknown;
}

/** Public surface of `Editor.converter`. SD-3240: no `any`. */
export interface EditorConverterSurface {
  // --- Plain data members ---
  addedMedia: Record<string, unknown>;
  bodySectPr: unknown;
  comments: Comment[];
  commentThreadingProfile: unknown;
  convertedXml: Record<string, ConvertedXmlPart>;
  declaration: unknown;
  docHiglightColors: unknown;
  documentAttributes: unknown;
  documentGuid: string | null;
  documentModified: boolean;
  footerEditors: HeaderFooterEditorEntry[];
  footerIds: HeaderFooterIdMap;
  footers: Record<string, unknown>;
  footnoteProperties: unknown;
  headerEditors: HeaderFooterEditorEntry[];
  headerFooterModified: boolean;
  headerIds: HeaderFooterIdMap;
  headers: Record<string, unknown>;
  importedBodyHasFooterRef: boolean;
  importedBodyHasHeaderRef: boolean;
  /**
   * Typed array of linked-style records (each carries an `id` and
   * an optional nested `definition.styles`). Wider unknown extras
   * are accepted via the trailing index signature.
   */
  linkedStyles: Array<{
    id?: string | number;
    definition?: { styles?: Record<string, unknown> };
    [key: string]: unknown;
  }>;
  numbering: NumberingModel;
  /**
   * Raw converter page styles: `pageSize` / `pageMargins` shape as
   * parsed from `w:sectPr`. Includes `alternateHeaders?: boolean`
   * read by the document-settings adapter
   * (`ConverterWithDocumentSettings.pageStyles`).
   * NOT the consumer-facing `PageStyles` flattened shape.
   */
  pageStyles: {
    pageSize?: { width?: number; height?: number };
    pageMargins?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
      header?: number;
      footer?: number;
    };
    alternateHeaders?: boolean;
    [key: string]: unknown;
  };
  savedTagsToRestore: unknown;
  themeColors: unknown;
  translatedLinkedStyles: unknown;
  /**
   * Translated numbering model: same `abstracts` / `definitions`
   * shape as `numbering` but with rendered values applied. Internal
   * helpers iterate both maps.
   */
  translatedNumbering: { abstracts?: Record<number, unknown>; definitions?: Record<number, unknown> };

  // --- Methods ---
  /**
   * Convert the current document tree to DOCX XML. Returns the
   * exported XML string by default, or the intermediate
   * `ConvertedXmlPart` (xml-js tree) when called with
   * `exportJsonOnly: true`. The `Blob` / `Buffer` wrapping happens
   * upstream in `Editor.exportDocx()` (which feeds the result into
   * a zipper), not here.
   */
  exportToDocx(...args: unknown[]): Promise<string | ConvertedXmlPart>;
  getBibliographyPartExportPaths(): readonly string[];
  /**
   * ISO-8601 `dcterms:created` timestamp from core.xml (e.g.
   * `'2024-01-15T10:30:00Z'`), or `null` if core.xml is missing or
   * has no created element.
   */
  getDocumentCreatedTimestamp(): string | null;
  /**
   * Document default styles for font rendering: typeface, font size
   * (pt), and CSS font-family stack. Used by ProseMirrorRenderer to
   * configure the default editor styles.
   */
  getDocumentDefaultStyles():
    | {
        typeface?: string;
        fontSizePt?: number;
        fontFamilyCss?: string;
        [key: string]: unknown;
      }
    | null
    | undefined;
  getDocumentFonts(): string[];
  /**
   * Async. Returns the stable document identifier (GUID-based
   * `identifierHash` when both GUID and timestamp exist, otherwise a
   * `contentHash` and a backfilled GUID/timestamp pair). Resolves to
   * a non-null string in every code path; the `null` fallback lives
   * on `Editor.getDocumentIdentifier()` for the converter-missing
   * case.
   */
  getDocumentIdentifier(): Promise<string>;
  /** Returns `{ styleString, fontsImported }` for font face injection. */
  getFontFaceImportString():
    | {
        styleString?: string;
        fontsImported?: string[];
        [key: string]: unknown;
      }
    | null
    | undefined;
  getSchema(): unknown;
  getSuperdocVersion(): string | null;
  promoteToGuid(): void;
  schemaToXml(element: unknown): string;
}

/**
 * Curried command callable: `(...args) => (props) => boolean`,
 * matching the runtime pattern in `CommandService.js`.
 */
export type SurfaceCommandCallable = (...args: unknown[]) => (props: CommandProps) => boolean;

/** Public surface of `Editor.extensionService`. SD-3240: no `any`. */
export interface EditorExtensionServiceSurface {
  attributes: ExtensionAttribute[];
  commands: Record<string, SurfaceCommandCallable>;
  /**
   * Registered extensions. Each entry is an `EditorExtension`
   * (node/mark/extension) with a runtime `isExternal?` flag set by
   * the importer pipeline.
   */
  extensions: Array<EditorExtension & { isExternal?: boolean }>;
  externalExtensions: readonly EditorExtension[];
  helpers: EditorHelpers;
  nodeViews: { [node: string]: NodeViewConstructor };
  plugins: readonly Plugin<unknown>[];
  schema: Schema<string, string>;
  splittableMarks: readonly string[];
}
