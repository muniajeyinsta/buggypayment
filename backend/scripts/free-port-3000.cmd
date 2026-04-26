@echo off
REM Kills the process Windows reports as LISTENING on TCP :3000 (dev helper).
set "PORT=%~1"
if "%PORT%"=="" set "PORT=3000"
echo [free-port] Looking for LISTENING on port %PORT% ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
  echo [free-port] taskkill /PID %%a /F
  taskkill /PID %%a /F 2>nul
)
