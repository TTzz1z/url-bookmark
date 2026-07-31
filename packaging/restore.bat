@echo off
setlocal
cd /d "%~dp0"

if "%~1"=="" (
  echo Usage: restore.bat backups\backup-YYYYMMDD-HHMMSS
  echo Stop start.bat before restoring.
  pause
  exit /b 1
)

set "SOURCE=%~1"
if not exist "%SOURCE%\bookmarks.db" (
  echo [ERROR] Missing "%SOURCE%\bookmarks.db"
  pause
  exit /b 1
)

mkdir "data" 2>nul
mkdir "data\assets" 2>nul

copy /Y "%SOURCE%\bookmarks.db" "data\bookmarks.db" >nul
if errorlevel 1 (
  echo [ERROR] Failed to write data\bookmarks.db. Stop the app and try again.
  pause
  exit /b 1
)

if exist "data\assets\*" del /Q "data\assets\*" >nul 2>nul
for /d %%D in ("data\assets\*") do rd /S /Q "%%D" >nul 2>nul

if exist "%SOURCE%\assets\*" (
  xcopy /E /I /Y "%SOURCE%\assets\*" "data\assets\" >nul
)

echo Restore complete. Run start.bat again.
pause
exit /b 0
