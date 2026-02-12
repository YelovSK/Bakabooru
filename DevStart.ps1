# DevStart.ps1
# This script launches the Bakabooru API, Scanner, and Client in separate windows.

Write-Host "Starting Bakabooru Development Environment..." -ForegroundColor Cyan

# 1. Start the API
Write-Host "Launching API (Bakabooru.Server)..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd server; dotnet run --project Bakabooru.Server" -Title "Bakabooru API"

# 2. Start the Scanner
Write-Host "Launching Scanner (Bakabooru.Scanner)..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd server; dotnet run --project Bakabooru.Scanner" -Title "Bakabooru Scanner"

# 3. Start the Client
Write-Host "Launching Client (Angular)..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd client; npm start" -Title "Bakabooru Client"

Write-Host "All services launched in separate windows." -ForegroundColor Green
Write-Host "API: http://localhost:5119"
Write-Host "Client: http://localhost:4200"
