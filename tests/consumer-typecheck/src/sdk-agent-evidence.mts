import {
  dispatchSuperDocTool,
  type AgentApplyArgs,
  type AgentReceipt,
  type BoundDocApi,
} from '../../../packages/sdk/langs/node/dist/index.js';

declare const document: BoundDocApi;
const args: AgentApplyArgs = {
  evidence: 'full',
  plan: {
    intent: 'append with complete receipt counts',
    steps: [
      { kind: 'apply', operationId: 'doc.create.paragraph', args: { text: 'Approved.' } },
      { kind: 'verify', checks: [{ kind: 'revision-changed' }] },
    ],
  },
};
await dispatchSuperDocTool(document, 'agent_apply', args, { preset: 'core' });
const required: AgentApplyArgs = { ...args, evidence: 'required' };
const defaults: AgentApplyArgs = { plan: required.plan };
defaults.plan.intent satisfies string;
// @ts-expect-error Evidence policies are validated, not arbitrary strings.
const invalid: AgentApplyArgs = { ...args, evidence: 'none' };
void invalid;

declare const receipt: AgentReceipt;
receipt.preSnapshot?.revision satisfies string | undefined;
receipt.postSnapshot?.counts?.paragraphs satisfies number | undefined;
receipt.executedOperations?.[0]?.operationId satisfies string | undefined;
receipt.verification?.[0]?.passed satisfies boolean | undefined;
receipt.status satisfies 'ok' | 'partial' | 'failed' | 'aborted';
