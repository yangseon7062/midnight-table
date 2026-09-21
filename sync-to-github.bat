@echo off
setlocal
cd /d "%~dp0"
set LOG=push-log.txt
echo ===== sync push log ===== > "%LOG%"
echo.
echo ==========================================
echo   Midnight Table - sync to GitHub
echo ==========================================
echo.

if not exist ".git" (
  echo [X] This folder is not a git repository yet.
  echo     Run push2.bat first.
  goto done
)

echo [1/2] Committing changes...
git add -A >> "%LOG%" 2>&1
if exist "commit-message.txt" (
  git commit -F "commit-message.txt" >> "%LOG%" 2>&1
) else (
  git commit -m "update from Claude" >> "%LOG%" 2>&1
)
git log --oneline -1 >> "%LOG%" 2>&1
echo     done.

echo [2/2] Pushing...
git push origin main --tags >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo [X] Push failed. See push-log.txt
  goto done
)

echo.
echo ==========================================
echo   DONE!  github.com/yangseon7062/midnight-table
echo ==========================================

:done
echo.
pause
