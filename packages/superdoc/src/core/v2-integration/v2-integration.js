// Local V2 integration seam.
//
// Public SuperDoc must not depend on V2 implementation packages.
// Instead, the product injects a single V2 integration object through
// `config.editorIntegration`. When no integration is provided, a local stub
// preserves the existing V1 behavior and surfaces a clear runtime error if
// `editorVersion: 2` is requested without an integration.
//
// The integration is the only seam through which a V2 editor runtime reaches
// public SuperDoc. A production V2 package can expose the same shape later.

import { defineComponent, h, onMounted } from 'vue';

/**
 * @typedef {Object} SuperDocV2Integration
 * @property {number} version Integration contract version.
 * @property {unknown} [capabilities] Optional capability snapshot/hints.
 * @property {unknown} EditorComponent Vue component that boots the V2 DOCX editor.
 * @property {unknown} [RulerComponent] Optional Vue component for the V2 ruler.
 * @property {(...args: unknown[]) => unknown} [createGeometryPublisher] Factory for the V2 geometry publisher.
 * @property {(...args: unknown[]) => unknown} [createReviewHydrationController] Factory for the V2 review-row hydration controller.
 * @property {(value: unknown) => boolean} [isSyntheticTrackedChangeCommentLaneItem] Predicate for synthetic tracked-change comment-lane items.
 * @property {(value: unknown) => boolean} [isV2SyntheticTrackedChangeRow] Predicate for synthesized V2 tracked-change rows.
 */

/** Default version for the local stub integration (V1-compatible). */
export const SUPERDOC_V2_INTEGRATION_VERSION = 1;

const V2_SYNTHETIC_TRACKED_CHANGE_COMMENT_ID_PREFIX = 'tc-comment:';
const V2_BODY_TRACKED_CHANGE_ANCHOR_PREFIX = 'tc::body::';

/**
 * @param {unknown} item
 * @returns {boolean}
 */
export function isSyntheticTrackedChangeCommentLaneItem(item) {
  if (!item || typeof item !== 'object') return false;
  const id = item.id ?? item.commentId;
  if (typeof id !== 'string') return false;
  return id.startsWith(V2_SYNTHETIC_TRACKED_CHANGE_COMMENT_ID_PREFIX);
}

/**
 * @param {{ trackedChange?: unknown, trackedChangeAnchorKey?: unknown } | null | undefined} row
 * @returns {boolean}
 */
export function isV2SyntheticTrackedChangeRow(row) {
  if (!row || row.trackedChange !== true) return false;
  const anchorKey = row.trackedChangeAnchorKey;
  return typeof anchorKey === 'string' && anchorKey.startsWith(V2_BODY_TRACKED_CHANGE_ANCHOR_PREFIX);
}

function createStubGeometryPublisher() {
  return {
    publish() {},
    recollect() {},
    reset() {},
    getLastEpoch() {
      return null;
    },
    getLastPayload() {
      return null;
    },
  };
}

function createStubReviewHydrationController() {
  return {
    setContext() {},
    onRenderReadiness() {},
    reset() {},
    getDiagnostics() {
      return null;
    },
  };
}

const StubV2EditorComponent = defineComponent({
  name: 'SuperDocV2IntegrationMissing',
  emits: ['v2-editor-failed'],
  setup(_props, { emit }) {
    onMounted(() => {
      emit('v2-editor-failed', {
        reason: 'v2-integration-missing',
        detail:
          'SuperDoc: editorVersion: 2 requires an editor integration. Pass `editorIntegration` in the SuperDoc config.',
      });
    });
    return () => h('div', { class: 'superdoc-v2-integration-missing' });
  },
});

/**
 * @returns {SuperDocV2Integration}
 */
export function createStubV2Integration() {
  return {
    version: SUPERDOC_V2_INTEGRATION_VERSION,
    capabilities: null,
    EditorComponent: StubV2EditorComponent,
    RulerComponent: null,
    createGeometryPublisher: createStubGeometryPublisher,
    createReviewHydrationController: createStubReviewHydrationController,
    isSyntheticTrackedChangeCommentLaneItem,
    isV2SyntheticTrackedChangeRow,
  };
}

/**
 * @param {{ editorIntegration?: unknown } | null | undefined} config
 * @returns {SuperDocV2Integration}
 */
export function resolveV2Integration(config) {
  const stub = createStubV2Integration();
  const candidate = config?.editorIntegration ?? null;
  const injected = typeof candidate === 'function' ? candidate() : candidate;
  if (!injected || typeof injected !== 'object') return stub;

  /** @type {SuperDocV2Integration} */
  const integration = /** @type {SuperDocV2Integration} */ (injected);
  return {
    version: typeof integration.version === 'number' ? integration.version : stub.version,
    capabilities: integration.capabilities ?? stub.capabilities,
    EditorComponent: integration.EditorComponent ?? stub.EditorComponent,
    RulerComponent: integration.RulerComponent ?? stub.RulerComponent,
    createGeometryPublisher: integration.createGeometryPublisher ?? stub.createGeometryPublisher,
    createReviewHydrationController:
      integration.createReviewHydrationController ?? stub.createReviewHydrationController,
    isSyntheticTrackedChangeCommentLaneItem:
      integration.isSyntheticTrackedChangeCommentLaneItem ?? stub.isSyntheticTrackedChangeCommentLaneItem,
    isV2SyntheticTrackedChangeRow: integration.isV2SyntheticTrackedChangeRow ?? stub.isV2SyntheticTrackedChangeRow,
  };
}

/**
 * @param {SuperDocV2Integration | null | undefined} integration
 * @returns {boolean}
 */
export function hasRealV2Integration(integration) {
  return Boolean(integration && integration.EditorComponent && integration.EditorComponent !== StubV2EditorComponent);
}
