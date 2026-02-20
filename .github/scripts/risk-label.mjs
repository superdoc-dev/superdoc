import { readFileSync } from 'node:fs';

// --- Path Classification ---
// Order matters: critical is checked first, then sensitive, then low.
// When in doubt, a path is classified higher (critical > sensitive > low).

const CRITICAL_PATHS = [
  'packages/layout-engine/style-engine/',
  'packages/layout-engine/layout-engine/',
  'packages/layout-engine/pm-adapter/',
  'packages/layout-engine/layout-bridge/',
  'packages/layout-engine/measuring/',
  'packages/layout-engine/painters/',
  'packages/super-editor/src/core/super-converter/',
  'packages/super-editor/src/core/presentation-editor/',
  'packages/superdoc/src/core/',
  'packages/word-layout/',
];

const SENSITIVE_PATHS = [
  'packages/super-editor/src/extensions/',
  'packages/super-editor/src/core/',
  'packages/superdoc/src/',
  'packages/layout-engine/contracts/',
  'packages/esign/',
  'shared/',
];

const TEST_PATTERNS = [
  /__tests__\//,
  /\/test-fixtures\//,
  /\.(test|spec)\.[^/]+$/,
  /^tests\//,
  /^e2e-tests\//,
];

// --- Helpers ---

function isTestFile(file) {
  return TEST_PATTERNS.some((p) => p.test(file));
}

function classifyFile(file) {
  for (const prefix of CRITICAL_PATHS) {
    if (file.startsWith(prefix)) return 'critical';
  }
  for (const prefix of SENSITIVE_PATHS) {
    if (file.startsWith(prefix)) return 'sensitive';
  }
  return 'low';
}

// --- Main Classification ---

export function classify(files) {
  if (!files.length) {
    return { level: 'low', downgraded: false };
  }

  const entries = files.map((file) => ({
    file,
    risk: classifyFile(file),
    test: isTestFile(file),
  }));

  // Highest risk wins
  let level = 'low';
  if (entries.some((e) => e.risk === 'critical')) level = 'critical';
  else if (entries.some((e) => e.risk === 'sensitive')) level = 'sensitive';

  // Downgrade if ALL risky files are test-only
  const riskyFiles = entries.filter((e) => e.risk !== 'low');
  let downgraded = false;
  if (riskyFiles.length > 0 && riskyFiles.every((e) => e.test)) {
    if (level === 'critical') level = 'sensitive';
    else if (level === 'sensitive') level = 'low';
    downgraded = true;
  }

  return { level, downgraded };
}

// --- CLI ---

if (process.argv[1]?.endsWith('risk-label.mjs')) {
  let files;
  if (process.argv.length > 2) {
    files = process.argv.slice(2);
  } else {
    const input = readFileSync('/dev/stdin', 'utf-8');
    files = input.trim().split('\n').filter(Boolean);
  }

  const result = classify(files);
  console.log(JSON.stringify(result, null, 2));
}
