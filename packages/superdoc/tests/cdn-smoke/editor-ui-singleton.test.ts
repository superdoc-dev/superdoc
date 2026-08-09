/**
 * `editor.ui` through the classic CDN bundle.
 *
 * The classic script tag has no package subpaths, so `editor.ui` is the only
 * way a CDN consumer can build custom UI. These tests run it the way that
 * consumer does: one `<script>`, `new SuperDoc(...)`, then the controller off
 * the instance — no factory import and no reach into `toolbar.ui`.
 *
 * The fixture contains real DOCX comments rather than an empty document. Two
 * tests keep the built-in path honest: a control that
 * proves SuperDoc's own comments UI really does render for this fixture (so
 * asserting its absence means something), and a check that adopting the
 * singleton did not break toolbar Search.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// This directory runs as CJS under Playwright, so `__dirname` is the way to
// reach repository files (`import.meta.url` is unavailable).
const SAMPLE = path.resolve(__dirname, 'fixtures/sample-review.docx');

const PAGE = `<!DOCTYPE html><html><head>
<link href="/dist-cdn/superdoc.min.css" rel="stylesheet"/>
<script>window.SUPERDOC_ENGINE_CDN_BASE_URL='/node_modules/@superdoc/docx-engine';</script>
<script src="/dist-cdn/superdoc.min.js"></script>
</head><body style="margin:0">
<div id="toolbar"></div>
<div id="editor"></div>
<script>
  window.__evidence = { ready: false, exceptions: [], comments: [] };

  // Exactly what a CDN consumer writes: no import, no subpath, no toolbar.ui.
  window.__mount = function (options) {
    var config = {
      selector: '#editor',
      document: '/sample-review.docx',
      onReady: function () { window.__evidence.ready = true; },
      onException: function (payload) {
        window.__evidence.exceptions.push(String(payload && payload.error));
      },
    };
    if (options && options.toolbar) config.toolbar = '#toolbar';
    if (options && options.noBuiltInComments) config.modules = { comments: false };
    if (options && options.findReplace) config.modules = { surfaces: { findReplace: true } };

    var editor = new SuperDoc(config);
    window.__editor = editor;

    // Read the controller before the document is ready: it must answer, and it
    // must be the same object on every read.
    window.__evidence.beforeReady = {
      type: typeof editor.ui,
      stableIdentity: editor.ui === editor.ui,
      documentReady: editor.ui.document.getSnapshot().ready,
      boldEnabled: editor.ui.commands.get('bold').getState().enabled,
      commentsStatus: editor.ui.comments.getSnapshot().listStatus,
    };

    // A custom comments sidebar, wired from the controller alone.
    window.__stopObserving = editor.ui.comments.observe(function (snapshot) {
      window.__evidence.comments = snapshot.items.map(function (comment) {
        return { id: comment.commentId, text: comment.text, status: comment.status };
      });
      window.__evidence.commentsStatus = snapshot.listStatus;
      window.__evidence.commentsTotal = snapshot.total;
    });
    return editor;
  };

  window.__boldState = function () {
    return window.__editor.ui.commands.get('bold').getState();
  };
</script>
</body></html>`;

/** Serve the page and the commented fixture, then wait for the global. */
async function open(page: Page): Promise<void> {
  const sample = await readFile(SAMPLE);
  await page.route('**/sample-review.docx', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: sample,
    }),
  );
  await page.route('**/editor-ui.html', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: PAGE }),
  );
  await page.goto('/editor-ui.html');
  await page.waitForFunction(() => (window as never as { SuperDoc?: unknown }).SuperDoc !== undefined, {
    timeout: 30_000,
  });
}

interface Evidence {
  ready: boolean;
  exceptions: string[];
  comments: Array<{ id: string; status?: string; text: string }>;
  commentsStatus?: string;
  commentsTotal?: number;
  beforeReady: {
    type: string;
    stableIdentity: boolean;
    documentReady: boolean;
    boldEnabled: boolean;
    commentsStatus: string;
  };
}

/**
 * The bits of the CDN instance the comment-mutation tests drive. The classic
 * bundle has no exported types at the script-tag boundary, so this names only
 * what is called rather than reaching for the full public surface.
 *
 * Every member of `SuperDocUIReceipt` discriminates on `success`, and failures
 * carry `failure.message` — there is no `{ ok, reason }` receipt (that shape is
 * `WorkflowActionResult`, a different type). Reading the message means a failed
 * assertion reports why, instead of just "expected true".
 */
type LooseReceipt = { success?: boolean; failure?: { message?: string }; txId?: string } | undefined;

interface LooseEditor {
  ui: {
    selection: { capture(): unknown };
    comments: {
      getSnapshot(): { items: Array<{ commentId: string; status?: string }>; total: number };
      resolve(commentId: string): Promise<LooseReceipt>;
      reopen(commentId: string): Promise<LooseReceipt>;
      createFromCapture(capture: unknown, input: { text: string }): Promise<LooseReceipt>;
    };
  };
}

async function runCommentMutation(
  page: Page,
  action: 'resolve' | 'reopen',
  commentId: string,
): Promise<{ succeeded: boolean; failureMessage: string | null; txId: string | null }> {
  await page.evaluate(
    ({ action: mutationAction, commentId: targetId }) => {
      const w = window as never as {
        __editor: LooseEditor;
        __commentMutationResult?: {
          done: boolean;
          receipt?: LooseReceipt;
          error?: string;
        };
      };
      w.__commentMutationResult = { done: false };
      void Promise.resolve(w.__editor.ui.comments[mutationAction](targetId)).then(
        (receipt) => {
          w.__commentMutationResult = { done: true, receipt };
        },
        (error) => {
          w.__commentMutationResult = {
            done: true,
            error: error instanceof Error ? error.message : String(error),
          };
        },
      );
    },
    { action, commentId },
  );
  await page.waitForFunction(
    () => {
      return (
        (window as never as { __commentMutationResult?: { done?: boolean } }).__commentMutationResult?.done === true
      );
    },
    { timeout: 30_000 },
  );

  return page.evaluate(() => {
    const result = (
      window as never as {
        __commentMutationResult?: { receipt?: LooseReceipt; error?: string };
      }
    ).__commentMutationResult;
    const receipt = result?.receipt;
    return {
      succeeded: receipt?.success === true,
      failureMessage: result?.error ?? receipt?.failure?.message ?? null,
      txId: receipt?.txId ?? null,
    };
  });
}

/** Mount, wait for readiness (or a load failure), and report the evidence. */
async function mount(
  page: Page,
  options: { toolbar?: boolean; noBuiltInComments?: boolean; findReplace?: boolean } = {},
): Promise<Evidence> {
  await page.evaluate((opts) => (window as never as { __mount: (o: unknown) => void }).__mount(opts), options);
  await page.waitForFunction(
    () => {
      const evidence = (window as never as { __evidence: Evidence }).__evidence;
      return evidence.ready || evidence.exceptions.length > 0;
    },
    { timeout: 90_000 },
  );
  return page.evaluate(() => (window as never as { __evidence: Evidence }).__evidence);
}

test('a bare constructor exposes a usable editor.ui before the document is ready', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);

  const evidence = await mount(page);

  expect(evidence.exceptions).toEqual([]);
  expect(evidence.ready).toBe(true);
  // No toolbar was requested, so this is the singleton itself, not a toolbar alias.
  expect(evidence.beforeReady.type).toBe('object');
  expect(evidence.beforeReady.stableIdentity).toBe(true);
  // Pre-ready reads answer with pending state rather than throwing.
  expect(evidence.beforeReady.documentReady).toBe(false);
  expect(evidence.beforeReady.boldEnabled).toBe(false);
  expect(typeof evidence.beforeReady.commentsStatus).toBe('string');
});

test('editor.ui.commands.get("bold") becomes enabled once a selection exists', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  await mount(page);

  // Real input, not a synthetic selection: click into the document, then
  // select its text.
  await page.click('#editor');
  await page.keyboard.press('ControlOrMeta+a');

  // Wait for a selection that STAYS, and assert on the state captured at that
  // moment rather than re-reading afterwards.
  //
  // Both halves matter. A select-all pressed while the editor is still
  // rendering does take effect, then a later render collapses it, and bold
  // correctly reports `range-selection-required` for about a second before the
  // selection re-establishes. So a single `enabled === true` poll can match the
  // brief first spike, and a separate read afterwards then lands in the
  // disabled window. That is timing-dependent: it passes on a fast machine and
  // fails on a loaded CI runner. Requiring the state to hold across
  // consecutive polls waits out the render instead of racing it, and returning
  // the observed state removes the second read entirely.
  //
  // Checked against both controls so this cannot pass vacuously: with no input
  // at all bold never holds enabled and the test fails, and with the click but
  // no select-all it passes, because a collapsed cursor is enough to toggle
  // bold for subsequent typing. The select-all is kept so the assertion covers
  // a real text range rather than only a caret.
  const observed = await page
    .waitForFunction(
      () => {
        const w = window as never as {
          __boldState: () => { enabled: boolean; supported: boolean };
          __boldStreak?: number;
        };
        const state = w.__boldState();
        w.__boldStreak = state.enabled ? (w.__boldStreak ?? 0) + 1 : 0;
        return w.__boldStreak >= 5 ? state : null;
      },
      { timeout: 30_000, polling: 100 },
    )
    .then((handle) => handle.jsonValue())
    .catch(async () => {
      const state = await page.evaluate(() => (window as never as { __boldState: () => unknown }).__boldState());
      throw new Error(`bold never held enabled; last state: ${JSON.stringify(state)}`);
    });

  expect(observed.supported).toBe(true);
  expect(observed.enabled).toBe(true);
});

/**
 * Selectors SuperDoc's own comments UI renders. Asserted absent below, and
 * asserted PRESENT in the control test that follows, so "absent" is a measured
 * result rather than a stale selector that matches nothing.
 */
const BUILT_IN_COMMENTS = ['.superdoc__right-sidebar', '.floating-comments', '.comments-dialog'] as const;

async function builtInCommentsNodes(page: Page): Promise<number> {
  let total = 0;
  for (const selector of BUILT_IN_COMMENTS) total += await page.locator(selector).count();
  return total;
}

async function waitForCommentsReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const evidence = (window as never as { __evidence: Evidence }).__evidence;
      return evidence.commentsStatus === 'ready' && evidence.comments.length > 0;
    },
    { timeout: 60_000 },
  );
}

test('the controller reports comments with no built-in comments UI mounted', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  await mount(page, { noBuiltInComments: true });

  await waitForCommentsReady(page);

  const evidence = await page.evaluate(() => (window as never as { __evidence: Evidence }).__evidence);
  expect(evidence.commentsStatus).toBe('ready');
  expect(evidence.comments.length).toBe(3);
  expect(evidence.comments.map((comment) => comment.text)).toContain('Please confirm the correct recipient title.');

  // The point of the test: the controller is an independent data source, not a
  // side effect of SuperDoc's comments UI being mounted. With `comments: false`
  // nothing SuperDoc-owned rendered a comment, and the application still has
  // every thread.
  expect(await builtInCommentsNodes(page)).toBe(0);
  expect(await page.locator('#toolbar .superdoc-toolbar').count()).toBe(0);
});

/**
 * Whether the controller can still MUTATE comments once SuperDoc's own comments
 * module is off — the question the docs must answer, and one that reading the
 * list cannot settle. `modules.comments: false` is documented as removing the
 * built-in comments presentation; if it also silently disabled resolve/reopen,
 * an application owning its own comments panel would be building on sand.
 *
 * This asserts the measured outcome rather than a hoped-for one: it records
 * what the receipt actually reports so the documentation can describe the real
 * capability boundary instead of guessing at it.
 */
test('the controller can resolve and reopen a comment with no built-in comments module', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  await mount(page, { noBuiltInComments: true });

  await waitForCommentsReady(page);

  const firstCommentId = await page.evaluate(() => {
    const id = (window as never as { __evidence: Evidence }).__evidence.comments[0]?.id ?? null;
    return id == null ? null : String(id);
  });
  expect(firstCommentId).toBeTruthy();

  const receipts = {
    commentId: firstCommentId,
    resolved: await runCommentMutation(page, 'resolve', firstCommentId),
  };

  // Measured: comment mutations route through the Document API, which the
  // presentation switch does not gate. The documentation's capability boundary
  // depends on this staying true.
  expect(receipts.resolved.failureMessage).toBeNull();
  expect(receipts.resolved.succeeded).toBe(true);
  expect(receipts.resolved.txId).toBeTruthy();

  // A committed transaction is not the same as a changed thread, so assert the
  // lifecycle the docs describe actually moved — a successful no-op must not
  // pass. The list republishes asynchronously after the mutation settles, hence
  // polling rather than reading straight back.
  const statusIs = (id: string, expected: string) =>
    page.waitForFunction(
      ({ id: target, expected: want }) =>
        (window as never as { __evidence: Evidence }).__evidence.comments.find((item) => String(item.id) === target)
          ?.status === want,
      { id, expected },
      { timeout: 30_000 },
    );

  await statusIs(receipts.commentId, 'resolved');
  const reopened = await runCommentMutation(page, 'reopen', receipts.commentId);

  expect(reopened.failureMessage).toBeNull();
  expect(reopened.succeeded).toBe(true);
  expect(reopened.txId).toBeTruthy();

  // Require the documented reopened status rather than "not resolved". A
  // negated check also passes when the item is missing entirely — `undefined
  // !== 'resolved'` — so a regression that dropped reopened threads from the
  // snapshot would satisfy it without the lifecycle ever completing.
  await statusIs(receipts.commentId, 'open');

  // Still no SuperDoc-owned comments UI: the mutation did not quietly mount one.
  expect(await builtInCommentsNodes(page)).toBe(0);
});

/**
 * Creation is the other half of the custom-comments story, and the half the
 * docs example leans on hardest (`createFromCapture`). It takes a different
 * route from `resolve`/`reopen` — it needs a live selection capture — so it is
 * measured separately rather than assumed to follow.
 */
test('the controller can create a comment from a capture with no built-in comments module', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  await mount(page, { noBuiltInComments: true });

  await waitForCommentsReady(page);

  const before = await page.evaluate(() => (window as never as { __evidence: Evidence }).__evidence.commentsTotal ?? 0);

  // Drive a real selection through the browser rather than fabricating a Range,
  // then wait for the controller to actually report a capture. A fixed sleep
  // here races the editor on a loaded runner: `capture()` returns null while the
  // controller's selection snapshot is still empty, and the failure would look
  // like a product bug rather than a test that measured too early.
  //
  // A double-click selects one word. Select-all spans the whole body and the
  // Document API rejects the resulting anchor with `unsupported-context`, which
  // would test the harness rather than the capability.
  const glyphPoint = await page.evaluate(() => {
    const root = document.querySelector('#editor');
    if (!root) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      const word = /\S+/.exec(text);
      if (!word || word.index == null) continue;
      const range = document.createRange();
      range.setStart(node, word.index);
      range.setEnd(node, word.index + word[0].length);
      const rect = Array.from(range.getClientRects()).find((candidate) => candidate.width > 0 && candidate.height > 0);
      if (rect) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return null;
  });
  expect(glyphPoint, 'the mounted document exposes a painted text glyph').toBeTruthy();
  await page.mouse.dblclick(glyphPoint!.x, glyphPoint!.y);
  await page.waitForFunction(
    () => (window as never as { __editor: LooseEditor }).__editor.ui.selection.capture() != null,
    undefined,
    { timeout: 30_000 },
  );

  const receipt = await page.evaluate(async () => {
    const editor = (window as never as { __editor: LooseEditor }).__editor;
    const capture = editor.ui.selection.capture();
    const result = await editor.ui.comments.createFromCapture(capture, { text: 'Custom panel comment' });
    return { succeeded: result?.success === true, failureMessage: result?.failure?.message ?? null };
  });

  expect(receipt.failureMessage).toBeNull();
  expect(receipt.succeeded).toBe(true);

  // Poll for the new thread instead of sleeping: the list settles asynchronously.
  await page.waitForFunction(
    (expected) => (window as never as { __evidence: Evidence }).__evidence.commentsTotal === expected,
    before + 1,
    { timeout: 30_000 },
  );

  expect(await builtInCommentsNodes(page)).toBe(0);
});

test('control: the same fixture does render built-in comments UI by default', async ({ page }) => {
  // Keeps the assertion above honest. If SuperDoc renames these classes this
  // test fails first, instead of the one above passing for the wrong reason.
  test.setTimeout(180_000);
  await open(page);
  await mount(page);

  await waitForCommentsReady(page);
  await expect(page.locator('.superdoc__right-sidebar')).toHaveCount(1);
  expect(await builtInCommentsNodes(page)).toBeGreaterThan(0);
});

test('Search still opens from the built-in toolbar', async ({ page }) => {
  // The find bar is opt-in via `modules.surfaces.findReplace`; without it the
  // Search button is rendered but does nothing, which would make this test pass
  // vacuously in the other direction. The point here is that routing the
  // toolbar through the shared controller did not break the one toolbar button
  // that does NOT go through it: Search emits `search:open` on the instance and
  // the shell opens the surface.
  test.setTimeout(180_000);
  await open(page);
  await mount(page, { toolbar: true, findReplace: true });

  await expect(page.locator('#toolbar .superdoc-toolbar')).toBeVisible();
  await page.click('[data-item="btn-search"]');

  await expect(page.locator('.sd-find-replace')).toBeVisible({ timeout: 15_000 });
});
