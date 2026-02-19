import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { PresentationEditor } from '@core/presentation-editor/index.js';
import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SHAPE_FIXTURES_DIR = resolve(__dirname, '../../../../layout-engine/test-fixtures/shapes');

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
