import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { hideSelection: false } });

test('@behavior SD-1905 selection highlight preserved when focus moves to editor UI surface', async ({ superdoc }) => {
  await superdoc.type('Select this text then open dropdown');
  await superdoc.waitForStable();

  // Select all text via keyboard shortcut
  await superdoc.selectAll();
  await superdoc.waitForStable();

  // Verify selection overlay is rendered
  const overlayChildCount = await superdoc.page.evaluate(() => {
    const overlay = document.querySelector('.presentation-editor__selection-layer--local');
    return overlay ? overlay.children.length : -1;
  });
  expect(overlayChildCount).toBeGreaterThan(0);

  await superdoc.screenshot('sd-1905-selection-before-ui-focus');

  // Simulate focus moving to an editor UI surface (e.g. toolbar dropdown).
  // This is what happens when a user clicks a toolbar dropdown — focus leaves
  // the ProseMirror editor and moves to a UI element marked as editor UI.
  await superdoc.page.evaluate(() => {
    const btn = document.createElement('button');
    btn.setAttribute('data-editor-ui-surface', '');
    btn.textContent = 'Fake toolbar button';
    btn.id = 'sd-1905-test-ui-surface';
    document.body.appendChild(btn);
    btn.focus();
  });
  await superdoc.waitForStable();

  // Selection overlay should still be visible after focus moved to UI surface
  const overlayAfterUiFocus = await superdoc.page.evaluate(() => {
    const overlay = document.querySelector('.presentation-editor__selection-layer--local');
    return overlay ? overlay.children.length : -1;
  });
  expect(overlayAfterUiFocus).toBeGreaterThan(0);

  await superdoc.screenshot('sd-1905-selection-with-ui-surface-focused');

  // Clean up test element
  await superdoc.page.evaluate(() => {
    document.getElementById('sd-1905-test-ui-surface')?.remove();
  });
});
