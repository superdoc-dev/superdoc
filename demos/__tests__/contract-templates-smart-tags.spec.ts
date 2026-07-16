import { test, expect } from '@playwright/test';

/**
 * Smart-tags authoring: clicking a tag chip in the sidebar inserts a matching
 * inline SDT at the caret (dogfoods ui.selection.capture + create.contentControl).
 * The inserted control is created EMPTY (shows the placeholder) and contentLocked
 * (values are filled only via the Values form), carries the field's tag, and
 * paints with the same .superdoc-structured-content-inline wrapper the chips match.
 *
 * Runs only for the contract-templates demo (the shared suite runs once per DEMO).
 */

test('clicking a Smart-tags chip inserts a matching inline SDT at the caret', async ({ page }) => {
  test.skip(process.env.DEMO !== 'contract-templates', 'contract-templates demo only');

  await page.route('**/ingest.superdoc.dev/**', (r) =>
    r.fulfill({ status: 204, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await page.waitForFunction(
    () => (window as any).__demo?.state?.ui?.contentControls?.getSnapshot()?.items?.length > 0,
    null,
    { timeout: 30_000 },
  );
  await page.waitForSelector('[data-tag-key]');

  // Place a caret in the document body so capture() has an insertion point.
  await page.evaluate(() => {
    (window as any).__demo.superdoc.activeEditor.commands?.setTextSelection?.({ from: 6, to: 6 });
  });

  const key = await page.getAttribute('[data-tag-key]', 'data-tag-key');
  expect(key).toBeTruthy();

  // Count existing controls with this tag, then click the chip and expect one more.
  // (The field is inserted empty/locked, so we count by tag, not by text.)
  const tag = JSON.stringify({ kind: 'smartField', key });
  const countForTag = () =>
    page.evaluate((t) => {
      const ed = (window as any).__demo.superdoc.activeEditor;
      let n = 0;
      ed.state.doc.descendants((node: any) => {
        if (node.type.name === 'structuredContent' && node.attrs?.tag === t) n += 1;
        return true;
      });
      return n;
    }, tag);

  const before = await countForTag();
  await page.click(`[data-tag-key="${key}"]`);
  await expect.poll(countForTag, { timeout: 6_000 }).toBe(before + 1);
});

test('clicking an in-editor smart-field token highlights its sidebar chip', async ({ page }) => {
  test.skip(process.env.DEMO !== 'contract-templates', 'contract-templates demo only');

  await page.route('**/ingest.superdoc.dev/**', (r) =>
    r.fulfill({ status: 204, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await page.waitForFunction(
    () => (window as any).__demo?.state?.ui?.contentControls?.getSnapshot()?.items?.length > 0,
    null,
    { timeout: 30_000 },
  );
  await page.waitForSelector('[data-tag-key]');

  const sel = '.superdoc-structured-content-inline[data-sdt-tag*="smartField"]';
  await page.waitForSelector(sel);
  // The key of the first painted inline smart-field token in the document.
  const key = await page.evaluate((s) => {
    const el = document.querySelector(s);
    try {
      return JSON.parse(el?.getAttribute('data-sdt-tag') ?? '{}').key ?? null;
    } catch {
      return null;
    }
  }, sel);
  expect(key).toBeTruthy();

  // Click the token in the document; its sidebar chip should become active.
  await page.locator(sel).first().click();
  await expect
    .poll(
      async () =>
        page.evaluate(
          (k) => document.querySelector(`.smart-tag[data-tag-key="${k}"]`)?.classList.contains('is-active') ?? false,
          key,
        ),
      { timeout: 5_000 },
    )
    .toBe(true);
});

test('a smart-field pill does not shift its box on hover or click (no jitter)', async ({ page }) => {
  test.skip(process.env.DEMO !== 'contract-templates', 'contract-templates demo only');

  await page.route('**/ingest.superdoc.dev/**', (r) =>
    r.fulfill({ status: 204, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await page.waitForFunction(
    () => (window as any).__demo?.state?.ui?.contentControls?.getSnapshot()?.items?.length > 0,
    null,
    { timeout: 30_000 },
  );
  const sel = '.superdoc-structured-content-inline[data-sdt-tag*="smartField"]';
  await page.waitForSelector(sel);

  // Under chrome:'none' SuperDoc resets the field's border/fill on hover and on
  // selectednode; the demo re-asserts them to keep the box. Guard that the box
  // and border stay constant across rest -> hover -> click, so it never moves.
  const box = () =>
    page.evaluate((s) => {
      const el = document.querySelector(s) as HTMLElement;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), border: getComputedStyle(el).borderTopWidth };
    }, sel);

  const rest = await box();
  await page.locator(sel).first().hover();
  await page.waitForTimeout(250);
  const hovered = await box();
  await page.locator(sel).first().click();
  await page.waitForTimeout(250);
  const clicked = await box();

  for (const state of [hovered, clicked]) {
    expect(state.border).toBe('1px');
    expect(Math.abs(state.w - rest.w)).toBeLessThanOrEqual(1);
    expect(Math.abs(state.h - rest.h)).toBeLessThanOrEqual(1);
  }
});

test('a block clause keeps its left rail and box across hover/select (no jitter)', async ({ page }) => {
  test.skip(process.env.DEMO !== 'contract-templates', 'contract-templates demo only');

  await page.route('**/ingest.superdoc.dev/**', (r) =>
    r.fulfill({ status: 204, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await page.waitForFunction(
    () => (window as any).__demo?.state?.ui?.contentControls?.getSnapshot()?.items?.length > 0,
    null,
    { timeout: 30_000 },
  );
  const sel = '.superdoc-structured-content-block[data-sdt-tag*="reusableSection"]';
  await page.waitForSelector(sel);

  // Block SDTs strip border + fill on .sdt-group-hover / .ProseMirror-selectednode;
  // the demo overrides them. Guard the 4px left rail and box stay constant.
  const box = () =>
    page.evaluate((s) => {
      const el = document.querySelector(s) as HTMLElement;
      const r = el.getBoundingClientRect();
      return { rail: getComputedStyle(el).borderLeftWidth, w: Math.round(r.width), h: Math.round(r.height) };
    }, sel);

  const rest = await box();
  expect(rest.rail).toBe('4px');
  await page.locator(sel).first().hover();
  await page.waitForTimeout(250);
  const hovered = await box();
  await page.locator(sel).first().click();
  await page.waitForTimeout(250);
  const clicked = await box();

  for (const state of [hovered, clicked]) {
    expect(state.rail).toBe('4px');
    expect(Math.abs(state.w - rest.w)).toBeLessThanOrEqual(1);
    expect(Math.abs(state.h - rest.h)).toBeLessThanOrEqual(1);
  }
});

test('smart fields are contentLocked and fill only through the Values form', async ({ page }) => {
  test.skip(process.env.DEMO !== 'contract-templates', 'contract-templates demo only');

  await page.route('**/ingest.superdoc.dev/**', (r) =>
    r.fulfill({ status: 204, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await page.waitForFunction(
    () => (window as any).__demo?.state?.ui?.contentControls?.getSnapshot()?.items?.length > 0,
    null,
    { timeout: 30_000 },
  );

  const smartFieldLockModes = () =>
    page.evaluate(() => {
      const doc = (window as any).__demo.doc();
      return doc.contentControls
        .list({})
        .items.filter((c: any) => {
          try {
            return JSON.parse(c.properties?.tag ?? '{}').kind === 'smartField';
          } catch {
            return false;
          }
        })
        .map((c: any) => c.lockMode);
    });
  const textForDisclosingParty = () =>
    page.evaluate(() => {
      const doc = (window as any).__demo.doc();
      const tag = JSON.stringify({ kind: 'smartField', key: 'disclosingParty' });
      return doc.contentControls.selectByTag({ tag }).items.map((c: any) => c.text);
    });

  // Every smart field starts contentLocked (the user can't type into them).
  const before = await smartFieldLockModes();
  expect(before.length).toBeGreaterThan(0);
  expect(before.every((m) => m === 'contentLocked')).toBe(true);

  // Editing through the Values form writes through the lock (unlock -> setValue
  // -> relock): the field text updates even though the control is locked. Use a
  // value distinct from the seeded default so the write is observable.
  await page.click('.tab[data-tab="values"]');
  await page.fill('input[data-field="disclosingParty"]', 'Globex Corporation');
  await expect.poll(textForDisclosingParty, { timeout: 6_000 }).toContain('Globex Corporation');

  // And the controls are relocked afterward, never left editable.
  const after = await smartFieldLockModes();
  expect(after.every((m) => m === 'contentLocked')).toBe(true);
});

test('block clauses are contentLocked too', async ({ page }) => {
  test.skip(process.env.DEMO !== 'contract-templates', 'contract-templates demo only');

  await page.route('**/ingest.superdoc.dev/**', (r) =>
    r.fulfill({ status: 204, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await page.waitForFunction(
    () => (window as any).__demo?.state?.ui?.contentControls?.getSnapshot()?.items?.length > 0,
    null,
    { timeout: 30_000 },
  );

  // Clause blocks are locked like the inline fields, so their prose can't be
  // edited by typing in the document.
  const clauseLockModes = await page.evaluate(() => {
    const doc = (window as any).__demo.doc();
    return doc.contentControls
      .list({})
      .items.filter((c: any) => {
        try {
          return JSON.parse(c.properties?.tag ?? '{}').kind === 'reusableSection';
        } catch {
          return false;
        }
      })
      .map((c: any) => c.lockMode);
  });
  expect(clauseLockModes.length).toBeGreaterThan(0);
  expect(clauseLockModes.every((m) => m === 'contentLocked')).toBe(true);
});

test('a field value broadcasts to every occurrence, including one nested in a locked clause', async ({ page }) => {
  test.skip(process.env.DEMO !== 'contract-templates', 'contract-templates demo only');

  await page.route('**/ingest.superdoc.dev/**', (r) =>
    r.fulfill({ status: 204, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await page.waitForFunction(
    () => (window as any).__demo?.state?.ui?.contentControls?.getSnapshot()?.items?.length > 0,
    null,
    { timeout: 30_000 },
  );

  // Receiving party appears twice: once in the header sentence and once nested
  // inside the (locked) Permitted Use clause. The clause's content lock silently
  // vetoes writes to the nested one unless the clause is unlocked around the
  // write - this guards that the form value reaches BOTH occurrences.
  const receivingPartyTexts = () =>
    page.evaluate(() => {
      const doc = (window as any).__demo.doc();
      const tag = JSON.stringify({ kind: 'smartField', key: 'receivingParty' });
      return doc.contentControls.selectByTag({ tag }).items.map((c: any) => c.text);
    });

  expect((await receivingPartyTexts()).length).toBe(2);

  await page.click('.tab[data-tab="values"]');
  await page.fill('input[data-field="receivingParty"]', 'Beacon Bio');

  await expect
    .poll(async () => (await receivingPartyTexts()).filter((t) => t === 'Beacon Bio').length, { timeout: 6_000 })
    .toBe(2);
});

test('the clause library is single-use: seeded clauses are In contract, others Add clause', async ({ page }) => {
  test.skip(process.env.DEMO !== 'contract-templates', 'contract-templates demo only');

  await page.route('**/ingest.superdoc.dev/**', (r) =>
    r.fulfill({ status: 204, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await page.waitForFunction(
    () => (window as any).__demo?.state?.ui?.contentControls?.getSnapshot()?.items?.length > 0,
    null,
    { timeout: 30_000 },
  );
  await page.waitForSelector('.clause[data-clause-id]');

  // A seeded clause is already in the contract; a library-only one is available.
  await expect(page.locator('.clause[data-clause-id="permittedUse"] .clause-status')).toHaveText('In contract');
  await expect(page.locator('.clause[data-clause-id="permittedUse"]')).toHaveClass(/is-present/);
  await expect(page.locator('.clause[data-clause-id="indemnification"] .clause-status')).toHaveText('Add clause');
  await expect(page.locator('.clause[data-clause-id="indemnification"]')).toHaveClass(/is-available/);
});

test('clicking an available clause adds it once (single-use, then In contract)', async ({ page }) => {
  test.skip(process.env.DEMO !== 'contract-templates', 'contract-templates demo only');

  await page.route('**/ingest.superdoc.dev/**', (r) =>
    r.fulfill({ status: 204, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await page.waitForFunction(
    () => (window as any).__demo?.state?.ui?.contentControls?.getSnapshot()?.items?.length > 0,
    null,
    { timeout: 30_000 },
  );
  await page.waitForSelector('.clause[data-clause-id="indemnification"]');

  // Caret in the (unlocked) title so the clause adds at a clean block boundary.
  await page.evaluate(() => {
    (window as any).__demo.superdoc.activeEditor.commands?.setTextSelection?.({ from: 6, to: 6 });
  });

  const indemnificationInfo = () =>
    page.evaluate(() => {
      const doc = (window as any).__demo.doc();
      const items = doc.contentControls.list({}).items.filter((c: any) => {
        try {
          return JSON.parse(c.properties?.tag ?? '{}').sectionId === 'indemnification';
        } catch {
          return false;
        }
      });
      return { count: items.length, allLocked: items.every((c: any) => c.lockMode === 'contentLocked') };
    });

  expect((await indemnificationInfo()).count).toBe(0);
  await page.click('.clause[data-clause-id="indemnification"]');

  // It's added once, locked, and the card flips to In contract.
  await expect.poll(async () => (await indemnificationInfo()).count, { timeout: 6_000 }).toBe(1);
  expect((await indemnificationInfo()).allLocked).toBe(true);
  await expect(page.locator('.clause[data-clause-id="indemnification"] .clause-status')).toHaveText('In contract');

  // Clicking again does NOT duplicate it (single-use; reveals the existing one).
  await page.click('.clause[data-clause-id="indemnification"]');
  await page.waitForTimeout(500);
  expect((await indemnificationInfo()).count).toBe(1);
});

test('adding the Return of Materials clause nests a real smart field that fills from the form', async ({ page }) => {
  test.skip(process.env.DEMO !== 'contract-templates', 'contract-templates demo only');

  await page.route('**/ingest.superdoc.dev/**', (r) =>
    r.fulfill({ status: 204, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await page.waitForFunction(
    () => (window as any).__demo?.state?.ui?.contentControls?.getSnapshot()?.items?.length > 0,
    null,
    { timeout: 30_000 },
  );
  await page.waitForSelector('.clause[data-clause-id="returnOfMaterials"]');

  // Caret in the (unlocked) title so the clause adds at a clean block boundary.
  await page.evaluate(() => {
    (window as any).__demo.superdoc.activeEditor.commands?.setTextSelection?.({ from: 6, to: 6 });
  });

  // Receiving party smart fields in the document (Return of Materials carries one).
  const receivingPartyControls = () =>
    page.evaluate(() => {
      const doc = (window as any).__demo.doc();
      const tag = JSON.stringify({ kind: 'smartField', key: 'receivingParty' });
      return doc.contentControls.selectByTag({ tag }).items.map((c: any) => c.text);
    });

  const before = (await receivingPartyControls()).length; // 2 seeded
  await page.click('.clause[data-clause-id="returnOfMaterials"]');

  // Adding the clause creates a real nested Receiving party SDT (not plain text).
  await expect.poll(async () => (await receivingPartyControls()).length, { timeout: 6_000 }).toBe(before + 1);

  // Filling Receiving party in the Values form reaches every occurrence,
  // including the one just nested inside the added clause.
  await page.click('.tab[data-tab="values"]');
  await page.fill('input[data-field="receivingParty"]', 'Beacon Bio');
  await expect
    .poll(async () => (await receivingPartyControls()).filter((t) => t === 'Beacon Bio').length, { timeout: 6_000 })
    .toBe(before + 1);
});

test('the public custom SDT variables drive the painted fields across states (no !important)', async ({ page }) => {
  test.skip(process.env.DEMO !== 'contract-templates', 'contract-templates demo only');

  await page.route('**/ingest.superdoc.dev/**', (r) =>
    r.fulfill({ status: 204, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await page.waitForFunction(
    () => (window as any).__demo?.state?.ui?.contentControls?.getSnapshot()?.items?.length > 0,
    null,
    { timeout: 30_000 },
  );
  const sel = ".superdoc-structured-content-inline[data-sdt-tag*='smartField']";
  await page.waitForSelector(sel);
  const field = page.locator(sel).first();

  const bg = () => field.evaluate((el) => getComputedStyle(el).backgroundColor);
  const borderTop = () =>
    field.evaluate((el) => `${getComputedStyle(el).borderTopWidth} ${getComputedStyle(el).borderTopColor}`);

  const restBg = await bg();
  const restBorder = await borderTop();
  await field.hover();
  await page.waitForTimeout(250);
  const hoverBg = await bg();
  const hoverBorder = await borderTop();

  // The custom hover background applies (the fill changes)...
  expect(hoverBg).not.toBe(restBg);
  // ...and it is NOT the built-in lock-hover tint. Fields carry data-lock-mode,
  // which matches SuperDoc's lock-hover path; the custom variable must win.
  expect(hoverBg).not.toBe('rgba(98, 155, 231, 0.08)');
  // The border is constant across states (no jitter) - achieved with variables
  // alone: the demo CSS has no !important and no .ProseMirror-selectednode /
  // .sdt-group-hover state selectors.
  expect(hoverBorder).toBe(restBorder);
  expect(restBorder.startsWith('1px ')).toBe(true);

  // No built-in label / chrome leaks under chrome:'none'.
  const leakedLabels = await page
    .locator('.superdoc-structured-content__label, .superdoc-structured-content-inline__label')
    .count();
  expect(leakedLabels).toBe(0);
});
