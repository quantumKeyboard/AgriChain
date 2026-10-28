#!/usr/bin/env bash
# =============================================================================
#  AgriChain Sentinel - launcher for macOS and Linux (same menu as run.bat)
#  macOS: double-click run.command    Terminal: ./run.sh
#  Shortcuts: ./run.sh start | setup | stop
#
#  - Never upgrades pip.
#  - Uses backend/.venv; if venv is unavailable it falls back to pip --user.
#  - The Ethereum node (Hardhat), API and UI run in the background;
#    logs go to .run/chain.log, .run/api.log and .run/ui.log.
#  Written for bash 3.2 (the version macOS ships).
# =============================================================================

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
CHAIN_DIR="$ROOT/blockchain"
VENV_PY="$BACKEND/.venv/bin/python"
RUN_DIR="$ROOT/.run"
API_URL="http://localhost:8000"
UI_URL="http://localhost:5173"
# Long timeout + retries: slow or unstable connections otherwise abort big downloads.
PIPFLAGS="--disable-pip-version-check --no-input --timeout 120 --retries 10"
export PYTHONUTF8=1 PIP_DISABLE_PIP_VERSION_CHECK=1
mkdir -p "$RUN_DIR"

if [ -t 1 ]; then
    BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; RST=$'\033[0m'
else
    BOLD=""; DIM=""; RED=""; GRN=""; YEL=""; RST=""
fi
ok()   { echo "  ${GRN}[OK]${RST} $*"; }
warn() { echo "  ${YEL}[!]${RST} $*"; }
err()  { echo "  ${RED}[X]${RST} $*"; }

pause() {
    [ -t 0 ] || return 0
    echo
    read -rsn1 -p "  Press any key to return to the menu..." _
    echo
}

open_url() {
    if [ "$(uname)" = "Darwin" ]; then open "$1"
    elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 &
    else echo "  Open $1 in your browser."
    fi
}

# ----------------------------------------------------------------- detection
find_base_python() {
    # Prefer an explicit 3.13 / 3.12 / 3.11, then python3.
    BASE_PY=""
    for c in python3.13 python3.12 python3.11 python3; do
        if command -v "$c" >/dev/null 2>&1 &&
            "$c" -c 'import sys; sys.exit(0 if (3,11) <= sys.version_info[:2] < (3,14) else 1)' >/dev/null 2>&1; then
            BASE_PY="$(command -v "$c")"
            return 0
        fi
    done
    return 1
}

detect() {
    PY=""; PY_LABEL="${RED}NOT FOUND${RST} - install Python 3.12 (python.org or: brew install python@3.12)"
    if [ -x "$VENV_PY" ]; then
        PY="$VENV_PY"; PY_LABEL="backend/.venv"
    elif find_base_python; then
        PY="$BASE_PY"; PY_LABEL="$BASE_PY (user install, no venv)"
    fi

    STATUS="${GRN}Ready - press 1${RST}"
    READY=1
    if [ -z "$PY" ]; then
        STATUS="${RED}Python missing${RST} - install it, then press 2"; READY=0
    elif ! "$PY" -c "import fastapi, sklearn, shap, sqlmodel, uvicorn, web3" >/dev/null 2>&1; then
        STATUS="${YEL}Not installed yet${RST} - press 2 for setup"; READY=0
    fi

    if command -v npm >/dev/null 2>&1; then
        NODE_LABEL="found ($(node -v 2>/dev/null))"
        if { [ ! -d "$FRONTEND/node_modules" ] || [ ! -d "$CHAIN_DIR/node_modules" ]; } && [ "$READY" = 1 ]; then
            STATUS="${YEL}Not installed yet${RST} - press 2 for setup"; READY=0
        fi
    else
        NODE_LABEL="${RED}NOT FOUND${RST} - install the LTS from nodejs.org (or: brew install node)"
        STATUS="${RED}Node.js missing${RST} - install it, then press 2"; READY=0
    fi

    RUNNING=""
    port_in_use 8545 && RUNNING="Blockchain"
    port_in_use 8000 && RUNNING="${RUNNING:+$RUNNING + }API"
    port_in_use 5173 && RUNNING="${RUNNING:+$RUNNING + }UI"
}

port_in_use() {
    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1
    else
        curl -s -o /dev/null --max-time 1 "http://localhost:$1/" 2>/dev/null
    fi
}

# ----------------------------------------------------------------- setup
pip_install() {
    # Up to 3 attempts; pip caches finished downloads, so each retry resumes.
    n=1
    while [ $n -le 3 ]; do
        # shellcheck disable=SC2086
        "$PY" -m pip install $PIPFLAGS "$@" -r "$BACKEND/requirements-dev.txt" && return 0
        echo
        warn "Attempt $n of 3 did not finish - network is slow, retrying..."
        sleep 3
        n=$((n + 1))
    done
    return 1
}

ensure_model() {
    if (cd "$BACKEND" && "$PY" -c "from app.ml.scorer import load_bundle; load_bundle()") >/dev/null 2>&1; then
        echo "        Model OK."
        return 0
    fi
    echo "        Training the fraud model - about 10 seconds..."
    (cd "$BACKEND" && "$PY" scripts/generate_dataset.py && "$PY" scripts/train_model.py) || {
        err "Model training failed - see the messages above."; return 1; }
}

setup() {
    echo; echo "  ${BOLD}=== Setup ===${RST}"; echo
    if [ -x "$VENV_PY" ] && "$VENV_PY" -m pip --version >/dev/null 2>&1; then
        PY="$VENV_PY"
    else
        if ! find_base_python; then
            err "Python 3.11, 3.12 or 3.13 was not found."
            echo "      Install Python 3.12 from https://www.python.org/downloads/"
            echo "      (or with Homebrew: brew install python@3.12), then run this again."
            return 1
        fi
        echo "  [1/5] Creating a virtual environment in backend/.venv ..."
        rm -rf "$BACKEND/.venv"
        if "$BASE_PY" -m venv "$BACKEND/.venv" >/dev/null 2>&1 &&
            { "$VENV_PY" -m pip --version >/dev/null 2>&1 || "$VENV_PY" -m ensurepip --default-pip >/dev/null 2>&1; } &&
            "$VENV_PY" -m pip --version >/dev/null 2>&1; then
            PY="$VENV_PY"
        else
            rm -rf "$BACKEND/.venv"
            warn "Virtual environments are unavailable - using your user Python instead."
            echo "      (On Debian/Ubuntu you can fix this with: sudo apt install python3-venv)"
            PY="$BASE_PY"
        fi
    fi

    if [ "$PY" = "$VENV_PY" ]; then
        echo "  [2/5] Installing Python packages into backend/.venv - a few minutes..."
        pip_install || { setup_pip_failed; return 1; }
    else
        echo "  [2/5] Installing Python packages for your user - a few minutes..."
        pip_install --user || { echo "        Retrying without --user..."; pip_install; } || { setup_pip_failed; return 1; }
    fi

    [ -f "$BACKEND/.env" ] || cp "$BACKEND/.env.example" "$BACKEND/.env"
    echo "  [3/5] Checking the ML model..."
    ensure_model || return 1

    echo "  [4/5] Installing frontend packages - first time only..."
    if ! command -v npm >/dev/null 2>&1; then
        err "Node.js was not found. Install the LTS from https://nodejs.org/ (or: brew install node)"
        return 1
    fi
    (cd "$FRONTEND" && npm install --no-audit --no-fund) || { err "npm install failed - see the messages above."; return 1; }
    echo "  [5/5] Installing the blockchain toolkit (Hardhat, Solidity compiler) - first time only..."
    (cd "$CHAIN_DIR" && npm install --no-audit --no-fund) || { err "npm install failed - see the messages above."; return 1; }
    echo
    ok "Setup complete. Press 1 in the menu to start the app."
}

setup_pip_failed() {
    echo
    err "pip could not install the packages - see the messages above."
    echo "      'Read timed out' = slow or unstable internet. Finished downloads are"
    echo "      cached, so just press 2 again to continue. Also try another network."
    echo "      'externally-managed-environment' = Homebrew Python without venv:"
    echo "      install Python from python.org instead, then press 2 again."
}

# ----------------------------------------------------------------- run / stop
launch_chain() {
    if port_in_use 8545; then echo "  Ethereum node already running on port 8545."; return 0; fi
    echo "  Starting the Ethereum node - Hardhat, chain id 31337 (log: .run/chain.log)..."
    (
        cd "$CHAIN_DIR" || exit 1
        nohup npm run node >"$RUN_DIR/chain.log" 2>&1 </dev/null &
        echo $! >"$RUN_DIR/chain.pid"
    )
}

wait_for_chain() {
    i=0
    while [ $i -lt 40 ]; do
        curl -sf -o /dev/null -H "Content-Type: application/json" \
            -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' "http://127.0.0.1:8545" 2>/dev/null && return 0
        sleep 1; i=$((i + 1))
    done
    warn "The Ethereum node did not start - check .run/chain.log (menu: L)."
    return 1
}

launch_api() {
    if port_in_use 8000; then echo "  API already running on port 8000."; return 0; fi
    echo "  Starting API  (log: .run/api.log)..."
    # Only the server is backgrounded (not the cd), so no extra shell keeps the terminal attached.
    (
        cd "$BACKEND" || exit 1
        nohup "$PY" -m uvicorn app.main:app --port 8000 >"$RUN_DIR/api.log" 2>&1 </dev/null &
        echo $! >"$RUN_DIR/api.pid"
    )
}

launch_ui() {
    if port_in_use 5173; then echo "  UI already running on port 5173."; return 0; fi
    echo "  Starting UI   (log: .run/ui.log)..."
    (
        cd "$FRONTEND" || exit 1
        nohup npm run dev >"$RUN_DIR/ui.log" 2>&1 </dev/null &
        echo $! >"$RUN_DIR/ui.pid"
    )
}

wait_for_api() {
    echo "  Waiting for the API - it deploys the smart contract and records the demo history, ~20 s..."
    i=0
    while [ $i -lt 90 ]; do
        curl -sf -o /dev/null "$API_URL/api/health" 2>/dev/null && return 0
        sleep 1; i=$((i + 1))
    done
    warn "API did not answer yet - check .run/api.log (menu: L)."
    return 1
}

wait_for_ui() {
    i=0
    while [ $i -lt 20 ]; do
        curl -s -o /dev/null --max-time 1 "$UI_URL" 2>/dev/null && return 0
        sleep 1; i=$((i + 1))
    done
}

start_all() {
    detect
    if [ "$READY" != 1 ]; then
        echo; echo "  Not set up yet - running setup first..."
        setup || return 1
        detect
        [ "$READY" = 1 ] || return 1
    fi
    launch_chain
    wait_for_chain || return 1
    launch_api
    launch_ui
    wait_for_api
    wait_for_ui
    echo "  Opening $UI_URL ..."
    open_url "$UI_URL"
    echo
    ok "AgriChain Sentinel is running in the background."
    echo "       UI       : $UI_URL"
    echo "       Ethereum : http://127.0.0.1:8545 (Hardhat node)"
    echo "       API docs : $API_URL/docs"
    echo "       Stop it with option 4 (it keeps running if you close this window)."
}

kill_port() {
    if command -v lsof >/dev/null 2>&1; then
        pids="$(lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null)"
        [ -n "$pids" ] && kill $pids 2>/dev/null
    elif command -v fuser >/dev/null 2>&1; then
        fuser -k "$1/tcp" >/dev/null 2>&1
    fi
}

stop_app() {
    echo; echo "  Stopping the app..."
    for name in api ui chain; do
        if [ -f "$RUN_DIR/$name.pid" ]; then
            pid="$(cat "$RUN_DIR/$name.pid")"
            pkill -P "$pid" 2>/dev/null
            kill "$pid" 2>/dev/null
            rm -f "$RUN_DIR/$name.pid"
        fi
    done
    kill_port 8000
    kill_port 5173
    kill_port 8545
    sleep 1
    ok "Stopped."
}

# ----------------------------------------------------------------- other actions
need_setup() { detect; [ -n "$PY" ] && [ "$READY" = 1 ] && return 0; warn "Not set up yet - choose option 2 first."; return 1; }

reset_demo() {
    need_setup || return
    echo
    if curl -sf -X POST -o /dev/null "$API_URL/api/dev/reset" 2>/dev/null; then
        ok "Demo data reset through the running API. Refresh the browser."
    else
        echo "  API is not running - resetting directly (needs the Ethereum node)..."
        launch_chain && wait_for_chain && (cd "$BACKEND" && "$PY" scripts/seed_demo.py) && ok "Demo data reset."
    fi
}

retrain() {
    need_setup || return
    echo
    (cd "$BACKEND" && "$PY" scripts/generate_dataset.py && "$PY" scripts/train_model.py) &&
        { echo; ok "Model retrained. Restart the app (4 then 1) to load it."; }
}

run_tests() {
    need_setup || return
    echo; echo "  ${BOLD}=== Backend tests ===${RST}"
    (cd "$BACKEND" && "$PY" -m pytest -q)
    echo; echo "  ${BOLD}=== Frontend tests ===${RST}"
    (cd "$FRONTEND" && npm test)
    echo; echo "  ${BOLD}=== Smart contract tests ===${RST}"
    (cd "$CHAIN_DIR" && npm test)
}

show_logs() {
    for name in chain api ui; do
        echo; echo "  ${BOLD}=== .run/$name.log (last 25 lines) ===${RST}"
        if [ -f "$RUN_DIR/$name.log" ]; then tail -n 25 "$RUN_DIR/$name.log"; else echo "  (no log yet)"; fi
    done
}

menu() {
    while true; do
        detect
        clear
        echo
        echo "   ${BOLD}======================================================${RST}"
        echo "   ${BOLD}   AgriChain Sentinel  -  macOS / Linux launcher${RST}"
        echo "   ${BOLD}======================================================${RST}"
        echo "      Python  : $PY_LABEL"
        echo "      Node.js : $NODE_LABEL"
        echo "      Status  : $STATUS"
        [ -n "$RUNNING" ] && echo "      Running : ${GRN}$RUNNING${RST}  ($UI_URL)"
        echo "   ------------------------------------------------------"
        echo "      [1]  Start the app        (blockchain + API + UI)"
        echo "      [2]  Setup / repair       (install everything)"
        echo "      [3]  Open app in browser"
        echo "      [4]  Stop the app"
        echo "   ------------------------------------------------------"
        echo "      [5]  Start blockchain + API  $API_URL/docs"
        echo "      [6]  Start UI only        $UI_URL"
        echo "      [7]  Reset demo data"
        echo "      [8]  Retrain the ML model"
        echo "      [9]  Run tests"
        echo "      [L]  Show logs"
        echo "      [0]  Exit"
        echo "   ${BOLD}======================================================${RST}"
        echo
        read -rsn1 -p "    Press a key: " key
        echo
        case "$key" in
            1) start_all; pause ;;
            2) clear; setup; pause ;;
            3) open_url "$UI_URL" ;;
            4) stop_app; pause ;;
            5) need_setup && { launch_chain; wait_for_chain && launch_api && wait_for_api && open_url "$API_URL/docs"; }; pause ;;
            6) need_setup && { launch_ui; wait_for_ui; open_url "$UI_URL"; }; pause ;;
            7) reset_demo; pause ;;
            8) retrain; pause ;;
            9) run_tests; pause ;;
            l | L) show_logs; pause ;;
            0 | q | Q)
                if [ -n "$RUNNING" ]; then
                    read -rsn1 -p "    The app is still running. Stop it too? [y/N] " yn; echo
                    case "$yn" in y | Y) stop_app ;; esac
                fi
                exit 0 ;;
        esac
    done
}

case "${1:-}" in
    start) detect; start_all ;;
    setup) setup ;;
    stop) stop_app ;;
    *) menu ;;
esac
