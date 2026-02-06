import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { CaseDefinition } from '../cases/types.js';
import type { SandboxState } from '../sandbox/state.js';
import type { NormalizedTrace, TraceStep } from '../traces/types.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function loadFixture(root: string, fixture: string): Promise<SandboxState> {
  const fixturePath = path.join(root, 'fixtures', 'docs', fixture);
  const raw = await fs.readFile(fixturePath, 'utf8');
  return JSON.parse(raw) as SandboxState;
}

export function sameSequence(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function matchesAnyLengthSingleToolSequence(sequence: string[], allowedSequences: string[][]): boolean {
  if (sequence.length === 0) return false;
  if (allowedSequences.length === 0) return false;

  const allowedSingleTools = new Set<string>();
  for (const allowed of allowedSequences) {
    if (allowed.length === 0) return false;
    const first = allowed[0];
    if (!allowed.every((name) => name === first)) {
      return false;
    }
    allowedSingleTools.add(first);
  }

  if (allowedSingleTools.size !== 1) {
    return false;
  }

  const [onlyTool] = [...allowedSingleTools];
  return sequence.every((name) => name === onlyTool);
}

export function extractToolCallSequence(trace: NormalizedTrace): string[] {
  return trace.steps.filter((step) => step.type === 'tool_call').map((step) => step.name);
}

export function getErrorSteps(trace: NormalizedTrace): Array<Extract<TraceStep, { type: 'error' }>> {
  return trace.steps.filter((step): step is Extract<TraceStep, { type: 'error' }> => step.type === 'error');
}

export function getAssistantMessages(trace: NormalizedTrace): string[] {
  const messages: string[] = [];
  for (const step of trace.steps) {
    if (step.type === 'message' && step.role === 'assistant') {
      messages.push(step.content);
    }
  }
  return messages;
}

export function getLastToolResultStep(
  trace: NormalizedTrace,
  toolName: string,
): Extract<TraceStep, { type: 'tool_result' }> | null {
  let match: Extract<TraceStep, { type: 'tool_result' }> | null = null;
  for (const step of trace.steps) {
    if (step.type === 'tool_result' && step.name === toolName) {
      match = step;
    }
  }
  return match;
}

export type TraceFindContentAssertion = {
  type: string;
  description?: string;
  toolName?: string;
  expectedTotal: number;
  expectedBlockIds?: string[];
  assistantMustContain?: string[];
};

export function isTraceFindContentAssertion(value: unknown, assertionType: string): value is TraceFindContentAssertion {
  if (!isRecord(value)) return false;
  if (value.type !== assertionType) return false;
  if (typeof value.expectedTotal !== 'number') return false;
  if (value.expectedBlockIds != null && !Array.isArray(value.expectedBlockIds)) return false;
  if (value.assistantMustContain != null && !Array.isArray(value.assistantMustContain)) return false;
  return true;
}

export function evaluateTraceFindContentAssertion(
  caseDef: CaseDefinition,
  trace: NormalizedTrace,
  assertion: TraceFindContentAssertion,
): string[] {
  const failures: string[] = [];

  const sequence = extractToolCallSequence(trace);
  const matchesAllowedSequence =
    caseDef.allowedSequences.some((allowed) => sameSequence(sequence, allowed)) ||
    matchesAnyLengthSingleToolSequence(sequence, caseDef.allowedSequences);
  if (!matchesAllowedSequence) {
    failures.push(
      `tool call sequence mismatch. got=[${sequence.join(', ')}], allowed=${JSON.stringify(caseDef.allowedSequences)}`,
    );
  }

  const errors = getErrorSteps(trace);
  if (errors.length > 0) {
    failures.push(`trace contains error step(s): ${errors.map((entry) => entry.message).join(' | ')}`);
  }

  const toolName = assertion.toolName ?? 'find_content';
  const toolResultStep = getLastToolResultStep(trace, toolName);
  if (!toolResultStep) {
    failures.push(`missing tool_result for ${toolName}`);
    return failures;
  }

  if (!isRecord(toolResultStep.result)) {
    failures.push(`tool_result for ${toolName} is not an object`);
    return failures;
  }

  if (toolResultStep.result.total !== assertion.expectedTotal) {
    failures.push(`expected total=${assertion.expectedTotal}, got total=${String(toolResultStep.result.total)}`);
  }

  if (assertion.expectedBlockIds && assertion.expectedBlockIds.length > 0) {
    const matches = Array.isArray(toolResultStep.result.matches) ? toolResultStep.result.matches : [];
    const actualBlockIds = new Set(
      matches
        .map((entry) =>
          isRecord(entry) && isRecord(entry.address) && typeof entry.address.blockId === 'string'
            ? entry.address.blockId
            : null,
        )
        .filter((entry): entry is string => entry !== null),
    );

    for (const expectedBlockId of assertion.expectedBlockIds) {
      if (!actualBlockIds.has(expectedBlockId)) {
        failures.push(`expected blockId "${expectedBlockId}" not found in tool_result.matches`);
      }
    }
  }

  if (assertion.assistantMustContain && assertion.assistantMustContain.length > 0) {
    const assistantMessages = getAssistantMessages(trace);
    const finalAssistant = assistantMessages.at(-1) ?? '';
    if (!finalAssistant) {
      failures.push('missing final assistant message');
    } else {
      for (const snippet of assertion.assistantMustContain) {
        if (!finalAssistant.includes(snippet)) {
          failures.push(`assistant message missing snippet "${snippet}"`);
        }
      }
    }
  }

  return failures;
}
