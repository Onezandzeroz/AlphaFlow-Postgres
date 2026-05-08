#!/usr/bin/env bun
/**
 * Kill process on a specific port (cross-platform)
 *
 * Usage: bun run kill-port [port]
 * Default: kills port 3000
 *
 * Works on both Windows and Linux/macOS
 */

import { $ } from "bun";

const port = process.argv[2] || '3000';
const isWindows = process.platform === 'win32';

console.log(`🔍 Finding process on port ${port}...`);

try {
  let pids: string[] = [];

  if (isWindows) {
    // Windows: use netstat to find PIDs
    const result = await $`netstat -ano`.quiet().text();
    const lines = result.split('\n');
    for (const line of lines) {
      if (line.includes(`:${port}`) && (line.includes('LISTENING') || line.includes('LISTEN'))) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && !pids.includes(pid)) {
          pids.push(pid);
        }
      }
    }
  } else {
    // Linux/macOS: use lsof
    const result = await $`lsof -ti :${port}`.quiet().text();
    pids = result.trim().split('\n').filter(Boolean);
  }

  if (pids.length === 0) {
    console.log(`✅ No process found on port ${port}`);
    process.exit(0);
  }

  console.log(`📋 Found ${pids.length} process(es): ${pids.join(', ')}`);

  // Kill the process(es)
  for (const pid of pids) {
    try {
      if (isWindows) {
        await $`taskkill /F /PID ${pid}`.quiet();
      } else {
        await $`kill -9 ${pid}`.quiet();
      }
      console.log(`💀 Killed process ${pid}`);
    } catch {
      console.log(`⚠️  Could not kill process ${pid} (may require admin/sudo)`);
    }
  }

  console.log(`✅ Port ${port} is now free`);

} catch {
  console.log(`✅ No process found on port ${port} (port is free)`);
}
