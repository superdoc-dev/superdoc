#!/usr/bin/env node

import { execSync } from 'node:child_process';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const portArg = process.argv[2] ?? '9990';
const port = String(portArg).trim();

const getPidsOnPort = () => {
  try {
    const output = execSync(`lsof -ti tcp:${port}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (!output) return [];
    return [...new Set(output.split(/\s+/).filter(Boolean))];
  } catch {
    return [];
  }
};

const killPids = (pids, signal) => {
  for (const pid of pids) {
    try {
      process.kill(Number(pid), signal);
    } catch {
      // Process may have already exited or be inaccessible.
    }
  }
};

const waitUntilFreed = async (timeoutMs) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (getPidsOnPort().length === 0) return true;
    await wait(120);
  }

  return getPidsOnPort().length === 0;
};

const initialPids = getPidsOnPort();
if (initialPids.length === 0) {
  console.log(`[free-port] tcp:${port} is already free.`);
  process.exit(0);
}

console.log(`[free-port] Releasing tcp:${port} (pid: ${initialPids.join(', ')})`);

killPids(initialPids, 'SIGTERM');
if (await waitUntilFreed(2500)) {
  console.log(`[free-port] tcp:${port} released.`);
  process.exit(0);
}

const remaining = getPidsOnPort();
if (remaining.length > 0) {
  console.log(`[free-port] Escalating to SIGKILL for pid: ${remaining.join(', ')}`);
  killPids(remaining, 'SIGKILL');
}

if (!(await waitUntilFreed(1500))) {
  const stuck = getPidsOnPort();
  console.error(`[free-port] Failed to release tcp:${port}. Remaining pid: ${stuck.join(', ')}`);
  process.exit(1);
}

console.log(`[free-port] tcp:${port} released.`);
