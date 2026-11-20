#!/usr/bin/env node
const { spawn } = require('child_process');
const { BACKEND_DIR, ensureEnvFile, ensurePython } = require('./python-env');

ensureEnvFile();
const pythonPath = ensurePython();

const [cmd, ...args] = process.argv.slice(2);

if (!cmd) {
  console.error('[backend] Usage: node scripts/run.js <tool> [args...]');
  process.exit(1);
}

// Map tools to python -m <tool>
const pythonArgs = ['-m', cmd, ...args];

const child = spawn(pythonPath, pythonArgs, {
  cwd: BACKEND_DIR,
  stdio: 'inherit',
  env: {
    ...process.env,
    PYTHONUTF8: '1',
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
  },
});

process.on('SIGINT', () => {
  if (!child.killed) child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  if (!child.killed) child.kill('SIGTERM');
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
