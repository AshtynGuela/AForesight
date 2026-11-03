@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Python environment is missing. Follow README.md to install dependencies.
  pause
  exit /b 1
)
echo AgriForesight - local Philippines farm prototype
echo Open http://127.0.0.1:5000 in your browser.
echo Keep this window open. Press Ctrl+C to stop.
".venv\Scripts\python.exe" app.py
pause
