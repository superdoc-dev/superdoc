function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function pass(reason) {
  return {
    pass: true,
    score: 1,
    reason,
  };
}

function fail(reason) {
  return {
    pass: false,
    score: 0,
    reason,
  };
}

function getTracePayload(output) {
  if (!isRecord(output)) {
    return null;
  }
  return output;
}

function getTraceSteps(payload) {
  if (!payload || !isRecord(payload.trace) || !Array.isArray(payload.trace.steps)) {
    return [];
  }
  return payload.trace.steps;
}

function getToolCallSequence(payload) {
  if (Array.isArray(payload?.toolCallSequence)) {
    return payload.toolCallSequence.filter((name) => typeof name === 'string');
  }

  return getTraceSteps(payload)
    .filter((step) => isRecord(step) && step.type === 'tool_call' && typeof step.name === 'string')
    .map((step) => step.name);
}

function getErrorMessages(payload) {
  if (Array.isArray(payload?.errorMessages)) {
    return payload.errorMessages.filter((entry) => typeof entry === 'string');
  }

  return getTraceSteps(payload)
    .filter((step) => isRecord(step) && step.type === 'error' && typeof step.message === 'string')
    .map((step) => step.message);
}

function getFindContentExpectation(payload) {
  if (!isRecord(payload?.expectations)) {
    return null;
  }

  return isRecord(payload.expectations.findContent) ? payload.expectations.findContent : null;
}

function getFindContentResult(payload, toolName) {
  const targetTool = typeof toolName === 'string' && toolName.length > 0 ? toolName : 'find_content';
  let match = null;
  for (const step of getTraceSteps(payload)) {
    if (isRecord(step) && step.type === 'tool_result' && step.name === targetTool && isRecord(step.result)) {
      match = step.result;
    }
  }
  return match;
}

function sameSequence(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return false;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function matchesAnyLengthSingleToolSequence(sequence, allowedSequences) {
  if (!Array.isArray(sequence) || sequence.length === 0) {
    return false;
  }
  if (!Array.isArray(allowedSequences) || allowedSequences.length === 0) {
    return false;
  }

  const allowedSingleTools = new Set();
  for (const allowed of allowedSequences) {
    if (!Array.isArray(allowed) || allowed.length === 0) {
      return false;
    }

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

function assertNoErrorSteps(output) {
  const payload = getTracePayload(output);
  if (!payload) {
    return fail('Provider output is not an object.');
  }

  const errors = getErrorMessages(payload);
  if (errors.length > 0) {
    return fail(`Trace contains error step(s): ${errors.join(' | ')}`);
  }

  return pass('Trace has no error steps.');
}

function assertRequiredSubsequencePresent(output) {
  const payload = getTracePayload(output);
  if (!payload) {
    return fail('Provider output is not an object.');
  }

  const allowedSequences = Array.isArray(payload.caseDefinition?.allowedSequences)
    ? payload.caseDefinition.allowedSequences
    : [];

  if (allowedSequences.length === 0) {
    return fail('Case definition is missing allowedSequences.');
  }

  const sequence = getToolCallSequence(payload);
  const matches =
    allowedSequences.some((allowed) => sameSequence(sequence, allowed)) ||
    matchesAnyLengthSingleToolSequence(sequence, allowedSequences);
  if (!matches) {
    return fail(
      `Tool call sequence mismatch. got=[${sequence.join(', ')}], allowed=${JSON.stringify(allowedSequences)}`,
    );
  }

  return pass(`Tool call sequence matched allowed path: [${sequence.join(', ')}].`);
}

function assertNoHallucinatedTools(output) {
  const payload = getTracePayload(output);
  if (!payload) {
    return fail('Provider output is not an object.');
  }

  const allowedSequences = Array.isArray(payload.caseDefinition?.allowedSequences)
    ? payload.caseDefinition.allowedSequences
    : [];

  const allowedTools = new Set(
    allowedSequences
      .flatMap((sequence) => (Array.isArray(sequence) ? sequence : []))
      .filter((toolName) => typeof toolName === 'string'),
  );

  if (allowedTools.size === 0) {
    return fail('No allowed tool names configured from allowedSequences.');
  }

  const sequence = getToolCallSequence(payload);
  const hallucinated = sequence.filter((toolName) => !allowedTools.has(toolName));
  if (hallucinated.length > 0) {
    return fail(`Hallucinated tool(s): ${hallucinated.join(', ')}`);
  }

  return pass('All tool calls are from the allowed tool set.');
}

function assertFindContentTotal(output) {
  const payload = getTracePayload(output);
  if (!payload) {
    return fail('Provider output is not an object.');
  }

  const expectation = getFindContentExpectation(payload);
  if (!expectation) {
    return fail('Missing findContent expectations in provider output.');
  }

  const toolName =
    typeof expectation.toolName === 'string' && expectation.toolName.length > 0
      ? expectation.toolName
      : 'find_content';
  const result = getFindContentResult(payload, toolName);
  if (!result) {
    return fail(`Missing tool_result for ${toolName}.`);
  }

  if (typeof result.total !== 'number') {
    return fail(`tool_result.total for ${toolName} is not numeric.`);
  }

  if (typeof expectation.expectedTotal === 'number') {
    if (result.total !== expectation.expectedTotal) {
      return fail(`Expected total=${expectation.expectedTotal}, got total=${result.total}.`);
    }
    return pass(`tool_result.total matched expected total ${expectation.expectedTotal}.`);
  }

  if (typeof expectation.minMatches === 'number') {
    if (result.total < expectation.minMatches) {
      return fail(`Expected at least ${expectation.minMatches} matches, got ${result.total}.`);
    }
    return pass(`tool_result.total ${result.total} satisfied minimum ${expectation.minMatches}.`);
  }

  return fail('No expectedTotal or minMatches configured for findContent expectation.');
}

function assertExpectedBlockIds(output) {
  const payload = getTracePayload(output);
  if (!payload) {
    return fail('Provider output is not an object.');
  }

  const expectation = getFindContentExpectation(payload);
  if (!expectation) {
    return fail('Missing findContent expectations in provider output.');
  }

  const expectedBlockIds = Array.isArray(expectation.expectedBlockIds)
    ? expectation.expectedBlockIds.filter((value) => typeof value === 'string')
    : [];

  if (expectedBlockIds.length === 0) {
    return pass('No expected block IDs configured for this case.');
  }

  const toolName =
    typeof expectation.toolName === 'string' && expectation.toolName.length > 0
      ? expectation.toolName
      : 'find_content';
  const result = getFindContentResult(payload, toolName);
  if (!result) {
    return fail(`Missing tool_result for ${toolName}.`);
  }

  const matches = Array.isArray(result.matches) ? result.matches : [];
  const actualBlockIds = new Set(
    matches
      .map((entry) =>
        isRecord(entry) && isRecord(entry.address) && typeof entry.address.blockId === 'string'
          ? entry.address.blockId
          : null,
      )
      .filter((value) => typeof value === 'string'),
  );

  const missing = expectedBlockIds.filter((blockId) => !actualBlockIds.has(blockId));
  if (missing.length > 0) {
    return fail(`Missing expected block IDs: ${missing.join(', ')}`);
  }

  return pass(`All expected block IDs were returned (${expectedBlockIds.join(', ')}).`);
}

function assertFinalAnswerQuality(output) {
  const payload = getTracePayload(output);
  if (!payload) {
    return fail('Provider output is not an object.');
  }

  const finalAssistant = typeof payload.finalAssistant === 'string' ? payload.finalAssistant.trim() : '';
  if (finalAssistant.length === 0) {
    return fail('Missing final assistant message.');
  }
  return pass('Final assistant message is present.');
}

module.exports = {
  assertNoErrorSteps,
  assertRequiredSubsequencePresent,
  assertNoHallucinatedTools,
  assertFindContentTotal,
  assertExpectedBlockIds,
  assertFinalAnswerQuality,
};
