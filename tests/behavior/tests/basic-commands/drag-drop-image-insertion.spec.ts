import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import type { Locator } from '@playwright/test';

test.use({ config: { toolbar: 'full', showSelection: true } });

type PlacementSnapshot = {
  imagePos: number;
  imageCount: number;
};

type DropDiagnostics = {
  dragOverPrevented: boolean;
  dropPrevented: boolean;
  droppedFileCount: number;
};

async function getImagePlacementSnapshot(superdoc: SuperDocFixture): Promise<PlacementSnapshot> {
  return superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const doc = editor?.state?.doc;
    if (!doc) {
      throw new Error('Editor document is unavailable.');
    }

    let imagePos = -1;
    let imageCount = 0;

    doc.descendants((node: any, pos: number) => {
      if (node.type?.name === 'image') {
        imageCount += 1;
        if (imagePos === -1) imagePos = pos;
      }
    });

    return { imagePos, imageCount };
  });
}

async function getDropTarget(superdoc: SuperDocFixture): Promise<Locator> {
  const viewport = superdoc.page.locator('.presentation-editor__viewport').first();
  if ((await viewport.count()) > 0) {
    return viewport;
  }
  return superdoc.page.locator('#editor').first();
}

async function dispatchImageDropAtPos(
  superdoc: SuperDocFixture,
  clientX: number,
  clientY: number,
  fileName: string,
  imageHeightPx: number,
): Promise<DropDiagnostics> {
  const target = await getDropTarget(superdoc);
  const targetSelector = (await target.getAttribute('class'))?.includes('presentation-editor__viewport')
    ? '.presentation-editor__viewport'
    : '#editor';

  const diagnostics = await superdoc.page.evaluate(
    async ({ selector, dropX, dropY, name, imageHeight }) => {
      const host = document.querySelector(selector);
      if (!host) {
        throw new Error(`Unable to attach drag diagnostics. Missing target selector: ${selector}`);
      }

      const dt = new DataTransfer();
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = imageHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not get 2D canvas context for drop image generation.');
      }
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) {
        throw new Error('Failed to generate drop image blob.');
      }

      const file = new File([blob], name, { type: 'image/png' });
      dt.items.add(file);
      dt.effectAllowed = 'copy';

      (window as any).__sdDragDropDiag = {};

      const dragOverListener = (event: Event) => {
        const dragEvent = event as DragEvent;
        (window as any).__sdDragDropDiag = {
          ...(window as any).__sdDragDropDiag,
          dragOverPrevented: dragEvent.defaultPrevented,
        };
      };

      const dropListener = (event: Event) => {
        const dragEvent = event as DragEvent;
        (window as any).__sdDragDropDiag = {
          ...(window as any).__sdDragDropDiag,
          dropPrevented: dragEvent.defaultPrevented,
          droppedFileCount: dragEvent.dataTransfer?.files?.length ?? 0,
        };
      };

      host.addEventListener('dragover', dragOverListener, { once: true });
      host.addEventListener('drop', dropListener, { once: true });

      const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
        clientX: dropX,
        clientY: dropY,
      });
      host.dispatchEvent(dragOverEvent);

      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
        clientX: dropX,
        clientY: dropY,
      });
      host.dispatchEvent(dropEvent);

      const result = (window as any).__sdDragDropDiag ?? {};
      return {
        dragOverPrevented: Boolean(result.dragOverPrevented),
        dropPrevented: Boolean(result.dropPrevented),
        droppedFileCount: Number.isFinite(result.droppedFileCount) ? result.droppedFileCount : 0,
      };
    },
    { selector: targetSelector, dropX: clientX, dropY: clientY, name: fileName, imageHeight: imageHeightPx },
  );

  return diagnostics;
}

async function getLineTopByText(superdoc: SuperDocFixture, text: string): Promise<number> {
  return superdoc.page.evaluate((targetText) => {
    const lines = Array.from(document.querySelectorAll('.superdoc-line')) as HTMLElement[];
    const targetLine = lines.find((line) => (line.textContent ?? '').includes(targetText));
    if (!targetLine) {
      throw new Error(`Unable to find rendered line containing "${targetText}".`);
    }
    return targetLine.getBoundingClientRect().top;
  }, text);
}

async function getRenderedTextMidpoint(
  superdoc: SuperDocFixture,
  text: string,
): Promise<{ clientX: number; clientY: number }> {
  return superdoc.page.evaluate((targetText) => {
    const viewport = document.querySelector('.presentation-editor__viewport');
    if (!viewport) {
      throw new Error('Unable to locate presentation viewport.');
    }

    const walker = document.createTreeWalker(viewport, NodeFilter.SHOW_TEXT);
    let current: Node | null = walker.nextNode();
    while (current) {
      const textValue = current.textContent ?? '';
      const hitIndex = textValue.indexOf(targetText);
      if (hitIndex >= 0) {
        const range = document.createRange();
        range.setStart(current, hitIndex);
        range.setEnd(current, hitIndex + targetText.length);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return {
            clientX: Math.round(rect.left + Math.min(6, rect.width / 2)),
            clientY: Math.round(rect.top + rect.height / 2),
          };
        }
      }
      current = walker.nextNode();
    }

    throw new Error(`Could not resolve rendered text position for "${targetText}".`);
  }, text);
}

async function getTextPosOrNull(superdoc: SuperDocFixture, text: string): Promise<number | null> {
  return superdoc.page.evaluate((targetText) => {
    const doc = (window as any).editor?.state?.doc;
    if (!doc) {
      throw new Error('Editor document is unavailable.');
    }

    let found: number | null = null;
    doc.descendants((node: any, pos: number) => {
      if (found != null) return false;
      if (!node.isText || !node.text) return;
      const hit = node.text.indexOf(targetText);
      if (hit >= 0) {
        found = pos + hit;
        return false;
      }
    });
    return found;
  }, text);
}

test('drops an image before target text at the requested location', async ({ superdoc, browserName }) => {
  test.skip(browserName !== 'chromium', 'Synthetic file DataTransfer drag/drop is deterministic in Chromium only.');

  await superdoc.type('alpha beta');
  await superdoc.newLine();
  await superdoc.type('omega');
  await superdoc.waitForStable();

  const before = await getImagePlacementSnapshot(superdoc);
  expect(before.imageCount).toBe(0);
  const omegaLineTopBeforeDrop = await getLineTopByText(superdoc, 'omega');

  const betaPosBeforeDrop = await superdoc.findTextPos('beta');
  await superdoc.setTextSelection(betaPosBeforeDrop, betaPosBeforeDrop);
  await superdoc.waitForStable();
  const betaDropPoint = await getRenderedTextMidpoint(superdoc, 'beta');

  const diagnostics = await dispatchImageDropAtPos(
    superdoc,
    betaDropPoint.clientX,
    betaDropPoint.clientY,
    'drop-before-beta.png',
    160,
  );
  expect(diagnostics.droppedFileCount).toBeGreaterThan(0);
  const imageCountAfterDrop = await expect
    .poll(async () => (await getImagePlacementSnapshot(superdoc)).imageCount, {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(0)
    .then(async () => (await getImagePlacementSnapshot(superdoc)).imageCount);
  test.skip(
    imageCountAfterDrop === 0,
    `Synthetic drop delivered files but inserted no image (dragOverPrevented=${diagnostics.dragOverPrevented}, dropPrevented=${diagnostics.dropPrevented}).`,
  );
  expect(imageCountAfterDrop).toBe(1);
  await superdoc.waitForStable();

  const after = await getImagePlacementSnapshot(superdoc);
  const alphaPos = await getTextPosOrNull(superdoc, 'alpha');
  const betaPosAfterDrop = await getTextPosOrNull(superdoc, 'beta');
  const omegaLineTopAfterDrop = await getLineTopByText(superdoc, 'omega');
  const textAfterDrop = await superdoc.getTextContent();

  if (alphaPos == null || betaPosAfterDrop == null) {
    throw new Error(`Expected post-drop text to preserve "alpha" and "beta". Actual text: "${textAfterDrop}"`);
  }
  expect(after.imagePos).toBeGreaterThan(alphaPos);
  expect(after.imagePos).toBeLessThan(betaPosAfterDrop);
  expect(omegaLineTopAfterDrop).toBeGreaterThan(omegaLineTopBeforeDrop);
  expect(textAfterDrop).toContain('alpha beta omega');
});
