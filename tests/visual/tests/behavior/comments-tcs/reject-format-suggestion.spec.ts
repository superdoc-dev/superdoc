import { type Page } from '@playwright/test';
import { test } from '../../fixtures/superdoc.js';

test.use({ config: { comments: 'panel', hideSelection: true, hideCaret: true } });

/**
 * Tests for rejecting tracked format suggestions via the comment bubble ✗ flow.
 *
 * Only the marks in the trackFormat allowedMarks whitelist are covered here:
 *   bold, italic, strike, underline, textStyle (color, fontFamily, fontSize)
 *
 * Marks NOT currently tracked by trackFormat (and therefore not tested):
 *   - highlight (mark name 'highlight')
 *   - link      (mark name 'link')
 *   - heading   (uses setLinkedStyle, not a mark operation)
 *
 * See addMarkStep.js allowedMarks and SD-1930 for expanding coverage.
 */

/**
 * Reject all tracked changes using rejectTrackedChangeById for each trackFormat mark.
 * This mirrors the comment bubble ✗ button flow (CommentDialog.vue handleReject).
 */
async function rejectAllByBubble(page: Page) {
  await page.evaluate(() => {
    const editor = (window as any).editor;
    const doc = editor.state.doc;
    const ids = new Set<string>();
    doc.descendants((node: any) => {
      if (node.isText) {
        node.marks.forEach((m: any) => {
          if (m.type.name.startsWith('track') && m.attrs.id) ids.add(m.attrs.id);
        });
      }
    });
    for (const id of ids) {
      editor.commands.rejectTrackedChangeById(id);
    }
  });
}

test('@behavior reject tracked color suggestion restores original color', async ({ superdoc }) => {
  await superdoc.type('Agreement signed by both parties');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    const e = (window as any).editor;
    e.commands.setFontFamily('Times New Roman, serif');
    e.commands.setColor('#112233');
  });
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-color-initial');

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.setColor('#FF0000');
  });
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-color-suggested');

  await rejectAllByBubble(superdoc.page);
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-color-rejected');
});

test('@behavior reject tracked font family suggestion restores original font', async ({ superdoc }) => {
  await superdoc.type('Agreement signed by both parties');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    const e = (window as any).editor;
    e.commands.setFontFamily('Times New Roman, serif');
    e.commands.setColor('#112233');
  });
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.setFontFamily('Arial, sans-serif');
  });
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-font-suggested');

  await rejectAllByBubble(superdoc.page);
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-font-rejected');
});

test('@behavior reject tracked bold suggestion removes bold', async ({ superdoc }) => {
  await superdoc.type('Agreement signed by both parties');
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.executeCommand('toggleBold');
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-bold-suggested');

  await rejectAllByBubble(superdoc.page);
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-bold-rejected');
});

test('@behavior reject tracked italic suggestion removes italic', async ({ superdoc }) => {
  await superdoc.type('Agreement signed by both parties');
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.executeCommand('toggleItalic');
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-italic-suggested');

  await rejectAllByBubble(superdoc.page);
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-italic-rejected');
});

test('@behavior reject tracked underline suggestion removes underline', async ({ superdoc }) => {
  await superdoc.type('Agreement signed by both parties');
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.executeCommand('toggleUnderline');
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-underline-suggested');

  await rejectAllByBubble(superdoc.page);
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-underline-rejected');
});

test('@behavior reject tracked strikethrough suggestion removes strike', async ({ superdoc }) => {
  await superdoc.type('Agreement signed by both parties');
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.executeCommand('toggleStrike');
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-strike-suggested');

  await rejectAllByBubble(superdoc.page);
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-strike-rejected');
});

test('@behavior reject multiple mark suggestions restores all marks', async ({ superdoc }) => {
  await superdoc.type('Agreement signed by both parties');
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.executeCommand('toggleBold');
  await superdoc.executeCommand('toggleItalic');
  await superdoc.executeCommand('toggleUnderline');
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-multi-marks-suggested');

  await rejectAllByBubble(superdoc.page);
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-multi-marks-rejected');
});

test('@behavior reject multiple textStyle suggestions restores all styles', async ({ superdoc }) => {
  await superdoc.type('Agreement signed by both parties');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    const e = (window as any).editor;
    e.commands.setFontFamily('Times New Roman, serif');
    e.commands.setColor('#112233');
    e.commands.setFontSize('12pt');
  });
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-multi-style-initial');

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    const e = (window as any).editor;
    e.commands.setColor('#FF00AA');
    e.commands.setFontFamily('Courier New, monospace');
    e.commands.setFontSize('18pt');
  });
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-multi-style-suggested');

  await rejectAllByBubble(superdoc.page);
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-multi-style-rejected');
});

test('@behavior reject mixed marks and textStyle suggestions restores everything', async ({ superdoc }) => {
  await superdoc.type('Agreement signed by both parties');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    const e = (window as any).editor;
    e.commands.setFontFamily('Times New Roman, serif');
    e.commands.setColor('#112233');
  });
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-mixed-initial');

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.executeCommand('toggleBold');
  await superdoc.executeCommand('toggleUnderline');
  await superdoc.page.evaluate(() => {
    const e = (window as any).editor;
    e.commands.setColor('#FF00AA');
    e.commands.setFontFamily('Arial, sans-serif');
  });
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-mixed-suggested');

  await rejectAllByBubble(superdoc.page);
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-mixed-rejected');
});

test('@behavior reject font size suggestion restores original size', async ({ superdoc }) => {
  await superdoc.type('Agreement signed by both parties');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.setFontSize('12pt');
  });
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.setFontSize('24pt');
  });
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-fontsize-suggested');

  await rejectAllByBubble(superdoc.page);
  await superdoc.waitForStable();
  await superdoc.screenshot('reject-fmt-fontsize-rejected');
});
