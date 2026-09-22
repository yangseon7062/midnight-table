@echo off
setlocal
cd /d "%~dp0"
title Midnight Table - local play

echo ==========================================
echo   Midnight Table - card battle playtest
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 goto NONODE

if not exist node_modules goto INSTALL
goto BUILD

:INSTALL
echo [1/3] Installing dependencies (first run only, a few minutes)...
call npm install
if errorlevel 1 goto FAIL
goto BUILD

:BUILD
echo [1/3] Building the client...
call npm run build
if errorlevel 1 goto FAIL
echo.

echo [2/3] The browser will open in about 5 seconds.
start "" /min cmd /c "timeout /t 5 /nobreak >nul && explorer http://localhost:3000"
echo.

echo [3/3] Starting the server.
echo.
echo   URL          http://localhost:3000
echo   Admin editor http://localhost:3000/admin  (password: midnight-admin)
echo.
echo   KEEP THIS WINDOW OPEN while you play.
echo   Press Ctrl+C or close this window to stop the server.
echo.
echo ------------------------------------------
call npm start
goto END

:NONODE
echo.
echo Node.js was not found on this PC.
echo Install it from https://nodejs.org (LTS) and run this file again.
goto END

:FAIL
echo.
echo Something failed above.
echo Copy the last 20 lines of this window and paste them to Claude.
goto END

:END
echo.
pause
