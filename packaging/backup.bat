@echo off
setlocal
cd /d "%~dp0"

if not exist "data\bookmarks.db" (
  echo [ERROR] data\bookmarks.db was not found. Start the app once to create the database.
  pause
  exit /b 1
)

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%I"
set "BACKUP_DIR=backups\backup-%STAMP%"
mkdir "%BACKUP_DIR%" 2>nul
mkdir "%BACKUP_DIR%\assets" 2>nul

copy /Y "data\bookmarks.db" "%BACKUP_DIR%\bookmarks.db" >nul
if errorlevel 1 (
  echo [ERROR] Failed to copy the database. Stop the app and try again.
  pause
  exit /b 1
)

if exist "data\assets\*" (
  xcopy /E /I /Y "data\assets\*" "%BACKUP_DIR%\assets\" >nul
)

echo Backup complete: %BACKUP_DIR%
echo Includes bookmarks.db and assets\
pause
exit /b 0
