/**
 * TypeScript compatibility matrix.
 *
 * Tests that superdoc's type declarations work across all common
 * tsconfig combinations consumers might use:
 *   - moduleResolution: bundler, node16, nodenext
 *   - skipLibCheck: true (all scenarios), false (regression check)
 *   - strict: true and false
 *   - Import paths: "superdoc", "superdoc/super-editor"
 *   - Node.js headless usage (Buffer return types)
 *
 * Run: npm run typecheck:matrix
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const scenarios = [
  // Core scenarios — must all pass
  {
    name: 'bundler / strict / skipLibCheck',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-main.ts', 'src/imports-sub-export.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / strict / skipLibCheck',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-main.ts'],
    mustPass: true,
  },
  {
    name: 'nodenext / strict / skipLibCheck',
    module: 'NodeNext',
    moduleResolution: 'nodenext',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-main.ts'],
    mustPass: true,
  },
  {
    name: 'bundler / headless Node.js',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/headless-node.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / headless Node.js',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/headless-node.ts'],
    mustPass: true,
  },
  {
    name: 'bundler / sub-export only',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-sub-export.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / sub-export only',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-sub-export.ts'],
    mustPass: true,
  },
  {
    name: 'bundler / headless-toolbar',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-headless-toolbar.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / headless-toolbar',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-headless-toolbar.ts'],
    mustPass: true,
  },
  {
    name: 'bundler / loose (non-strict)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: false,
    files: ['src/imports-main.ts', 'src/imports-sub-export.ts'],
    mustPass: true,
  },
  // IT-852 regression: prosemirror types must NOT be overridden by ambient shims
  {
    name: 'bundler / prosemirror coexistence (IT-852)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/prosemirror-coexistence.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / prosemirror coexistence (IT-852)',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/prosemirror-coexistence.ts'],
    mustPass: true,
  },
  // skipLibCheck=false — informational only (pre-existing dep errors)
  {
    name: 'bundler / skipLibCheck=false',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: false,
    strict: true,
    files: ['src/imports-main.ts'],
    mustPass: false, // may fail from dep errors in node_modules
  },
];

const tscPath = join(__dirname, 'node_modules', '.bin', 'tsc');
let passed = 0;
let failed = 0;
let warnings = 0;

console.log('TypeScript Compatibility Matrix');
console.log('='.repeat(80));
console.log();

for (const scenario of scenarios) {
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: scenario.module,
      moduleResolution: scenario.moduleResolution,
      strict: scenario.strict,
      skipLibCheck: scenario.skipLibCheck,
      noEmit: true,
      esModuleInterop: true,
      types: ['node'],
    },
    include: scenario.files,
  };

  const tsconfigPath = join(__dirname, 'tsconfig.matrix.json');
  writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));

  let output = '';
  let exitCode = 0;
  try {
    output = execSync(`${tscPath} -p ${tsconfigPath} --noEmit 2>&1`, {
      cwd: __dirname,
      encoding: 'utf-8',
    });
  } catch (e) {
    output = e.stdout || '';
    exitCode = e.status || 1;
  }

  const srcErrors = (output.match(/^src\//gm) || []).length;
  const nmErrors = (output.match(/^node_modules\//gm) || []).length;

  let status;
  let icon;
  if (exitCode === 0) {
    icon = '✓';
    status = 'PASS';
    passed++;
  } else if (srcErrors === 0) {
    icon = '⚠';
    status = `DEPS (nm:${nmErrors})`;
    warnings++;
  } else {
    icon = '✗';
    status = `FAIL (src:${srcErrors} nm:${nmErrors})`;
    failed++;
    if (scenario.mustPass) {
      console.log(`  ${icon} ${scenario.name}: ${status}`);
      console.log(
        output
          .split('\n')
          .filter((l) => l.startsWith('src/'))
          .map((l) => `    ${l}`)
          .join('\n'),
      );
      continue;
    }
  }

  console.log(`  ${icon} ${scenario.name}: ${status}`);
}

console.log();
console.log('='.repeat(80));
console.log(`Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);

if (failed > 0) {
  console.log('\nFAILED — consumer types are broken for some configurations');
  process.exit(1);
} else {
  console.log('\nAll required scenarios pass.');
}
