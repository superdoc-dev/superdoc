/**
 * Shared assertion helpers for SuperDoc tool call validation.
 *
 * Used via: file://tools/assertions.js:functionName
 *
 * Every function receives (output, context) where output is the normalized
 * tool call array [{function: {name, arguments}}].
 */

// --- Helpers ---

function findTool(output, name) {
  if (!Array.isArray(output)) return null;
  return output.find((c) => c.function?.name === name);
}

function getArgs(toolCall) {
  try {
    return JSON.parse(toolCall.function.arguments);
  } catch {
    return {};
  }
}

function findToolArgs(output, name) {
  const call = findTool(output, name);
  return call ? getArgs(call) : null;
}

// --- Reading tool assertions ---

/** Checks query_match uses select.type "text" with a pattern */
module.exports.textSearchArgs = (output) => {
  const args = findToolArgs(output, 'query_match');
  if (!args) return { pass: false, score: 0, reason: 'query_match not called' };
  if (args.select?.type !== 'text')
    return { pass: false, score: 0, reason: `select.type is "${args.select?.type}", expected "text"` };
  if (!args.select?.pattern) return { pass: false, score: 0, reason: 'select.pattern is missing' };
  return { pass: true, score: 1, reason: 'Correct text search' };
};

/** Checks query_match uses select.type "node" with correct nodeType */
module.exports.nodeSearchArgs = (output, context) => {
  const expectedType = context.vars?.expectedNodeType || 'heading';
  const args = findToolArgs(output, 'query_match');
  if (!args) return { pass: false, score: 0, reason: 'query_match not called' };
  if (args.select?.type !== 'node')
    return { pass: false, score: 0, reason: `select.type is "${args.select?.type}", expected "node"` };
  if (args.select?.nodeType !== expectedType)
    return { pass: false, score: 0, reason: `nodeType is "${args.select?.nodeType}", expected "${expectedType}"` };
  return { pass: true, score: 1, reason: 'Correct node search' };
};

// --- Argument accuracy assertions ---

/** Checks apply_mutations uses valid op names (text.rewrite, not replace) */
module.exports.validOpNames = (output) => {
  const args = findToolArgs(output, 'apply_mutations');
  if (!args) return true; // No apply_mutations call = skip
  const invalid = ['replace', 'insert', 'delete'];
  const bad = (args.steps || []).find((s) => invalid.includes(s.op));
  if (bad)
    return { pass: false, score: 0, reason: `Invalid op "${bad.op}". Use text.rewrite, text.insert, or text.delete` };
  return { pass: true, score: 1, reason: 'Valid op names' };
};

/** Checks apply_mutations steps have required fields */
module.exports.stepFields = (output) => {
  const args = findToolArgs(output, 'apply_mutations');
  if (!args) return true;
  for (const step of args.steps || []) {
    if (!step.op) return { pass: false, score: 0, reason: 'Step missing "op"' };
    if (!step.where) return { pass: false, score: 0, reason: 'Step missing "where"' };
  }
  return { pass: true, score: 1, reason: 'All steps have required fields' };
};

/** Checks no hallucinated doc or sessionId params */
module.exports.noHallucinatedParams = (output) => {
  if (!Array.isArray(output)) return true;
  for (const call of output) {
    const args = getArgs(call);
    if ('doc' in args) return { pass: false, score: 0, reason: `${call.function.name} passed hallucinated "doc"` };
    if ('sessionId' in args)
      return { pass: false, score: 0, reason: `${call.function.name} passed hallucinated "sessionId"` };
  }
  return { pass: true, score: 1, reason: 'No hallucinated params' };
};

/** Checks discover_tools groups are valid and contain expected group */
module.exports.validDiscoverGroups = (output, context) => {
  const expected = context.vars?.expectedGroup || context.config?.expectedGroup;
  const valid = [
    'core',
    'format',
    'create',
    'tables',
    'sections',
    'lists',
    'comments',
    'trackChanges',
    'toc',
    'history',
    'session',
  ];
  const args = findToolArgs(output, 'discover_tools');
  if (!args) return { pass: false, score: 0, reason: 'discover_tools not called' };
  if (!Array.isArray(args.groups)) return { pass: false, score: 0, reason: 'groups is not an array' };
  const invalid = args.groups.find((g) => !valid.includes(g));
  if (invalid) return { pass: false, score: 0, reason: `Invalid group "${invalid}"` };
  if (expected && !args.groups.includes(expected))
    return { pass: false, score: 0, reason: `Missing expected group "${expected}"` };
  return { pass: true, score: 1, reason: 'Valid groups' };
};

// --- Tool correctness assertions ---

/** Checks apply_mutations does not use text.insert for structural elements */
module.exports.noTextInsertForStructure = (output) => {
  const args = findToolArgs(output, 'apply_mutations');
  if (!args) return true;
  const bad = (args.steps || []).find((s) => s.op === 'text.insert');
  if (bad)
    return { pass: false, score: 0, reason: 'Should use standalone create_heading/create_paragraph, not text.insert' };
  return { pass: true, score: 1, reason: 'No structural misuse' };
};

/** Checks mutation where does not use require "any" */
module.exports.noRequireAny = (output) => {
  const args = findToolArgs(output, 'apply_mutations');
  if (!args) return true;
  const bad = (args.steps || []).find((s) => s.where?.require === 'any');
  if (bad) return { pass: false, score: 0, reason: '"require: any" is only valid in query_match, not mutations' };
  return { pass: true, score: 1, reason: 'Correct require usage' };
};

/** Checks format.apply uses {inline: {bold: true}} not {bold: true} */
module.exports.correctFormatArgs = (output) => {
  const args = findToolArgs(output, 'apply_mutations');
  if (!args) return true;
  const formatSteps = (args.steps || []).filter((s) => s.op === 'format.apply');
  const bad = formatSteps.find((s) => s.args?.bold !== undefined && !s.args?.inline);
  if (bad)
    return { pass: false, score: 0, reason: 'format.apply args should be {inline: {bold: true}}, not {bold: true}' };
  return { pass: true, score: 1, reason: 'Correct format.apply structure' };
};

/** Checks text.rewrite and format.apply are not in the same batch */
module.exports.noMixedBatch = (output) => {
  const args = findToolArgs(output, 'apply_mutations');
  if (!args) return true;
  const ops = (args.steps || []).map((s) => s.op);
  const hasText = ops.some((o) => o === 'text.rewrite' || o === 'text.insert' || o === 'text.delete');
  const hasFormat = ops.includes('format.apply');
  if (hasText && hasFormat)
    return { pass: false, score: 0, reason: 'Must not combine text ops and format.apply in one batch' };
  return { pass: true, score: 1, reason: 'Ops correctly separated' };
};

// --- Workflow assertions ---

/** Checks changeMode is "tracked" */
module.exports.isTrackedMode = (output) => {
  const args = findToolArgs(output, 'apply_mutations');
  if (!args) return true;
  if (args.changeMode !== 'tracked')
    return { pass: false, score: 0, reason: `changeMode is "${args.changeMode}", expected "tracked"` };
  return { pass: true, score: 1, reason: 'Tracked mode set' };
};

/** Checks changeMode is NOT "tracked" */
module.exports.isNotTrackedMode = (output) => {
  const args = findToolArgs(output, 'apply_mutations');
  if (!args) return true;
  if (args.changeMode === 'tracked')
    return { pass: false, score: 0, reason: 'changeMode should not be "tracked" for direct edits' };
  return { pass: true, score: 1, reason: 'Direct mode correct' };
};

/** Checks apply_mutations has atomic: true and multiple steps */
module.exports.atomicMultiStep = (output) => {
  const args = findToolArgs(output, 'apply_mutations');
  if (!args) return true;
  if (!args.atomic) return { pass: false, score: 0, reason: 'Missing atomic: true' };
  if ((args.steps || []).length < 2)
    return { pass: false, score: 0, reason: `Only ${(args.steps || []).length} step(s), expected 2+` };
  return { pass: true, score: 1, reason: 'Atomic multi-step correct' };
};

/** Checks delete uses text.delete or text.rewrite */
module.exports.usesDeleteOp = (output) => {
  const args = findToolArgs(output, 'apply_mutations');
  if (!args) return true;
  const steps = args.steps || [];
  if (steps.some((s) => s.op === 'text.delete' || s.op === 'text.rewrite'))
    return { pass: true, score: 1, reason: 'Uses delete op' };
  return { pass: false, score: 0, reason: 'No text.delete or text.rewrite found' };
};

/** Checks text.rewrite is used */
module.exports.usesRewriteOp = (output) => {
  const args = findToolArgs(output, 'apply_mutations');
  if (!args) return true;
  if ((args.steps || []).some((s) => s.op === 'text.rewrite'))
    return { pass: true, score: 1, reason: 'Uses text.rewrite' };
  return { pass: false, score: 0, reason: 'No text.rewrite found' };
};
