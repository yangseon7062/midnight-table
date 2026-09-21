@echo off
setlocal
cd /d "%~dp0"
set LOG=push-log.txt
echo ===== midnight-table push log ===== > "%LOG%"
echo.
echo ==========================================
echo   Midnight Table - push to GitHub
echo ==========================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [X] git is not installed.
  echo     Install from https://git-scm.com/download/win and run again.
  echo git not found >> "%LOG%"
  goto done
)
git --version >> "%LOG%" 2>&1

if not exist "midnight-table.git.bundle" (
  echo [X] midnight-table.git.bundle not found in this folder.
  echo bundle missing >> "%LOG%"
  goto done
)

if exist ".git" goto push

echo [1/3] Restoring commit history from bundle...
if exist ".gittmp" rmdir /s /q ".gittmp"
git clone -q "midnight-table.git.bundle" ".gittmp" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [X] Could not read the bundle. See push-log.txt
  goto done
)
move ".gittmp\.git" ".git" >> "%LOG%" 2>&1
rmdir /s /q ".gittmp"
git reset -q >> "%LOG%" 2>&1
echo     done.

:push
echo [2/3] Connecting remote...
git remote remove origin >nul 2>nul
git remote add origin https://github.com/yangseon7062/midnight-table.git >> "%LOG%" 2>&1
echo     done.

echo [3/3] Pushing... (a GitHub login window may appear)
git push -u origin main --tags >> "%LOG%" 2>&1
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
echo (log saved to push-log.txt)
echo.
pause
