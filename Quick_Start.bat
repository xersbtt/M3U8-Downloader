@echo off
title M3U8 Downloader Quick Start
cd /d "%~dp0"
echo.
echo ===================================================
echo     STARTING M3U8 DOWNLOADER DASHBOARD
echo ===================================================
echo.

:: [1/3] Is the server already running? (identify our app via /api/health)
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://localhost:3000/api/health' -TimeoutSec 2; if ($r.name -eq 'dlm3u8') { exit 0 } } catch {}; exit 1" >nul 2>&1
if %errorlevel%==0 (
  echo [+] Server is already running at http://localhost:3000
  echo [*] Opening the browser...
  start http://localhost:3000
  goto end_ok
)

:: [2/3] Is port 3000 occupied by a DIFFERENT application?
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  echo [!] ERROR: Port 3000 is being used by a DIFFERENT application.
  echo     Please close that application and run this file again.
  pause
  exit /b 1
)

:: [3/3] Start the server hidden. Output goes to server.log / server_err.log
echo [*] Starting the Web UI Downloader in the background...
powershell -NoProfile -Command "Start-Process node -ArgumentList 'src/index.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden -RedirectStandardOutput '%~dp0server.log' -RedirectStandardError '%~dp0server_err.log'"

:: Wait for the server to become ready (up to ~20 seconds)
set /a tries=0
:wait_loop
set /a tries+=1
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://localhost:3000/api/health' -TimeoutSec 2; if ($r.name -eq 'dlm3u8') { exit 0 } } catch {}; exit 1" >nul 2>&1
if %errorlevel%==0 goto started
if %tries% geq 20 goto failed
ping -n 2 127.0.0.1 >nul
goto wait_loop

:started
echo [+] Server is ready at http://localhost:3000
echo [*] The browser will open the Dashboard shortly.
echo.
echo [!] To stop the server: click the "Shutdown" button in the web UI,
echo     or run Stop_Server.bat
goto end_ok

:failed
echo.
echo [!] ERROR: The server did not start within 20 seconds.
echo.
echo --------- Startup error (server_err.log) ---------
if exist server_err.log type server_err.log
echo --------- Server log (last 20 lines) --------------
if exist server.log powershell -NoProfile -Command "Get-Content 'server.log' -Tail 20"
echo --------------------------------------------------
pause
exit /b 1

:end_ok
echo ===================================================
ping -n 4 127.0.0.1 >nul
