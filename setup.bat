@echo off
setlocal

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js 22 or newer first.
  exit /b 1
)

for /f "usebackq delims=" %%V in (`node -p "Number(process.versions.node.split('.')[0])"`) do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR (
  echo [ERROR] Unable to read the installed Node.js version.
  exit /b 1
)
if %NODE_MAJOR% LSS 22 (
  echo [ERROR] Node.js %NODE_MAJOR% is too old. This project requires Node.js 22 or newer.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Reinstall Node.js with npm included.
  exit /b 1
)

echo [1/2] Installing project dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [ERROR] Dependency installation failed. Check the network, npm configuration, and folder permissions.
  exit /b 1
)

echo [2/2] Initializing the SQLite database...
call npm run db:migrate
if errorlevel 1 (
  echo [ERROR] Database initialization failed. Check that the data folder is writable and the database is not locked.
  exit /b 1
)

echo.
echo Setup complete. Run "npm run dev" for development or "start.bat" for production.
exit /b 0
