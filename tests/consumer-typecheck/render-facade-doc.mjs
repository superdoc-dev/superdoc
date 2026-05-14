#!/usr/bin/env node
/**
 * Render the public type facade design doc from public-facade-policy.json.
 *
 * The JSON is the source of truth. Markdown is regenerated and committed.
 * CI runs `--check` to fail on drift.
 *
 * Usage:
 *   node render-facade-doc.mjs --check   # exit non-zero if committed doc differs
 *   node render-facade-doc.mjs --write   # regenerate the committed doc
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const POLICY_PATH = resolve(HERE, 'public-facade-policy.json');
const DOC_PATH = resolve(HERE, '..', '..', 'docs', 'architecture', 'public-type-facade.md');

const POLICY = JSON.parse(readFileSync(POLICY_PATH, 'utf8'));

const tierById = Object.fromEntries(POLICY.tiers.map((t) => [t.id, t]));

const ALLOWED_KINDS = new Set(['runtime_value', 'type']);

function validatePolicy() {
  const tierIds = new Set(POLICY.tiers.map((t) => t.id));
  const importPathIds = new Set(POLICY.import_paths.map((p) => p.path));
  const statusIds = new Set((POLICY.classification_statuses || []).map((s) => s.id));

  for (const tier of POLICY.tiers) {
    if (tier.id === 'legacy-root' && tier.label.startsWith('@')) {
      throw new Error('legacy-root is a policy tier, not a source annotation tag');
    }
  }

  for (const ip of POLICY.import_paths) {
    if (!tierIds.has(ip.tier_for_new_exports)) {
      throw new Error(`Unknown tier_for_new_exports "${ip.tier_for_new_exports}" on import_path ${ip.path}`);
    }
    if (!ip.classification_status || !statusIds.has(ip.classification_status)) {
      throw new Error(`Unknown classification_status "${ip.classification_status}" on import_path ${ip.path}`);
    }
  }

  for (const m of POLICY.source_annotation_mapping || []) {
    if (!tierIds.has(m.tier)) {
      throw new Error(`Unknown tier "${m.tier}" in source_annotation_mapping`);
    }
  }

  const seen = new Set();
  for (const symbol of POLICY.symbols) {
    const key = `${symbol.kind}|${symbol.import_path}|${symbol.name}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate symbol policy entry: ${key}`);
    }
    seen.add(key);

    if (!ALLOWED_KINDS.has(symbol.kind)) {
      throw new Error(`Unknown kind "${symbol.kind}" for ${key}; expected one of ${[...ALLOWED_KINDS].join(', ')}`);
    }
    if (!importPathIds.has(symbol.import_path)) {
      throw new Error(`Unknown import_path "${symbol.import_path}" for ${key}`);
    }
    if (!tierIds.has(symbol.tier)) {
      throw new Error(`Unknown tier "${symbol.tier}" for ${key}`);
    }
    if (!symbol.name || !symbol.kind || !symbol.group || !symbol.import_path) {
      throw new Error(`Incomplete symbol policy entry: ${key}`);
    }
    if (symbol.tier === 'legacy-root' && !symbol.migration_target) {
      throw new Error(`Legacy-root symbol needs a migration_target: ${key}`);
    }
    if (symbol.tier === 'public' && !symbol.evidence) {
      throw new Error(`Public symbol needs evidence: ${key}`);
    }
  }
}

function tierLabel(id) {
  const t = tierById[id];
  return t ? t.label : id;
}

function symbolsBy(kind, tiers) {
  const allowed = new Set(tiers);
  return POLICY.symbols.filter((s) => s.kind === kind && allowed.has(s.tier));
}

function groupedSymbols(symbols) {
  const groups = new Map();
  for (const symbol of symbols) {
    const key = [symbol.group, symbol.tier, symbol.import_path].join('\0');
    if (!groups.has(key)) {
      groups.set(key, {
        group: symbol.group,
        tier: symbol.tier,
        import_path: symbol.import_path,
        migration_target: symbol.migration_target,
        members: [],
      });
    }
    groups.get(key).members.push(symbol);
  }
  return [...groups.values()];
}

function escapeCell(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function table(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map(escapeCell).join(' | ')} |`).join('\n');
  return [head, sep, body].join('\n');
}

function bullets(items) {
  return items.map((s) => `- ${s}`).join('\n');
}

function numbered(items) {
  return items.map((s, i) => `${i + 1}. ${s}`).join('\n');
}

function joinNames(members) {
  return members.map((m) => `\`${m.name}\``).join(', ');
}

function memberNotes(members) {
  const notes = members.filter((m) => m.notes);
  if (notes.length === 0) return '';
  return notes.map((m) => `\`${m.name}\` - ${m.notes}`).join('; ');
}

function section(title, body) {
  return `## ${title}\n\n${body.trim()}\n`;
}

function renderHeader() {
  const m = POLICY.metadata;
  return [
    '# SuperDoc Public Type Facade',
    '',
    `**Status:** ${m.status} (${m.ticket})  `,
    `**Owner:** ${m.owner}  `,
    `**Last updated:** ${m.last_updated}`,
    '',
    '<!--',
    'This file is generated from tests/consumer-typecheck/public-facade-policy.json.',
    'Do not edit by hand. Run `node tests/consumer-typecheck/render-facade-doc.mjs --write` to regenerate.',
    'CI runs `node tests/consumer-typecheck/render-facade-doc.mjs --check` to fail on drift.',
    '-->',
  ].join('\n');
}

function renderPurpose() {
  return section('Purpose', POLICY.narrative.purpose.join('\n\n'));
}

function renderGoals() {
  return section('Goals', bullets(POLICY.narrative.goals));
}

function renderNonGoals() {
  return section('Non-goals', bullets(POLICY.narrative.non_goals));
}

function renderTiers() {
  const rows = POLICY.tiers.map((t) => [t.label, t.summary]);
  return section(
    'Visibility tiers',
    [
      'These are policy tiers, not necessarily source-code annotation tags.',
      '',
      table(['Policy tier', 'Meaning'], rows),
    ].join('\n'),
  );
}

function renderSourceAnnotationMapping() {
  const rows = POLICY.source_annotation_mapping.map((m) => [
    m.tier,
    m.source_form,
    m.notes,
  ]);
  return section(
    'Source annotation mapping',
    [
      'Source annotations are normalized in a follow-up PR. The policy tier remains the audit source of truth.',
      '',
      table(['Policy tier', 'Source annotation form', 'Notes'], rows),
    ].join('\n'),
  );
}

function renderClassificationStatuses() {
  const statuses = POLICY.classification_statuses || [];
  if (statuses.length === 0) return '';
  const rows = statuses.map((s) => [s.id, s.summary]);
  return section(
    'Classification status',
    [
      'Each `import_paths[]` entry carries a `classification_status` that bounds how the audit may use `symbols[]`.',
      '',
      table(['Status', 'Meaning'], rows),
    ].join('\n'),
  );
}

function renderImportPaths() {
  const rows = POLICY.import_paths.map((p) => [
    `\`${p.path}\``,
    p.kind,
    tierLabel(p.tier_for_new_exports),
    p.classification_status || '',
    p.decision,
  ]);
  return section(
    'Import Path Policy',
    [
      table(['Import path', 'Kind', 'Tier for new exports', 'Classification status', 'Decision'], rows),
      '',
      'No other `superdoc/*` subpath should be added without updating `public-facade-policy.json`, `package.json` exports, the export-coverage audit, and the consumer matrix in the same PR.',
    ].join('\n'),
  );
}

function uniqueRemovalPostures(members) {
  const set = new Set();
  for (const m of members) if (m.removal_posture) set.add(m.removal_posture);
  return [...set].join('; ');
}

function buildSupportedRow(g) {
  const names = joinNames(g.members);
  const notes = memberNotes(g.members) || '';
  return [g.group, names, `Imported from \`${g.import_path}\`. ${notes}`.trim()];
}

function buildOtherRow(g) {
  const names = joinNames(g.members);
  const migrationOrEvidence = g.migration_target
    ? `Migration target: ${g.migration_target}`
    : (g.members[0]?.evidence || '');
  const notes = memberNotes(g.members) || '';
  const removal = uniqueRemovalPostures(g.members);
  const trailing = [notes, removal && `Removal: ${removal}`].filter(Boolean).join(' ');
  const cell = trailing ? `${migrationOrEvidence} ${trailing}`.trim() : migrationOrEvidence;
  return [g.group, tierLabel(g.tier), names, cell];
}

function renderRuntimeValues() {
  const supported = groupedSymbols(symbolsBy('runtime_value', ['public', 'beta']));
  const other = groupedSymbols(symbolsBy('runtime_value', ['legacy-root', 'internal']));

  return [
    section(
      'Supported runtime values',
      table(['Group', 'Names', 'Notes'], supported.map(buildSupportedRow)),
    ),
    section(
      'Legacy and internal runtime values',
      [
        'These currently appear or are reachable but are not part of the supported contract.',
        '',
        table(['Group', 'Tier', 'Names', 'Migration / evidence / removal'], other.map(buildOtherRow)),
      ].join('\n'),
    ),
  ].join('\n');
}

function renderTypes() {
  const supported = groupedSymbols(symbolsBy('type', ['public', 'beta']));
  const other = groupedSymbols(symbolsBy('type', ['legacy-root', 'internal']));

  return [
    section(
      'Public type groups',
      [
        'Public types are named from the customer workflow they support, not from the internal package that happens to define them.',
        '',
        table(['Group', 'Names', 'Notes'], supported.map(buildSupportedRow)),
      ].join('\n'),
    ),
    section(
      'Legacy and internal type groups',
      [
        'Exported for compatibility or reachable as implementation detail. Not part of the supported contract.',
        '',
        table(['Group', 'Tier', 'Names', 'Migration / evidence / removal'], other.map(buildOtherRow)),
      ].join('\n'),
    ),
  ].join('\n');
}

function renderSymbolPolicy() {
  const rows = POLICY.symbols.map((s) => {
    const migrationOrEvidence = s.migration_target
      ? `Migration target: ${s.migration_target}`
      : (s.evidence || '');
    const removal = s.removal_posture ? ` Removal: ${s.removal_posture.replace(/\.$/, '')}.` : '';
    return [
      `\`${s.name}\``,
      s.kind,
      s.group,
      tierLabel(s.tier),
      `\`${s.import_path}\``,
      `${migrationOrEvidence}${removal}`.trim(),
    ];
  });

  return section(
    'Symbol policy',
    [
      'This flat list is the machine-readable record reviewed in this PR. **Strict audit may consume `symbols[]` only for `import_paths` whose `classification_status` is `fully-classified`.** For partial paths, the table records reviewed symbols and known direction; it cannot drive strict gating until the path is promoted. Grouped sections above are for review ergonomics.',
      '',
      table(['Symbol', 'Kind', 'Group', 'Tier', 'Import path', 'Migration / evidence / removal'], rows),
    ].join('\n'),
  );
}

function renderLegacyFacade() {
  const lf = POLICY.legacy_super_editor_facade;
  const rows = lf.known_symbol_decisions.map((d) => [
    d.symbols.map((s) => `\`${s}\``).join(', '),
    d.current_use,
    d.proposed_target,
  ]);
  return section(
    'Legacy `superdoc/super-editor` facade',
    [
      '`superdoc/super-editor` is a compatibility facade. Rules:',
      '',
      bullets(lf.rules),
      '',
      'Known symbols and their migration decisions:',
      '',
      table(['Symbols', 'Current use', 'Proposed target'], rows),
    ].join('\n'),
  );
}

function renderImplementationShape() {
  const i = POLICY.implementation_shape;
  return section(
    'Implementation shape',
    [
      'Recommended source layout:',
      '',
      '```text',
      ...i.source_layout,
      '```',
      '',
      bullets(i.notes),
    ].join('\n'),
  );
}

function renderAuditConsumption() {
  const a = POLICY.audit_consumption;
  return section(
    'Audit consumption',
    [
      a.summary,
      '',
      '**Rationale.**',
      '',
      bullets(a.rationale),
      '',
      '**Future state.**',
      '',
      bullets(a.future_state),
    ].join('\n'),
  );
}

function renderCiGates() {
  const rows = POLICY.ci_gates.map((g) => [g.id, g.name, g.description]);
  return section(
    'CI gates after the facade exists',
    [
      'Existing SD-2828 gates stay. Add these once the facade is implemented:',
      '',
      table(['#', 'Gate', 'Description'], rows),
    ].join('\n'),
  );
}

function renderSequencing() {
  return section('Sequencing', numbered(POLICY.sequencing));
}

function renderOpenDecisions() {
  const rows = POLICY.open_decisions.map((d) => [
    d.id,
    d.question,
    d.default_if_unresolved,
  ]);
  return section(
    'Open decisions',
    table(['#', 'Question', 'Default if unresolved'], rows),
  );
}

function renderRfcReconciliation() {
  if (!POLICY.rfc_reconciliation || POLICY.rfc_reconciliation.length === 0) {
    return section('RFC reconciliation', 'No open RFC reconciliation items.');
  }
  const blocks = POLICY.rfc_reconciliation.map((r, idx) => {
    return [
      `### ${idx + 1}. \`${r.file}\` near line ${r.anchor_line}`,
      '',
      `**Issue.** ${r.issue}`,
      '',
      '**Current text.**',
      '',
      '> ' + r.current_text,
      '',
      '**Proposed text.**',
      '',
      '> ' + r.proposed_text,
      '',
      `**Rationale.** ${r.rationale}`,
      '',
      `**Source of truth.** ${r.source_of_truth}`,
    ].join('\n');
  });
  return section('RFC reconciliation', blocks.join('\n\n'));
}

function render() {
  const parts = [
    renderHeader(),
    '',
    renderPurpose(),
    renderGoals(),
    renderNonGoals(),
    renderTiers(),
    renderSourceAnnotationMapping(),
    renderClassificationStatuses(),
    renderImportPaths(),
    renderRuntimeValues(),
    renderTypes(),
    renderSymbolPolicy(),
    renderLegacyFacade(),
    renderImplementationShape(),
    renderAuditConsumption(),
    renderCiGates(),
    renderSequencing(),
    renderOpenDecisions(),
    renderRfcReconciliation(),
  ];
  // Ensure single trailing newline.
  return parts.join('\n').replace(/\n+$/, '') + '\n';
}

function main() {
  validatePolicy();

  const args = process.argv.slice(2);
  const mode = args.includes('--write') ? 'write' : args.includes('--check') ? 'check' : null;
  if (!mode) {
    console.error('Usage: render-facade-doc.mjs --write | --check');
    process.exit(2);
  }

  const rendered = render();

  if (mode === 'write') {
    writeFileSync(DOC_PATH, rendered, 'utf8');
    console.log(`Wrote ${DOC_PATH}`);
    return;
  }

  let committed;
  try {
    committed = readFileSync(DOC_PATH, 'utf8');
  } catch (err) {
    console.error(`Cannot read ${DOC_PATH}: ${err.message}`);
    console.error('Run `node tests/consumer-typecheck/render-facade-doc.mjs --write` to generate it.');
    process.exit(1);
  }

  if (committed === rendered) {
    console.log(`OK: ${DOC_PATH} matches public-facade-policy.json`);
    return;
  }

  console.error(`DRIFT: ${DOC_PATH} does not match public-facade-policy.json`);
  console.error('Run `node tests/consumer-typecheck/render-facade-doc.mjs --write` and commit the result.');
  process.exit(1);
}

main();
