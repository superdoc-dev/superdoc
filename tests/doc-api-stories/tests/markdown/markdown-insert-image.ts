import { describe, expect, it } from 'vitest';
import { unwrap, useStoryHarness } from '../harness';

const ONE_BY_ONE_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Z5kYAAAAASUVORK5CYII=';

function sid(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

describe('document-api story: markdown insert image', () => {
  const { client, outPath } = useStoryHarness('markdown/insert-image', {
    preserveResults: true,
  });

  it('inserts markdown with a base64 image and preserves it after save + reopen', async () => {
    const sessionId = sid('markdown-image');
    const reopenSessionId = sid('markdown-image-reopen');
    const outputDoc = outPath('markdown-insert-image.docx');
    const markdown = `![pixel](${ONE_BY_ONE_PNG_DATA_URI})`;

    await client.doc.open({ sessionId });

    const beforeImageNodes = unwrap<any>(
      await client.doc.find({
        sessionId,
        type: 'node',
        nodeType: 'image',
        limit: 100,
      }),
    );
    const beforeImages = unwrap<any>(await client.doc.images.list({ sessionId }));
    const baselineNodeTotal = Number(beforeImageNodes.total ?? 0);
    const baselineImageTotal = Number(beforeImages.total ?? 0);

    const insertResult = unwrap<any>(await client.doc.insert({ sessionId, value: markdown, type: 'markdown' }));
    expect(insertResult?.receipt?.success ?? insertResult?.success).toBe(true);

    const imageNodesAfterInsert = unwrap<any>(
      await client.doc.find({
        sessionId,
        type: 'node',
        nodeType: 'image',
        limit: 100,
      }),
    );
    expect(imageNodesAfterInsert.total).toBe(baselineNodeTotal + 1);

    const imagesAfterInsert = unwrap<any>(await client.doc.images.list({ sessionId }));
    expect(imagesAfterInsert.total).toBe(baselineImageTotal + 1);

    const insertedImageId = imagesAfterInsert.items?.[imagesAfterInsert.items.length - 1]?.sdImageId;
    expect(typeof insertedImageId).toBe('string');
    expect(insertedImageId?.length).toBeGreaterThan(0);

    const insertedImage = unwrap<any>(
      await client.doc.images.get({
        sessionId,
        imageId: insertedImageId,
      }),
    );
    expect(insertedImage.properties?.alt).toBe('pixel');
    expect(insertedImage.properties?.size).toMatchObject({ width: 1, height: 1 });

    const markdownAfterInsert = unwrap<any>(await client.doc.getMarkdown({ sessionId }));
    expect(typeof markdownAfterInsert).toBe('string');
    expect(markdownAfterInsert).toContain('![pixel](');

    await client.doc.save({
      sessionId,
      out: outputDoc,
      force: true,
    });

    await client.doc.close({
      sessionId,
      discard: true,
    });

    await client.doc.open({
      sessionId: reopenSessionId,
      doc: outputDoc,
    });

    const imageNodesAfterReopen = unwrap<any>(
      await client.doc.find({
        sessionId: reopenSessionId,
        type: 'node',
        nodeType: 'image',
        limit: 100,
      }),
    );
    expect(imageNodesAfterReopen.total).toBe(baselineNodeTotal + 1);

    const imagesAfterReopen = unwrap<any>(await client.doc.images.list({ sessionId: reopenSessionId }));
    expect(imagesAfterReopen.total).toBe(baselineImageTotal + 1);

    const reopenedImageId = imagesAfterReopen.items?.[imagesAfterReopen.items.length - 1]?.sdImageId;
    expect(typeof reopenedImageId).toBe('string');
    expect(reopenedImageId?.length).toBeGreaterThan(0);

    const reopenedImage = unwrap<any>(
      await client.doc.images.get({
        sessionId: reopenSessionId,
        imageId: reopenedImageId,
      }),
    );
    expect(reopenedImage.properties?.alt).toBe('pixel');
    expect(reopenedImage.properties?.size).toMatchObject({ width: 1, height: 1 });

    const markdownAfterReopen = unwrap<any>(await client.doc.getMarkdown({ sessionId: reopenSessionId }));
    expect(typeof markdownAfterReopen).toBe('string');
    expect(markdownAfterReopen).toContain('![pixel](');
  });
});
