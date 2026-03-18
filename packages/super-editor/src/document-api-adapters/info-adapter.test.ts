import type { FindOutput, FindItemDomain } from '@superdoc/document-api';
import { buildResolvedHandle, buildDiscoveryItem, buildDiscoveryResult } from '@superdoc/document-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../core/Editor.js';
import { findLegacyAdapter } from './find-adapter.js';
import { getLiveDocumentCounts } from './helpers/live-document-counts.js';
import type { LiveDocumentCounts } from './helpers/live-document-counts.js';
import { infoAdapter } from './info-adapter.js';

vi.mock('./find-adapter.js', () => ({
  findLegacyAdapter: vi.fn(),
}));

vi.mock('./helpers/live-document-counts.js', () => ({
  getLiveDocumentCounts: vi.fn(),
}));

vi.mock('./plan-engine/revision-tracker.js', () => ({
  getRevision: vi.fn(() => '42'),
}));

const findLegacyAdapterMock = vi.mocked(findLegacyAdapter);
const getLiveDocumentCountsMock = vi.mocked(getLiveDocumentCounts);

function makeFindOutput(
  overrides: {
    total?: number;
    items?: Array<{
      address: FindItemDomain['address'];
      node?: FindItemDomain['node'];
      context?: FindItemDomain['context'];
    }>;
  } = {},
): FindOutput {
  const items = (overrides.items ?? []).map((item, idx) => {
    const nodeId = 'nodeId' in item.address ? (item.address as { nodeId: string }).nodeId : `find:${idx}`;
    const handle = buildResolvedHandle(nodeId, 'ephemeral', 'node');
    return buildDiscoveryItem(nodeId, handle, item);
  });
  const total = overrides.total ?? items.length;
  return {
    ...buildDiscoveryResult({
      evaluatedRevision: '',
      total,
      items,
      page: { limit: total, offset: 0, returned: items.length },
    }),
  };
}

const DEFAULT_COUNTS: LiveDocumentCounts = {
  words: 5,
  characters: 29,
  paragraphs: 5,
  headings: 2,
  tables: 1,
  images: 3,
  comments: 2,
  trackedChanges: 1,
  sdtFields: 4,
  lists: 2,
};

describe('infoAdapter', () => {
  beforeEach(() => {
    findLegacyAdapterMock.mockReset();
    getLiveDocumentCountsMock.mockReset();
  });

  it('delegates counts to getLiveDocumentCounts', () => {
    getLiveDocumentCountsMock.mockReturnValue(DEFAULT_COUNTS);
    findLegacyAdapterMock.mockReturnValue(makeFindOutput());

    const result = infoAdapter({} as Editor, {});

    expect(result.counts).toBe(DEFAULT_COUNTS);
    expect(result.counts.characters).toBe(29);
    expect(getLiveDocumentCountsMock).toHaveBeenCalledOnce();
  });

  it('builds outline from heading find query', () => {
    getLiveDocumentCountsMock.mockReturnValue(DEFAULT_COUNTS);
    findLegacyAdapterMock.mockReturnValue(
      makeFindOutput({
        total: 2,
        items: [
          {
            address: { kind: 'block', nodeType: 'heading', nodeId: 'H1' },
            node: {
              nodeType: 'heading',
              kind: 'block',
              properties: { headingLevel: 2 },
              text: 'Overview',
            },
          },
          {
            address: { kind: 'block', nodeType: 'heading', nodeId: 'H2' },
            node: {
              nodeType: 'heading',
              kind: 'block',
              properties: { headingLevel: 6 },
              summary: { text: 'Details' },
            },
          },
        ],
      }),
    );

    const result = infoAdapter({} as Editor, {});

    expect(result.outline).toEqual([
      { level: 2, text: 'Overview', nodeId: 'H1' },
      { level: 6, text: 'Details', nodeId: 'H2' },
    ]);
  });

  it('includes capabilities and revision', () => {
    getLiveDocumentCountsMock.mockReturnValue(DEFAULT_COUNTS);
    findLegacyAdapterMock.mockReturnValue(makeFindOutput());

    const result = infoAdapter({} as Editor, {});

    expect(result.capabilities).toEqual({
      canFind: true,
      canGetNode: true,
      canComment: true,
      canReplace: true,
    });
    expect(result.revision).toBe('42');
  });

  it('only calls findLegacyAdapter for heading query (not for counts)', () => {
    getLiveDocumentCountsMock.mockReturnValue(DEFAULT_COUNTS);
    findLegacyAdapterMock.mockReturnValue(makeFindOutput());

    infoAdapter({} as Editor, {});

    expect(findLegacyAdapterMock).toHaveBeenCalledOnce();
    expect(findLegacyAdapterMock).toHaveBeenCalledWith(expect.anything(), {
      select: { type: 'node', nodeType: 'heading' },
      includeNodes: true,
    });
  });
});
