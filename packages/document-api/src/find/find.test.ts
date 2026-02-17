import { executeFind, normalizeFindQuery } from './find.js';
import type { Query, QueryResult, Selector } from '../types/index.js';
import type { FindAdapter } from './find.js';

describe('normalizeFindQuery', () => {
  it('passes through a full Query object with canonical selector', () => {
    const query: Query = {
      select: { type: 'node', nodeType: 'paragraph' },
      limit: 10,
    };

    const result = normalizeFindQuery(query);
    expect(result).toStrictEqual(query);
  });

  it('wraps a NodeSelector into a Query', () => {
    const selector: Selector = { type: 'node', nodeType: 'heading' };

    expect(normalizeFindQuery(selector)).toEqual({ select: selector });
  });

  it('normalizes the nodeType shorthand into a canonical NodeSelector', () => {
    const selector: Selector = { nodeType: 'paragraph' };

    expect(normalizeFindQuery(selector)).toEqual({
      select: { type: 'node', nodeType: 'paragraph' },
      limit: undefined,
      offset: undefined,
      within: undefined,
      includeNodes: undefined,
      includeUnknown: undefined,
    });
  });

  it('maps FindOptions fields onto the Query', () => {
    const selector: Selector = { type: 'text', pattern: 'hello' };
    const within = { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'p1' };

    const result = normalizeFindQuery(selector, {
      limit: 5,
      offset: 2,
      within,
      includeNodes: true,
      includeUnknown: true,
    });

    expect(result).toEqual({
      select: selector,
      limit: 5,
      offset: 2,
      within,
      includeNodes: true,
      includeUnknown: true,
    });
  });

  it('leaves optional fields undefined when options are omitted', () => {
    const selector: Selector = { type: 'node', nodeType: 'table' };

    const result = normalizeFindQuery(selector);

    expect(result.select).toStrictEqual(selector);
    expect(result.limit).toBeUndefined();
    expect(result.offset).toBeUndefined();
    expect(result.within).toBeUndefined();
    expect(result.includeNodes).toBeUndefined();
    expect(result.includeUnknown).toBeUndefined();
  });
});

describe('executeFind', () => {
  it('normalizes the input and delegates to the adapter', () => {
    const expected: QueryResult = { matches: [], total: 0 };
    const adapter: FindAdapter = { find: vi.fn(() => expected) };

    const result = executeFind(adapter, { nodeType: 'paragraph' }, { limit: 5 });

    expect(result).toBe(expected);
    expect(adapter.find).toHaveBeenCalledWith({
      select: { type: 'node', nodeType: 'paragraph' },
      limit: 5,
      offset: undefined,
      within: undefined,
      includeNodes: undefined,
      includeUnknown: undefined,
    });
  });

  it('passes a full Query through to the adapter', () => {
    const expected: QueryResult = { matches: [], total: 0 };
    const adapter: FindAdapter = { find: vi.fn(() => expected) };
    const query: Query = { select: { type: 'text', pattern: 'hello' }, limit: 10 };

    const result = executeFind(adapter, query);

    expect(result).toBe(expected);
    expect(adapter.find).toHaveBeenCalledWith(query);
  });
});
