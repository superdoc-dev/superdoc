/**
 * Shared harness lifecycle utilities for visual testing scripts.
 */

import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { sleep, createLogBuffer } from './utils.js';
import { colors } from './terminal.js';

export const HARNESS_PORT = 9989;
export const HARNESS_HOSTS = ['127.0.0.1', '::1'];
export const HARNESS_URL = `http://localhost:${HARNESS_PORT}`;
export const HARNESS_START_TIMEOUT_MS = 60_000;
export const HARNESS_POLL_INTERVAL_MS = 200;
export const HARNESS_SHUTDOWN_TIMEOUT_MS = 5_000;
export const HARNESS_LOG_BUFFER_LIMIT = 8_000;

/**
 * Check if a port is open on a specific host.
 *
 * @param port - Port number to check
 * @param host - Host address to check
 * @returns Promise that resolves to true if port is open
 */
export async function isPortOpenOnHost(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onFailure = () => {
      socket.destroy();
      resolve(false);
    };

    socket.setTimeout(1_000);
    socket.once('error', onFailure);
    socket.once('timeout', onFailure);
    socket.connect(port, host, () => {
      socket.end();
      resolve(true);
    });
  });
}

/**
 * Check if the harness port is open on any of the harness hosts.
 *
 * @param port - Port number to check (defaults to HARNESS_PORT)
 * @returns Promise that resolves to true if port is open
 */
export async function isPortOpen(port: number = HARNESS_PORT): Promise<boolean> {
  const checks = await Promise.all(HARNESS_HOSTS.map((host) => isPortOpenOnHost(port, host)));
  return checks.some(Boolean);
}

/**
 * Wait for a port to become available.
 *
 * @param port - Port number to wait for
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @param child - Optional child process to monitor for early exit
 * @param spawnErrorRef - Optional error reference from spawn
 */
export async function waitForPort(
  port: number,
  timeoutMs: number,
  child?: ChildProcess,
  spawnErrorRef?: { error?: Error },
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (spawnErrorRef?.error) {
      throw spawnErrorRef.error;
    }

    if (child && child.exitCode !== null) {
      throw new Error(`Harness exited before ready (code ${child.exitCode})`);
    }

    if (await isPortOpen(port)) {
      return;
    }

    await sleep(HARNESS_POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for harness at ${HARNESS_URL}`);
}

/**
 * Start the harness if not already running.
 *
 * @returns Object containing the child process (if started) and whether it was started
 */
export async function ensureHarnessRunning(): Promise<{ child: ChildProcess | null; started: boolean }> {
  if (await isPortOpen(HARNESS_PORT)) {
    console.log(colors.info(`Harness already running at ${HARNESS_URL}`));
    return { child: null, started: false };
  }

  const child = spawn('pnpm', ['--filter', '@superdoc-testing/harness', 'dev', '--', '--strictPort'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  const logBuffer = createLogBuffer(HARNESS_LOG_BUFFER_LIMIT);
  child.stdout?.on('data', (chunk) => logBuffer.append(chunk));
  child.stderr?.on('data', (chunk) => logBuffer.append(chunk));

  const spawnErrorRef: { error?: Error } = {};
  child.once('error', (error) => {
    spawnErrorRef.error = error;
  });

  try {
    await waitForPort(HARNESS_PORT, HARNESS_START_TIMEOUT_MS, child, spawnErrorRef);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const output = logBuffer.dump();
    throw new Error(output ? `${message}\nHarness output:\n${output}` : message);
  }

  return { child, started: true };
}

/**
 * Stop a running harness process.
 *
 * @param child - The child process to stop
 */
export async function stopHarness(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');

  const exitPromise = new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
  });

  await Promise.race([exitPromise, sleep(HARNESS_SHUTDOWN_TIMEOUT_MS)]);

  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await exitPromise;
  }
}

/**
 * Run a pnpm command.
 *
 * @param args - Arguments to pass to pnpm
 * @returns Promise that resolves when the command completes successfully
 */
export function runCommand(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code ?? 'unknown'} (${signal ?? 'no signal'})`));
      }
    });
  });
}
