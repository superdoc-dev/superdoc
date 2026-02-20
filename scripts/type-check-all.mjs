import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const projects = [
  'packages/super-editor/tsconfig.migrated.json',
  'packages/superdoc/tsconfig.json',
  'packages/ai/tsconfig.json',
  'packages/collaboration-yjs/tsconfig.json',
  'shared/common/tsconfig.json',
];

// Projects that depend on superdoc being built (types generated from JS)
const superdocDependents = ['packages/ai/tsconfig.json'];
const superdocTypesPath = 'packages/superdoc/dist/superdoc/src/index.d.ts';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

async function main() {
  const superdocBuilt = existsSync(superdocTypesPath);

  for (const project of projects) {
    // Skip projects that depend on superdoc types if superdoc isn't built
    if (superdocDependents.includes(project) && !superdocBuilt) {
      console.log(`\n[type-check] Skipping ${project} (superdoc not built - run 'pnpm build:superdoc' first)`);
      continue;
    }

    console.log(`\n[type-check] tsc --noEmit -p ${project}`);
    await run('npx', ['tsc', '--noEmit', '-p', project]);
  }
}

main().catch((error) => {
  console.error('\nType checking failed.');
  console.error(error.message || error);
  process.exit(1);
});
