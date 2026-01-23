import { test, expect } from '@playwright/test';
import { goToPageAndWaitForEditor, sleep, settleForScreenshot } from '../helpers.js';

test.describe('structured content commands', () => {
  const addStructuredContentInline = async (page, options) => {
    await page.evaluate(
      (options) => window.superdoc.activeEditor.commands.insertStructuredContentInline(options),
      options,
    );
  };

  const addStructuredContentBlock = async (page, options) => {
    await page.evaluate(
      (options) => window.superdoc.activeEditor.commands.insertStructuredContentBlock(options),
      options,
    );
  };

  const findStructuredContentOnDOMByAlias = async (page, alias) => {
    return page.locator(`[data-alias=${alias}]`);
  };

  const findAllStructuredContents = async (page) => {
    return page.evaluateHandle(() => {
      return window.editor.helpers.structuredContentCommands.getStructuredContentTags(window.editor.state);
    });
  };

  const findStructuredContentIdByAlias = async (page, alias) => {
    const domLocator = await page.locator(`[data-alias=${alias}]`);
    if (!domLocator) {
      throw new Exception(`DOM element not found by alias ${alias}`);
    }

    return domLocator.getAttribute('data-id');
  };

  const updateStructuredContentById = async (page, id, options) => {
    await page.evaluate(
      ([id, options]) => {
        window.editor.commands.updateStructuredContentById(id, options);
      },
      [id, options],
    );
  };

  const deleteStructuredContentById = async (page, id) => {
    await page.evaluate((id) => window.editor.commands.deleteStructuredContentById(id), id);
  };

  const deleteStructuredContentAtSelection = async (page) => {
    await page.evaluate(() => window.editor.commands.deleteStructuredContentAtSelection());
  };

  const deleteStructuredContent = async (page, structuredContents) => {
    await page.evaluate((structuredContents) => {
      window.editor.commands.deleteStructuredContent(structuredContents);
    }, structuredContents);
  };

  const insertTable = async (page, rowsXColumns) => {
    const [rows, cols] = rowsXColumns.split('x');
    const showTableButton = await page.locator('div[data-item="btn-table"]');
    await showTableButton.click();

    const tableToAdd = await page.locator(`div[data-cols="${cols}"][data-rows="${rows}"]`);

    await tableToAdd.click();
  };

  const expectEditorScreenshot = async (page, superEditor) => {
    await settleForScreenshot(page);
    await expect(superEditor).toHaveScreenshot();
  };

  test('should insert a structured content inline and type into it', async ({ page }) => {
    const superEditor = await goToPageAndWaitForEditor(page);

    await addStructuredContentInline(page, { attrs: { alias: 'some-alias' } });
    const domLocator = await findStructuredContentOnDOMByAlias(page, 'some-alias');

    await domLocator.click();
    await page.keyboard.type('Some content inside a structured content inline', { delay: 100 });

    await expectEditorScreenshot(page, superEditor);
  });

  test('should turn selected text into a structured content inline', async ({ page }) => {
    const superEditor = await goToPageAndWaitForEditor(page);
    await superEditor.click();

    await page.keyboard.type('Some content that will become a structured content inline');

    await page.keyboard.press('Enter');

    await page.keyboard.type('Some content that will not become structured content');

    await page.getByText('Some content that will become a structured content inline').click({ clickCount: 3 });

    await addStructuredContentInline(page, { attrs: { alias: 'some-alias' } });

    // Click somewhere else just so the tag is not "selected" anymore
    await page.getByText('Some content that will become a structured content inline').click();
    await expectEditorScreenshot(page, superEditor);
  });

  test('should insert structured content inline with given text', async ({ page }) => {
    const superEditor = await goToPageAndWaitForEditor(page);
    await superEditor.click();

    await addStructuredContentInline(page, {
      text: 'Some content that was inserted programatically',
    });

    await expectEditorScreenshot(page, superEditor);
  });

  // TODO: Check what's going on here, the visual seems weird
  test.skip('should insert structured content inline with given json', async ({ page }) => {
    const superEditor = await goToPageAndWaitForEditor(page);
    await superEditor.click();

    await addStructuredContentInline(page, {
      json: {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Some paragraph here',
          },
        ],
      },
    });

    await expectEditorScreenshot(page, superEditor);
  });

  test('should insert a structured content block and type into it', async ({ page }) => {
    const superEditor = await goToPageAndWaitForEditor(page);
    await superEditor.click();

    await addStructuredContentBlock(page, { attrs: { alias: 'some-alias' } });
    const domLocator = await findStructuredContentOnDOMByAlias(page, 'some-alias');

    await domLocator.click();
    await page.keyboard.type('Some content inside a structured content block', {
      delay: 100,
    });

    await expectEditorScreenshot(page, superEditor);
  });

  test('should insert html as structured content block', async ({ page }) => {
    const superEditor = await goToPageAndWaitForEditor(page);
    await superEditor.click();

    await addStructuredContentBlock(page, {
      html: 'Some <b>HTML</b> <i>content</i>',
    });

    await expectEditorScreenshot(page, superEditor);
  });

  test('should insert image as structured content block', async ({ page }) => {
    const superEditor = await goToPageAndWaitForEditor(page);
    await superEditor.click();

    await addStructuredContentBlock(page, {
      json: {
        type: 'image',
        attrs: {
          src: 'https://www.superdoc.dev/hs-fs/hubfs/logo-3.webp?width=100&height=100&name=logo-3.webp',
          alt: 'image',
        },
      },
    });
    // Wait for the image to be rendered
    await sleep(2000);

    await page.keyboard.press('ArrowDown');

    await expectEditorScreenshot(page, superEditor);
  });

  test('should insert a base64 image as structured content block', async ({ page }) => {
    const superEditor = await goToPageAndWaitForEditor(page);
    await superEditor.click();

    await addStructuredContentBlock(page, {
      json: {
        type: 'image',
        attrs: {
          src: 'data:image/png;base64,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',
          alt: 'image',
        },
      },
    });
    // Wait for the image to be rendered
    await sleep(2000);

    await page.keyboard.press('ArrowDown');

    await expectEditorScreenshot(page, superEditor);
  });

  test('should update structured content block by id (html -> html)', async ({ page }) => {
    const superEditor = await goToPageAndWaitForEditor(page);
    await superEditor.click();

    await addStructuredContentBlock(page, {
      html: 'Some <b>HTML</b> <i>content</i>',
      attrs: { alias: 'some-content' },
    });

    const structuredContentBlockID = await findStructuredContentIdByAlias(page, 'some-content');
    await updateStructuredContentById(page, structuredContentBlockID, {
      html: 'Updated <b><i>HTML</i></b>',
    });

    await expectEditorScreenshot(page, superEditor);
  });

  test('should update structured content block by id (html -> json)', async ({ page }) => {
    const superEditor = await goToPageAndWaitForEditor(page);
    await superEditor.click();

    await addStructuredContentBlock(page, {
      html: 'Some <b>HTML</b> <i>content</i>',
      attrs: { alias: 'some-content' },
    });

    const structuredContentBlockID = await findStructuredContentIdByAlias(page, 'some-content');

    await updateStructuredContentById(page, structuredContentBlockID, {
      json: {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Updated paragraph here',
          },
        ],
      },
    });

    await expectEditorScreenshot(page, superEditor);
  });

  test('should update structured content block by id (json -> json)', async ({ page }) => {
    const superEditor = await goToPageAndWaitForEditor(page);
    await superEditor.click();

    await addStructuredContentBlock(page, {
      json: {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Some initial paragraph here',
          },
        ],
      },
      attrs: { alias: 'some-content' },
    });

    const structuredContentBlockID = await findStructuredContentIdByAlias(page, 'some-content');
    await updateStructuredContentById(page, structuredContentBlockID, {
      json: {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Some updated paragraph here',
          },
        ],
      },
    });

    await expectEditorScreenshot(page, superEditor);
  });

  test('should update structured content block by id (json -> html)', async ({ page }) => {
    const superEditor = await goToPageAndWaitForEditor(page);
    await superEditor.click();

    await addStructuredContentBlock(page, {
      json: {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Some initial paragraph here',
          },
        ],
      },
      attrs: { alias: 'some-content' },
    });

    const structuredContentBlockID = await findStructuredContentIdByAlias(page, 'some-content');
    await updateStructuredContentById(page, structuredContentBlockID, {
      html: 'Some <b>updated</b> <i> initial </i>paragraph here',
    });

    await expectEditorScreenshot(page, superEditor);
  });

  test('should delete structured content inline by id', async ({ page }) => {
    const superEditor = await goToPageAndWaitForEditor(page);
    await superEditor.click();

    await addStructuredContentInline(page, {
      text: 'Some content that should be deleted',
      attrs: { alias: 'some-content' },
    });

    await expect(page.getByText('Some content that should be deleted')).toBeVisible();

    const structuredContentId = await findStructuredContentIdByAlias(page, 'some-content');

    await deleteStructuredContentById(page, structuredContentId);

    await expect(page.getByText('Some content that should be deleted')).not.toBeVisible();
  });

  test('should delete structured content inline at selection but preserve its content', async ({ page }) => {
    const superEditor = await goToPageAndWaitForEditor(page);
    await superEditor.click();

    await addStructuredContentInline(page, {
      text: 'Some content that should be persisted',
      attrs: { alias: 'some-content' },
    });

    const textDom = await page.getByText('Some content that should be persisted');

    expect(textDom).toBeVisible();

    await textDom.click({ clickCount: 3 });

    await deleteStructuredContentAtSelection(page);

    await expect(page.getByText('Some content that should be persisted')).toBeVisible();
  });

  test('should delete multiple structured content inline at once', async ({ page }) => {
    const superEditor = await goToPageAndWaitForEditor(page);
    await superEditor.click();

    await addStructuredContentInline(page, {
      text: 'Some content that should be deleted 1',
      attrs: { alias: 'some-content1' },
    });
    await addStructuredContentInline(page, {
      text: 'Some content that should be deleted 2',
      attrs: { alias: 'some-content2' },
    });
    await addStructuredContentInline(page, {
      text: 'Some content that should be deleted 3',
      attrs: { alias: 'some-content3' },
    });

    const structuredContents = await findAllStructuredContents(page);
    await deleteStructuredContent(page, structuredContents);

    await expect(page.getByText('Some content that should be deleted 1')).not.toBeVisible();
    await expect(page.getByText('Some content that should be deleted 2')).not.toBeVisible();
    await expect(page.getByText('Some content that should be deleted 3')).not.toBeVisible();
  });

  test.describe('advanced use cases', () => {
    test('should insert structured content inline inside a list', async ({ page }) => {
      const superEditor = await goToPageAndWaitForEditor(page);
      await superEditor.click();

      await page.keyboard.type('- Item1');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Item 2');
      await addStructuredContentInline(page, {
        text: 'Some structured content inside a list item',
      });
      await page.keyboard.press('Enter');
      await page.keyboard.type('Item 3');

      await expectEditorScreenshot(page, superEditor);
    });

    test('should insert multiple structured content inline inside a nested list', async ({ page }) => {
      const superEditor = await goToPageAndWaitForEditor(page);
      await superEditor.click();

      await page.keyboard.type('- Item1');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await page.keyboard.type('Item2');
      await addStructuredContentInline(page, {
        text: 'Some structured content inside a list item',
      });
      await page.keyboard.press('Enter');
      await page.keyboard.type('Item3');
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Item4');
      await addStructuredContentInline(page, {
        text: 'Some more content inside a list item',
      });
      await page.keyboard.press('Enter');
      await page.keyboard.type('Item5');

      await expectEditorScreenshot(page, superEditor);
    });

    test('should insert structured content inline inside a table cell', async ({ page }) => {
      const superEditor = await goToPageAndWaitForEditor(page);
      await superEditor.click();

      await insertTable(page, '3x3');
      await addStructuredContentInline(page, {
        text: 'Some structured content inside a table cell',
      });

      await expectEditorScreenshot(page, superEditor);
    });

    test('should insert an image structured content inside a table cell', async ({ page }) => {
      const superEditor = await goToPageAndWaitForEditor(page);
      await superEditor.click();

      await insertTable(page, '3x3');
      await addStructuredContentBlock(page, {
        json: {
          type: 'image',
          attrs: {
            src: 'https://www.superdoc.dev/hs-fs/hubfs/logo-3.webp?width=100&height=100&name=logo-3.webp',
            alt: 'image',
          },
        },
      });
      await sleep(2000);
      await expectEditorScreenshot(page, superEditor);
    });
  });
});
