@echo off
setlocal

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Run setup.bat after installing Node.js 22 or newer.
  exit /b 1
)

if not exist "node_modules" (
  echo [ERROR] Dependencies are missing. Run setup.bat first.
  exit /b 1
)

call npm run db:migrate
if errorlevel 1 (
  echo [ERROR] Database initialization failed. The application was not started.
  exit /b 1
)

if not exist ".next\BUILD_ID" (
  echo No production build was found. Running "npm run build"...
  call npm run build
  if errorlevel 1 (
    echo [ERROR] The production build failed. The application was not started.
    exit /b 1
  )
)

echo Starting URL Bookmark at http://localhost:3000
call npm run start
if errorlevel 1 (
  echo [ERROR] The application failed to start. Check whether port 3000 is already in use.
  exit /b 1
)
