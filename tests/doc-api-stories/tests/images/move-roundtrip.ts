import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { unwrap, useStoryHarness } from '../harness';

const TEST_IMAGE_PATH = path.resolve(import.meta.dirname, 'assets/test-image.webp');

function sid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getParagraphBlocks(result: any): any[] {
  const blocks = Array.isArray(result?.blocks) ? result.blocks : [];
  return blocks.filter((block) => block?.nodeType === 'paragraph');
}

async function imageDataUri(): Promise<string> {
  const buf = await readFile(TEST_IMAGE_PATH);
  return `data:image/webp;base64,${buf.toString('base64')}`;
}

describe('document-api story: images.move roundtrip', () => {
  const { client, outPath } = useStoryHarness('images/move-roundtrip', {
    preserveResults: true,
  });

  it('removes the empty source paragraph and preserves structure after save + reopen', async () => {
    const sessionId = sid('images-move');
    const reopenSessionId = sid('images-move-reopen');
    const savedDocPath = outPath('images-move-roundtrip.docx');

    await client.doc.open({ sessionId });

    const createdImage = unwrap<any>(
      await client.doc.create.image({
        sessionId,
        src: await imageDataUri(),
        alt: 'roundtrip move image',
        at: { kind: 'documentEnd' },
      }),
    );
    expect(createdImage?.success).toBe(true);

    const imagesBeforeMove = unwrap<any>(await client.doc.images.list({ sessionId }));
    const imageId = imagesBeforeMove?.items?.[0]?.sdImageId;
    expect(typeof imageId).toBe('string');

    const createdParagraph = unwrap<any>(
      await client.doc.create.paragraph({
        sessionId,
        at: { kind: 'documentEnd' },
        text: 'Destination paragraph',
      }),
    );
    expect(createdParagraph?.success).toBe(true);

    const targetParagraph = createdParagraph?.paragraph;
    expect(targetParagraph).toMatchObject({
      kind: 'block',
      nodeType: 'paragraph',
    });

    const blocksBeforeMove = unwrap<any>(await client.doc.blocks.list({ sessionId, limit: 20, includeText: true }));
    const paragraphsBeforeMove = getParagraphBlocks(blocksBeforeMove);
    const sourceParagraph = paragraphsBeforeMove.find(
      (paragraph) => paragraph?.nodeId !== targetParagraph.nodeId && paragraph?.isEmpty === false,
    );
    expect(typeof sourceParagraph?.nodeId).toBe('string');

    const moveResult = unwrap<any>(
      await client.doc.images.move({
        sessionId,
        imageId,
        to: {
          kind: 'inParagraph',
          target: targetParagraph,
          offset: 0,
        },
      }),
    );
    expect(moveResult?.success).toBe(true);

    const blocksAfterMove = unwrap<any>(await client.doc.blocks.list({ sessionId, limit: 20, includeText: true }));
    const paragraphsAfterMove = getParagraphBlocks(blocksAfterMove);
    expect(paragraphsAfterMove.some((paragraph) => paragraph?.nodeId === sourceParagraph?.nodeId)).toBe(false);
    expect(paragraphsAfterMove.some((paragraph) => paragraph?.nodeId === targetParagraph.nodeId)).toBe(true);
    const emptyParagraphCountAfterMove = paragraphsAfterMove.filter((paragraph) => paragraph?.isEmpty === true).length;

    await client.doc.save({
      sessionId,
      out: savedDocPath,
      force: true,
    });

    await client.doc.open({
      sessionId: reopenSessionId,
      doc: savedDocPath,
    });

    const blocksAfterReopen = unwrap<any>(
      await client.doc.blocks.list({ sessionId: reopenSessionId, limit: 20, includeText: true }),
    );
    const paragraphsAfterReopen = getParagraphBlocks(blocksAfterReopen);
    expect(paragraphsAfterReopen).toHaveLength(paragraphsAfterMove.length);
    expect(paragraphsAfterReopen.filter((paragraph) => paragraph?.isEmpty === true)).toHaveLength(
      emptyParagraphCountAfterMove,
    );
    expect(paragraphsAfterReopen.some((paragraph) => paragraph?.text === 'Destination paragraph')).toBe(true);
  });
});
