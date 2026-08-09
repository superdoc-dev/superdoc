export interface CompareApplyResult {
  readonly appliedOperations?: number;
  readonly diagnostics?: readonly string[];
}

export interface CompareApplyDebugSnapshot {
  readonly textLength: number | null;
  readonly hostFacadeTextLength: number | null;
  readonly projectionBlockCount: number | null;
  readonly projectionTableCount: number | null;
  readonly renderStage: string | null;
  readonly hostFacadeMatchesEditorDoc: boolean | null;
}

export interface CompareApplyDocApi {
  readonly diff: {
    apply(input: { diff: unknown }, options: { changeMode: 'tracked' | 'direct' }): CompareApplyResult;
  };
  getText?(input: Record<string, never>): string;
  readonly doc?: {
    getText?(input: Record<string, never>): string;
  } | null;
  readonly documentMutationReadiness?: {
    whenPainted?(input?: { txId?: string }): Promise<unknown> | unknown;
  } | null;
  readonly host?: {
    readMountedProjectionBlocks?(): Array<{ kind?: string }> | null;
    getRenderReadinessSnapshot?(): { renderStage?: string | null } | null;
    getDocumentFacade?():
      | {
          available: true;
          doc: {
            getText?(input: Record<string, never>): string;
          };
        }
      | {
          available: false;
        };
  } | null;
}

export interface CompareApplyOutcome {
  readonly applyResult: CompareApplyResult;
  readonly changeMode: 'tracked' | 'direct';
  readonly fallbackFromTracked: boolean;
}

export function isWs09TrackedCompareDeferred(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : null;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return code === 'CAPABILITY_UNSUPPORTED' && /compare-apply-deferred \(ws09\)/i.test(message);
}

export function compareApplyDeferredMessage(error: unknown): string | null {
  if (!isWs09TrackedCompareDeferred(error)) return null;
  return (
    'Tracked compare apply is deferred for ws09 table topology in this build. ' +
    'SuperDoc Dev retried the same diff in direct mode.'
  );
}

function isWs07VisualFamilyApplyBlock(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : null;
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (code !== 'CAPABILITY_UNSUPPORTED') return false;

  const families = Array.from(
    message.matchAll(/\b([a-z-]+)\s+\((?:deferred|blocked):\s+compare-apply-deferred \(ws07\)\)/gi),
    (match) => match[1] ?? '',
  ).filter((family) => family.length > 0);
  if (families.length === 0) return false;

  const allowedFamilies = new Set(['sections', 'settings', 'theme']);
  return families.every((family) => allowedFamilies.has(family));
}

function sanitizeWs07VisualFamiliesFromDiff(diff: unknown): unknown {
  if (!diff || typeof diff !== 'object') return diff;
  const payload = 'payload' in diff ? (diff as { payload?: unknown }).payload : null;
  if (!payload || typeof payload !== 'object') return diff;

  const next = structuredClone(diff as Record<string, unknown>) as {
    payload?: {
      analysis?: {
        families?: Array<{ family?: unknown; state?: unknown; blockedReason?: unknown; excludedDecision?: unknown }>;
      };
      semanticAnalysis?: {
        familyDeltas?: Array<{ family?: unknown; detectedChange?: unknown; reason?: unknown; owner?: unknown }>;
      };
    };
  };

  const strippedFamilies = new Set(['sections', 'settings', 'theme']);

  const analysisFamilies = next.payload?.analysis?.families;
  if (Array.isArray(analysisFamilies)) {
    next.payload!.analysis!.families = analysisFamilies.map((family) =>
      strippedFamilies.has(String(family?.family))
        ? {
            ...family,
            state: 'unchanged',
            blockedReason: undefined,
            excludedDecision: undefined,
          }
        : family,
    );
  }

  const familyDeltas = next.payload?.semanticAnalysis?.familyDeltas;
  if (Array.isArray(familyDeltas)) {
    next.payload!.semanticAnalysis!.familyDeltas = familyDeltas.map((delta) =>
      strippedFamilies.has(String(delta?.family))
        ? {
            ...delta,
            detectedChange: false,
            reason: undefined,
            owner: undefined,
          }
        : delta,
    );
  }

  return next;
}

function prefersDirectWs09TableTopologyApply(diff: unknown): boolean {
  if (!diff || typeof diff !== 'object') return false;
  const payload = 'payload' in diff ? (diff as { payload?: unknown }).payload : null;
  if (!payload || typeof payload !== 'object') return false;
  const familyPolicy =
    'familyPolicy' in payload && Array.isArray((payload as { familyPolicy?: unknown }).familyPolicy)
      ? (
          payload as {
            familyPolicy: Array<{
              family?: unknown;
              disposition?: unknown;
              changed?: unknown;
              applyRequired?: unknown;
            }>;
          }
        ).familyPolicy
      : [];
  const tablesPolicy = familyPolicy.find((entry) => entry?.family === 'tables') ?? null;
  if (!tablesPolicy) return false;
  const mainDocument = 'mainDocument' in payload ? (payload as { mainDocument?: unknown }).mainDocument : null;
  const targetMainDocument =
    mainDocument && typeof mainDocument === 'object' ? (mainDocument as { target?: unknown }).target : null;
  const hasTargetMainDocumentXml = Boolean(
    targetMainDocument &&
    typeof targetMainDocument === 'object' &&
    typeof (targetMainDocument as { xml?: unknown }).xml === 'string',
  );
  return (
    tablesPolicy.changed === true &&
    tablesPolicy.applyRequired === true &&
    tablesPolicy.disposition === 'deferred' &&
    hasTargetMainDocumentXml
  );
}

export function applyCompareWithWs09Fallback(docApi: CompareApplyDocApi, diff: unknown): CompareApplyOutcome {
  if (prefersDirectWs09TableTopologyApply(diff)) {
    try {
      return {
        applyResult: docApi.diff.apply({ diff }, { changeMode: 'direct' }),
        changeMode: 'direct',
        fallbackFromTracked: true,
      };
    } catch (error) {
      if (!isWs07VisualFamilyApplyBlock(error)) throw error;
      const sanitizedDiff = sanitizeWs07VisualFamiliesFromDiff(diff);
      return {
        applyResult: docApi.diff.apply({ diff: sanitizedDiff }, { changeMode: 'direct' }),
        changeMode: 'direct',
        fallbackFromTracked: true,
      };
    }
  }
  try {
    return {
      applyResult: docApi.diff.apply({ diff }, { changeMode: 'tracked' }),
      changeMode: 'tracked',
      fallbackFromTracked: false,
    };
  } catch (error) {
    if (!isWs09TrackedCompareDeferred(error)) throw error;
    return {
      applyResult: docApi.diff.apply({ diff }, { changeMode: 'direct' }),
      changeMode: 'direct',
      fallbackFromTracked: true,
    };
  }
}

export async function settleCompareApplyPaint(docApi: CompareApplyDocApi): Promise<void> {
  const readiness = docApi.documentMutationReadiness;
  const whenPainted = readiness?.whenPainted;
  if (typeof whenPainted !== 'function') return;
  await whenPainted.call(readiness);
}

export function captureCompareApplyDebugSnapshot(docApi: CompareApplyDocApi): CompareApplyDebugSnapshot {
  let textLength: number | null = null;
  try {
    const directTextReader = docApi.getText ?? docApi.doc?.getText;
    const text = directTextReader?.({});
    if (typeof text === 'string') textLength = text.length;
  } catch {
    textLength = null;
  }

  let hostFacadeTextLength: number | null = null;
  let hostFacadeMatchesEditorDoc: boolean | null = null;
  try {
    const facade = docApi.host?.getDocumentFacade?.();
    if (facade?.available === true) {
      const hostText = facade.doc.getText?.({});
      if (typeof hostText === 'string') hostFacadeTextLength = hostText.length;
      const editorDoc = docApi.doc ?? null;
      hostFacadeMatchesEditorDoc = editorDoc ? facade.doc === editorDoc : null;
    }
  } catch {
    hostFacadeTextLength = null;
    hostFacadeMatchesEditorDoc = null;
  }

  let projectionBlockCount: number | null = null;
  let projectionTableCount: number | null = null;
  try {
    const blocks = docApi.host?.readMountedProjectionBlocks?.() ?? null;
    if (Array.isArray(blocks)) {
      projectionBlockCount = blocks.length;
      projectionTableCount = blocks.filter((block) => block?.kind === 'table').length;
    }
  } catch {
    projectionBlockCount = null;
    projectionTableCount = null;
  }

  let renderStage: string | null = null;
  try {
    const snapshot = docApi.host?.getRenderReadinessSnapshot?.() ?? null;
    renderStage = typeof snapshot?.renderStage === 'string' ? snapshot.renderStage : null;
  } catch {
    renderStage = null;
  }

  return {
    textLength,
    hostFacadeTextLength,
    projectionBlockCount,
    projectionTableCount,
    renderStage,
    hostFacadeMatchesEditorDoc,
  };
}
