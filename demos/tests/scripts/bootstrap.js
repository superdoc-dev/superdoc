import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import testConfig from '../test-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testsDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(testsDir, '..');

const packages = [
  { name: 'demo-gallery-tests', dir: testsDir },
  ...testConfig.packages.map((relPath) => ({
    name: relPath,
    dir: path.resolve(repoRoot, relPath),
  })),
];

const hasNodeModules = (dir) => fs.existsSync(path.join(dir, 'node_modules'));

const install = ({ name, dir }) => {
  if (hasNodeModules(dir)) {
    console.log(`✓ ${name} already installed`);
    return;
  }

  console.log(`→ Installing ${name} dependencies...`);
  execSync('pnpm install --ignore-workspace', { cwd: dir, stdio: 'inherit' });
};

packages.forEach(install);

console.log(
  'Bootstrap complete. Install Playwright browsers if needed: pnpm --dir examples/tests exec playwright install chromium',
);
