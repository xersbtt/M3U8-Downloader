@echo off
title Stop M3U8 Downloader Server
cd /d "%~dp0"
echo.
echo ===================================================
echo     STOPPING M3U8 DOWNLOADER DASHBOARD
echo ===================================================
echo.

:: [1/3] Is the server running? (identify our app via /api/health)
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://localhost:3000/api/health' -TimeoutSec 2; if ($r.name -eq 'dlm3u8') { exit 0 } } catch {}; exit 1" >nul 2>&1
if not %errorlevel%==0 (
  echo [*] No M3U8 Downloader server was found running on port 3000.
  goto end_ok
)

:: [2/3] Send a graceful shutdown: the server stops FFmpeg + the browser and saves the queue
echo [*] Sending shutdown command to the server...
powershell -NoProfile -Command "try { Invoke-RestMethod -Uri 'http://localhost:3000/api/shutdown' -Method Post -TimeoutSec 5 | Out-Null } catch {}" >nul 2>&1

:: Wait for the server to exit (up to ~10 seconds)
set /a tries=0
:wait_loop
set /a tries+=1
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }" >nul 2>&1
if %errorlevel%==0 goto stopped
if %tries% geq 10 goto force_kill
ping -n 2 127.0.0.1 >nul
goto wait_loop

:force_kill
:: [3/3] Fallback: force-stop the node process on port 3000 (including child processes)
echo [!] The server did not respond to the shutdown command. Force-stopping the process...
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'node') { taskkill /PID $($c.OwningProcess) /T /F | Out-Null; exit 0 } else { Write-Output ('[!] Port 3000 belongs to process: ' + $p.ProcessName + ' - NOT stopping it, to avoid affecting other apps.'); exit 1 } }; exit 0"
goto stopped

:stopped
echo [+] Server stopped successfully.

:end_ok
echo ===================================================
ping -n 3 127.0.0.1 >nul
