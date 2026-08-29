@echo off
REM ============================================================================
REM  Workflow Studio - start the app using the local "libs" folder
REM ============================================================================
setlocal
cd /d "%~dp0"

if not exist "%~dp0libs" (
    echo [ERROR] "libs" folder not found. Run install_lib.bat first.
    pause
    exit /b 1
)

REM --- Locate a Python 3.10+ interpreter (the app requires Python 3.10+) ---
set "PY="
py -3.10 -c "import sys" >nul 2>&1 && set "PY=py -3.10" && goto :found
py -3.11 -c "import sys" >nul 2>&1 && set "PY=py -3.11" && goto :found
python -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>&1 && set "PY=python" && goto :found

echo [ERROR] Python 3.10 or newer is required, but none was found on this machine.
pause
exit /b 1

:found
REM Make the bundled libs folder the first place Python looks for packages
set "PYTHONPATH=%~dp0libs;%PYTHONPATH%"

echo Starting Workflow Studio at http://localhost:8000 ...
echo Press CTRL+C to stop.
echo.
%PY% run_local.py

endlocal
