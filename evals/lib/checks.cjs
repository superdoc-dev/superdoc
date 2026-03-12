/**
 * Individual assertion checks for SuperDoc tool call validation.
 *
 * Each function receives (output, context) from Promptfoo:
 *   output  = array of tool calls [{function: {name, arguments}}] (after normalize.cjs)
 *   context = { vars, prompt, test, ... }
 *
 * Returns: { pass, score, reason } or true (skip/not applicable).
 */

const VALID_GROUPS = [
  'core', 'format', 'create', 'tables', 'sections',
  'lists', 'comments', 'trackChanges', 'toc', 'history', 'session',
];

// --- Helpers ---

function findTool(output, name) {
  if (!Array.isArray(output)) return null;
  return output.find((c) => c.function?.name === name);
}

function getArgs(call) {
  try { return JSON.parse(call.function.arguments || '{}'); }
  catch { return {}; }
}

function findMutations(output) {
  const call = findTool(output, 'apply_mutations');
  if (!call) return null;
  return getArgs(call);
}

function getSteps(output) {
  const args = findMutations(output);
  return args?.steps || [];
}

// --- Hygiene ---

module.exports.noHallucinatedParams = (output) => {
  if (!Array.isArray(output) || output.length === 0) return true;
  for (const call of output) {
    const name = call.function?.name;
    const args = getArgs(call);
    if ('doc' in args) return { pass: false, score: 0, reason: `${name} passed hallucinated "doc"` };
    if ('sessionId' in args) return { pass: false, score: 0, reason: `${name} passed hallucinated "sessionId"` };
  }
  return { pass: true, score: 1, reason: 'No hallucinated params' };
};

// --- Mutation structure ---

module.exports.validOpNames = (output) => {
  if (!findMutations(output)) return true;
  const invalid = ['replace', 'insert', 'delete'];
  const bad = getSteps(output).find((s) => invalid.includes(s.op));
  if (bad) return { pass: false, score: 0, reason: `Invalid op "${bad.op}". Use text.rewrite, text.insert, or text.delete` };
  return { pass: true, score: 1, reason: 'Valid op names' };
};

module.exports.stepFields = (output) => {
  if (!findMutations(output)) return true;
  for (const step of getSteps(output)) {
    if (!step.op) return { pass: false, score: 0, reason: 'Step missing "op"' };
    if (!step.where) return { pass: false, score: 0, reason: 'Step missing "where"' };
  }
  return { pass: true, score: 1, reason: 'All steps have required fields' };
};

module.exports.noRequireAny = (output) => {
  if (!findMutations(output)) return true;
  const bad = getSteps(output).find((s) => s.where?.require === 'any');
  if (bad) return { pass: false, score: 0, reason: '"require: any" is only valid in query_match, not mutations' };
  return { pass: true, score: 1, reason: 'Correct require usage' };
};

module.exports.noMixedBatch = (output) => {
  if (!findMutations(output)) return true;
  const ops = getSteps(output).map((s) => s.op);
  const hasText = ops.some((o) => o === 'text.rewrite' || o === 'text.insert' || o === 'text.delete');
  const hasFormat = ops.includes('format.apply');
  if (hasText && hasFormat) return { pass: false, score: 0, reason: 'Must not combine text ops and format.apply in one batch' };
  return { pass: true, score: 1, reason: 'Ops correctly separated' };
};

module.exports.correctFormatArgs = (output) => {
  if (!findMutations(output)) return true;
  const formatSteps = getSteps(output).filter((s) => s.op === 'format.apply');
  const bad = formatSteps.find((s) => s.args?.bold !== undefined && !s.args?.inline);
  if (bad) return { pass: false, score: 0, reason: 'format.apply args should be {inline: {bold: true}}, not {bold: true}' };
  return { pass: true, score: 1, reason: 'Correct format.apply structure' };
};

// --- Reading ---

module.exports.textSearchArgs = (output) => {
  const call = findTool(output, 'query_match');
  if (!call) return { pass: false, score: 0, reason: 'query_match not called' };
  const args = getArgs(call);
  if (args.select?.type !== 'text') return { pass: false, score: 0, reason: `select.type is "${args.select?.type}", expected "text"` };
  if (!args.select?.pattern) return { pass: false, score: 0, reason: 'select.pattern is missing' };
  return { pass: true, score: 1, reason: 'Correct text search' };
};

module.exports.nodeSearchArgs = (output, context) => {
  const expectedType = context?.vars?.expectedNodeType || 'heading';
  const call = findTool(output, 'query_match');
  if (!call) return { pass: false, score: 0, reason: 'query_match not called' };
  const args = getArgs(call);
  if (args.select?.type !== 'node') return { pass: false, score: 0, reason: `select.type is "${args.select?.type}", expected "node"` };
  if (args.select?.nodeType !== expectedType) return { pass: false, score: 0, reason: `nodeType is "${args.select?.nodeType}", expected "${expectedType}"` };
  return { pass: true, score: 1, reason: 'Correct node search' };
};

// --- Correctness ---

module.exports.noTextInsertForStructure = (output) => {
  if (!findMutations(output)) return true;
  const bad = getSteps(output).find((s) => s.op === 'text.insert');
  if (bad) return { pass: false, score: 0, reason: 'Should use standalone create_heading/create_paragraph, not text.insert' };
  return { pass: true, score: 1, reason: 'No structural misuse' };
};

module.exports.validDiscoverGroups = (output, context) => {
  const expected = context?.vars?.expectedGroup;
  const call = findTool(output, 'discover_tools');
  if (!call) return { pass: false, score: 0, reason: 'discover_tools not called' };
  const args = getArgs(call);
  if (!Array.isArray(args.groups)) return { pass: false, score: 0, reason: 'groups is not an array' };
  const invalid = args.groups.find((g) => !VALID_GROUPS.includes(g));
  if (invalid) return { pass: false, score: 0, reason: `Invalid group "${invalid}"` };
  if (expected && !args.groups.includes(expected)) return { pass: false, score: 0, reason: `Missing expected group "${expected}"` };
  return { pass: true, score: 1, reason: 'Valid groups' };
};

// --- Workflow ---

module.exports.isTrackedMode = (output) => {
  const args = findMutations(output);
  if (!args) return true;
  if (args.changeMode !== 'tracked') return { pass: false, score: 0, reason: `changeMode is "${args.changeMode}", expected "tracked"` };
  return { pass: true, score: 1, reason: 'Tracked mode set' };
};

module.exports.isNotTrackedMode = (output) => {
  const args = findMutations(output);
  if (!args) return true;
  if (args.changeMode === 'tracked') return { pass: false, score: 0, reason: 'changeMode should not be "tracked" for direct edits' };
  return { pass: true, score: 1, reason: 'Direct mode correct' };
};

module.exports.atomicMultiStep = (output) => {
  const args = findMutations(output);
  if (!args) return true;
  if (!args.atomic) return { pass: false, score: 0, reason: 'Missing atomic: true' };
  if ((args.steps || []).length < 2) return { pass: false, score: 0, reason: `Only ${(args.steps || []).length} step(s), expected 2+` };
  return { pass: true, score: 1, reason: 'Atomic multi-step correct' };
};

module.exports.usesDeleteOp = (output) => {
  if (!findMutations(output)) return true;
  if (getSteps(output).some((s) => s.op === 'text.delete' || s.op === 'text.rewrite'))
    return { pass: true, score: 1, reason: 'Uses delete op' };
  return { pass: false, score: 0, reason: 'No text.delete or text.rewrite found' };
};

module.exports.usesRewriteOp = (output) => {
  if (!findMutations(output)) return true;
  if (getSteps(output).some((s) => s.op === 'text.rewrite'))
    return { pass: true, score: 1, reason: 'Uses text.rewrite' };
  return { pass: false, score: 0, reason: 'No text.rewrite found' };
};
