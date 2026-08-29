@echo off
REM ============================================================================
REM  Workflow Studio - install all Python dependencies into the local "libs" folder
REM  Run this once before starting the server (or after updating requirements.txt)
REM ============================================================================
setlocal
cd /d "%~dp0"

REM --- Locate a Python 3.10+ interpreter (the app requires Python 3.10+) ---
set "PY="
py -3.10 -c "import sys" >nul 2>&1 && set "PY=py -3.10" && goto :found
py -3.11 -c "import sys" >nul 2>&1 && set "PY=py -3.11" && goto :found
python -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>&1 && set "PY=python" && goto :found

echo [ERROR] Python 3.10 or newer is required, but none was found on this machine.
echo         Install Python 3.10+ from https://www.python.org/downloads/
pause
exit /b 1

:found
echo [1/3] Using interpreter: %PY%
if not exist "libs" mkdir "libs"

echo [2/3] Installing dependencies into "%~dp0libs" ...
%PY% -m pip install -r "%~dp0requirements.txt" --target "%~dp0libs" --upgrade
if errorlevel 1 goto :error

echo [3/3] Done. Dependencies installed into:
echo        %~dp0libs
echo.
echo You can now start the app by running run_server.bat
goto :end

:error
echo.
echo [ERROR] Installation failed. Check the messages above.
pause
exit /b 1

:end
pause
endlocal
