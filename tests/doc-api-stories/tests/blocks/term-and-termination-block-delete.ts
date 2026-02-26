import { describe, expect, it } from 'vitest';
import { corpusDoc, unwrap, useStoryHarness } from '../harness';

type DeletableBlockNodeType = 'paragraph' | 'heading' | 'listItem' | 'table' | 'image' | 'sdt';

const DELETABLE_BLOCK_NODE_TYPES = new Set<DeletableBlockNodeType>([
  'paragraph',
  'heading',
  'listItem',
  'table',
  'image',
  'sdt',
]);

const TERM_AND_TERMINATION_CLAUSE_PREFIX =
  'Term and Termination This Agreement shall commence on the date first written above';

function asDeletableBlockNodeType(value: unknown): DeletableBlockNodeType | null {
  if (typeof value !== 'string') return null;
  return DELETABLE_BLOCK_NODE_TYPES.has(value as DeletableBlockNodeType) ? (value as DeletableBlockNodeType) : null;
}

describe('document-api story: blocks delete term-and-termination clause block', () => {
  const { client, copyDoc, outPath } = useStoryHarness('blocks/term-and-termination-block-delete', {
    preserveResults: true,
  });

  it('finds the clause block, deletes the whole block, and saves the result docx', async () => {
    const sourceDocPath = await copyDoc(corpusDoc('basic/longer-header.docx'), 'source.docx');
    const sessionId = `blocks-delete-clause-${Date.now()}`;

    await client.doc.open({ doc: sourceDocPath, sessionId });

    const clauseMatchResult = unwrap<any>(
      await client.doc.query.match({
        sessionId,
        select: {
          type: 'text',
          pattern: TERM_AND_TERMINATION_CLAUSE_PREFIX,
          caseSensitive: false,
        },
        require: 'first',
      }),
    );

    expect(Array.isArray(clauseMatchResult.items)).toBe(true);
    expect(clauseMatchResult.items.length).toBeGreaterThan(0);

    const clauseMatch = clauseMatchResult.items[0];
    expect(typeof clauseMatch?.snippet).toBe('string');
    expect(clauseMatch.snippet).toContain('Term and Termination');

    const addressNodeId = clauseMatch?.address?.nodeId;
    const addressNodeType = clauseMatch?.address?.nodeType;
    const clauseBlockId =
      typeof addressNodeId === 'string' ? addressNodeId : (clauseMatch?.blocks?.[0]?.blockId as string | undefined);
    const nodeType = asDeletableBlockNodeType(addressNodeType);

    expect(typeof clauseBlockId).toBe('string');
    if (typeof clauseBlockId !== 'string') {
      throw new Error('query.match did not return a block address/nodeId for the clause match.');
    }
    if (!nodeType) {
      throw new Error(`Clause block nodeType is not deletable: ${String(addressNodeType)}.`);
    }

    const deleteResult = unwrap<any>(
      await client.doc.blocks.delete({
        sessionId,
        target: {
          kind: 'block',
          nodeType,
          nodeId: clauseBlockId,
        },
      }),
    );

    expect(deleteResult?.success).toBe(true);
    expect(deleteResult?.deleted?.nodeId).toBe(clauseBlockId);
    expect(deleteResult?.deleted?.nodeType).toBe(nodeType);

    try {
      await client.doc.getNodeById({ sessionId, id: clauseBlockId });
      expect.unreachable('Expected deleted clause block to be missing.');
    } catch (error) {
      expect((error as { code?: string }).code).toBe('TARGET_NOT_FOUND');
    }

    await client.doc.save({
      sessionId,
      out: outPath('term-and-termination-block-deleted.docx'),
    });
  });
});
