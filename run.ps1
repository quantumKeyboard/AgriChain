# One-command local demo for Windows (PowerShell 5.1+ or PowerShell 7).
# First run installs everything; then starts the API (:8000) in a second window and the UI (:5173) here.
# Usage:  double-click run.bat   (or)   powershell -ExecutionPolicy Bypass -File .\run.ps1

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PYTHONUTF8 = "1"

function Fail($msg) {
    Write-Host ""
    Write-Host "ERROR: $msg" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

function Find-Python {
    # Prefer the Python launcher with a supported version (3.13, 3.12, 3.11), then plain `python`.
    if (Get-Command py -ErrorAction SilentlyContinue) {
        foreach ($v in "3.13", "3.12", "3.11") {
            & py "-$v" -c "import sys" 2>$null
            if ($LASTEXITCODE -eq 0) { return ,@("py", "-$v") }
        }
    }
    if (Get-Command python -ErrorAction SilentlyContinue) {
        & python -c "import sys; sys.exit(0 if (3, 11) <= sys.version_info[:2] < (3, 14) else 1)" 2>$null
        if ($LASTEXITCODE -eq 0) { return ,@("python") }
    }
    return $null
}

# ---------------------------------------------------------------- backend
Set-Location (Join-Path $Root "backend")
$venvPy = Join-Path (Get-Location) ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPy)) {
    $pyCmd = Find-Python
    if (-not $pyCmd) { Fail "Python 3.11, 3.12 or 3.13 is required. Install it from https://www.python.org/downloads/ (tick 'Add python.exe to PATH')." }
    Write-Host "Creating Python virtual environment..." -ForegroundColor Yellow
    $exe = $pyCmd[0]
    $pyArgs = @($pyCmd | Select-Object -Skip 1) + @("-m", "venv", ".venv")
    & $exe @pyArgs
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $venvPy)) { Fail "Could not create the virtual environment." }
    Write-Host "Installing backend packages (first run only, a few minutes)..." -ForegroundColor Yellow
    & $venvPy -m pip install --upgrade pip
    & $venvPy -m pip install -e ".[dev]"
    if ($LASTEXITCODE -ne 0) { Fail "pip install failed (see messages above)." }
}

if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env" }

# Retrain if the model is missing or was pickled by an incompatible scikit-learn.
& $venvPy -c "from app.ml.scorer import load_bundle; load_bundle()" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Training the fraud model (about 10 seconds)..." -ForegroundColor Yellow
    & $venvPy scripts\generate_dataset.py
    & $venvPy scripts\train_model.py
    if ($LASTEXITCODE -ne 0) { Fail "Model training failed." }
}

# ---------------------------------------------------------------- frontend
Set-Location (Join-Path $Root "frontend")
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail "Node.js 20+ is required. Install the LTS from https://nodejs.org/" }
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend packages (first run only)..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) { Fail "npm install failed (see messages above)." }
}

# ---------------------------------------------------------------- start
Write-Host "Starting API on http://localhost:8000 (separate window)..." -ForegroundColor Green
$api = Start-Process -FilePath $venvPy `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--port", "8000" `
    -WorkingDirectory (Join-Path $Root "backend") -PassThru

try {
    Write-Host ""
    Write-Host "  UI       ->  http://localhost:5173" -ForegroundColor Green
    Write-Host "  API docs ->  http://localhost:8000/docs" -ForegroundColor Green
    Write-Host "  Press Ctrl+C here to stop both." -ForegroundColor DarkGray
    Write-Host ""
    Start-Job { Start-Sleep 4; Start-Process "http://localhost:5173" } | Out-Null
    npx vite --port 5173
}
finally {
    if ($api -and -not $api.HasExited) { Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue }
}
