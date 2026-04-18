import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

type SurfaceKey = 'dialog' | 'floating';

async function readOutcome(superdoc: SuperDocFixture, key: SurfaceKey) {
  return superdoc.page.evaluate((surfaceKey) => {
    return (window as any).__surfaceOutcomes?.[surfaceKey] ?? null;
  }, key);
}

async function openDialogSurface(superdoc: SuperDocFixture) {
  return superdoc.page.evaluate(() => {
    const win = window as any;
    win.__surfaceOutcomes ??= {};

    const handle = win.superdoc.openSurface({
      mode: 'dialog',
      title: 'Confirm action',
      render: ({ container, resolve, close }: any) => {
        container.innerHTML = `
          <div data-testid="dialog-surface-content">
            <button type="button" data-testid="dialog-confirm">Confirm</button>
            <button type="button" data-testid="dialog-cancel">Cancel</button>
          </div>
        `;

        container
          .querySelector('[data-testid="dialog-confirm"]')
          ?.addEventListener('click', () => resolve({ confirmed: true }));
        container.querySelector('[data-testid="dialog-cancel"]')?.addEventListener('click', () => close('cancelled'));
      },
    });

    handle.result.then((outcome: unknown) => {
      win.__surfaceOutcomes.dialog = outcome;
    });

    return { id: handle.id, mode: handle.mode };
  });
}

async function openFloatingSurface(superdoc: SuperDocFixture) {
  return superdoc.page.evaluate(() => {
    const win = window as any;
    win.__surfaceOutcomes ??= {};

    const handle = win.superdoc.openSurface({
      mode: 'floating',
      title: 'Find',
      floating: { placement: 'top-right', width: 320 },
      render: ({ container }: any) => {
        container.innerHTML = `
          <div data-testid="floating-surface-content">
            <input aria-label="Find query" />
          </div>
        `;
      },
    });

    handle.result.then((outcome: unknown) => {
      win.__surfaceOutcomes.floating = outcome;
    });

    return { id: handle.id, mode: handle.mode };
  });
}

test('@behavior SD-2337: dialog surface resolves and unmounts after submit', async ({ superdoc }) => {
  const handle = await openDialogSurface(superdoc);

  expect(handle.mode).toBe('dialog');
  await superdoc.waitForStable();

  const dialogBackdrop = superdoc.page.locator('.sd-surface-dialog-backdrop');
  await expect(dialogBackdrop).toHaveCount(1);
  await expect(superdoc.page.locator('[data-testid="dialog-confirm"]')).toBeVisible();

  await superdoc.page.locator('[data-testid="dialog-confirm"]').click();
  await expect(dialogBackdrop).toHaveCount(0);

  await expect.poll(async () => (await readOutcome(superdoc, 'dialog'))?.status).toBe('submitted');

  await expect.poll(async () => (await readOutcome(superdoc, 'dialog'))?.data?.confirmed).toBe(true);
});

test('@behavior SD-2337: closeSurface closes the topmost dialog before floating and accepts ids', async ({
  superdoc,
}) => {
  const floatingHandle = await openFloatingSurface(superdoc);
  const dialogHandle = await openDialogSurface(superdoc);

  expect(floatingHandle.mode).toBe('floating');
  expect(dialogHandle.mode).toBe('dialog');
  await superdoc.waitForStable();

  const dialogBackdrop = superdoc.page.locator('.sd-surface-dialog-backdrop');
  const floatingSurface = superdoc.page.locator('.sd-surface-floating');

  await expect(dialogBackdrop).toHaveCount(1);
  await expect(floatingSurface).toHaveCount(1);

  await superdoc.page.evaluate(() => {
    (window as any).superdoc.closeSurface();
  });

  await expect(dialogBackdrop).toHaveCount(0);
  await expect(floatingSurface).toHaveCount(1);

  await expect.poll(async () => (await readOutcome(superdoc, 'dialog'))?.status).toBe('closed');

  await expect.poll(async () => await readOutcome(superdoc, 'floating')).toBeNull();

  await superdoc.page.evaluate((floatingId) => {
    (window as any).superdoc.closeSurface(floatingId);
  }, floatingHandle.id);

  await expect(floatingSurface).toHaveCount(0);

  await expect.poll(async () => (await readOutcome(superdoc, 'floating'))?.status).toBe('closed');
});
