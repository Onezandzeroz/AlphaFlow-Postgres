#!/usr/bin/env bun
/**
 * Smart Dev Server for AlphaAi Accounting
 *
 * - Main Next.js app: Fixed port 3000
 * - Uses Webpack mode (required for Prisma compatibility with Next.js 16)
 *
 * Usage: bun run dev (from package.json)
 */

import { spawn } from "child_process";
import * as net from "net";

const BASE_PORT = 3000;

/**
 * Check if a port is available by attempting to bind to it
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, '127.0.0.1');
  });
}

/**
 * Main entry point
 */
async function main() {
  console.log('\n🚀 AlphaAi Accounting - Dev Server\n');

  // Check if port 3000 is available
  const available = await isPortAvailable(BASE_PORT);

  if (!available) {
    console.error('❌ Port 3000 is already in use!');
    console.error('');
    console.error('Possible solutions:');
    console.error('  1. Kill the process using port 3000:');
    console.error('     bun run kill-port');
    console.error('');
    console.error('  2. Find what\'s using the port:');
    console.error('     Linux/macOS: lsof -i :3000');
    console.error('     Windows:     netstat -ano | findstr :3000');
    console.error('');
    process.exit(1);
  }

  console.log('✅ Port 3000 is available - starting Next.js dev server...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🌐 App URL:  http://localhost:3000');
  console.log('  📦 Bundler:  Webpack (required for Prisma compatibility)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Start Next.js dev server on port 3000 with Webpack (required for Prisma)
  const nextProcess = spawn('bun', ['x', 'next', 'dev', '-p', '3000', '--webpack'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_OPTIONS: '--max-old-space-size=4096',
    }
  });

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down dev server...');
    nextProcess.kill('SIGINT');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    nextProcess.kill('SIGTERM');
    process.exit(0);
  });

  nextProcess.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
