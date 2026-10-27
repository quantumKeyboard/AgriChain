@echo off
rem ===========================================================================
rem  AgriChain Sentinel - Windows launcher (plain cmd, no PowerShell needed)
rem  Double-click this file. Pick an option from the menu.
rem
rem  - Never upgrades pip.
rem  - Uses backend\.venv if it can; if venv is blocked on this PC it installs
rem    into your user Python instead (pip install --user).
rem ===========================================================================
setlocal EnableExtensions
title AgriChain Sentinel
cd /d "%~dp0"

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "VENV_PY=%BACKEND%\.venv\Scripts\python.exe"
rem Long timeout + retries: slow or unstable connections otherwise abort big downloads.
set "PIPFLAGS=--disable-pip-version-check --no-input --timeout 120 --retries 10"
set "API_URL=http://localhost:8000"
set "UI_URL=http://localhost:5173"
set "PYTHONUTF8=1"
set "PIP_DISABLE_PIP_VERSION_CHECK=1"

rem Shortcut: "run.bat start" skips the menu.
if /i "%~1"=="start" goto start_all
if /i "%~1"=="setup" goto setup

:menu
call :detect
cls
echo.
echo    ======================================================
echo       AgriChain Sentinel  -  Windows launcher
echo    ======================================================
echo       Python  : %PY_LABEL%
echo       Node.js : %NODE_LABEL%
echo       Status  : %STATUS%
echo    ------------------------------------------------------
echo       [1]  Start the app        (API + UI, opens browser)
echo       [2]  Setup / repair       (install everything)
echo       [3]  Open app in browser
echo       [4]  Stop the app
echo    ------------------------------------------------------
echo       [5]  Start API only       %API_URL%/docs
echo       [6]  Start UI only        %UI_URL%
echo       [7]  Reset demo data
echo       [8]  Retrain the ML model
echo       [9]  Run tests
echo       [0]  Exit
echo    ======================================================
echo.
choice /c 1234567890 /n /m "    Press a number: "
if errorlevel 10 goto end
if errorlevel 9 goto tests
if errorlevel 8 goto retrain
if errorlevel 7 goto reset
if errorlevel 6 goto start_ui_only
if errorlevel 5 goto start_api_only
if errorlevel 4 goto stop
if errorlevel 3 goto open_browser
if errorlevel 2 goto setup
if errorlevel 1 goto start_all
goto menu


rem ===========================================================================
rem  Detection: which Python to use, and is everything installed?
rem ===========================================================================
:detect
set "PYEXE="
set "PYARGS="
set "PY_LABEL=NOT FOUND - install Python 3.12 from python.org"
set "MODE="
if exist "%VENV_PY%" (
    set "PYEXE=%VENV_PY%"
    set "MODE=venv"
    set "PY_LABEL=backend\.venv"
    goto detect_deps
)
call :find_base_python
if not defined BASEEXE goto detect_node
set "PYEXE=%BASEEXE%"
set "PYARGS=%BASEARGS%"
set "MODE=user"
set "PY_LABEL=%BASELABEL% (user install, no venv)"

:detect_deps
set "STATUS=Ready - press 1"
"%PYEXE%" %PYARGS% -c "import fastapi, sklearn, shap, sqlmodel, uvicorn" >nul 2>&1
if errorlevel 1 set "STATUS=Not installed yet - press 2 for setup"

:detect_node
set "NODE_LABEL=NOT FOUND - install the LTS from nodejs.org"
where npm >nul 2>&1
if errorlevel 1 (
    set "STATUS=Node.js missing - install it, then press 2"
    goto :eof
)
set "NODE_LABEL=found"
if not defined PYEXE (
    set "STATUS=Python missing - install it, then press 2"
    goto :eof
)
if not exist "%FRONTEND%\node_modules" set "STATUS=Not installed yet - press 2 for setup"
goto :eof


:find_base_python
rem Prefer the py launcher with 3.13 / 3.12 / 3.11, then plain "python".
set "BASEEXE="
set "BASEARGS="
set "BASELABEL="
for %%V in (3.13 3.12 3.11) do (
    if not defined BASEEXE (
        py -%%V -c "import sys" >nul 2>&1 && (
            set "BASEEXE=py"
            set "BASEARGS=-%%V"
            set "BASELABEL=Python %%V"
        )
    )
)
if defined BASEEXE goto :eof
python -c "import sys; sys.exit(0 if (3,11) <= sys.version_info[:2] < (3,14) else 1)" >nul 2>&1
if errorlevel 1 goto :eof
set "BASEEXE=python"
set "BASELABEL=python on PATH"
goto :eof


rem ===========================================================================
rem  [2] Setup / repair
rem ===========================================================================
:setup
cls
echo.
echo  === Setup ===
echo.
call :find_base_python
if exist "%VENV_PY%" goto setup_install
if not defined BASEEXE (
    echo  [X] Python 3.11, 3.12 or 3.13 was not found.
    echo      Install Python 3.12 from https://www.python.org/downloads/
    echo      and tick "Add python.exe to PATH", then run this again.
    goto done
)

echo  [1/4] Creating a virtual environment in backend\.venv ...
"%BASEEXE%" %BASEARGS% -m venv "%BACKEND%\.venv" >nul 2>&1
if not exist "%VENV_PY%" goto setup_no_venv
"%VENV_PY%" -m pip --version >nul 2>&1
if not errorlevel 1 goto setup_install
rem venv exists but has no pip (blocked ensurepip) - try once, else fall back.
"%VENV_PY%" -m ensurepip --default-pip >nul 2>&1
"%VENV_PY%" -m pip --version >nul 2>&1
if not errorlevel 1 goto setup_install
rmdir /s /q "%BACKEND%\.venv" >nul 2>&1

:setup_no_venv
echo        Virtual environments are blocked here - using your user Python instead.
set "PYEXE=%BASEEXE%"
set "PYARGS=%BASEARGS%"
echo  [2/4] Installing Python packages for your user - a few minutes ...
call :pip_install --user
if not errorlevel 1 goto setup_env
echo        Retrying without --user ...
call :pip_install
if errorlevel 1 goto setup_pip_failed
goto setup_env

:setup_install
set "PYEXE=%VENV_PY%"
set "PYARGS="
echo  [2/4] Installing Python packages into backend\.venv - a few minutes ...
call :pip_install
if errorlevel 1 goto setup_pip_failed

:setup_env
if not exist "%BACKEND%\.env" copy /y "%BACKEND%\.env.example" "%BACKEND%\.env" >nul
echo  [3/4] Checking the ML model ...
call :ensure_model
if errorlevel 1 goto done

echo  [4/4] Installing frontend packages - first time only ...
where npm >nul 2>&1
if errorlevel 1 (
    echo  [X] Node.js was not found. Install the LTS from https://nodejs.org/
    echo      then close this window and run run.bat again.
    goto done
)
pushd "%FRONTEND%"
call npm install --no-audit --no-fund
set "NPMERR=%errorlevel%"
popd
if not "%NPMERR%"=="0" (
    echo  [X] npm install failed - see the messages above.
    goto done
)
echo.
echo  [OK] Setup complete. Press 1 in the menu to start the app.
goto done

:setup_pip_failed
echo.
echo  [X] pip could not install the packages - see the messages above.
echo      "Read timed out" = slow or unstable internet. Packages that finished
echo      downloading are cached, so just press 2 again to continue.
echo      Also try: a different network / mobile hotspot, or pausing VPN.
goto done


:pip_install
rem Up to 3 attempts. pip caches finished downloads, so each retry resumes.
rem %1 = optional --user
for /l %%n in (1,1,3) do (
    "%PYEXE%" %PYARGS% -m pip install %PIPFLAGS% %~1 -r "%BACKEND%\requirements-dev.txt" && exit /b 0
    echo.
    echo        Attempt %%n of 3 did not finish - network is slow, retrying ...
    timeout /t 3 /nobreak >nul
)
exit /b 1


:ensure_model
rem Retrain only if the committed model cannot be loaded.
pushd "%BACKEND%"
"%PYEXE%" %PYARGS% -c "from app.ml.scorer import load_bundle; load_bundle()" >nul 2>&1
if not errorlevel 1 (
    echo        Model OK.
    popd
    exit /b 0
)
echo        Training the fraud model - about 10 seconds ...
"%PYEXE%" %PYARGS% scripts\generate_dataset.py
"%PYEXE%" %PYARGS% scripts\train_model.py
set "TRAINERR=%errorlevel%"
popd
if not "%TRAINERR%"=="0" (
    echo  [X] Model training failed - see the messages above.
    exit /b 1
)
exit /b 0


rem ===========================================================================
rem  [1] Start everything
rem ===========================================================================
:start_all
call :detect
echo %STATUS% | find "Ready" >nul
if not errorlevel 1 goto start_all_go
echo.
echo  Not set up yet - running setup first ...
call :setup_then_return
call :detect
echo %STATUS% | find "Ready" >nul
if errorlevel 1 goto done

:start_all_go
call :launch_api
call :launch_ui
call :wait_for_api
echo  Opening %UI_URL% ...
start "" "%UI_URL%"
echo.
echo  [OK] AgriChain Sentinel is running.
echo       UI       : %UI_URL%
echo       API docs : %API_URL%/docs
echo       Two windows were opened - "AgriChain API" and "AgriChain UI".
echo       Use option 4 in the menu to stop them.
goto done

:setup_then_return
rem Run setup without its final pause/menu jump.
set "INLINE_SETUP=1"
call :setup_inline
set "INLINE_SETUP="
exit /b 0

:setup_inline
goto setup


:launch_api
netstat -ano | findstr /r /c:":8000 .*LISTENING" >nul
if not errorlevel 1 (
    echo  API already running on port 8000.
    exit /b 0
)
echo  Starting API ...
start "AgriChain API" /D "%BACKEND%" cmd /k ""%PYEXE%" %PYARGS% -m uvicorn app.main:app --port 8000"
exit /b 0

:launch_ui
netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if not errorlevel 1 (
    echo  UI already running on port 5173.
    exit /b 0
)
echo  Starting UI ...
start "AgriChain UI" /D "%FRONTEND%" cmd /k "npm run dev"
exit /b 0

:wait_for_api
echo  Waiting for the API to be ready - first start seeds demo data, up to ~30 s ...
for /l %%i in (1,1,45) do (
    curl -s -o nul -f "%API_URL%/api/health" >nul 2>&1 && exit /b 0
    timeout /t 1 /nobreak >nul
)
echo  [!] API did not answer yet - check the "AgriChain API" window for errors.
exit /b 0


rem ===========================================================================
rem  Other menu actions
rem ===========================================================================
:start_api_only
call :detect
if not defined PYEXE goto need_setup
call :launch_api
call :wait_for_api
start "" "%API_URL%/docs"
goto done

:start_ui_only
where npm >nul 2>&1
if errorlevel 1 goto need_setup
if not exist "%FRONTEND%\node_modules" goto need_setup
call :launch_ui
timeout /t 4 /nobreak >nul
start "" "%UI_URL%"
goto done

:open_browser
start "" "%UI_URL%"
goto menu

:stop
echo.
echo  Stopping the app ...
for %%P in (8000 5173) do (
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr /r /c:":%%P .*LISTENING"') do taskkill /pid %%A /t /f >nul 2>&1
)
taskkill /fi "WINDOWTITLE eq AgriChain API*" /t /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq AgriChain UI*" /t /f >nul 2>&1
echo  [OK] Stopped.
goto done

:reset
call :detect
if not defined PYEXE goto need_setup
echo.
curl -s -f -X POST "%API_URL%/api/dev/reset" >nul 2>&1
if not errorlevel 1 (
    echo  [OK] Demo data reset through the running API. Refresh the browser.
    goto done
)
echo  API is not running - resetting the database directly ...
pushd "%BACKEND%"
"%PYEXE%" %PYARGS% scripts\seed_demo.py
popd
echo  [OK] Demo data reset.
goto done

:retrain
call :detect
if not defined PYEXE goto need_setup
echo.
pushd "%BACKEND%"
"%PYEXE%" %PYARGS% scripts\generate_dataset.py
"%PYEXE%" %PYARGS% scripts\train_model.py
popd
echo.
echo  [OK] Model retrained. Restart the app (4 then 1) to load it.
goto done

:tests
call :detect
if not defined PYEXE goto need_setup
echo.
echo  === Backend tests ===
pushd "%BACKEND%"
"%PYEXE%" %PYARGS% -m pytest -q
popd
echo.
echo  === Frontend tests ===
pushd "%FRONTEND%"
call npm test
popd
goto done

:need_setup
echo.
echo  [!] Not set up yet - choose option 2 first.
goto done

:done
if defined INLINE_SETUP exit /b 0
echo.
pause
goto menu

:end
endlocal
exit /b 0
