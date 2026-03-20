/**
 * Combined entry point for Cloud Run deployment.
 * Starts both the collaboration server and the AI agent.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('Starting SuperDoc Collaboration Server + Agent...');

// Start server
const server = spawn('npx', ['tsx', join(__dirname, 'server.ts')], {
  stdio: 'inherit',
  env: { ...process.env },
});

// Wait a bit for server to start, then start agent
setTimeout(() => {
  const agent = spawn('npx', ['tsx', join(__dirname, 'agent.ts')], {
    stdio: 'inherit',
    env: { ...process.env },
  });

  agent.on('exit', (code) => {
    console.log(`Agent exited with code ${code}`);
    process.exit(code || 0);
  });
}, 2000);

server.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code || 0);
});

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  server.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  server.kill('SIGINT');
});
