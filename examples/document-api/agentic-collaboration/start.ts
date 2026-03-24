/**
 * Production entrypoint for Railway deployment.
 * Spawns the collaboration server and agent as child processes.
 */

import { spawn, type ChildProcess } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || '3050';

function spawnProcess(name: string, cwd: string, command: string, args: string[]): ChildProcess {
  console.log(`[Start] Spawning ${name}...`);

  const proc = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, PORT },
  });

  proc.on('error', (err) => {
    console.error(`[Start] ${name} error:`, err);
  });

  proc.on('exit', (code) => {
    console.log(`[Start] ${name} exited with code ${code}`);
    // If either process exits, shut down everything
    process.exit(code || 1);
  });

  return proc;
}

async function waitForServer(url: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`[Start] Server is ready`);
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Server failed to start');
}

async function main() {
  console.log(`[Start] Starting agentic-collaboration on port ${PORT}`);

  // Start the server
  const server = spawnProcess(
    'server',
    join(__dirname, 'server'),
    'npx',
    ['tsx', 'server.ts']
  );

  // Wait for server to be ready
  await waitForServer(`http://localhost:${PORT}/health`);

  // Start the agent
  const agent = spawnProcess(
    'agent',
    join(__dirname, 'agent'),
    'npx',
    ['tsx', 'agent.ts']
  );

  // Handle shutdown
  process.on('SIGTERM', () => {
    console.log('[Start] Received SIGTERM, shutting down...');
    server.kill('SIGTERM');
    agent.kill('SIGTERM');
  });

  process.on('SIGINT', () => {
    console.log('[Start] Received SIGINT, shutting down...');
    server.kill('SIGINT');
    agent.kill('SIGINT');
  });
}

main().catch((err) => {
  console.error('[Start] Fatal error:', err);
  process.exit(1);
});
