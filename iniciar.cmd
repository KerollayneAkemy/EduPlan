@echo off
cd /d "%~dp0"
echo Abra http://localhost:8000 . Use Ctrl+C para encerrar o EduPlan.
"%~dp0.venv\Scripts\python.exe" -m uvicorn app:app --host 127.0.0.1 --port 8000
pause
