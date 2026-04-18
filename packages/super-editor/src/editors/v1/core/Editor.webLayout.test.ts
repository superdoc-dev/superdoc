import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Editor } from './Editor.js';
import { loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import { getStarterExtensions } from '@extensions/index.js';

/**
 * Tests for web layout mode (OOXML ST_View 'web').
 *
 * Web layout mode enables responsive document rendering where content
 * reflows to fit the container width, similar to web pages. This contrasts
 * with print layout mode which maintains fixed page dimensions.
 *
 * Key behaviors tested:
 * - isWebLayout() detection
 * - getMaxContentSize() behavior in web vs print layout
 */

let blankDocData: { docx: unknown; media: unknown; mediaFiles: unknown; fonts: unknown };

beforeAll(async () => {
  blankDocData = await loadTestDataForEditorTests('blank-doc.docx');
});

function createTestEditor(options: Partial<Parameters<(typeof Editor)['prototype']['constructor']>[0]> = {}) {
  return new Editor({
    isHeadless: true,
    deferDocumentLoad: true,
    mode: 'docx',
    extensions: getStarterExtensions(),
    suppressDefaultDocxStyles: true,
    ...options,
  });
}

function getBlankDocOptions() {
  return {
    mode: 'docx' as const,
    content: blankDocData.docx,
    mediaFiles: blankDocData.mediaFiles,
    fonts: blankDocData.fonts,
  };
}

describe('Editor Web Layout Mode', () => {
  describe('isWebLayout()', () => {
    it('returns true when viewOptions.layout is "web"', () => {
      const editor = createTestEditor({
        viewOptions: { layout: 'web' },
      });

      expect(editor.isWebLayout()).toBe(true);
    });

    it('returns false when viewOptions.layout is "print"', () => {
      const editor = createTestEditor({
        viewOptions: { layout: 'print' },
      });

      expect(editor.isWebLayout()).toBe(false);
    });

    it('returns false when viewOptions is undefined', () => {
      const editor = createTestEditor({
        viewOptions: undefined,
      });

      expect(editor.isWebLayout()).toBe(false);
    });

    it('returns false when viewOptions.layout is undefined', () => {
      const editor = createTestEditor({
        viewOptions: {},
      });

      expect(editor.isWebLayout()).toBe(false);
    });
  });

  describe('getMaxContentSize()', () => {
    describe('web layout mode', () => {
      it('returns empty object to skip image constraints', async () => {
        const editor = createTestEditor({
          viewOptions: { layout: 'web' },
        });
        await editor.open(undefined, getBlankDocOptions());

        const size = editor.getMaxContentSize();

        // Web layout skips constraints - CSS handles responsive sizing
        expect(size).toEqual({});
      });

      it('returns empty object even when document has page size defined', async () => {
        const editor = createTestEditor({
          viewOptions: { layout: 'web' },
        });
        await editor.open(undefined, getBlankDocOptions());

        // Verify document has page styles (blank-doc.docx has standard Letter size)
        expect(editor.converter?.pageStyles?.pageSize).toBeDefined();

        // But web layout still returns empty - let CSS handle it
        expect(editor.getMaxContentSize()).toEqual({});
      });
    });

    describe('print layout mode', () => {
      it('returns calculated dimensions based on page size and margins', async () => {
        const editor = createTestEditor({
          viewOptions: { layout: 'print' },
        });
        await editor.open(undefined, getBlankDocOptions());

        const size = editor.getMaxContentSize();

        // Print layout should return numeric dimensions
        expect(size.width).toBeDefined();
        expect(size.height).toBeDefined();
        expect(typeof size.width).toBe('number');
        expect(typeof size.height).toBe('number');
        expect(size.width).toBeGreaterThan(0);
        expect(size.height).toBeGreaterThan(0);
      });

      it('accounts for page margins in calculations', async () => {
        const editor = createTestEditor({
          viewOptions: { layout: 'print' },
        });
        await editor.open(undefined, getBlankDocOptions());

        const { pageSize = {}, pageMargins = {} } = editor.converter?.pageStyles ?? {};
        const PIXELS_PER_INCH = 96;

        // Get the actual calculated size
        const size = editor.getMaxContentSize();

        // Verify margins are subtracted from page dimensions
        if (pageSize.width && pageSize.height) {
          const expectedMaxWidth =
            pageSize.width * PIXELS_PER_INCH -
            (pageMargins.left ?? 0) * PIXELS_PER_INCH -
            (pageMargins.right ?? 0) * PIXELS_PER_INCH -
            20; // MAX_WIDTH_BUFFER_PX

          const expectedMaxHeight =
            pageSize.height * PIXELS_PER_INCH -
            (pageMargins.top ?? 0) * PIXELS_PER_INCH -
            (pageMargins.bottom ?? 0) * PIXELS_PER_INCH -
            50; // MAX_HEIGHT_BUFFER_PX

          expect(size.width).toBe(expectedMaxWidth);
          expect(size.height).toBe(expectedMaxHeight);
        }
      });
    });

    describe('edge cases', () => {
      it('returns empty object when converter is not initialized', () => {
        const editor = createTestEditor({
          viewOptions: { layout: 'print' },
        });
        // Don't call open() - converter won't be initialized

        expect(editor.getMaxContentSize()).toEqual({});
      });

      it('returns empty object by default (no viewOptions)', async () => {
        const editor = createTestEditor();
        await editor.open(undefined, getBlankDocOptions());

        // Default behavior - print layout with calculated dimensions
        const size = editor.getMaxContentSize();

        // Default should be print layout (calculated dimensions)
        expect(typeof size.width).toBe('number');
        expect(typeof size.height).toBe('number');
      });
    });
  });
  describe('table cell context', () => {
    /**
     * Builds a minimal fake editor whose state.selection.$head walks up through
     * ancestor nodes at the given depths. Each entry in `ancestors` becomes the
     * node returned by $head.node(d) for d = ancestors.length down to 1.
     *
     * pageSize is in inches (matching the real converter shape).
     */
    function makeEditor({
      ancestors,
      layout = 'print' as 'print' | 'web',
      pageSize = { width: 8.5, height: 11 },
      pageMargins = { top: 1, bottom: 1, left: 1, right: 1 },
    }: {
      ancestors: Array<{ type: { name: string }; attrs: Record<string, unknown> }>;
      layout?: 'print' | 'web';
      pageSize?: { width: number; height: number };
      pageMargins?: { top: number; bottom: number; left: number; right: number };
    }) {
      const $head = {
        depth: ancestors.length,
        node: (d: number) => ancestors[d - 1],
      };

      return {
        converter: { pageStyles: { pageSize, pageMargins } },
        options: { viewOptions: { layout } },
        state: { selection: { $head } },
        isWebLayout() {
          return (this as any).options.viewOptions?.layout === 'web';
        },
      };
    }

    it('constrains width to cell colwidth when cursor is inside a tableCell', () => {
      const editor = makeEditor({
        ancestors: [
          { type: { name: 'tableRow' }, attrs: {} },
          { type: { name: 'tableCell' }, attrs: { colwidth: [200], cellMargins: null } },
          { type: { name: 'paragraph' }, attrs: {} },
        ],
      });

      const size = Editor.prototype.getMaxContentSize.call(editor);

      expect(size.width).toBe(200);
      // Height is still derived from the page dimensions
      expect(size.height).toBeGreaterThan(0);
    });

    it('subtracts left and right cellMargins from the cell width', () => {
      const editor = makeEditor({
        ancestors: [
          { type: { name: 'tableRow' }, attrs: {} },
          {
            type: { name: 'tableCell' },
            attrs: { colwidth: [300], cellMargins: { left: 20, right: 15 } },
          },
          { type: { name: 'paragraph' }, attrs: {} },
        ],
      });

      const size = Editor.prototype.getMaxContentSize.call(editor);

      expect(size.width).toBe(265); // 300 - 20 - 15
    });

    it('sums multiple colwidth values for spanned cells', () => {
      const editor = makeEditor({
        ancestors: [
          { type: { name: 'tableRow' }, attrs: {} },
          {
            type: { name: 'tableCell' },
            attrs: { colwidth: [150, 150], cellMargins: null },
          },
          { type: { name: 'paragraph' }, attrs: {} },
        ],
      });

      const size = Editor.prototype.getMaxContentSize.call(editor);

      expect(size.width).toBe(300);
    });

    it('constrains width when cursor is inside a tableHeader', () => {
      const editor = makeEditor({
        ancestors: [
          { type: { name: 'tableRow' }, attrs: {} },
          { type: { name: 'tableHeader' }, attrs: { colwidth: [180], cellMargins: null } },
          { type: { name: 'paragraph' }, attrs: {} },
        ],
      });

      const size = Editor.prototype.getMaxContentSize.call(editor);

      expect(size.width).toBe(180);
    });

    it('falls back to page content width when not inside a table cell', () => {
      // Standard Letter page (8.5 × 11 in) with 1 in margins on each side
      const PIXELS_PER_INCH = 96;
      const MAX_WIDTH_BUFFER_PX = 20;
      const expectedWidth = (8.5 - 1 - 1) * PIXELS_PER_INCH - MAX_WIDTH_BUFFER_PX; // 6.5 in content

      const editor = makeEditor({
        ancestors: [{ type: { name: 'paragraph' }, attrs: {} }],
      });

      const size = Editor.prototype.getMaxContentSize.call(editor);

      expect(size.width).toBe(expectedWidth);
    });

    it('falls back to page content width when colwidth is empty', () => {
      const PIXELS_PER_INCH = 96;
      const MAX_WIDTH_BUFFER_PX = 20;
      const expectedWidth = (8.5 - 1 - 1) * PIXELS_PER_INCH - MAX_WIDTH_BUFFER_PX;

      const editor = makeEditor({
        ancestors: [
          { type: { name: 'tableRow' }, attrs: {} },
          { type: { name: 'tableCell' }, attrs: { colwidth: [], cellMargins: null } },
          { type: { name: 'paragraph' }, attrs: {} },
        ],
      });

      const size = Editor.prototype.getMaxContentSize.call(editor);

      expect(size.width).toBe(expectedWidth);
    });

    it('falls back to page content width when colwidth is missing', () => {
      const PIXELS_PER_INCH = 96;
      const MAX_WIDTH_BUFFER_PX = 20;
      const expectedWidth = (8.5 - 1 - 1) * PIXELS_PER_INCH - MAX_WIDTH_BUFFER_PX;

      const editor = makeEditor({
        ancestors: [
          { type: { name: 'tableRow' }, attrs: {} },
          { type: { name: 'tableCell' }, attrs: { colwidth: null, cellMargins: null } },
          { type: { name: 'paragraph' }, attrs: {} },
        ],
      });

      const size = Editor.prototype.getMaxContentSize.call(editor);

      expect(size.width).toBe(expectedWidth);
    });

    describe('web layout mode', () => {
      it('constrains width to cell colwidth in web layout mode', () => {
        const editor = makeEditor({
          layout: 'web',
          ancestors: [
            { type: { name: 'tableRow' }, attrs: {} },
            { type: { name: 'tableCell' }, attrs: { colwidth: [200], cellMargins: null } },
            { type: { name: 'paragraph' }, attrs: {} },
          ],
        });

        const size = Editor.prototype.getMaxContentSize.call(editor);

        expect(size.width).toBe(200);
        // Web layout has no page height, so Infinity is used to skip the height check
        // while still letting getAllowedImageDimensions apply the width constraint.
        expect(size.height).toBe(Infinity);
      });

      it('subtracts cell margins in web layout mode', () => {
        const editor = makeEditor({
          layout: 'web',
          ancestors: [
            { type: { name: 'tableRow' }, attrs: {} },
            {
              type: { name: 'tableCell' },
              attrs: { colwidth: [300], cellMargins: { left: 20, right: 15 } },
            },
            { type: { name: 'paragraph' }, attrs: {} },
          ],
        });

        const size = Editor.prototype.getMaxContentSize.call(editor);

        expect(size.width).toBe(265); // 300 - 20 - 15
        expect(size.height).toBe(Infinity);
      });

      it('returns empty object in web layout mode when not inside a table cell', () => {
        const editor = makeEditor({
          layout: 'web',
          ancestors: [{ type: { name: 'paragraph' }, attrs: {} }],
        });

        const size = Editor.prototype.getMaxContentSize.call(editor);

        expect(size).toEqual({});
      });

      it('returns empty object in web layout mode when colwidth is empty', () => {
        const editor = makeEditor({
          layout: 'web',
          ancestors: [
            { type: { name: 'tableRow' }, attrs: {} },
            { type: { name: 'tableCell' }, attrs: { colwidth: [], cellMargins: null } },
            { type: { name: 'paragraph' }, attrs: {} },
          ],
        });

        const size = Editor.prototype.getMaxContentSize.call(editor);

        expect(size).toEqual({});
      });

      it('constrains width for tableHeader in web layout mode', () => {
        const editor = makeEditor({
          layout: 'web',
          ancestors: [
            { type: { name: 'tableRow' }, attrs: {} },
            { type: { name: 'tableHeader' }, attrs: { colwidth: [250], cellMargins: { left: 10, right: 10 } } },
            { type: { name: 'paragraph' }, attrs: {} },
          ],
        });

        const size = Editor.prototype.getMaxContentSize.call(editor);

        expect(size.width).toBe(230); // 250 - 10 - 10
        expect(size.height).toBe(Infinity);
      });
    });
  });
});
