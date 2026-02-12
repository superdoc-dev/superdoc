import { test } from '../../fixtures/superdoc.js';

test.use({ config: { hideCaret: false } });

test.fixme('@behavior SDT lock modes enforcement', async ({ superdoc }) => {
  // Insert unlocked inline SDT
  await superdoc.type('Unlocked inline: ');
  await superdoc.waitForStable();
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertStructuredContentInline({
      attrs: { id: '100', alias: 'Unlocked Field', lockMode: 'unlocked' },
      text: 'editable value',
    });
  });
  await superdoc.waitForStable();

  // Insert sdtLocked inline SDT
  await superdoc.press('End');
  await superdoc.press('Enter');
  await superdoc.type('SDT-locked inline: ');
  await superdoc.waitForStable();
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertStructuredContentInline({
      attrs: { id: '200', alias: 'SDT Locked', lockMode: 'sdtLocked' },
      text: 'cannot delete wrapper',
    });
  });
  await superdoc.waitForStable();

  // Insert contentLocked inline SDT
  await superdoc.press('End');
  await superdoc.press('Enter');
  await superdoc.type('Content-locked inline: ');
  await superdoc.waitForStable();
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertStructuredContentInline({
      attrs: { id: '300', alias: 'Content Locked', lockMode: 'contentLocked' },
      text: 'read-only content',
    });
  });
  await superdoc.waitForStable();
  await superdoc.screenshot('sdt-inline-created');

  // Insert block SDT with sdtContentLocked
  await superdoc.press('End');
  await superdoc.press('Enter');
  await superdoc.press('Enter');
  await superdoc.waitForStable();
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertStructuredContentBlock({
      attrs: { id: '400', alias: 'Fully Locked Block', lockMode: 'sdtContentLocked' },
      html: '<p>This block is fully locked (sdtContentLocked).</p>',
    });
  });
  await superdoc.waitForStable();
  await superdoc.screenshot('sdt-block-created');

  // Type inside sdtLocked (content should be editable)
  const sdt200 = await superdoc.page.evaluate(() => {
    let result: { pos: number; size: number } | null = null;
    (window as any).editor.state.doc.descendants((node: any, pos: number) => {
      if (result) return false;
      if (
        (node.type.name === 'structuredContent' || node.type.name === 'structuredContentBlock') &&
        String(node.attrs.id) === '200'
      ) {
        result = { pos, size: node.nodeSize };
        return false;
      }
      return true;
    });
    return result;
  });

  if (sdt200) {
    await superdoc.setTextSelection(sdt200.pos + 2);
    await superdoc.waitForStable();
    await superdoc.type(' ADDED');
    await superdoc.waitForStable();
    await superdoc.screenshot('sdt-locked-typed');
  }

  // Try typing inside contentLocked (should be blocked)
  const sdt300 = await superdoc.page.evaluate(() => {
    let result: { pos: number; size: number } | null = null;
    (window as any).editor.state.doc.descendants((node: any, pos: number) => {
      if (result) return false;
      if (
        (node.type.name === 'structuredContent' || node.type.name === 'structuredContentBlock') &&
        String(node.attrs.id) === '300'
      ) {
        result = { pos, size: node.nodeSize };
        return false;
      }
      return true;
    });
    return result;
  });

  if (sdt300) {
    await superdoc.setTextSelection(sdt300.pos + 2);
    await superdoc.waitForStable();
    await superdoc.type('BLOCKED');
    await superdoc.waitForStable();
    await superdoc.screenshot('sdt-content-locked-typing');
  }

  // Update lock mode: unlocked → contentLocked
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.updateStructuredContentById('100', {
      attrs: { lockMode: 'contentLocked' },
    });
  });
  await superdoc.waitForStable();
  await superdoc.screenshot('sdt-lock-mode-updated');
});
