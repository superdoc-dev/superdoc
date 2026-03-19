/**
 * Assertion checks for SuperDoc tool call validation.
 *
 * Targets the public grouped SDK tool surface:
 *   superdoc_search, superdoc_get_content, superdoc_edit,
 *   superdoc_format, superdoc_create, superdoc_list,
 *   superdoc_comment, superdoc_track_changes, superdoc_mutations
 *
 * Each function receives (output, context) from Promptfoo:
 *   output  = array of tool calls [{function: {name, arguments}}] (after normalize.cjs)
 *   context = { vars, prompt, test, ... }
 *
 * Returns: { pass, score, reason } or true (skip/not applicable).
 */

const { resolve } = require('node:path');

// --- Tool name constants ---

const SEARCH = 'superdoc_search';
const GET_CONTENT = 'superdoc_get_content';
const EDIT = 'superdoc_edit';
const FORMAT = 'superdoc_format';
const CREATE = 'superdoc_create';
const LIST = 'superdoc_list';
const COMMENT = 'superdoc_comment';
const TRACK_CHANGES = 'superdoc_track_changes';
const MUTATIONS = 'superdoc_mutations';

// --- Helpers ---

function findTool(output, name) {
  if (!Array.isArray(output)) return null;
  return output.find((c) => c.function?.name === name);
}

function findTools(output, name) {
  if (!Array.isArray(output)) return [];
  return output.filter((c) => c.function?.name === name);
}

function getArgs(call) {
  try { return JSON.parse(call.function.arguments || '{}'); }
  catch { return {}; }
}

function findMutations(output) {
  const call = findTool(output, MUTATIONS);
  if (!call) return null;
  return getArgs(call);
}

function getSteps(output) {
  const args = findMutations(output);
  return args?.steps || [];
}

function loadFormatSchemaInfo() {
  try {
    const bundle = require(resolve(__dirname, '../../packages/sdk/tools/tools.openai.json'));
    const formatTool = bundle?.tools?.find((tool) => tool?.function?.name === FORMAT);
    const parameters = formatTool?.function?.parameters;
    const toolProperties = parameters?.properties;
    const inlineProperties = toolProperties?.inline?.properties;
    if (toolProperties && inlineProperties) {
      return {
        toolKeys: new Set(Object.keys(toolProperties)),
        inlineKeys: new Set(Object.keys(inlineProperties)),
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to load generated tool schema for ${FORMAT}: ${message}`);
  }

  throw new Error(`Generated tool schema for ${FORMAT} is missing required inline metadata.`);
}

const { toolKeys: FORMAT_TOOL_KEYS, inlineKeys: FORMAT_INLINE_KEYS } = loadFormatSchemaInfo();

function isRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function findUnknownKeys(candidate, allowedKeys) {
  if (!isRecord(candidate)) return [];
  return Object.keys(candidate).filter((key) => !allowedKeys.has(key));
}

function findMisnestedInlineKeys(candidate) {
  if (!isRecord(candidate)) return [];
  return Object.keys(candidate).filter((key) => key !== 'inline' && FORMAT_INLINE_KEYS.has(key));
}

function validateInlinePayload(inline, scope) {
  if (!isRecord(inline)) {
    return `${scope} must provide a non-null "inline" object`;
  }

  const inlineKeys = Object.keys(inline);
  if (inlineKeys.length === 0) {
    return `${scope} must provide at least one inline formatting key`;
  }

  const unknownInlineKeys = findUnknownKeys(inline, FORMAT_INLINE_KEYS);
  if (unknownInlineKeys.length > 0) {
    return `${scope} has unknown inline key(s): ${unknownInlineKeys.join(', ')}`;
  }

  return null;
}

function validateFormatToolInlineArgs(args) {
  const misplacedInlineKeys = findMisnestedInlineKeys(args);
  if (misplacedInlineKeys.length > 0) {
    return `superdoc_format action "inline" must nest formatting under "inline", not top-level keys: ${misplacedInlineKeys.join(', ')}`;
  }

  const unknownKeys = findUnknownKeys(args, FORMAT_TOOL_KEYS);
  if (unknownKeys.length > 0) {
    return `superdoc_format action "inline" has unknown top-level key(s): ${unknownKeys.join(', ')}`;
  }

  return validateInlinePayload(args.inline, 'superdoc_format action "inline"');
}

function validateMutationFormatArgs(stepArgs) {
  const misplacedInlineKeys = findMisnestedInlineKeys(stepArgs);
  if (misplacedInlineKeys.length > 0) {
    return `format.apply args must nest formatting under "inline", not top-level keys: ${misplacedInlineKeys.join(', ')}`;
  }

  return validateInlinePayload(stepArgs?.inline, 'format.apply args');
}

// --- Hygiene ---

module.exports.noHallucinatedParams = (output) => {
  if (!Array.isArray(output) || output.length === 0) return true;
  for (const call of output) {
    const name = call.function?.name;
    const args = getArgs(call);
    // Tolerate empty string values -- models pass {doc: "", sessionId: ""}
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
  if (bad) return { pass: false, score: 0, reason: '"require: any" is only valid in superdoc_search, not mutation steps' };
  return { pass: true, score: 1, reason: 'Correct require usage' };
};

module.exports.noMixedBatch = (output) => {
  if (!findMutations(output)) return true;
  const ops = getSteps(output).map((s) => s.op);
  const hasText = ops.some((o) => o === 'text.rewrite' || o === 'text.insert' || o === 'text.delete');
  const hasFormat = ops.includes('format.apply');
  if (hasText && hasFormat) return { pass: false, score: 0, reason: 'Must not combine text ops and format.apply in one superdoc_mutations batch' };
  return { pass: true, score: 1, reason: 'Ops correctly separated' };
};

module.exports.correctFormatArgs = (output) => {
  if (!Array.isArray(output)) return true;

  let hasValidFormat = false;
  const formatCalls = findTools(output, FORMAT);
  const mutationCalls = findTools(output, MUTATIONS);

  // Path 1: superdoc_format with action "inline" — in Level 1 we validate the
  // inline payload shape, but do not require runtime-resolved target/ref values.
  for (const fmtCall of formatCalls) {
    const args = getArgs(fmtCall);
    if (args.action !== 'inline') continue;

    const error = validateFormatToolInlineArgs(args);
    if (error) return { pass: false, score: 0, reason: error };
    hasValidFormat = true;
  }

  // Path 2: superdoc_mutations with format.apply steps — must use args.inline wrapper
  for (const mutationCall of mutationCalls) {
    const steps = getArgs(mutationCall).steps || [];
    const formatSteps = steps.filter((s) => s.op === 'format.apply');
    for (const step of formatSteps) {
      const error = validateMutationFormatArgs(step.args);
      if (error) return { pass: false, score: 0, reason: error };
      hasValidFormat = true;
    }
  }

  if (!hasValidFormat && formatCalls.length === 0 && mutationCalls.length === 0) return true;
  if (!hasValidFormat) return { pass: false, score: 0, reason: 'No formatting operation found' };
  return { pass: true, score: 1, reason: 'Correct format args' };
};

// --- Reading ---

module.exports.textSearchArgs = (output) => {
  const call = findTool(output, SEARCH);
  if (!call) return { pass: false, score: 0, reason: 'superdoc_search not called' };
  const args = getArgs(call);
  if (args.select?.type !== 'text') return { pass: false, score: 0, reason: `select.type is "${args.select?.type}", expected "text"` };
  if (!args.select?.pattern) return { pass: false, score: 0, reason: 'select.pattern is missing' };
  return { pass: true, score: 1, reason: 'Correct text search' };
};

module.exports.nodeSearchArgs = (output, context) => {
  const expectedType = context?.vars?.expectedNodeType || 'heading';
  const call = findTool(output, SEARCH);
  if (!call) return { pass: false, score: 0, reason: 'superdoc_search not called' };
  const args = getArgs(call);
  if (args.select?.type !== 'node') return { pass: false, score: 0, reason: `select.type is "${args.select?.type}", expected "node"` };
  if (args.select?.nodeType !== expectedType) return { pass: false, score: 0, reason: `nodeType is "${args.select?.nodeType}", expected "${expectedType}"` };
  return { pass: true, score: 1, reason: 'Correct node search' };
};

// --- Content ---

module.exports.usesGetContentText = (output) => {
  const call = findTool(output, GET_CONTENT);
  if (!call) return { pass: false, score: 0, reason: 'superdoc_get_content not called' };
  const args = getArgs(call);
  if (args.action !== 'text') return { pass: false, score: 0, reason: `action is "${args.action}", expected "text"` };
  return { pass: true, score: 1, reason: 'superdoc_get_content with action "text"' };
};

// --- Correctness ---

module.exports.noTextInsertForStructure = (output) => {
  if (!Array.isArray(output)) return true;
  // Pass if the model used superdoc_create
  const usedCreate = output.some((c) => c.function?.name === CREATE);
  if (usedCreate) return { pass: true, score: 1, reason: 'Used superdoc_create' };
  if (!findMutations(output)) return true;
  const bad = getSteps(output).find((s) => s.op === 'text.insert');
  if (bad) return { pass: false, score: 0, reason: 'Should use superdoc_create, not text.insert via superdoc_mutations' };
  return { pass: true, score: 1, reason: 'No structural misuse' };
};

module.exports.usesCreateAction = (output, context) => {
  const expectedAction = context?.vars?.expectedCreateAction;
  if (!expectedAction) return true;
  const call = findTool(output, CREATE);
  if (!call) return { pass: false, score: 0, reason: 'superdoc_create not called' };
  const args = getArgs(call);
  if (args.action !== expectedAction) return { pass: false, score: 0, reason: `action is "${args.action}", expected "${expectedAction}"` };
  return { pass: true, score: 1, reason: `superdoc_create with action "${expectedAction}"` };
};

module.exports.usesCommentCreate = (output) => {
  const call = findTool(output, COMMENT);
  if (!call) return { pass: false, score: 0, reason: 'superdoc_comment not called' };
  const args = getArgs(call);
  if (args.action !== 'create') return { pass: false, score: 0, reason: `action is "${args.action}", expected "create"` };
  return { pass: true, score: 1, reason: 'superdoc_comment with action "create"' };
};

module.exports.usesEditUndo = (output) => {
  const call = findTool(output, EDIT);
  if (!call) return { pass: false, score: 0, reason: 'superdoc_edit not called' };
  const args = getArgs(call);
  if (args.action !== 'undo') return { pass: false, score: 0, reason: `action is "${args.action}", expected "undo"` };
  return { pass: true, score: 1, reason: 'superdoc_edit with action "undo"' };
};

module.exports.usesTrackChangesDecide = (output) => {
  const call = findTool(output, TRACK_CHANGES);
  if (!call) return { pass: false, score: 0, reason: 'superdoc_track_changes not called' };
  const args = getArgs(call);
  if (args.action !== 'decide') return { pass: false, score: 0, reason: `action is "${args.action}", expected "decide"` };
  return { pass: true, score: 1, reason: 'superdoc_track_changes with action "decide"' };
};

// --- Workflow ---

module.exports.isTrackedMode = (output) => {
  // Check superdoc_mutations first
  const mutArgs = findMutations(output);
  if (mutArgs) {
    if (mutArgs.changeMode !== 'tracked') return { pass: false, score: 0, reason: `superdoc_mutations changeMode is "${mutArgs.changeMode}", expected "tracked"` };
    return { pass: true, score: 1, reason: 'Tracked mode set' };
  }
  // Check superdoc_edit
  const editCall = findTool(output, EDIT);
  if (editCall) {
    const args = getArgs(editCall);
    if (args.changeMode !== 'tracked') return { pass: false, score: 0, reason: `superdoc_edit changeMode is "${args.changeMode}", expected "tracked"` };
    return { pass: true, score: 1, reason: 'Tracked mode set' };
  }
  return true;
};

module.exports.isNotTrackedMode = (output) => {
  // Check superdoc_mutations
  const mutArgs = findMutations(output);
  if (mutArgs && mutArgs.changeMode === 'tracked') {
    return { pass: false, score: 0, reason: 'changeMode should not be "tracked" for direct edits' };
  }
  // Check superdoc_edit
  const editCall = findTool(output, EDIT);
  if (editCall) {
    const args = getArgs(editCall);
    if (args.changeMode === 'tracked') return { pass: false, score: 0, reason: 'changeMode should not be "tracked" for direct edits' };
  }
  return { pass: true, score: 1, reason: 'Direct mode correct' };
};

module.exports.atomicMultiStep = (output) => {
  if (!Array.isArray(output)) return true;
  const mutationCalls = output.filter((c) => c.function?.name === MUTATIONS);
  if (mutationCalls.length === 0) return true;
  // Best case: single call with 2+ steps and atomic: true
  for (const call of mutationCalls) {
    const args = getArgs(call);
    if (args.atomic && (args.steps || []).length >= 2) {
      return { pass: true, score: 1, reason: 'Atomic multi-step correct' };
    }
  }
  const totalSteps = mutationCalls.reduce((sum, c) => sum + (getArgs(c).steps || []).length, 0);
  if (mutationCalls.length > 1 && totalSteps >= 2) {
    return { pass: false, score: 0, reason: `${totalSteps} steps split across ${mutationCalls.length} calls -- should be 1 atomic call with all steps` };
  }
  const firstArgs = getArgs(mutationCalls[0]);
  if (!firstArgs.atomic) return { pass: false, score: 0, reason: 'Missing atomic: true' };
  return { pass: false, score: 0, reason: `Only ${(firstArgs.steps || []).length} step(s), expected 2+` };
};

module.exports.usesDeleteOp = (output) => {
  // Check superdoc_mutations steps
  if (findMutations(output)) {
    if (getSteps(output).some((s) => s.op === 'text.delete' || s.op === 'text.rewrite'))
      return { pass: true, score: 1, reason: 'Uses delete op via superdoc_mutations' };
  }
  // Check superdoc_edit with delete/replace action
  if (Array.isArray(output)) {
    const editCall = output.find((c) => c.function?.name === EDIT);
    if (editCall) {
      const args = getArgs(editCall);
      if (args.action === 'delete' || args.action === 'replace')
        return { pass: true, score: 1, reason: 'Uses delete via superdoc_edit' };
    }
  }
  return { pass: false, score: 0, reason: 'No delete or rewrite operation found' };
};

module.exports.usesRewriteOp = (output) => {
  // Check superdoc_mutations steps
  if (findMutations(output)) {
    if (getSteps(output).some((s) => s.op === 'text.rewrite'))
      return { pass: true, score: 1, reason: 'Uses text.rewrite via superdoc_mutations' };
  }
  // Check superdoc_edit with replace action
  if (Array.isArray(output)) {
    const editCall = output.find((c) => c.function?.name === EDIT);
    if (editCall) {
      const args = getArgs(editCall);
      if (args.action === 'replace')
        return { pass: true, score: 1, reason: 'Uses replace via superdoc_edit' };
    }
  }
  return { pass: false, score: 0, reason: 'No text.rewrite or replace found' };
};
