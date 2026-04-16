@echo off
REM From repo root: free :3000 then start the Buggy API (Windows).
cd /d "%~dp0"
call "%~dp0scripts\free-port-3000.cmd" 3000
node server\index.js
