import { describe, it, expect, mock } from 'bun:test';
import { DocumentApiValidationError } from '../errors.js';
import {
  executeAnchoredMetadataAttach,
  executeAnchoredMetadataGet,
  executeAnchoredMetadataList,
  executeAnchoredMetadataRemove,
  executeAnchoredMetadataResolve,
  executeAnchoredMetadataUpdate,
  type AnchoredMetadataAdapter,
} from './anchored-metadata.js';
import type { SelectionTarget } from '../types/address.js';

function makeAdapter(): AnchoredMetadataAdapter {
  return {
    attach: mock().mockReturnValue({
      success: true,
      id: 'm-1',
      namespace: 'urn:test:1',
      partName: 'customXml/item1.xml',
    }),
    list: mock().mockReturnValue({ items: [], total: 0 }),
    get: mock().mockReturnValue(null),
    update: mock().mockReturnValue({ success: true, id: 'm-1' }),
    remove: mock().mockReturnValue({ success: true, id: 'm-1' }),
    resolve: mock().mockReturnValue(null),
  };
}

const VALID_PAYLOAD = { type: 'citation', source: 'Alpha Corp v. SEC', confidence: 0.92 };
const VALID_NAMESPACE = 'urn:test:1';

const TEXT_TARGET: SelectionTarget = {
  kind: 'selection',
  start: { kind: 'text', blockId: 'b-1', offset: 0 },
  end: { kind: 'text', blockId: 'b-1', offset: 10 },
};

const CROSS_BLOCK_TARGET: SelectionTarget = {
  kind: 'selection',
  start: { kind: 'text', blockId: 'b-1', offset: 0 },
  end: { kind: 'text', blockId: 'b-2', offset: 5 },
};

const NODE_EDGE_TARGET: SelectionTarget = {
  kind: 'selection',
  start: { kind: 'nodeEdge', node: { kind: 'block', nodeType: 'paragraph', nodeId: 'b-1' }, edge: 'before' },
  end: { kind: 'nodeEdge', node: { kind: 'block', nodeType: 'paragraph', nodeId: 'b-1' }, edge: 'after' },
};

// ---------------------------------------------------------------------------
// attach
// ---------------------------------------------------------------------------

describe('metadata.attach validation', () => {
  it('accepts a same-block text-range target with a JSON payload + namespace', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeAnchoredMetadataAttach(adapter, {
        target: TEXT_TARGET,
        namespace: VALID_NAMESPACE,
        payload: VALID_PAYLOAD,
      }),
    ).not.toThrow();
    expect(adapter.attach).toHaveBeenCalled();
  });

  it('accepts a caller-supplied id', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeAnchoredMetadataAttach(adapter, {
        target: TEXT_TARGET,
        namespace: VALID_NAMESPACE,
        payload: VALID_PAYLOAD,
        id: 'consumer-id-1',
      }),
    ).not.toThrow();
  });

  it('accepts JSON primitives, arrays, and nulls as payload', () => {
    const adapter = makeAdapter();
    for (const payload of ['string', 42, true, false, null, [], [1, 2, 3], { nested: { a: 1 } }]) {
      expect(() =>
        executeAnchoredMetadataAttach(adapter, {
          target: TEXT_TARGET,
          namespace: VALID_NAMESPACE,
          payload,
        }),
      ).not.toThrow();
    }
  });

  it('rejects non-SelectionTarget shapes', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeAnchoredMetadataAttach(adapter, {
        target: { foo: 'bar' } as unknown as SelectionTarget,
        namespace: VALID_NAMESPACE,
        payload: VALID_PAYLOAD,
      }),
    ).toThrow(DocumentApiValidationError);
  });

  it('rejects nodeEdge anchors (v1 is inline SDT only)', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeAnchoredMetadataAttach(adapter, {
        target: NODE_EDGE_TARGET,
        namespace: VALID_NAMESPACE,
        payload: VALID_PAYLOAD,
      }),
    ).toThrow(DocumentApiValidationError);
  });

  it('rejects cross-paragraph spans', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeAnchoredMetadataAttach(adapter, {
        target: CROSS_BLOCK_TARGET,
        namespace: VALID_NAMESPACE,
        payload: VALID_PAYLOAD,
      }),
    ).toThrow(DocumentApiValidationError);
  });

  it('rejects empty namespace', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeAnchoredMetadataAttach(adapter, {
        target: TEXT_TARGET,
        namespace: '',
        payload: VALID_PAYLOAD,
      }),
    ).toThrow(DocumentApiValidationError);
  });

  it('rejects payload with a cycle', () => {
    const adapter = makeAdapter();
    const cyclic: Record<string, unknown> = { name: 'a' };
    cyclic.self = cyclic;
    expect(() =>
      executeAnchoredMetadataAttach(adapter, {
        target: TEXT_TARGET,
        namespace: VALID_NAMESPACE,
        payload: cyclic,
      }),
    ).toThrow(DocumentApiValidationError);
  });

  it('rejects payload that is a bare function (not JSON-serializable)', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeAnchoredMetadataAttach(adapter, {
        target: TEXT_TARGET,
        namespace: VALID_NAMESPACE,
        payload: () => 1,
      }),
    ).toThrow(DocumentApiValidationError);
  });

  it('rejects payload that is undefined at the top', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeAnchoredMetadataAttach(adapter, {
        target: TEXT_TARGET,
        namespace: VALID_NAMESPACE,
        payload: undefined,
      }),
    ).toThrow(DocumentApiValidationError);
  });

  it('rejects empty caller-supplied id', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeAnchoredMetadataAttach(adapter, {
        target: TEXT_TARGET,
        namespace: VALID_NAMESPACE,
        payload: VALID_PAYLOAD,
        id: '',
      }),
    ).toThrow(DocumentApiValidationError);
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('metadata.list validation', () => {
  it('accepts no input', () => {
    const adapter = makeAdapter();
    expect(() => executeAnchoredMetadataList(adapter)).not.toThrow();
    expect(adapter.list).toHaveBeenCalled();
  });

  it('accepts namespace filter', () => {
    const adapter = makeAdapter();
    expect(() => executeAnchoredMetadataList(adapter, { namespace: VALID_NAMESPACE })).not.toThrow();
  });

  it('accepts a within filter (text-range, same block)', () => {
    const adapter = makeAdapter();
    expect(() => executeAnchoredMetadataList(adapter, { within: TEXT_TARGET })).not.toThrow();
    expect(adapter.list).toHaveBeenCalled();
  });

  it('accepts namespace + within together', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeAnchoredMetadataList(adapter, { namespace: VALID_NAMESPACE, within: TEXT_TARGET }),
    ).not.toThrow();
  });

  it('accepts resolvedOnly filter', () => {
    const adapter = makeAdapter();
    expect(() => executeAnchoredMetadataList(adapter, { resolvedOnly: true })).not.toThrow();
  });

  it('rejects non-string namespace', () => {
    const adapter = makeAdapter();
    expect(() => executeAnchoredMetadataList(adapter, { namespace: 42 as unknown as string })).toThrow(
      DocumentApiValidationError,
    );
  });

  it('rejects cross-block within', () => {
    const adapter = makeAdapter();
    expect(() => executeAnchoredMetadataList(adapter, { within: CROSS_BLOCK_TARGET })).toThrow(
      DocumentApiValidationError,
    );
  });

  it('rejects nodeEdge within', () => {
    const adapter = makeAdapter();
    expect(() => executeAnchoredMetadataList(adapter, { within: NODE_EDGE_TARGET })).toThrow(
      DocumentApiValidationError,
    );
  });

  it('rejects non-SelectionTarget within', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeAnchoredMetadataList(adapter, { within: { foo: 'bar' } as unknown as SelectionTarget }),
    ).toThrow(DocumentApiValidationError);
  });

  it('rejects non-boolean resolvedOnly', () => {
    const adapter = makeAdapter();
    expect(() => executeAnchoredMetadataList(adapter, { resolvedOnly: 'yes' as unknown as boolean })).toThrow(
      DocumentApiValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// get / update / remove / resolve: id validation
// ---------------------------------------------------------------------------

describe('metadata.{get,update,remove,resolve} require id', () => {
  it('get accepts a non-empty id', () => {
    const adapter = makeAdapter();
    expect(() => executeAnchoredMetadataGet(adapter, { id: 'm-1' })).not.toThrow();
  });

  it('get rejects empty id', () => {
    const adapter = makeAdapter();
    expect(() => executeAnchoredMetadataGet(adapter, { id: '' })).toThrow(DocumentApiValidationError);
  });

  it('get rejects non-string id', () => {
    const adapter = makeAdapter();
    expect(() => executeAnchoredMetadataGet(adapter, { id: 42 as unknown as string })).toThrow(
      DocumentApiValidationError,
    );
  });

  it('update requires id and JSON-serializable payload', () => {
    const adapter = makeAdapter();
    expect(() => executeAnchoredMetadataUpdate(adapter, { id: 'm-1', payload: VALID_PAYLOAD })).not.toThrow();
    expect(() => executeAnchoredMetadataUpdate(adapter, { id: '', payload: VALID_PAYLOAD })).toThrow(
      DocumentApiValidationError,
    );
    expect(() => executeAnchoredMetadataUpdate(adapter, { id: 'm-1', payload: undefined })).toThrow(
      DocumentApiValidationError,
    );
  });

  it('remove rejects empty id', () => {
    const adapter = makeAdapter();
    expect(() => executeAnchoredMetadataRemove(adapter, { id: '' })).toThrow(DocumentApiValidationError);
  });

  it('resolve rejects empty id', () => {
    const adapter = makeAdapter();
    expect(() => executeAnchoredMetadataResolve(adapter, { id: '' })).toThrow(DocumentApiValidationError);
  });
});
