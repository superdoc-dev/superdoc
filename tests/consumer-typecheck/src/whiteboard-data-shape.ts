/**
 * Consumer typecheck: Whiteboard data shape contracts (SD-3213 follow-up).
 *
 * Pre-PR, the public types for Whiteboard / WhiteboardPage carried
 * three any-leak categories that all hurt consumers reading whiteboard
 * data:
 *
 *   1. `WhiteboardPage.toJSON()` declared `{ strokes: any[]; text: any[];
 *      stickers: any[] }` — the type said `stickers`, but the runtime
 *      always returned `images`. Consumers reading the typed return
 *      would have written `result.stickers` and silently gotten
 *      `undefined`.
 *   2. `WhiteboardPage.{strokes, text, images}` were typed as the
 *      *authored* shapes (e.g. `{ points, x, y }`), but the runtime
 *      stores *normalized* shapes (`{ pointsN, xN, yN }`). Consumers
 *      reaching for `page.strokes[0].points` would have hit
 *      `pointsN` at runtime with no IntelliSense.
 *   3. `Whiteboard.register` / `Whiteboard.getType` accepted /
 *      returned `any[]`, giving consumers no IntelliSense for the
 *      stable `id` field the runtime relies on.
 *
 * This fixture pins all three: the serialized field is `images` (not
 * `stickers`); stored items use normalized field names; registry items
 * expose `id` typed.
 */

import type { SuperDoc } from 'superdoc';

declare const superdoc: SuperDoc;

const whiteboard = superdoc.whiteboard;
if (whiteboard) {
  // --- 1. getWhiteboardData() returns the normalized page shape with
  //        `images`, not `stickers` -----------------------------------------
  const data = whiteboard.getWhiteboardData();
  const pages = data.pages ?? {};
  const firstKey = Object.keys(pages)[0];
  if (firstKey !== undefined) {
    const page = pages[firstKey]!;

    // `images` exists and is typed
    const images = page.images;
    void images;

    // `stickers` was a stale JSDoc artifact; it must NOT appear on the
    // public shape. If it slips back, this @ts-expect-error stops
    // erroring and tsc fails (TS2578).
    // @ts-expect-error SD-3213: toJSON() return uses `images`, not `stickers`.
    void page.stickers;
  }

  // --- 2. Stored items use normalized field names (not authored) -----------
  const allPages = whiteboard.getPages();
  const firstPage = allPages[0];
  if (firstPage) {
    const firstStroke = firstPage.strokes[0];
    if (firstStroke) {
      // Normalized field: `pointsN`, not `points`.
      const pointsN: number[][] = firstStroke.pointsN;
      const widthN: number | undefined = firstStroke.widthN;
      void pointsN;
      void widthN;

      // `points` was the authored input field, normalized away on store.
      // @ts-expect-error SD-3213: stored strokes have `pointsN`, not `points`.
      void firstStroke.points;
    }

    const firstText = firstPage.text[0];
    if (firstText) {
      // Stored text uses normalized coordinates and font size.
      // widthN includes null because #toNormalizedText falls back to
      // null when the input width is non-finite.
      const xN: number = firstText.xN;
      const yN: number = firstText.yN;
      const content: string = firstText.content;
      const fontSizeN: number | undefined = firstText.fontSizeN;
      const textWidthN: number | null | undefined = firstText.widthN;
      void xN;
      void yN;
      void content;
      void fontSizeN;
      void textWidthN;
    }

    const firstImage = firstPage.images[0];
    if (firstImage) {
      // Stored images use normalized coordinates/sizes plus the source URL.
      // widthN / heightN include null (#toNormalizedImage fallback).
      // stickerId is `string | number | null` because addImage() forwards
      // item.id (which is `string | number`) when type === 'sticker'.
      const xN: number = firstImage.xN;
      const imageWidthN: number | null | undefined = firstImage.widthN;
      const imageHeightN: number | null | undefined = firstImage.heightN;
      const src: string = firstImage.src;
      const stickerId: string | number | null | undefined = firstImage.stickerId;
      void xN;
      void imageWidthN;
      void imageHeightN;
      void src;
      void stickerId;
    }
  }

  // --- 3. Registry items expose `id` typed, arbitrary fields are unknown --
  whiteboard.register('stickers', [{ id: 's1', label: 'sticker' }]);
  const items = whiteboard.getType('stickers');
  if (items) {
    const first = items[0];
    if (first) {
      // `id` is typed.
      const id: string | number | undefined = first.id;
      void id;

      // Arbitrary fields are `unknown`, not `any`. Reading them without
      // narrowing must error. Bracket access is required under
      // `noPropertyAccessFromIndexSignature` (which the strict
      // "all public surface" scenario enables); same intent either way.
      const label = first['label'];
      // @ts-expect-error SD-3213: arbitrary registry fields are unknown, not any.
      label.toUpperCase();
      void label;
    }
  }
}
