#!/usr/bin/env node

/**
 * @deprecated Compatibility wrapper — delegates to verify-python-companion-wheels.mjs.
 * Remove after one release cycle.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PYTHON_EMBEDDED_CLI_TARGETS, toPythonWheelEmbeddedCliEntries } from './python-embedded-cli-targets.mjs';
import { verifyRootWheel, verifyCompanionWheels } from './verify-python-companion-wheels.mjs';

/**
 * @deprecated Use verifyRootWheel() from verify-python-companion-wheels.mjs.
 */
export async function verifyPythonWheelEmbeddedCli({ wheelPath, targets = PYTHON_EMBEDDED_CLI_TARGETS } = {}) {
  return verifyRootWheel({ wheelPath, targets });
}

/** @deprecated Kept for backward compatibility with old test imports. */
export function findMissingWheelEntries(entries, targets = PYTHON_EMBEDDED_CLI_TARGETS) {
  const expected = toPythonWheelEmbeddedCliEntries(targets);
  const present = new Set(entries);
  return expected.filter((entry) => !present.has(entry));
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  (async () => {
    console.warn('verify-python-wheel-embedded-cli.mjs is deprecated — use verify-python-companion-wheels.mjs');
    await verifyRootWheel();
    await verifyCompanionWheels();
  })().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
