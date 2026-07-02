@echo off
setlocal
set "ROOT=%~dp0"
set "PYW=%ROOT%.venv\Scripts\pythonw.exe"

if not exist "%PYW%" (
  echo pythonw.exe not found: %PYW%
  exit /b 1
)

start "" "%PYW%" "%ROOT%data_storage_server.py"
start "" "%PYW%" "%ROOT%ai_review_server.py"

exit /b 0
