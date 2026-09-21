@echo off
setlocal
cd /d "%~dp0"
set LOG=push-log.txt
set TAG=v5
echo ===== sync push log ===== > "%LOG%"
echo.
echo ==========================================
echo   Midnight Table - sync to GitHub
echo ==========================================
echo.

if not exist ".git" (
  echo [X] This folder is not a git repository yet.
  goto done
)

rem Stop tracking generated files. Harmless if already untracked.
rem The files stay on disk - git just stops following them.
echo [1/4] Untracking generated files...
git rm --cached -q push-log.txt >> "%LOG%" 2>&1
git rm --cached -q midnight-table.git.bundle >> "%LOG%" 2>&1
git rm --cached -q push-to-github.bat >> "%LOG%" 2>&1
git rm --cached -q push2.bat >> "%LOG%" 2>&1
git rm --cached -q commit-message.txt >> "%LOG%" 2>&1
echo     done.

echo [2/4] Committing changes...
git add -A >> "%LOG%" 2>&1
if exist "commit-message.txt" (
  git commit -F "commit-message.txt" >> "%LOG%" 2>&1
) else (
  git commit -m "update from Claude" >> "%LOG%" 2>&1
)
git log --oneline -1 >> "%LOG%" 2>&1
echo     done.

rem Skips quietly if the tag already exists.
echo [3/4] Tagging %TAG% ...
git tag -a %TAG% -m "card battle: engine, module, screens, AI" >> "%LOG%" 2>&1
echo     done.

echo [4/4] Pushing...
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
