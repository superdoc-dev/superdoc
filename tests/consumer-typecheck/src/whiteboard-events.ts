/**
 * Consumer typecheck: Whiteboard event-map typed payloads
 * (SD-3213 follow-up to the EventEmitter `unknown[]` drain).
 *
 * Before this change, `Whiteboard` extended `EventEmitter` with no
 * event map, so every listener received `unknown[]` (post-#3420) or
 * `any[]` (pre-#3420) regardless of which event was named.
 * `whiteboard.on('change', cb)` gave consumers no payload type, even
 * though the runtime always emits `WhiteboardData`.
 *
 * The same change splits `WhiteboardData` (output: `getWhiteboardData()`
 * return + `change` event payload, all fields required) from
 * `WhiteboardDataInput` (input to `setWhiteboardData(json)`, all
 * fields optional). Consumers reading the change payload can write
 * `data.meta.pageSizes` without optional chaining, and existing
 * `setWhiteboardData({ pages: {...} })` callers keep working through
 * the looser input type.
 *
 * This fixture pins all five typed event payloads, the closed
 * event-map shape (unknown event names are TS errors), and the
 * `WhiteboardData` field accessibility.
 *
 * Registry shape narrowing via `register<T>` / `getType<T>` is a
 * separate design decision (caller-asserted shape vs runtime-verified)
 * tracked as a follow-up; this PR keeps the existing
 * `WhiteboardRegistryItem` contract.
 */

import type { SuperDoc } from 'superdoc';

declare const superdoc: SuperDoc;

const whiteboard = superdoc.whiteboard;
if (whiteboard) {
  // --- Each typed event payload narrows precisely --------------------------

  whiteboard.on('change', (data) => {
    // `data.pages` is required (`Record<string, WhiteboardPageData>`).
    // No optional chaining or null-check needed — the runtime always
    // populates the field.
    const pages = data.pages;
    const firstKey = Object.keys(pages)[0];
    if (firstKey !== undefined) {
      const page = pages[firstKey]!;
      // Stored shape narrows through: `images`, not `stickers`
      // (pinned separately in whiteboard-data-shape.ts, exercised
      // here through the event payload entry point).
      void page.images;
    }

    // `data.meta` and `data.version` are required on the output
    // shape (the runtime always sets both). Required on
    // `WhiteboardData`, optional on `WhiteboardDataInput` — that
    // split is the point of this PR. Consumers can read these
    // fields without optional chaining.
    const pageSizes = data.meta.pageSizes;
    const firstSizeKey = Object.keys(pageSizes)[0];
    if (firstSizeKey !== undefined) {
      const size = pageSizes[firstSizeKey]!;
      const width: number = size.width;
      const height: number = size.height;
      const originalWidth: number | null = size.originalWidth;
      const originalHeight: number | null = size.originalHeight;
      void width;
      void height;
      void originalWidth;
      void originalHeight;
    }
    // `version` is the literal `1` (current schema version). If a
    // future schema bump widens this to `number`, this assertion
    // becomes incompatible and must be revisited alongside consumers.
    const version: 1 = data.version;
    void version;
  });

  whiteboard.on('setData', (pages) => {
    // `pages` is `WhiteboardPage[]`. `.length` is typed, no cast needed.
    const count: number = pages.length;
    void count;
  });

  whiteboard.on('tool', (tool) => {
    const name: string = tool;
    void name;
  });

  whiteboard.on('enabled', (enabled) => {
    const flag: boolean = enabled;
    void flag;
  });

  whiteboard.on('opacity', (opacity) => {
    const value: number = opacity;
    void value;
  });

  // Unknown event names must be a TS error (closed event map, no
  // DefaultEventMap fallback). If a future PR widens the map by adding
  // an index signature, this directive becomes unused and tsc fails
  // (TS2578).
  // @ts-expect-error SD-3213: WhiteboardEventMap is closed; unknown events are not allowed.
  whiteboard.on('not-a-real-event', () => {});

  // --- WhiteboardDataInput round-trip + partial accept ---------------------

  // Round trip: the strict output of getWhiteboardData() must be
  // assignable to the looser setWhiteboardData() input.
  whiteboard.setWhiteboardData(whiteboard.getWhiteboardData());

  // Partial input: callers can still pass just `{ pages }` without
  // supplying `meta` or `version` (the runtime only reads `json?.pages`).
  whiteboard.setWhiteboardData({ pages: {} });
}
