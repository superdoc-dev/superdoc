// @ts-check
import { describe, expect, it } from 'vitest';
import { resolveTrackedChangeImportIds } from './importTrackingContext.js';

describe('resolveTrackedChangeImportIds', () => {
  it('restores exported non-decimal source ids while keeping logical ids keyed by the Word id', () => {
    const converter = {
      trackedChangeIdMap: new Map([['1', 'logical-from-import-map']]),
      trackedChangeSourceIdMapByPart: new Map([['word/document.xml', new Map([['1', 'uuid-source-id']])]]),
    };

    expect(resolveTrackedChangeImportIds({ converter }, '1')).toEqual({
      partPath: 'word/document.xml',
      sourceId: 'uuid-source-id',
      logicalId: 'logical-from-import-map',
    });
  });

  it('preserves raw decimal Word ids when no source-id restore entry exists', () => {
    const converter = {
      trackedChangeIdMap: new Map([['2', 'logical-two']]),
      trackedChangeSourceIdMapByPart: new Map([['word/document.xml', new Map([['1', 'uuid-source-id']])]]),
    };

    expect(resolveTrackedChangeImportIds({ converter }, '2')).toEqual({
      partPath: 'word/document.xml',
      sourceId: '2',
      logicalId: 'logical-two',
    });
  });
});
