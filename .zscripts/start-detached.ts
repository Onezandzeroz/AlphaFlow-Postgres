#!/usr/bin/env bun
import { spawn } from "child_process";
import { writeFileSync, openSync } from "fs";

const PROJECT_DIR = "/home/z/my-project";

const logFd = openSync(`${PROJECT_DIR}/dev.log`, "w");

const child = spawn("bun", ["x", "next", "dev", "-p", "3000", "--webpack"], {
  cwd: PROJECT_DIR,
  detached: true,
  stdio: ["ignore", logFd, logFd],
  env: {
    ...process.env,
    NODE_OPTIONS: "--max-old-space-size=4096",
  },
});

// Write PID file
writeFileSync(`${PROJECT_DIR}/.zscripts/dev.pid`, child.pid.toString());

// Fully detach - the child process will not be killed when the parent exits
child.unref();

console.log(`Next.js dev server started with PID: ${child.pid}`);
console.log("Process detached - will survive parent exit");
process.exit(0);
