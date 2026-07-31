@echo off
setlocal
cd /d "%~dp0"

if not exist "runtime\node.exe" (
  echo [ERROR] Incomplete package: runtime\node.exe is missing.
  pause
  exit /b 1
)

"runtime\node.exe" "portable-launcher.mjs"
set "APP_EXIT_CODE=%ERRORLEVEL%"

if not "%APP_EXIT_CODE%"=="0" (
  echo.
  echo The application exited with an error. Keep this window for troubleshooting.
  pause
)

exit /b %APP_EXIT_CODE%
