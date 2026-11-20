#!/usr/bin/env node
const { spawn } = require('child_process');
const { BACKEND_DIR, ensureEnvFile, ensurePython, ensureModel } = require('./python-env');

ensureEnvFile();
const pythonPath = ensurePython();
ensureModel(pythonPath);

console.log('[backend] Starting AgriChain Sentinel API at http://localhost:8000 ...');

const uvicornArgs = ['-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8000'];
const child = spawn(pythonPath, uvicornArgs, {
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
