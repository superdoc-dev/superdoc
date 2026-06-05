import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { PresentationEditor } from '@core/presentation-editor/index.js';
import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SHAPE_FIXTURES_DIR = resolve(__dirname, '../../../../../../layout-engine/test-fixtures/shapes');

const SHAPE_FIXTURES = [
  { name: 'basic-vector-shapes.docx', description: 'inline vector shapes' },
  { name: 'vectors.docx', description: 'anchored drawings + shapes' },
] as const;

const waitForLayout = (presentation: PresentationEditor, timeoutMs = 10000) =>
  new Promise((resolve, reject) => {
    const unsubscribe = presentation.onLayoutUpdated(({ layout }) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(layout);
    });
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('Timed out waiting for layout'));
    }, timeoutMs);
  });

const loadFixtureData = async (filename: string) => {
  const buffer = await readFile(resolve(SHAPE_FIXTURES_DIR, filename));
  return Editor.loadXmlData(buffer, true);
};

const mountPresentationFromFixture = async (filename: string) => {
  const [docx, media, mediaFiles, fonts] = await loadFixtureData(filename);
  const host = document.createElement('div');
  document.body.appendChild(host);

  const presentation = new PresentationEditor({
    element: host,
    documentId: `shapes-${filename}`,
    content: docx,
    media,
    mediaFiles,
    fonts,
    mode: 'docx',
    extensions: getStarterExtensions(),
    layoutEngineOptions: {
      virtualization: { enabled: true, window: 4, overscan: 1, gap: 72, paddingTop: 0 },
    },
  });

  const layout = await waitForLayout(presentation);
  return { presentation, host, layout };
};

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
let originalCreateObjectURL: typeof URL.createObjectURL | undefined;

beforeAll(() => {
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContextStub(contextId: string) {
    if (contextId === '2d') {
      return {
        font: '',
        measureText: (text: string) => ({
          width: text.length * 6,
          actualBoundingBoxLeft: 0,
          actualBoundingBoxRight: text.length * 6,
        }),
      } as unknown as CanvasRenderingContext2D;
    }
    return null;
  } as typeof HTMLCanvasElement.prototype.getContext;
  originalCreateObjectURL = URL.createObjectURL;
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = (() => 'blob:mock-font') as typeof URL.createObjectURL;
  }
});

afterAll(() => {
  if (originalGetContext) {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  }
  if (originalCreateObjectURL) {
    URL.createObjectURL = originalCreateObjectURL;
  } else {
    delete (URL as any).createObjectURL;
  }
});

const DATA_FIXTURES_DIR = resolve(__dirname, '../data');

const mountPresentationFromData = async (filename: string) => {
  const buffer = await readFile(resolve(DATA_FIXTURES_DIR, filename));
  const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);
  const host = document.createElement('div');
  document.body.appendChild(host);

  const presentation = new PresentationEditor({
    element: host,
    documentId: `data-${filename}`,
    content: docx,
    media,
    mediaFiles,
    fonts,
    mode: 'docx',
    documentMode: 'viewing',
    extensions: getStarterExtensions(),
    layoutEngineOptions: {
      pageSize: { w: 816, h: 1056 },
      margins: { top: 96, right: 96, bottom: 96, left: 96 },
      zoom: 1,
      flowMode: 'paginated',
      layoutMode: 'vertical',
      virtualization: { enabled: false },
    },
  });

  const layout = await waitForLayout(presentation);
  return { presentation, host, layout };
};

describe('PresentationEditor header/footer layout snapshot (real editor path)', () => {
  it('returns an empty snapshot when the document has no header/footer stories', async () => {
    const { presentation, host } = await mountPresentationFromData('basic-paragraph.docx');
    try {
      expect(presentation.getHeaderFooterLayoutSnapshot()).toEqual({
        pageBindings: [],
        storyLayouts: { headers: [], footers: [] },
      });
    } finally {
      presentation.destroy();
      host.remove();
    }
  }, 20000);

  // h_f-normal-odd-even-firstpg.docx declares first/even/default header variants
  // (titlePg enabled), so the live editor must surface them as queryable stories
  // and bind the first-page variant to page 1.
  it('exposes story-part bindings and layouts from getHeaderFooterLayoutSnapshot()', async () => {
    const { presentation, host } = await mountPresentationFromData('h_f-normal-odd-even-firstpg.docx');
    try {
      const snapshot = presentation.getHeaderFooterLayoutSnapshot();

      // Well-formed top-level shape with deterministic, JSON-safe data.
      expect(snapshot).toHaveProperty('pageBindings');
      expect(Array.isArray(snapshot.pageBindings)).toBe(true);
      expect(snapshot.storyLayouts).toHaveProperty('headers');
      expect(snapshot.storyLayouts).toHaveProperty('footers');
      expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);

      // The three declared header variants (first/even/default) are all surfaced
      // as distinct stories, each with a populated raw layout.
      expect(snapshot.storyLayouts.headers.length).toBeGreaterThanOrEqual(3);
      const headerRefIds = new Set(snapshot.storyLayouts.headers.map((story) => story.refId));
      expect(headerRefIds.size).toBeGreaterThanOrEqual(3);
      for (const story of snapshot.storyLayouts.headers) {
        expect(typeof story.storyKey).toBe('string');
        expect(story.kind).toBe('header');
        expect(story.rawLayout).not.toBeNull();
      }

      // Page 1 binds to the first-page header variant.
      expect(snapshot.pageBindings.length).toBeGreaterThanOrEqual(1);
      const firstPage = snapshot.pageBindings[0]!;
      expect(firstPage.pageIndex).toBe(0);
      expect(firstPage.header).not.toBeNull();
      expect(firstPage.header!.variant).toBe('first');
      expect(firstPage.header!.refId).not.toBeNull();
      expect(firstPage.header!.region).not.toBeNull();
      expect(firstPage.header!.region!.contentHeight).not.toBeNull();
      expect(firstPage.header!.region!.contentHeight!).toBeGreaterThan(0);
      // Binding joins back to a surfaced story entry.
      expect(snapshot.storyLayouts.headers.some((story) => story.storyKey === firstPage.header!.storyKey)).toBe(true);
    } finally {
      presentation.destroy();
      host.remove();
    }
  }, 20000);

  it('getLayoutResolveSnapshot() returns aligned resolve/paint inputs from the live path', async () => {
    const { presentation, host } = await mountPresentationFromData('h_f-normal-odd-even-firstpg.docx');
    try {
      const resolveSnapshot = presentation.getLayoutResolveSnapshot();
      expect(resolveSnapshot).toHaveProperty('layout');
      expect(Array.isArray(resolveSnapshot.blocks)).toBe(true);
      expect(Array.isArray(resolveSnapshot.measures)).toBe(true);
      expect(Array.isArray(resolveSnapshot.sectionMetadata)).toBe(true);
      // resolveLayout requires one measure per lookup block.
      expect(resolveSnapshot.blocks.length).toBe(resolveSnapshot.measures.length);
      expect(resolveSnapshot.blocks.length).toBeGreaterThan(0);
    } finally {
      presentation.destroy();
      host.remove();
    }
  }, 20000);
});

describe('PresentationEditor DOCX shape fixtures', () => {
  SHAPE_FIXTURES.forEach(({ name, description }) => {
    it(`lays out drawings for ${description}`, async () => {
      const { presentation, host, layout } = await mountPresentationFromFixture(name);
      try {
        expect((layout as any).pages.length).toBeGreaterThan(0);
        const drawingFragments = (layout as any).pages.flatMap((page: any) =>
          page.fragments.filter((fragment: any) => fragment.kind === 'drawing'),
        );
        expect(drawingFragments.length).toBeGreaterThan(0);

        const domFragments = host.querySelectorAll('.superdoc-drawing-fragment');
        expect(domFragments.length).toBeGreaterThan(0);
      } finally {
        presentation.destroy();
        host.remove();
      }
    }, 20000);
  });
});
