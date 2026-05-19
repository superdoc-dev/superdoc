#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PYTHON_CLI_PLATFORM_TARGETS } from './python-embedded-cli-targets.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLATFORMS_ROOT = path.resolve(__dirname, '../langs/python/platforms');

const UNIX_TEMPLATE = (moduleName, binaryName) => `"""Build script that ensures the CLI binary is executable before wheel packaging."""

import stat
from pathlib import Path

from setuptools import setup
from setuptools.command.build_py import build_py


class BuildPyWithExecutableBinary(build_py):
    """Custom build_py that ensures the CLI binary has execute permissions."""

    def run(self):
        super().run()
        if self.build_lib:
            binary_path = Path(self.build_lib) / '${moduleName}' / 'bin' / '${binaryName}'
            if binary_path.exists():
                current_mode = binary_path.stat().st_mode
                binary_path.chmod(current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


setup(cmdclass={'build_py': BuildPyWithExecutableBinary})
`;

const WINDOWS_TEMPLATE = `"""Build script for Windows platform package.

Windows doesn't use Unix file permissions, so no chmod is needed.
This setup.py exists for consistency across all platform packages.
"""

from setuptools import setup

setup()
`;

async function main() {
  for (const target of PYTHON_CLI_PLATFORM_TARGETS) {
    const setupPath = path.join(PLATFORMS_ROOT, target.companionPypiName, 'setup.py');
    const isWindows = target.binaryName.endsWith('.exe');
    const content = isWindows
      ? WINDOWS_TEMPLATE
      : UNIX_TEMPLATE(target.companionModuleName, target.binaryName);

    await writeFile(setupPath, content);
    console.log(`Generated ${path.relative(process.cwd(), setupPath)}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
