/**
 * Consumer typecheck: `fonts` getter on `SuperDoc`.
 *
 * Locks the return shape of the `fonts` getter against the emitted `.d.ts`:
 * the read/write font surface `SuperDocFontsApi`. Drains the
 * `fonts:returns` obligation on the public-method coverage gate.
 *
 * The getter exposes the substitution- and load-aware font report for the
 * active document: pull (`getReport` / `getMissingFonts` / `getDocumentFonts`)
 * plus `onReport` (snapshot-then-subscribe). `getReport` returns the public
 * `FontResolutionRecord[]`; `onReport` streams `FontsChangedPayload`; the
 * write methods accept the shared URL-backed font config shapes. Every member
 * resolves to a named public type, so a consumer gets real IntelliSense with no
 * `any` at depth.
 *
 * Drained obligation (1):
 *   - fonts:returns
 */
import type {
  FontFaceConfig,
  FontFamilyConfig,
  FontResolutionRecord,
  FontsChangedPayload,
  SuperDoc,
  SuperDocFontFace,
  SuperDocFontFamily,
  SuperDocFontsApi,
} from 'superdoc';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

declare const sd: SuperDoc;

// Lock the getter return against the named public type.
const _fontsOk: AssertEqual<SuperDoc['fonts'], SuperDocFontsApi> = true;

// Consumer-style reads: each member resolves to a named public type.
const fonts: SuperDocFontsApi = sd.fonts;
const _report: FontResolutionRecord[] = fonts.getReport();
const _missing: string[] = fonts.getMissingFonts();
const _documentFonts: string[] = fonts.getDocumentFonts();
const _unsubscribe: () => void = fonts.onReport((payload: FontsChangedPayload) => void payload);

// Consumer-style writes: URL-backed family config, logical mapping, and preload.
const _face: SuperDocFontFace = { source: '/fonts/Gelasio-Regular.woff2', weight: 400, style: 'normal' };
const _family: SuperDocFontFamily = { family: 'Gelasio', faces: [_face] };
const _configFace: FontFaceConfig = _face;
const _configFamily: FontFamilyConfig = _family;
fonts.add(_family);
fonts.map({ Georgia: 'Gelasio' });
fonts.unmap(['Georgia']);
const _preload: Promise<void> = fonts.preload(['Georgia']);

// A record's fields are all nameable/typed - no `any` at depth.
const _record: FontResolutionRecord | undefined = _report[0];
void _record?.logicalFamily;
void _record?.physicalFamily;
void _record?.reason;
void _record?.loadStatus;
void _record?.exportFamily;
void _record?.missing;

void [_fontsOk, _missing, _documentFonts, _unsubscribe, _configFace, _configFamily, _preload];
