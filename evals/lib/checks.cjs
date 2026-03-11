/**
 * Individual assertion checks for SuperDoc tool call validation.
 *
 * Each check: (ctx, vars) => { pass, score, reason } | true (skip).
 * ctx is built by context.cjs. vars come from the test YAML.
 */

const VALID_GROUPS = [
  'core', 'format', 'create', 'tables', 'sections',
  'lists', 'comments', 'trackChanges', 'toc', 'history', 'session',
];

// --- Hygiene ---

/** No hallucinated doc or sessionId parameters on any tool call. */
module.exports.noHallucinatedParams = (ctx) => {
  if (!ctx.calls.length) return true;
  for (const call of ctx.calls) {
    const name = call.function?.name;
    let args;
    try { args = JSON.parse(call.function.arguments || '{}'); } catch { continue; }
    if ('doc' in args) return { pass: false, score: 0, reason: `${name} passed hallucinated "doc"` };
    if ('sessionId' in args) return { pass: false, score: 0, reason: `${name} passed hallucinated "sessionId"` };
  }
  return { pass: true, score: 1, reason: 'No hallucinated params' };
};

// --- Mutation structure ---

/** Step ops must be text.rewrite/text.insert/text.delete, not bare replace/insert/delete. */
module.exports.validOpNames = (ctx) => {
  if (!ctx.mutations) return true;
  const invalid = ['replace', 'insert', 'delete'];
  const bad = ctx.steps.find((s) => invalid.includes(s.op));
  if (bad) return { pass: false, score: 0, reason: `Invalid op "${bad.op}". Use text.rewrite, text.insert, or text.delete` };
  return { pass: true, score: 1, reason: 'Valid op names' };
};

/** Every step must have op and where fields. */
module.exports.stepFields = (ctx) => {
  if (!ctx.mutations) return true;
  for (const step of ctx.steps) {
    if (!step.op) return { pass: false, score: 0, reason: 'Step missing "op"' };
    if (!step.where) return { pass: false, score: 0, reason: 'Step missing "where"' };
  }
  return { pass: true, score: 1, reason: 'All steps have required fields' };
};

/** Mutations must use require "first"/"exactlyOne"/"all", not "any". */
module.exports.noRequireAny = (ctx) => {
  if (!ctx.mutations) return true;
  const bad = ctx.steps.find((s) => s.where?.require === 'any');
  if (bad) return { pass: false, score: 0, reason: '"require: any" is only valid in query_match, not mutations' };
  return { pass: true, score: 1, reason: 'Correct require usage' };
};

/** Text ops and format.apply must not be in the same batch. */
module.exports.noMixedBatch = (ctx) => {
  if (!ctx.mutations) return true;
  const ops = ctx.steps.map((s) => s.op);
  const hasText = ops.some((o) => o === 'text.rewrite' || o === 'text.insert' || o === 'text.delete');
  const hasFormat = ops.includes('format.apply');
  if (hasText && hasFormat) return { pass: false, score: 0, reason: 'Must not combine text ops and format.apply in one batch' };
  return { pass: true, score: 1, reason: 'Ops correctly separated' };
};

/** format.apply uses { inline: { bold: true } }, not { bold: true }. */
module.exports.correctFormatArgs = (ctx) => {
  if (!ctx.mutations) return true;
  const formatSteps = ctx.steps.filter((s) => s.op === 'format.apply');
  const bad = formatSteps.find((s) => s.args?.bold !== undefined && !s.args?.inline);
  if (bad) return { pass: false, score: 0, reason: 'format.apply args should be {inline: {bold: true}}, not {bold: true}' };
  return { pass: true, score: 1, reason: 'Correct format.apply structure' };
};

// --- Reading ---

/** query_match uses select.type "text" with a pattern. */
module.exports.textSearchArgs = (ctx) => {
  const args = ctx.toolMap['query_match'];
  if (!args) return { pass: false, score: 0, reason: 'query_match not called' };
  if (args.select?.type !== 'text') return { pass: false, score: 0, reason: `select.type is "${args.select?.type}", expected "text"` };
  if (!args.select?.pattern) return { pass: false, score: 0, reason: 'select.pattern is missing' };
  return { pass: true, score: 1, reason: 'Correct text search' };
};

/** query_match uses select.type "node" with correct nodeType. */
module.exports.nodeSearchArgs = (ctx, vars) => {
  const expectedType = vars?.expectedNodeType || 'heading';
  const args = ctx.toolMap['query_match'];
  if (!args) return { pass: false, score: 0, reason: 'query_match not called' };
  if (args.select?.type !== 'node') return { pass: false, score: 0, reason: `select.type is "${args.select?.type}", expected "node"` };
  if (args.select?.nodeType !== expectedType) return { pass: false, score: 0, reason: `nodeType is "${args.select?.nodeType}", expected "${expectedType}"` };
  return { pass: true, score: 1, reason: 'Correct node search' };
};

// --- Correctness ---

/** Structural elements (headings, paragraphs) should use standalone tools, not text.insert. */
module.exports.noTextInsertForStructure = (ctx) => {
  if (!ctx.mutations) return true;
  const bad = ctx.steps.find((s) => s.op === 'text.insert');
  if (bad) return { pass: false, score: 0, reason: 'Should use standalone create_heading/create_paragraph, not text.insert' };
  return { pass: true, score: 1, reason: 'No structural misuse' };
};

/** discover_tools groups are valid and contain the expected group. */
module.exports.validDiscoverGroups = (ctx, vars) => {
  const expected = vars?.expectedGroup;
  const args = ctx.toolMap['discover_tools'];
  if (!args) return { pass: false, score: 0, reason: 'discover_tools not called' };
  if (!Array.isArray(args.groups)) return { pass: false, score: 0, reason: 'groups is not an array' };
  const invalid = args.groups.find((g) => !VALID_GROUPS.includes(g));
  if (invalid) return { pass: false, score: 0, reason: `Invalid group "${invalid}"` };
  if (expected && !args.groups.includes(expected)) return { pass: false, score: 0, reason: `Missing expected group "${expected}"` };
  return { pass: true, score: 1, reason: 'Valid groups' };
};

// --- Workflow ---

/** changeMode is "tracked". */
module.exports.isTrackedMode = (ctx) => {
  if (!ctx.mutations) return true;
  if (ctx.mutations.changeMode !== 'tracked') return { pass: false, score: 0, reason: `changeMode is "${ctx.mutations.changeMode}", expected "tracked"` };
  return { pass: true, score: 1, reason: 'Tracked mode set' };
};

/** changeMode is NOT "tracked". */
module.exports.isNotTrackedMode = (ctx) => {
  if (!ctx.mutations) return true;
  if (ctx.mutations.changeMode === 'tracked') return { pass: false, score: 0, reason: 'changeMode should not be "tracked" for direct edits' };
  return { pass: true, score: 1, reason: 'Direct mode correct' };
};

/** atomic: true with 2+ steps. */
module.exports.atomicMultiStep = (ctx) => {
  if (!ctx.mutations) return true;
  if (!ctx.mutations.atomic) return { pass: false, score: 0, reason: 'Missing atomic: true' };
  if (ctx.steps.length < 2) return { pass: false, score: 0, reason: `Only ${ctx.steps.length} step(s), expected 2+` };
  return { pass: true, score: 1, reason: 'Atomic multi-step correct' };
};

/** Uses text.delete or text.rewrite. */
module.exports.usesDeleteOp = (ctx) => {
  if (!ctx.mutations) return true;
  if (ctx.steps.some((s) => s.op === 'text.delete' || s.op === 'text.rewrite'))
    return { pass: true, score: 1, reason: 'Uses delete op' };
  return { pass: false, score: 0, reason: 'No text.delete or text.rewrite found' };
};

/** Uses text.rewrite. */
module.exports.usesRewriteOp = (ctx) => {
  if (!ctx.mutations) return true;
  if (ctx.steps.some((s) => s.op === 'text.rewrite'))
    return { pass: true, score: 1, reason: 'Uses text.rewrite' };
  return { pass: false, score: 0, reason: 'No text.rewrite found' };
};
