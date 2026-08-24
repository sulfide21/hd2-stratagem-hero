@echo off
REM Double-click to play. Serves this folder over HTTP - the game needs that,
REM because ES modules and fetch() do not work from a file:// page.
setlocal
cd /d "%~dp0"

set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY where py >nul 2>nul && set "PY=py"
if not defined PY (
  echo Python was not found on PATH.
  echo Install Python from https://python.org, then double-click this file again.
  echo.
  pause
  exit /b 1
)

echo Serving http://localhost:8000/ - close this window to stop the server.
echo.

REM The browser is launched first because it takes longer to open than the
REM server takes to start, and the server line below blocks until you stop it.
start "" http://localhost:8000/
%PY% -m http.server 8000

echo.
echo Server stopped.
pause
