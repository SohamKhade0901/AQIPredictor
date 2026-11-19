@echo off
title Aerocast Delhi NCR Air Quality Forecast System
echo =====================================================
echo   Starting Aerocast - Delhi NCR Air Quality Forecast
echo =====================================================

cd /d "%~dp0"

echo [1/3] Starting FastAPI AI Service on port 8000...
start "Aerocast AI Service (Port 8000)" cmd /k "cd /d "%~dp0ai-service" && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

echo [2/3] Starting Express Backend on port 5000...
start "Aerocast Backend (Port 5000)" cmd /k "cd /d "%~dp0backend" && node src/server.js"

echo [3/3] Starting Vite Frontend on port 5173...
start "Aerocast Frontend (Port 5173)" cmd /k "cd /d "%~dp0frontend" && npm.cmd run dev -- --host 0.0.0.0 --port 5173"

timeout /t 3 >nul

echo Opening browser...
start http://localhost:5173
echo All services launched!
