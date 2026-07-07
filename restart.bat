@echo off
setlocal

cd /d "%~dp0"

echo Restarting Comic Maker dev server...

for %%P in (5173 5174 5175) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P " ^| findstr "LISTENING"') do (
    echo Stopping process on port %%P: %%A
    taskkill /F /PID %%A >nul 2>nul
  )
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting dev server...
start "Comic Maker Dev Server" cmd /k "cd /d ""%~dp0"" && npm run dev -- --host 127.0.0.1"

timeout /t 3 /nobreak >nul
start "" "http://localhost:5173/"

echo.
echo Comic Maker should be running at http://localhost:5173/
echo You can close this window.
pause
