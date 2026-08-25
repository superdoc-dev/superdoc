import type { Config, SuperDoc } from 'superdoc';

type BulkDecisionPayload = Parameters<NonNullable<Config['onTrackedChangesBulkDecision']>>[0];

declare const superdoc: SuperDoc;

superdoc.on('tracked-changes:bulk-decision', (event) => {
  const payload: BulkDecisionPayload = event;
  const documentId: string | null = payload.documentId;
  const decision: 'accept' | 'reject' = payload.decision;
  const requestedCount: number = payload.requestedCount;
  const successfulCount: number = payload.successfulCount;
  const permissionDeniedCount: number = payload.permissionDeniedCount;
  void [documentId, decision, requestedCount, successfulCount, permissionDeniedCount];
});

const config = {
  selector: '#editor',
  onTrackedChangesBulkDecision(event) {
    const payload: BulkDecisionPayload = event;
    void payload;
  },
} satisfies Config;

void config;
