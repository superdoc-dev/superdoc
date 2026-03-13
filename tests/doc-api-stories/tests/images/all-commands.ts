import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { corpusDoc, unwrap, useStoryHarness } from '../harness';

// ---------------------------------------------------------------------------
// Test image — read from local assets as a data URI
// ---------------------------------------------------------------------------

const TEST_IMAGE_PATH = path.resolve(import.meta.dirname, 'assets/test-image.webp');
const SET_SIZE_WIDTH_PX = 321;
const SET_SIZE_HEIGHT_PX = 123;
const PX_TO_EMU = 9_525;

async function imageDataUri(): Promise<string> {
  const buf = await readFile(TEST_IMAGE_PATH);
  return `data:image/webp;base64,${buf.toString('base64')}`;
}

/**
 * Corpus document with images already embedded. The converter assigns `sdImageId`
 * on import, so `images.list` / `images.get` / etc. can resolve them immediately.
 */
const IMAGE_CORPUS_DOC = corpusDoc('basic/image-wrapping.docx');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImageFixture = {
  imageId: string;
};

const ALL_IMAGE_COMMAND_IDS = [
  'create.image',
  'images.list',
  'images.get',
  'images.delete',
  'images.move',
  'images.convertToInline',
  'images.convertToFloating',
  'images.setSize',
  'images.setWrapType',
  'images.setWrapSide',
  'images.setWrapDistances',
  'images.setPosition',
  'images.setAnchorOptions',
  'images.setZOrder',
  // SD-2100: Geometry
  'images.scale',
  'images.setLockAspectRatio',
  'images.rotate',
  'images.flip',
  'images.crop',
  'images.resetCrop',
  // SD-2100: Content
  'images.replaceSource',
  // SD-2100: Semantic metadata
  'images.setAltText',
  'images.setDecorative',
  'images.setName',
  'images.setHyperlink',
  // SD-2100: Caption lifecycle
  'images.insertCaption',
  'images.updateCaption',
  'images.removeCaption',
] as const;

type ImageCommandId = (typeof ALL_IMAGE_COMMAND_IDS)[number];

type SetupKind = 'blank' | 'inlineImage' | 'floatingImage';

type Scenario = {
  operationId: ImageCommandId;
  setup: SetupKind;
  prepare?: (sessionId: string, fixture: ImageFixture | null) => Promise<void>;
  run: (sessionId: string, fixture: ImageFixture | null) => Promise<any>;
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('document-api story: all image commands', () => {
  const { client, outPath } = useStoryHarness('images/all-commands', {
    preserveResults: true,
  });

  const api = client as any;
  const readOperationIds = new Set<ImageCommandId>(['images.list', 'images.get']);
  const lockAspectRatioBySession = new Map<string, boolean>();

  // -- helpers ---------------------------------------------------------------

  function makeSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function docNameFor(operationId: ImageCommandId): string {
    return `${operationId.replace(/\./g, '-')}.docx`;
  }

  function sourceDocNameFor(operationId: ImageCommandId): string {
    return `${operationId.replace(/\./g, '-')}-source.docx`;
  }

  function readOutputNameFor(operationId: ImageCommandId): string {
    return `${operationId.replace(/\./g, '-')}-read-output.json`;
  }

  async function saveSource(sessionId: string, operationId: ImageCommandId) {
    await api.doc.save({
      sessionId,
      out: outPath(sourceDocNameFor(operationId)),
      force: true,
    });
  }

  async function saveResult(sessionId: string, operationId: ImageCommandId) {
    await api.doc.save({
      sessionId,
      out: outPath(docNameFor(operationId)),
      force: true,
    });
  }

  async function saveReadOutput(operationId: ImageCommandId, result: any) {
    const payload = { operationId, output: result };
    await writeFile(outPath(readOutputNameFor(operationId)), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  function assertMutationSuccess(operationId: ImageCommandId, result: any) {
    if (result?.success === true || result?.receipt?.success === true) return;
    const code = result?.failure?.code ?? result?.receipt?.failure?.code ?? 'UNKNOWN';
    throw new Error(`${operationId} did not report success (code: ${code}).`);
  }

  function assertReadOutput(operationId: ImageCommandId, result: any) {
    if (operationId === 'images.list') {
      expect(typeof result?.total).toBe('number');
      expect(Array.isArray(result?.items)).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);
      expect(typeof result.items[0]?.sdImageId).toBe('string');
      return;
    }

    if (operationId === 'images.get') {
      expect(typeof result?.sdImageId).toBe('string');
      expect(result?.address).toBeDefined();
      expect(result?.properties).toBeDefined();
      return;
    }

    throw new Error(`Unexpected read assertion branch for ${operationId}.`);
  }

  function requireFixture(operationId: ImageCommandId, fixture: ImageFixture | null): ImageFixture {
    if (!fixture) throw new Error(`${operationId} requires an image fixture.`);
    return fixture;
  }

  // -- fixture setup ---------------------------------------------------------

  /**
   * Resolve an image by placement from a session that already has images.
   * The corpus doc has both inline and floating images so we can pick the
   * right one for each test scenario.
   */
  async function resolveImageByPlacement(sessionId: string, placement: 'inline' | 'floating'): Promise<string> {
    const listResult = unwrap<any>(await api.doc.images.list({ sessionId }));
    const items: any[] = listResult?.items ?? [];
    const match = items.find((it) => it?.address?.placement === placement);
    if (match) return match.sdImageId;

    // Fallback: return first image regardless of placement
    const imageId = items[0]?.sdImageId;
    if (!imageId) {
      throw new Error(`resolveImageByPlacement: images.list returned no images (wanted ${placement}).`);
    }
    return imageId;
  }

  /** Open the corpus doc that has images, return the first inline image's id. */
  async function setupInlineImageFixture(sessionId: string): Promise<ImageFixture> {
    await api.doc.open({ sessionId, doc: IMAGE_CORPUS_DOC });
    const imageId = await resolveImageByPlacement(sessionId, 'inline');
    return { imageId };
  }

  /** Open the corpus doc, return the first floating image's id. */
  async function setupFloatingImageFixture(sessionId: string): Promise<ImageFixture> {
    await api.doc.open({ sessionId, doc: IMAGE_CORPUS_DOC });
    const imageId = await resolveImageByPlacement(sessionId, 'floating');
    return { imageId };
  }

  // -- scenarios -------------------------------------------------------------

  const scenarios: Scenario[] = [
    {
      operationId: 'create.image',
      setup: 'blank',
      run: async (sessionId) => {
        const src = await imageDataUri();
        return unwrap<any>(
          await api.doc.create.image({
            sessionId,
            src,
            alt: 'butterfly logo',
            at: { kind: 'documentEnd' },
          }),
        );
      },
    },
    {
      operationId: 'images.list',
      setup: 'inlineImage',
      run: async (sessionId) => {
        return unwrap<any>(await api.doc.images.list({ sessionId }));
      },
    },
    {
      operationId: 'images.get',
      setup: 'inlineImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.get', fixture);
        return unwrap<any>(await api.doc.images.get({ sessionId, imageId: f.imageId }));
      },
    },
    {
      operationId: 'images.delete',
      setup: 'inlineImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.delete', fixture);
        return unwrap<any>(await api.doc.images.delete({ sessionId, imageId: f.imageId }));
      },
    },
    {
      operationId: 'images.move',
      setup: 'inlineImage',
      prepare: async (sessionId) => {
        const result = unwrap<any>(
          await api.doc.create.paragraph({
            sessionId,
            at: { kind: 'documentEnd' },
            text: 'Paragraph below the image.',
          }),
        );
        if (result?.success !== true) {
          throw new Error('images.move prepare: failed to create target paragraph.');
        }
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.move', fixture);
        return unwrap<any>(
          await api.doc.images.move({
            sessionId,
            imageId: f.imageId,
            to: { kind: 'documentStart' },
          }),
        );
      },
    },
    {
      operationId: 'images.convertToFloating',
      setup: 'inlineImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.convertToFloating', fixture);
        return unwrap<any>(
          await api.doc.images.convertToFloating({
            sessionId,
            imageId: f.imageId,
          }),
        );
      },
    },
    {
      operationId: 'images.convertToInline',
      setup: 'floatingImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.convertToInline', fixture);
        return unwrap<any>(
          await api.doc.images.convertToInline({
            sessionId,
            imageId: f.imageId,
          }),
        );
      },
    },
    {
      operationId: 'images.setSize',
      setup: 'blank',
      run: async (sessionId) => {
        const src = await imageDataUri();
        const createdResult = unwrap<any>(
          await api.doc.create.image({
            sessionId,
            src,
            alt: 'resizable image',
            at: { kind: 'documentEnd' },
          }),
        );
        if (createdResult?.success !== true) {
          throw new Error('images.setSize setup: create.image did not succeed.');
        }

        const listResult = unwrap<any>(await api.doc.images.list({ sessionId }));
        const imageId = listResult?.items?.[0]?.sdImageId;
        if (typeof imageId !== 'string' || imageId.length === 0) {
          throw new Error('images.setSize setup: images.list did not return an image id.');
        }
        return unwrap<any>(
          await api.doc.images.setSize({
            sessionId,
            imageId,
            size: { width: SET_SIZE_WIDTH_PX, height: SET_SIZE_HEIGHT_PX },
          }),
        );
      },
    },
    {
      operationId: 'images.setWrapType',
      setup: 'floatingImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.setWrapType', fixture);
        return unwrap<any>(
          await api.doc.images.setWrapType({
            sessionId,
            imageId: f.imageId,
            type: 'Tight',
          }),
        );
      },
    },
    {
      operationId: 'images.setWrapSide',
      setup: 'floatingImage',
      prepare: async (sessionId, fixture) => {
        const f = requireFixture('images.setWrapSide', fixture);
        // setWrapSide requires a wrap type that supports side (Square/Tight/Through).
        // The corpus image may already have Square — ignore no-op errors.
        try {
          unwrap<any>(
            await api.doc.images.setWrapType({
              sessionId,
              imageId: f.imageId,
              type: 'Square',
            }),
          );
        } catch {
          /* already Square — fine */
        }
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.setWrapSide', fixture);
        return unwrap<any>(
          await api.doc.images.setWrapSide({
            sessionId,
            imageId: f.imageId,
            side: 'left',
          }),
        );
      },
    },
    {
      operationId: 'images.setWrapDistances',
      setup: 'floatingImage',
      prepare: async (sessionId, fixture) => {
        const f = requireFixture('images.setWrapDistances', fixture);
        // Ensure wrap type supports distances — ignore no-op errors.
        try {
          unwrap<any>(
            await api.doc.images.setWrapType({
              sessionId,
              imageId: f.imageId,
              type: 'Square',
            }),
          );
        } catch {
          /* already Square — fine */
        }
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.setWrapDistances', fixture);
        return unwrap<any>(
          await api.doc.images.setWrapDistances({
            sessionId,
            imageId: f.imageId,
            distances: { distTop: 100, distBottom: 100 },
          }),
        );
      },
    },
    {
      operationId: 'images.setPosition',
      setup: 'floatingImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.setPosition', fixture);
        return unwrap<any>(
          await api.doc.images.setPosition({
            sessionId,
            imageId: f.imageId,
            position: { hRelativeFrom: 'column', alignH: 'center' },
          }),
        );
      },
    },
    {
      operationId: 'images.setAnchorOptions',
      setup: 'floatingImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.setAnchorOptions', fixture);
        return unwrap<any>(
          await api.doc.images.setAnchorOptions({
            sessionId,
            imageId: f.imageId,
            options: { behindDoc: true, allowOverlap: false },
          }),
        );
      },
    },
    {
      operationId: 'images.setZOrder',
      setup: 'floatingImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.setZOrder', fixture);
        return unwrap<any>(
          await api.doc.images.setZOrder({
            sessionId,
            imageId: f.imageId,
            zOrder: { relativeHeight: 500 },
          }),
        );
      },
    },

    // -----------------------------------------------------------------
    // SD-2100: Geometry
    // -----------------------------------------------------------------

    {
      operationId: 'images.scale',
      setup: 'inlineImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.scale', fixture);
        return unwrap<any>(
          await api.doc.images.scale({
            sessionId,
            imageId: f.imageId,
            factor: 0.5,
          }),
        );
      },
    },
    {
      operationId: 'images.setLockAspectRatio',
      setup: 'inlineImage',
      prepare: async (sessionId, fixture) => {
        const f = requireFixture('images.setLockAspectRatio', fixture);
        const image = unwrap<any>(
          await api.doc.images.get({
            sessionId,
            imageId: f.imageId,
          }),
        );
        const current = image?.properties?.lockAspectRatio;
        lockAspectRatioBySession.set(sessionId, current === false ? true : false);
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.setLockAspectRatio', fixture);
        const locked = lockAspectRatioBySession.get(sessionId);
        lockAspectRatioBySession.delete(sessionId);
        return unwrap<any>(
          await api.doc.images.setLockAspectRatio({
            sessionId,
            imageId: f.imageId,
            locked: typeof locked === 'boolean' ? locked : false,
          }),
        );
      },
    },
    {
      operationId: 'images.rotate',
      setup: 'inlineImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.rotate', fixture);
        return unwrap<any>(
          await api.doc.images.rotate({
            sessionId,
            imageId: f.imageId,
            angle: 90,
          }),
        );
      },
    },
    {
      operationId: 'images.flip',
      setup: 'inlineImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.flip', fixture);
        return unwrap<any>(
          await api.doc.images.flip({
            sessionId,
            imageId: f.imageId,
            horizontal: true,
          }),
        );
      },
    },
    {
      operationId: 'images.crop',
      setup: 'inlineImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.crop', fixture);
        return unwrap<any>(
          await api.doc.images.crop({
            sessionId,
            imageId: f.imageId,
            crop: { left: 10, top: 10, right: 10, bottom: 10 },
          }),
        );
      },
    },
    {
      operationId: 'images.resetCrop',
      setup: 'inlineImage',
      prepare: async (sessionId, fixture) => {
        const f = requireFixture('images.resetCrop', fixture);
        // Apply a crop first so resetCrop has something to clear.
        try {
          unwrap<any>(
            await api.doc.images.crop({
              sessionId,
              imageId: f.imageId,
              crop: { left: 5, top: 5, right: 5, bottom: 5 },
            }),
          );
        } catch {
          /* crop may not be supported yet — resetCrop should still work */
        }
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.resetCrop', fixture);
        return unwrap<any>(
          await api.doc.images.resetCrop({
            sessionId,
            imageId: f.imageId,
          }),
        );
      },
    },

    // -----------------------------------------------------------------
    // SD-2100: Content
    // -----------------------------------------------------------------

    {
      operationId: 'images.replaceSource',
      setup: 'inlineImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.replaceSource', fixture);
        const src = await imageDataUri();
        return unwrap<any>(
          await api.doc.images.replaceSource({
            sessionId,
            imageId: f.imageId,
            src,
          }),
        );
      },
    },

    // -----------------------------------------------------------------
    // SD-2100: Semantic metadata
    // -----------------------------------------------------------------

    {
      operationId: 'images.setAltText',
      setup: 'inlineImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.setAltText', fixture);
        return unwrap<any>(
          await api.doc.images.setAltText({
            sessionId,
            imageId: f.imageId,
            description: 'A test image showing a butterfly logo',
          }),
        );
      },
    },
    {
      operationId: 'images.setDecorative',
      setup: 'inlineImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.setDecorative', fixture);
        return unwrap<any>(
          await api.doc.images.setDecorative({
            sessionId,
            imageId: f.imageId,
            decorative: true,
          }),
        );
      },
    },
    {
      operationId: 'images.setName',
      setup: 'inlineImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.setName', fixture);
        return unwrap<any>(
          await api.doc.images.setName({
            sessionId,
            imageId: f.imageId,
            name: 'Picture 42',
          }),
        );
      },
    },
    {
      operationId: 'images.setHyperlink',
      setup: 'inlineImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.setHyperlink', fixture);
        return unwrap<any>(
          await api.doc.images.setHyperlink({
            sessionId,
            imageId: f.imageId,
            url: 'https://example.com',
            tooltip: 'Visit example',
          }),
        );
      },
    },

    // -----------------------------------------------------------------
    // SD-2100: Caption lifecycle
    // -----------------------------------------------------------------

    {
      operationId: 'images.insertCaption',
      setup: 'inlineImage',
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.insertCaption', fixture);
        return unwrap<any>(
          await api.doc.images.insertCaption({
            sessionId,
            imageId: f.imageId,
            text: 'Figure 1: Test image caption',
          }),
        );
      },
    },
    {
      operationId: 'images.updateCaption',
      setup: 'inlineImage',
      prepare: async (sessionId, fixture) => {
        const f = requireFixture('images.updateCaption', fixture);
        // Insert a caption first so updateCaption has something to modify.
        try {
          unwrap<any>(
            await api.doc.images.insertCaption({
              sessionId,
              imageId: f.imageId,
              text: 'Original caption',
            }),
          );
        } catch {
          /* caption may already exist — fine */
        }
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.updateCaption', fixture);
        return unwrap<any>(
          await api.doc.images.updateCaption({
            sessionId,
            imageId: f.imageId,
            text: 'Updated caption text',
          }),
        );
      },
    },
    {
      operationId: 'images.removeCaption',
      setup: 'inlineImage',
      prepare: async (sessionId, fixture) => {
        const f = requireFixture('images.removeCaption', fixture);
        // Insert a caption first so removeCaption has something to remove.
        try {
          unwrap<any>(
            await api.doc.images.insertCaption({
              sessionId,
              imageId: f.imageId,
              text: 'Caption to be removed',
            }),
          );
        } catch {
          /* caption may already exist — fine */
        }
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('images.removeCaption', fixture);
        return unwrap<any>(
          await api.doc.images.removeCaption({
            sessionId,
            imageId: f.imageId,
          }),
        );
      },
    },
  ];

  // -- coverage check --------------------------------------------------------

  it('covers every image command currently defined on this branch', () => {
    const scenarioIds = scenarios.map((scenario) => scenario.operationId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(scenarioIds)).toEqual(new Set(ALL_IMAGE_COMMAND_IDS));
  });

  // -- test runner -----------------------------------------------------------

  for (const scenario of scenarios) {
    it(`${scenario.operationId}: executes and saves source/result docs`, async () => {
      const sessionId = makeSessionId(scenario.operationId.replace(/\./g, '-'));

      let fixture: ImageFixture | null = null;
      if (scenario.setup === 'inlineImage') {
        fixture = await setupInlineImageFixture(sessionId);
      } else if (scenario.setup === 'floatingImage') {
        fixture = await setupFloatingImageFixture(sessionId);
      } else {
        // blank — just open an empty doc and seed a paragraph
        await api.doc.open({ sessionId });
        await api.doc.insert({ sessionId, value: 'Blank document for image test.' });
      }

      if (scenario.prepare) {
        await scenario.prepare(sessionId, fixture);
      }

      await saveSource(sessionId, scenario.operationId);

      const result = await scenario.run(sessionId, fixture);

      if (readOperationIds.has(scenario.operationId)) {
        assertReadOutput(scenario.operationId, result);
        await saveReadOutput(scenario.operationId, result);
      } else {
        assertMutationSuccess(scenario.operationId, result);
      }

      await saveResult(sessionId, scenario.operationId);
    });
  }

  // -- OOXML validity invariants -----------------------------------------------

  it('create.image output has valid wp:extent, a:ext, and non-zero docPr IDs', async () => {
    const docxPath = outPath(docNameFor('create.image'));

    // Extract word/document.xml from the saved docx
    const xml = execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });

    // --- wp:extent must have positive integer cx/cy ---
    const extentMatches = [...xml.matchAll(/<wp:extent\s+([^>]*)\/?>/g)];
    expect(extentMatches.length).toBeGreaterThan(0);
    for (const m of extentMatches) {
      const attrs = m[1];
      const cx = Number(attrs.match(/cx="(\d+)"/)?.[1]);
      const cy = Number(attrs.match(/cy="(\d+)"/)?.[1]);
      expect(cx).toBeGreaterThan(0);
      expect(cy).toBeGreaterThan(0);
      expect(Number.isNaN(cx)).toBe(false);
      expect(Number.isNaN(cy)).toBe(false);
    }

    // --- a:ext must have positive integer cx/cy ---
    const aExtMatches = [...xml.matchAll(/<a:ext\s+([^>]*)\/?>/g)];
    expect(aExtMatches.length).toBeGreaterThan(0);
    for (const m of aExtMatches) {
      const attrs = m[1];
      const cx = Number(attrs.match(/cx="(\d+)"/)?.[1]);
      const cy = Number(attrs.match(/cy="(\d+)"/)?.[1]);
      expect(cx).toBeGreaterThan(0);
      expect(cy).toBeGreaterThan(0);
      expect(Number.isNaN(cx)).toBe(false);
      expect(Number.isNaN(cy)).toBe(false);
    }

    // --- wp:docPr must have non-zero id ---
    const docPrMatches = [...xml.matchAll(/<wp:docPr\s+([^>]*)\/?>/g)];
    expect(docPrMatches.length).toBeGreaterThan(0);
    for (const m of docPrMatches) {
      const id = Number(m[1].match(/id="(\d+)"/)?.[1]);
      expect(id).toBeGreaterThan(0);
    }

    // --- pic:cNvPr must have non-zero id ---
    const cNvPrMatches = [...xml.matchAll(/<pic:cNvPr\s+([^>]*)\/?>/g)];
    expect(cNvPrMatches.length).toBeGreaterThan(0);
    for (const m of cNvPrMatches) {
      const id = Number(m[1].match(/id="(\d+)"/)?.[1]);
      expect(id).toBeGreaterThan(0);
    }
  });

  it('images.setSize output contains the requested extent values in OOXML', async () => {
    const docxPath = outPath(docNameFor('images.setSize'));
    const xml = execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });

    const expectedCx = SET_SIZE_WIDTH_PX * PX_TO_EMU;
    const expectedCy = SET_SIZE_HEIGHT_PX * PX_TO_EMU;

    const wpExtents = [...xml.matchAll(/<wp:extent\s+([^>]*)\/?>/g)];
    expect(wpExtents.length).toBeGreaterThan(0);
    const hasExpectedWpExtent = wpExtents.some((m) => {
      const attrs = m[1];
      const cx = Number(attrs.match(/cx="(\d+)"/)?.[1]);
      const cy = Number(attrs.match(/cy="(\d+)"/)?.[1]);
      return cx === expectedCx && cy === expectedCy;
    });
    expect(hasExpectedWpExtent).toBe(true);

    const aExtents = [...xml.matchAll(/<a:ext\s+([^>]*)\/?>/g)];
    expect(aExtents.length).toBeGreaterThan(0);
    const hasValidAExtent = aExtents.some((m) => {
      const attrs = m[1];
      const cx = Number(attrs.match(/cx="(\d+)"/)?.[1]);
      const cy = Number(attrs.match(/cy="(\d+)"/)?.[1]);
      return cx > 0 && cy > 0;
    });
    expect(hasValidAExtent).toBe(true);
  });
});
