@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install the current LTS version from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Setting up Gym Progress for the first time. This may take a few minutes...
  call npm install
  if errorlevel 1 (
    echo Setup did not finish. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo Starting Gym Progress. Your browser will open automatically.
echo Keep this window open while using the app. Close it to stop the app.
call npm run dev
if errorlevel 1 (
  echo The app could not start. Please check the message above.
  pause
)
endlocal
