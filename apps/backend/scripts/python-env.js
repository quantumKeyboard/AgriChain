#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const BACKEND_DIR = path.resolve(__dirname, '..');
const VENV_DIR = path.join(BACKEND_DIR, '.venv');
const IS_WIN = process.platform === 'win32';

function getVenvPythonPath() {
  return IS_WIN
    ? path.join(VENV_DIR, 'Scripts', 'python.exe')
    : path.join(VENV_DIR, 'bin', 'python');
}

function isPythonVersionValid(pyCmd) {
  try {
    const res = spawnSync(
      pyCmd,
      ['-c', 'import sys; sys.exit(0 if (3,11) <= sys.version_info[:2] < (3,14) else 1)'],
      { stdio: 'ignore' }
    );
    return res.status === 0;
  } catch {
    return false;
  }
}

function findBasePython() {
  const candidates = [
    'python3.13',
    'python3.12',
    'python3.11',
    'python3',
    'python',
    '/Users/bhaveshmore/.local/bin/python3.11',
    '/usr/local/bin/python3.12',
    '/usr/local/bin/python3.11',
    '/opt/homebrew/bin/python3.12',
    '/opt/homebrew/bin/python3.11',
  ];

  for (const cmd of candidates) {
    if (isPythonVersionValid(cmd)) {
      return cmd;
    }
  }
  return null;
}

function ensureEnvFile() {
  const envFile = path.join(BACKEND_DIR, '.env');
  const envExample = path.join(BACKEND_DIR, '.env.example');
  if (!fs.existsSync(envFile) && fs.existsSync(envExample)) {
    console.log('[backend] Creating .env from .env.example ...');
    fs.copyFileSync(envExample, envFile);
  }
}

function ensurePython() {
  const venvPython = getVenvPythonPath();

  if (fs.existsSync(venvPython)) {
    // Check if dependencies are installed in this venv
    try {
      execSync(`"${venvPython}" -c "import fastapi, uvicorn"`, { stdio: 'ignore' });
      return venvPython;
    } catch {
      console.log('[backend] Existing .venv is missing dependencies. Re-installing...');
    }
  } else {
    console.log('[backend] Python virtual environment not found.');
    const basePython = findBasePython();
    if (!basePython) {
      console.error(
        '\n[backend] Error: Python 3.11, 3.12, or 3.13 is required but was not found.\n' +
        'Please install Python 3.11 or 3.12 from https://www.python.org/downloads/.\n'
      );
      process.exit(1);
    }

    console.log(`[backend] Creating .venv using ${basePython} ...`);
    execSync(`"${basePython}" -m venv "${VENV_DIR}"`, { stdio: 'inherit', cwd: BACKEND_DIR });
  }

  const pipFlags = '--disable-pip-version-check --no-input';
  console.log('[backend] Installing Python dependencies into .venv ...');
  execSync(`"${venvPython}" -m pip install ${pipFlags} -r requirements-dev.txt`, {
    stdio: 'inherit',
    cwd: BACKEND_DIR,
  });

  console.log('[backend] Installing backend package in editable mode ...');
  execSync(`"${venvPython}" -m pip install ${pipFlags} -e .`, {
    stdio: 'inherit',
    cwd: BACKEND_DIR,
  });

  return venvPython;
}

function ensureModel(pythonPath) {
  const modelFile = path.join(BACKEND_DIR, 'artifacts', 'model.joblib');
  if (!fs.existsSync(modelFile)) {
    console.log('[backend] ML model artifact missing — training model now...');
    execSync(`"${pythonPath}" scripts/generate_dataset.py`, { stdio: 'inherit', cwd: BACKEND_DIR });
    execSync(`"${pythonPath}" scripts/train_model.py`, { stdio: 'inherit', cwd: BACKEND_DIR });
  }
}

module.exports = {
  BACKEND_DIR,
  ensureEnvFile,
  ensurePython,
  ensureModel,
};
