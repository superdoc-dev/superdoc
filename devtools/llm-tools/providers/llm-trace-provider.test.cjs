const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  readOptionalNumber,
  defaultModelForRunner,
  getToolCallSequence,
  getErrorMessages,
  getFinalAssistantMessage,
  deriveFindContentExpectation,
} = require('./trace-utils.cjs');

// ---------------------------------------------------------------------------
// readOptionalNumber
// ---------------------------------------------------------------------------
describe('readOptionalNumber', () => {
  it('returns a finite number as-is', () => {
    assert.equal(readOptionalNumber(42), 42);
    assert.equal(readOptionalNumber(0), 0);
    assert.equal(readOptionalNumber(-3.14), -3.14);
  });

  it('parses a numeric string', () => {
    assert.equal(readOptionalNumber('7'), 7);
    assert.equal(readOptionalNumber('3.14'), 3.14);
    assert.equal(readOptionalNumber('-1'), -1);
  });

  it('returns undefined for non-finite numbers', () => {
    assert.equal(readOptionalNumber(NaN), undefined);
    assert.equal(readOptionalNumber(Infinity), undefined);
    assert.equal(readOptionalNumber(-Infinity), undefined);
  });

  it('returns undefined for empty or whitespace strings', () => {
    assert.equal(readOptionalNumber(''), undefined);
    assert.equal(readOptionalNumber('   '), undefined);
  });

  it('returns undefined for non-numeric strings', () => {
    assert.equal(readOptionalNumber('abc'), undefined);
    assert.equal(readOptionalNumber('12abc'), undefined);
  });

  it('returns undefined for null, undefined, and other types', () => {
    assert.equal(readOptionalNumber(null), undefined);
    assert.equal(readOptionalNumber(undefined), undefined);
    assert.equal(readOptionalNumber({}), undefined);
    assert.equal(readOptionalNumber([]), undefined);
    assert.equal(readOptionalNumber(true), undefined);
  });
});

// ---------------------------------------------------------------------------
// defaultModelForRunner
// ---------------------------------------------------------------------------
describe('defaultModelForRunner', () => {
  const originalEnv = {};

  beforeEach(() => {
    originalEnv.VERCEL_AI_PROVIDER = process.env.VERCEL_AI_PROVIDER;
    originalEnv.OPENAI_COMPATIBLE_MODEL = process.env.OPENAI_COMPATIBLE_MODEL;
    originalEnv.OLLAMA_MODEL = process.env.OLLAMA_MODEL;
    delete process.env.VERCEL_AI_PROVIDER;
    delete process.env.OPENAI_COMPATIBLE_MODEL;
    delete process.env.OLLAMA_MODEL;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('returns heuristic-mock for openai-raw', () => {
    assert.equal(defaultModelForRunner('openai-raw'), 'heuristic-mock');
  });

  it('returns gpt-5 for openai-sdk', () => {
    assert.equal(defaultModelForRunner('openai-sdk'), 'gpt-5');
  });

  it('returns claude-opus-4-5 for anthropic-sdk', () => {
    assert.equal(defaultModelForRunner('anthropic-sdk'), 'claude-opus-4-5');
  });

  it('returns gpt-5 for vercel-ai with openai provider', () => {
    process.env.VERCEL_AI_PROVIDER = 'openai';
    assert.equal(defaultModelForRunner('vercel-ai'), 'gpt-5');
  });

  it('returns OPENAI_COMPATIBLE_MODEL for vercel-ai with compatible provider', () => {
    process.env.VERCEL_AI_PROVIDER = 'openai-compatible';
    process.env.OPENAI_COMPATIBLE_MODEL = 'custom-model';
    assert.equal(defaultModelForRunner('vercel-ai'), 'custom-model');
  });

  it('falls back to gpt-4o-mini for compatible provider without env var', () => {
    process.env.VERCEL_AI_PROVIDER = 'lmstudio';
    assert.equal(defaultModelForRunner('vercel-ai'), 'gpt-4o-mini');
  });

  it('returns OLLAMA_MODEL for vercel-ai with no matching provider', () => {
    process.env.OLLAMA_MODEL = 'my-ollama-model';
    assert.equal(defaultModelForRunner('vercel-ai'), 'my-ollama-model');
  });

  it('falls back to llama3.1:8b for vercel-ai without env vars', () => {
    assert.equal(defaultModelForRunner('vercel-ai'), 'llama3.1:8b');
  });

  it('returns gpt-5 for unknown runner names', () => {
    assert.equal(defaultModelForRunner('unknown'), 'gpt-5');
    assert.equal(defaultModelForRunner(''), 'gpt-5');
  });
});

// ---------------------------------------------------------------------------
// getToolCallSequence
// ---------------------------------------------------------------------------
describe('getToolCallSequence', () => {
  it('extracts tool call names from trace steps', () => {
    const trace = {
      steps: [
        { type: 'tool_call', name: 'find_content' },
        { type: 'message', role: 'assistant', content: 'hello' },
        { type: 'tool_call', name: 'search_blocks' },
      ],
    };
    assert.deepEqual(getToolCallSequence(trace), ['find_content', 'search_blocks']);
  });

  it('returns empty array for trace without steps', () => {
    assert.deepEqual(getToolCallSequence({}), []);
    assert.deepEqual(getToolCallSequence({ steps: 'not-array' }), []);
  });

  it('returns empty array for null/undefined trace', () => {
    assert.deepEqual(getToolCallSequence(null), []);
    assert.deepEqual(getToolCallSequence(undefined), []);
  });

  it('skips steps with missing or non-string name', () => {
    const trace = {
      steps: [
        { type: 'tool_call', name: 123 },
        { type: 'tool_call' },
        { type: 'tool_call', name: 'valid' },
      ],
    };
    assert.deepEqual(getToolCallSequence(trace), ['valid']);
  });

  it('returns empty array for empty steps', () => {
    assert.deepEqual(getToolCallSequence({ steps: [] }), []);
  });
});

// ---------------------------------------------------------------------------
// getErrorMessages
// ---------------------------------------------------------------------------
describe('getErrorMessages', () => {
  it('extracts error messages from trace steps', () => {
    const trace = {
      steps: [
        { type: 'error', message: 'something failed' },
        { type: 'tool_call', name: 'find_content' },
        { type: 'error', message: 'another error' },
      ],
    };
    assert.deepEqual(getErrorMessages(trace), ['something failed', 'another error']);
  });

  it('returns empty array for trace with no errors', () => {
    const trace = { steps: [{ type: 'message', role: 'assistant', content: 'ok' }] };
    assert.deepEqual(getErrorMessages(trace), []);
  });

  it('returns empty array for null/undefined trace', () => {
    assert.deepEqual(getErrorMessages(null), []);
    assert.deepEqual(getErrorMessages(undefined), []);
  });

  it('skips error steps with non-string message', () => {
    const trace = {
      steps: [
        { type: 'error', message: 42 },
        { type: 'error', message: 'valid error' },
      ],
    };
    assert.deepEqual(getErrorMessages(trace), ['valid error']);
  });
});

// ---------------------------------------------------------------------------
// getFinalAssistantMessage
// ---------------------------------------------------------------------------
describe('getFinalAssistantMessage', () => {
  it('returns the last non-empty assistant message', () => {
    const trace = {
      steps: [
        { type: 'message', role: 'assistant', content: 'first' },
        { type: 'tool_call', name: 'find_content' },
        { type: 'message', role: 'assistant', content: 'second' },
      ],
    };
    assert.equal(getFinalAssistantMessage(trace), 'second');
  });

  it('skips whitespace-only assistant messages', () => {
    const trace = {
      steps: [
        { type: 'message', role: 'assistant', content: 'real content' },
        { type: 'message', role: 'assistant', content: '   ' },
      ],
    };
    assert.equal(getFinalAssistantMessage(trace), 'real content');
  });

  it('returns empty string when no assistant messages exist', () => {
    const trace = { steps: [{ type: 'tool_call', name: 'x' }] };
    assert.equal(getFinalAssistantMessage(trace), '');
  });

  it('returns empty string for null/undefined trace', () => {
    assert.equal(getFinalAssistantMessage(null), '');
    assert.equal(getFinalAssistantMessage(undefined), '');
  });

  it('ignores non-assistant messages', () => {
    const trace = {
      steps: [
        { type: 'message', role: 'user', content: 'user msg' },
        { type: 'message', role: 'assistant', content: 'assistant msg' },
        { type: 'message', role: 'system', content: 'system msg' },
      ],
    };
    assert.equal(getFinalAssistantMessage(trace), 'assistant msg');
  });

  it('trims whitespace from returned message', () => {
    const trace = {
      steps: [{ type: 'message', role: 'assistant', content: '  trimmed  ' }],
    };
    assert.equal(getFinalAssistantMessage(trace), 'trimmed');
  });
});

// ---------------------------------------------------------------------------
// deriveFindContentExpectation
// ---------------------------------------------------------------------------
describe('deriveFindContentExpectation', () => {
  it('returns null when caseDef has no assertions', () => {
    assert.equal(deriveFindContentExpectation({}, 'openai-sdk'), null);
    assert.equal(deriveFindContentExpectation({ assertions: [] }, 'openai-sdk'), null);
  });

  it('matches openai-specific assertion for openai-sdk runner', () => {
    const caseDef = {
      assertions: [{ type: 'openai_trace_find_content', expectedTotal: 3 }],
    };
    const result = deriveFindContentExpectation(caseDef, 'openai-sdk');
    assert.notEqual(result, null);
    assert.equal(result.expectedTotal, 3);
    assert.equal(result.toolName, 'find_content');
  });

  it('falls back to sandbox_find_content for unknown runner', () => {
    const caseDef = {
      assertions: [{ type: 'sandbox_find_content', minMatches: 1 }],
    };
    const result = deriveFindContentExpectation(caseDef, 'some-unknown-runner');
    assert.notEqual(result, null);
    assert.equal(result.minMatches, 1);
  });

  it('uses assertion toolName when provided', () => {
    const caseDef = {
      assertions: [{ type: 'sandbox_find_content', toolName: 'custom_tool' }],
    };
    const result = deriveFindContentExpectation(caseDef, 'openai-sdk');
    assert.equal(result.toolName, 'custom_tool');
  });

  it('defaults toolName to find_content when missing', () => {
    const caseDef = {
      assertions: [{ type: 'sandbox_find_content' }],
    };
    const result = deriveFindContentExpectation(caseDef, 'openai-sdk');
    assert.equal(result.toolName, 'find_content');
  });

  it('filters expectedBlockIds to strings only', () => {
    const caseDef = {
      assertions: [
        {
          type: 'sandbox_find_content',
          expectedBlockIds: ['p1', 42, 'p2', null],
        },
      ],
    };
    const result = deriveFindContentExpectation(caseDef, 'openai-sdk');
    assert.deepEqual(result.expectedBlockIds, ['p1', 'p2']);
  });

  it('returns empty expectedBlockIds when not an array', () => {
    const caseDef = {
      assertions: [{ type: 'sandbox_find_content', expectedBlockIds: 'not-array' }],
    };
    const result = deriveFindContentExpectation(caseDef, 'openai-sdk');
    assert.deepEqual(result.expectedBlockIds, []);
  });

  it('returns null when caseDef is null/undefined', () => {
    assert.equal(deriveFindContentExpectation(null, 'openai-sdk'), null);
    assert.equal(deriveFindContentExpectation(undefined, 'openai-sdk'), null);
  });

  it('prefers runner-specific assertion type over sandbox fallback', () => {
    const caseDef = {
      assertions: [
        { type: 'sandbox_find_content', expectedTotal: 10 },
        { type: 'anthropic_trace_find_content', expectedTotal: 5 },
      ],
    };
    const result = deriveFindContentExpectation(caseDef, 'anthropic-sdk');
    assert.equal(result.expectedTotal, 5);
  });

  it('matches vercel runner through multiple candidate types', () => {
    const caseDef = {
      assertions: [{ type: 'openai_trace_find_content', expectedTotal: 7 }],
    };
    const result = deriveFindContentExpectation(caseDef, 'vercel-ai');
    assert.notEqual(result, null);
    assert.equal(result.expectedTotal, 7);
  });
});
