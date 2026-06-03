/**
 * Real-editor regression for SD-3123: programmatic content edits on sdtLocked
 * SDTs must flow through (the wrapper is protected, but the content is
 * editable per OOXML spec). Before SD-3123, all paths dispatched a
 * full-wrapper `tr.replaceWith(pos, pos + nodeSize, ...)` which the
 * structured-content lock plugin's `filterTransaction` read as wrapper damage
 * and silently filtered — producing false-success no-ops. Mock-based unit
 * tests prove the new transaction shapes (AttrSteps for metadata, inner-range
 * ReplaceSteps for content), but they do not run the real lock plugin.
 * These tests close that gap.
 *
 * Operates through `editor.doc.contentControls.*` (the customer surface),
 * not `editor.commands.*`. Reads results back through `getContent` and the
 * painter-rendered DOM rather than PM internals.
 */

import { test, expect } from '../../fixtures/superdoc.js';

const BLOCK_SDT = '.superdoc-structured-content-block';
const INLINE_SDT = '.superdoc-structured-content-inline';

type LockMode = 'unlocked' | 'sdtLocked' | 'contentLocked' | 'sdtContentLocked';
type ContentControlTarget = { kind: 'inline' | 'block'; nodeType: 'sdt'; nodeId: string };
type MutationResult =
  | { success: true; contentControl: ContentControlTarget }
  | { success: false; failure: { code: string; message?: string } };
type GetContentResult = { content: string; format: 'text' | 'html' };

interface CreateOpts {
  kind: 'inline' | 'block';
  controlType?: 'text' | 'richText';
  alias: string;
  content?: string;
}

async function createControl(superdoc: any, opts: CreateOpts): Promise<ContentControlTarget> {
  const result = await superdoc.page.evaluate((o: CreateOpts) => {
    const r = (window as any).editor.doc.create.contentControl(
      { kind: o.kind, controlType: o.controlType, alias: o.alias, content: o.content },
      { changeMode: 'direct' },
    );
    if (!r.success) throw new Error(`create failed: ${r.failure?.code} ${r.failure?.message}`);
    return r.contentControl;
  }, opts);
  return result as ContentControlTarget;
}

async function setLock(superdoc: any, target: ContentControlTarget, lockMode: LockMode): Promise<MutationResult> {
  return superdoc.page.evaluate(
    ({ target, lockMode }: { target: ContentControlTarget; lockMode: LockMode }) =>
      (window as any).editor.doc.contentControls.setLockMode({ target, lockMode }, { changeMode: 'direct' }),
    { target, lockMode },
  );
}

async function textSetValue(superdoc: any, target: ContentControlTarget, value: string): Promise<MutationResult> {
  return superdoc.page.evaluate(
    ({ target, value }: { target: ContentControlTarget; value: string }) =>
      (window as any).editor.doc.contentControls.text.setValue({ target, value }, { changeMode: 'direct' }),
    { target, value },
  );
}

async function replaceContent(superdoc: any, target: ContentControlTarget, content: string): Promise<MutationResult> {
  return superdoc.page.evaluate(
    ({ target, content }: { target: ContentControlTarget; content: string }) =>
      (window as any).editor.doc.contentControls.replaceContent(
        { target, content, format: 'text' },
        { changeMode: 'direct' },
      ),
    { target, content },
  );
}

async function clearContent(superdoc: any, target: ContentControlTarget): Promise<MutationResult> {
  return superdoc.page.evaluate(
    ({ target }: { target: ContentControlTarget }) =>
      (window as any).editor.doc.contentControls.clearContent({ target }, { changeMode: 'direct' }),
    { target },
  );
}

async function getContent(superdoc: any, target: ContentControlTarget): Promise<GetContentResult> {
  return superdoc.page.evaluate(
    ({ target }: { target: ContentControlTarget }) => (window as any).editor.doc.contentControls.getContent({ target }),
    { target },
  );
}

// ===========================================================================
// sdtLocked: wrapper protected, content editable
// ===========================================================================

test.describe('SD-3123: Document API mutations on sdtLocked content controls', () => {
  test('text.setValue updates an sdtLocked inline plain-text control', async ({ superdoc }) => {
    const target = await createControl(superdoc, {
      kind: 'inline',
      controlType: 'text',
      alias: 'Locked plain-text',
      content: 'initial',
    });
    await superdoc.waitForStable();

    const lockResult = await setLock(superdoc, target, 'sdtLocked');
    expect(lockResult.success).toBe(true);
    await superdoc.waitForStable();

    const before = await getContent(superdoc, target);
    expect(before.content).toBe('initial');

    const setResult = await textSetValue(superdoc, target, 'updated');
    expect(setResult.success).toBe(true);
    await superdoc.waitForStable();

    const after = await getContent(superdoc, target);
    expect(after.content).toBe('updated');

    // Wrapper still in the painter DOM — the lock didn't get bypassed in a way
    // that drops the SDT.
    await superdoc.assertElementExists(INLINE_SDT);
  });

  test('replaceContent updates an sdtLocked block rich-text control', async ({ superdoc }) => {
    const target = await createControl(superdoc, {
      kind: 'block',
      controlType: 'richText',
      alias: 'Locked rich-text block',
      content: 'initial block body',
    });
    await superdoc.waitForStable();

    const lockResult = await setLock(superdoc, target, 'sdtLocked');
    expect(lockResult.success).toBe(true);
    await superdoc.waitForStable();

    const setResult = await replaceContent(superdoc, target, 'updated block body');
    expect(setResult.success).toBe(true);
    await superdoc.waitForStable();

    const after = await getContent(superdoc, target);
    expect(after.content).toContain('updated block body');

    await superdoc.assertElementExists(BLOCK_SDT);
  });

  test('clearContent empties an sdtLocked block control without removing the wrapper', async ({ superdoc }) => {
    const target = await createControl(superdoc, {
      kind: 'block',
      controlType: 'richText',
      alias: 'Locked clear target',
      content: 'will be cleared',
    });
    await superdoc.waitForStable();

    const lockResult = await setLock(superdoc, target, 'sdtLocked');
    expect(lockResult.success).toBe(true);
    await superdoc.waitForStable();

    const clearResult = await clearContent(superdoc, target);
    expect(clearResult.success).toBe(true);
    await superdoc.waitForStable();

    const after = await getContent(superdoc, target);
    expect(after.content.trim()).toBe('');
    await superdoc.assertElementExists(BLOCK_SDT);
  });

  test('round-trip: sdtLocked → unlocked → text.setValue succeeds (lock-state attr writes via AttrStep)', async ({
    superdoc,
  }) => {
    const target = await createControl(superdoc, {
      kind: 'inline',
      controlType: 'text',
      alias: 'Round-trip',
      content: 'initial',
    });
    await superdoc.waitForStable();

    expect((await setLock(superdoc, target, 'sdtLocked')).success).toBe(true);
    await superdoc.waitForStable();

    expect((await setLock(superdoc, target, 'unlocked')).success).toBe(true);
    await superdoc.waitForStable();

    expect((await textSetValue(superdoc, target, 'after unlock')).success).toBe(true);
    await superdoc.waitForStable();

    expect((await getContent(superdoc, target)).content).toBe('after unlock');
  });
});

// ===========================================================================
// contentLocked: content protected. API guard fires before reaching engine.
// ===========================================================================

test.describe('SD-3123: contentLocked still rejects content mutation via API guard', () => {
  test('text.setValue on a contentLocked control returns LOCK_VIOLATION and leaves content unchanged', async ({
    superdoc,
  }) => {
    const target = await createControl(superdoc, {
      kind: 'inline',
      controlType: 'text',
      alias: 'Content-locked',
      content: 'protected',
    });
    await superdoc.waitForStable();

    expect((await setLock(superdoc, target, 'contentLocked')).success).toBe(true);
    await superdoc.waitForStable();

    // The wrapper's `assertNotContentLocked` guard throws inside the adapter;
    // page.evaluate surfaces it as a rejected promise. Catch and inspect.
    const rejection = await superdoc.page.evaluate(
      ({ target }: { target: ContentControlTarget }) => {
        try {
          (window as any).editor.doc.contentControls.text.setValue(
            { target, value: 'changed' },
            { changeMode: 'direct' },
          );
          return { threw: false };
        } catch (err) {
          const e = err as { code?: string; message?: string };
          return { threw: true, code: e.code, message: e.message };
        }
      },
      { target },
    );

    expect(rejection.threw).toBe(true);
    expect(rejection.code).toBe('LOCK_VIOLATION');

    // Content should remain unchanged.
    expect((await getContent(superdoc, target)).content).toBe('protected');
  });
});
