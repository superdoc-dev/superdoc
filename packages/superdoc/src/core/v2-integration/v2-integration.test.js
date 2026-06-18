import { describe, it, expect } from 'vitest';
import {
  resolveV2Integration,
  createStubV2Integration,
  hasRealV2Integration,
  isSyntheticTrackedChangeCommentLaneItem,
  isV2SyntheticTrackedChangeRow,
  SUPERDOC_V2_INTEGRATION_VERSION,
} from './v2-integration.js';

describe('resolveV2Integration', () => {
  it('returns the V1-compatible stub when no integration is injected', () => {
    const integration = resolveV2Integration({});
    expect(integration.version).toBe(SUPERDOC_V2_INTEGRATION_VERSION);
    expect(integration.EditorComponent).toBeTruthy();
    expect(hasRealV2Integration(integration)).toBe(false);
    const publisher = integration.createGeometryPublisher({});
    expect(publisher.getLastEpoch()).toBeNull();
    const controller = integration.createReviewHydrationController({});
    expect(controller.getDiagnostics()).toBeNull();
  });

  it('treats null / non-object integration values as absent', () => {
    expect(hasRealV2Integration(resolveV2Integration({ v2Integration: null }))).toBe(false);
    expect(hasRealV2Integration(resolveV2Integration({ v2: 'nope' }))).toBe(false);
  });

  it('forwards an injected integration through config.v2Integration', () => {
    const EditorComponent = { name: 'RealV2Editor' };
    const RulerComponent = { name: 'RealV2Ruler' };
    const createGeometryPublisher = () => ({ real: true });
    const integration = resolveV2Integration({
      v2Integration: { version: 2, EditorComponent, RulerComponent, createGeometryPublisher },
    });
    expect(integration.version).toBe(2);
    expect(integration.EditorComponent).toBe(EditorComponent);
    expect(integration.RulerComponent).toBe(RulerComponent);
    expect(integration.createGeometryPublisher).toBe(createGeometryPublisher);
    expect(hasRealV2Integration(integration)).toBe(true);
  });

  it('accepts the neutral `v2` config alias', () => {
    const EditorComponent = { name: 'RealV2Editor' };
    const integration = resolveV2Integration({ v2: { EditorComponent } });
    expect(integration.EditorComponent).toBe(EditorComponent);
    expect(hasRealV2Integration(integration)).toBe(true);
  });

  it('fills missing optional fields from the stub defaults', () => {
    const EditorComponent = { name: 'RealV2Editor' };
    const integration = resolveV2Integration({ v2Integration: { EditorComponent } });
    expect(typeof integration.createReviewHydrationController).toBe('function');
    expect(typeof integration.isSyntheticTrackedChangeCommentLaneItem).toBe('function');
  });
});

describe('synthetic tracked-change predicates', () => {
  it('detects synthetic tracked-change comment-lane items', () => {
    expect(isSyntheticTrackedChangeCommentLaneItem({ id: 'tc-comment:abc' })).toBe(true);
    expect(isSyntheticTrackedChangeCommentLaneItem({ commentId: 'tc-comment:abc' })).toBe(true);
    expect(isSyntheticTrackedChangeCommentLaneItem({ id: 'real-comment' })).toBe(false);
    expect(isSyntheticTrackedChangeCommentLaneItem(null)).toBe(false);
  });

  it('detects synthesized V2 body tracked-change rows', () => {
    expect(isV2SyntheticTrackedChangeRow({ trackedChange: true, trackedChangeAnchorKey: 'tc::body::1' })).toBe(true);
    expect(isV2SyntheticTrackedChangeRow({ trackedChange: true, trackedChangeAnchorKey: 'other::1' })).toBe(false);
    expect(isV2SyntheticTrackedChangeRow({ trackedChange: false })).toBe(false);
  });
});

describe('createStubV2Integration', () => {
  it('produces an EditorComponent that fails closed in V2 mode', () => {
    const stub = createStubV2Integration();
    expect(stub.EditorComponent).toBeTruthy();
    expect(stub.RulerComponent).toBeNull();
  });
});
