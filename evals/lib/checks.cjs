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
    // Tolerate empty string values -- OpenAI models pass {doc: "", sessionId: ""}
    // as schema placeholders. cleanArgs strips these at runtime.
    if ('doc' in args && args.doc !== '') return { pass: false, score: 0, reason: `${name} passed hallucinated "doc"` };
    if ('sessionId' in args && args.sessionId !== '') return { pass: false, score: 0, reason: `${name} passed hallucinated "sessionId"` };
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
  if (formatSteps.length === 0) return true; // no format.apply steps, skip
  for (const step of formatSteps) {
    if (!step.args?.inline) {
      // Formatting properties must be nested inside args.inline, not at args top level
      const topLevelKeys = Object.keys(step.args || {}).filter((k) => k !== 'inline');
      const hint = topLevelKeys.length > 0 ? ` (found top-level: ${topLevelKeys.join(', ')})` : '';
      return { pass: false, score: 0, reason: `format.apply args must have "inline" wrapper: {inline: {bold: true}}, not {bold: true}${hint}` };
    }
  }
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

/** Accept query_match (node selector) or blocks_list (nodeTypes filter) for listing nodes. */
module.exports.nodeSearchOrBlocksList = (output, context) => {
  if (!Array.isArray(output)) return true;
  const expectedType = context?.vars?.expectedNodeType || 'heading';

  const qm = findTool(output, 'query_match');
  if (qm) {
    const args = getArgs(qm);
    if (args.select?.type !== 'node') {
      return { pass: false, score: 0, reason: `query_match select.type is "${args.select?.type}", expected "node"` };
    }
    if (args.select?.nodeType !== expectedType) {
      return { pass: false, score: 0, reason: `query_match nodeType is "${args.select?.nodeType}", expected "${expectedType}"` };
    }
    return { pass: true, score: 1, reason: `query_match with node selector (nodeType=${expectedType})` };
  }

  const bl = findTool(output, 'blocks_list');
  if (bl) {
    const args = getArgs(bl);
    if (!Array.isArray(args.nodeTypes) || !args.nodeTypes.includes(expectedType)) {
      return { pass: false, score: 0, reason: `blocks_list called but nodeTypes ${JSON.stringify(args.nodeTypes)} does not include "${expectedType}"` };
    }
    return { pass: true, score: 1, reason: `blocks_list with nodeTypes filter including "${expectedType}"` };
  }

  return { pass: false, score: 0, reason: 'Neither query_match nor blocks_list called' };
};

// --- Correctness ---

module.exports.noTextInsertForStructure = (output) => {
  if (!Array.isArray(output)) return true;
  // Pass if the model also called create_heading or create_paragraph (self-corrected)
  const usedStandalone = output.some((c) => {
    const name = c.function?.name;
    return name === 'create_heading' || name === 'create_paragraph';
  });
  if (usedStandalone) return { pass: true, score: 1, reason: 'Used standalone create tool' };
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
  if (!Array.isArray(output)) return true;
  // Collect all apply_mutations calls
  const mutationCalls = output.filter((c) => c.function?.name === 'apply_mutations');
  if (mutationCalls.length === 0) return true;
  // Best case: single call with 2+ steps and atomic: true
  for (const call of mutationCalls) {
    const args = getArgs(call);
    if (args.atomic && (args.steps || []).length >= 2) {
      return { pass: true, score: 1, reason: 'Atomic multi-step correct' };
    }
  }
  // Count total steps across all calls to give a better error message
  const totalSteps = mutationCalls.reduce((sum, c) => sum + (getArgs(c).steps || []).length, 0);
  if (mutationCalls.length > 1 && totalSteps >= 2) {
    return { pass: false, score: 0, reason: `${totalSteps} steps split across ${mutationCalls.length} calls -- should be 1 atomic call with all steps` };
  }
  const firstArgs = getArgs(mutationCalls[0]);
  if (!firstArgs.atomic) return { pass: false, score: 0, reason: 'Missing atomic: true' };
  return { pass: false, score: 0, reason: `Only ${(firstArgs.steps || []).length} step(s), expected 2+` };
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
