# Aerocast-mini: One-Click Startup Script
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  Starting Aerocast - Delhi NCR Air Quality Forecast" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

$PROJECT_ROOT = $PSScriptRoot

# 1. Start FastAPI AI Inference Service
Write-Host "`n[1/3] Starting AI Forecasting Service on port 8000..." -ForegroundColor Yellow
$aiVenvPython = Join-Path $PROJECT_ROOT "ai-service\.venv\Scripts\python.exe"
if (-not (Test-Path $aiVenvPython)) {
    $aiVenvPython = "python"
}
Start-Process -FilePath $aiVenvPython -ArgumentList "-m uvicorn app.main:app --host 127.0.0.1 --port 8000" -WorkingDirectory (Join-Path $PROJECT_ROOT "ai-service")

# 2. Start Express Backend
Write-Host "[2/3] Starting Express Backend API on port 5000..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList "src/server.js" -WorkingDirectory (Join-Path $PROJECT_ROOT "backend")

# 3. Start Vite Frontend
Write-Host "[3/3] Starting Vite Frontend on port 5173..." -ForegroundColor Yellow
Start-Process -FilePath "npm.cmd" -ArgumentList "run dev -- --host 0.0.0.0 --port 5173" -WorkingDirectory (Join-Path $PROJECT_ROOT "frontend")

Start-Sleep -Seconds 3

Write-Host "`nAll 3 services launched successfully!" -ForegroundColor Green
Write-Host "Frontend:    http://localhost:5173" -ForegroundColor Cyan
Write-Host "Backend API: http://localhost:5000" -ForegroundColor Cyan
Write-Host "AI Service:  http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host "`nOpening http://localhost:5173 in your default browser..." -ForegroundColor Green
Start-Process "http://localhost:5173"
