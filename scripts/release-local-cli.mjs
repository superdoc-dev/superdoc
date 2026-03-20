#!/usr/bin/env node

/**
 * Thin wrapper — releases the CLI package locally via semantic-release.
 * See release-local.mjs for the reusable runner logic.
 */

import { releasePackage } from './release-local.mjs';

try {
  releasePackage({ packageCwd: 'apps/cli', extraArgs: process.argv.slice(2) });
} catch (error) {
  const message = error && typeof error.message === 'string' ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
