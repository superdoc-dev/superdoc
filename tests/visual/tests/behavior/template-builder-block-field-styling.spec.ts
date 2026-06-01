import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const fieldTypesCss = fs.readFileSync(
  path.join(repoRoot, 'packages/template-builder/src/styles/field-types.css'),
  'utf8',
);

test('inline and block structured content field chrome use Template Builder field styles', async ({ superdoc }) => {
  await superdoc.page.addStyleTag({
    content: `
      :root {
        --superdoc-field-owner-color: rgb(37, 99, 235);
        --superdoc-field-signer-color: rgb(220, 38, 38);
        --sd-content-controls-label-text: rgb(255, 255, 0);
      }
      ${fieldTypesCss}
    `,
  });

  await superdoc.page.evaluate(() => {
    const fieldAttrs = (id: string, alias: string, fieldType: 'owner' | 'signer') => ({
      id,
      alias,
      tag: `{"fieldType":"${fieldType}"}`,
    });

    const inlineField = (id: string, alias: string, fieldType: 'owner' | 'signer', text: string) => ({
      type: 'paragraph',
      content: [
        {
          type: 'structuredContent',
          attrs: fieldAttrs(id, alias, fieldType),
          content: [{ type: 'text', text }],
        },
      ],
    });

    const blockField = (id: string, alias: string, fieldType: 'owner' | 'signer', text: string) => ({
      type: 'structuredContentBlock',
      attrs: fieldAttrs(id, alias, fieldType),
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text }],
        },
      ],
    });

    const spacer = () => ({ type: 'paragraph', content: [{ type: 'text', text: ' ' }] });

    const editor = (window as any).editor;
    const doc = editor.schema.nodeFromJSON({
      type: 'doc',
      content: [
        inlineField('1', 'Signer Inline', 'signer', 'Signer inline value'),
        spacer(),
        spacer(),
        blockField('2', 'Signer Block', 'signer', 'Signature area'),
        spacer(),
        spacer(),
        inlineField('3', 'Owner Inline', 'owner', 'Owner inline value'),
        spacer(),
        spacer(),
        blockField('4', 'Owner Block', 'owner', 'Owner approval area'),
      ],
    });
    editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content));
  });
  await superdoc.waitForStable();

  const renderedPage = superdoc.page.locator('.superdoc-page').first();
  const getInline = (fieldType: 'owner' | 'signer') =>
    renderedPage.locator(`.superdoc-structured-content-inline[data-sdt-tag*='"fieldType":"${fieldType}"']`).first();
  const getBlock = (fieldType: 'owner' | 'signer') =>
    renderedPage.locator(`.superdoc-structured-content-block[data-sdt-tag*='"fieldType":"${fieldType}"']`).first();

  const expectRestingBackgrounds = async (fieldType: 'owner' | 'signer') => {
    const inline = getInline(fieldType);
    const block = getBlock(fieldType);

    await inline.evaluate((el) => el.classList.remove('ProseMirror-selectednode'));
    await block.evaluate((el) => {
      el.classList.remove('ProseMirror-selectednode');
      el.classList.remove('sdt-group-hover');
    });

    const inlineBackground = await inline.evaluate((el) => getComputedStyle(el).backgroundColor);
    await expect(block).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const blockBackground = await block.evaluate((el) => getComputedStyle(el, '::before').backgroundColor);

    expect(inlineBackground).toBe(blockBackground);
    expect(inlineBackground).not.toBe('rgba(0, 0, 0, 0)');
  };

  const expectSelectedStateBackgrounds = async (fieldType: 'owner' | 'signer') => {
    const inline = getInline(fieldType);
    const block = getBlock(fieldType);

    await inline.evaluate((el) => el.classList.add('ProseMirror-selectednode'));
    await block.evaluate((el) => {
      el.classList.remove('sdt-group-hover');
      el.classList.add('ProseMirror-selectednode');
    });

    await expect(inline).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(block).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const blockSelectedBackground = await block.evaluate((el) => getComputedStyle(el, '::before').backgroundColor);
    expect(blockSelectedBackground).not.toBe('rgba(0, 0, 0, 0)');
  };

  const showInlineLabel = async (fieldType: 'owner' | 'signer') => {
    const inline = getInline(fieldType);
    await inline.evaluate((el) => el.classList.add('ProseMirror-selectednode'));
    return inline;
  };

  const showBlockLabel = async (fieldType: 'owner' | 'signer') => {
    const block = getBlock(fieldType);
    await block.evaluate((el) => {
      el.classList.remove('sdt-group-hover');
      el.classList.add('ProseMirror-selectednode');
    });
    return block;
  };

  const expectHoverBackgroundParity = async (fieldType: 'owner' | 'signer') => {
    const inline = getInline(fieldType);
    const block = getBlock(fieldType);

    await inline.evaluate((el) => el.classList.remove('ProseMirror-selectednode'));
    await inline.hover();
    const inlineHoverBackground = await inline.evaluate((el) => getComputedStyle(el).backgroundColor);

    await block.evaluate((el) => {
      el.classList.remove('ProseMirror-selectednode');
      el.classList.add('sdt-group-hover');
    });
    await expect
      .poll(async () => block.evaluate((el) => getComputedStyle(el, '::before').backgroundColor))
      .toBe(inlineHoverBackground);

    await inline.evaluate((el) => el.classList.add('ProseMirror-selectednode'));
    await block.evaluate((el) => {
      el.classList.remove('sdt-group-hover');
      el.classList.add('ProseMirror-selectednode');
    });
  };

  const signerInline = await showInlineLabel('signer');
  await expect(signerInline).toBeVisible();
  await expect(signerInline).toHaveCSS('border-color', 'rgb(220, 38, 38)');

  const signerInlineLabel = signerInline.locator('.superdoc-structured-content-inline__label');
  await expect(signerInlineLabel).toHaveCSS('color', 'rgb(255, 255, 0)');
  await expect(signerInlineLabel).toHaveCSS('border-color', 'rgb(220, 38, 38)');

  const signerBlock = await showBlockLabel('signer');
  await expect(signerBlock).toBeVisible();
  await expect(signerBlock).toHaveCSS('border-top-color', 'rgb(220, 38, 38)');

  const signerBlockLabel = signerBlock.locator('.superdoc-structured-content-block__label');
  await expect(signerBlockLabel).toHaveCSS('color', 'rgb(255, 255, 0)');
  await expect(signerBlockLabel).toHaveCSS('border-color', 'rgb(220, 38, 38)');
  await expectRestingBackgrounds('signer');
  await expectHoverBackgroundParity('signer');
  await expectSelectedStateBackgrounds('signer');

  const ownerInline = await showInlineLabel('owner');
  await expect(ownerInline).toBeVisible();
  await expect(ownerInline).toHaveCSS('border-color', 'rgb(37, 99, 235)');

  const ownerInlineLabel = ownerInline.locator('.superdoc-structured-content-inline__label');
  await expect(ownerInlineLabel).toHaveCSS('color', 'rgb(255, 255, 0)');
  await expect(ownerInlineLabel).toHaveCSS('border-color', 'rgb(37, 99, 235)');

  const ownerBlock = await showBlockLabel('owner');
  await expect(ownerBlock).toBeVisible();
  await expect(ownerBlock).toHaveCSS('border-top-color', 'rgb(37, 99, 235)');

  const ownerBlockLabel = ownerBlock.locator('.superdoc-structured-content-block__label');
  await expect(ownerBlockLabel).toHaveCSS('color', 'rgb(255, 255, 0)');
  await expect(ownerBlockLabel).toHaveCSS('border-color', 'rgb(37, 99, 235)');
  await expectRestingBackgrounds('owner');
  await expectHoverBackgroundParity('owner');
  await expectSelectedStateBackgrounds('owner');

  for (const fieldType of ['signer', 'owner'] as const) {
    await getInline(fieldType).evaluate((el) => el.classList.remove('ProseMirror-selectednode'));
    await getBlock(fieldType).evaluate((el) => {
      el.classList.remove('ProseMirror-selectednode');
      el.classList.remove('sdt-group-hover');
    });
  }

  await superdoc.screenshot('template-builder-owner-and-signer-inline-and-block-field-styling');
});
