/**
 * Pure utility functions for trace extraction and provider configuration.
 * Extracted for testability — no external dependencies.
 */

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultModelForRunner(runnerName) {
  const vercelProvider = (process.env.VERCEL_AI_PROVIDER ?? '').trim().toLowerCase();

  switch (runnerName) {
    case 'openai-raw':
      return 'heuristic-mock';
    case 'openai-sdk':
      return 'gpt-5';
    case 'anthropic-sdk':
      return 'claude-opus-4-5';
    case 'vercel-ai':
      if (vercelProvider === 'openai') {
        return 'gpt-5';
      }
      if (
        vercelProvider === 'openai-compatible' ||
        vercelProvider === 'openai_compatible' ||
        vercelProvider === 'compatible' ||
        vercelProvider === 'lmstudio'
      ) {
        return process.env.OPENAI_COMPATIBLE_MODEL ?? 'gpt-4o-mini';
      }
      return process.env.OLLAMA_MODEL ?? 'llama3.1:8b';
    default:
      return 'gpt-5';
  }
}

function readOptionalNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function getToolCallSequence(trace) {
  if (!isRecord(trace) || !Array.isArray(trace.steps)) {
    return [];
  }

  return trace.steps
    .filter((step) => isRecord(step) && step.type === 'tool_call' && typeof step.name === 'string')
    .map((step) => step.name);
}

function getErrorMessages(trace) {
  if (!isRecord(trace) || !Array.isArray(trace.steps)) {
    return [];
  }

  return trace.steps
    .filter((step) => isRecord(step) && step.type === 'error' && typeof step.message === 'string')
    .map((step) => step.message);
}

function getFinalAssistantMessage(trace) {
  if (!isRecord(trace) || !Array.isArray(trace.steps)) {
    return '';
  }

  const assistantMessages = trace.steps
    .filter(
      (step) =>
        isRecord(step) &&
        step.type === 'message' &&
        step.role === 'assistant' &&
        typeof step.content === 'string',
    )
    .map((step) => step.content.trim())
    .filter((content) => content.length > 0);

  return assistantMessages.at(-1) ?? '';
}

function firstMatchingAssertion(assertions, typeCandidates) {
  if (!Array.isArray(assertions)) {
    return null;
  }

  for (const typeName of typeCandidates) {
    const match = assertions.find((assertion) => isRecord(assertion) && assertion.type === typeName);
    if (match) {
      return match;
    }
  }

  return null;
}

function deriveFindContentExpectation(caseDef, runnerName) {
  const typeCandidatesByRunner = {
    'openai-sdk': ['openai_trace_find_content', 'sandbox_find_content'],
    'anthropic-sdk': ['anthropic_trace_find_content', 'sandbox_find_content'],
    'vercel-ai': [
      'vercel_trace_find_content',
      'openai_trace_find_content',
      'anthropic_trace_find_content',
      'sandbox_find_content',
    ],
  };

  const typeCandidates = typeCandidatesByRunner[runnerName] ?? ['sandbox_find_content'];
  const assertion = firstMatchingAssertion(caseDef?.assertions, typeCandidates);
  if (!assertion) {
    return null;
  }

  const toolName =
    typeof assertion.toolName === 'string' && assertion.toolName.trim().length > 0
      ? assertion.toolName
      : 'find_content';

  const expectedTotal = readOptionalNumber(assertion.expectedTotal);
  const minMatches = readOptionalNumber(assertion.minMatches);
  const expectedBlockIds = Array.isArray(assertion.expectedBlockIds)
    ? assertion.expectedBlockIds.filter((value) => typeof value === 'string')
    : [];

  return {
    toolName,
    expectedTotal,
    minMatches,
    expectedBlockIds,
  };
}

module.exports = {
  isRecord,
  cloneJson,
  defaultModelForRunner,
  readOptionalNumber,
  getToolCallSequence,
  getErrorMessages,
  getFinalAssistantMessage,
  firstMatchingAssertion,
  deriveFindContentExpectation,
};
