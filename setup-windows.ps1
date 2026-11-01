# GoMaxi — one-time Windows setup. Right-click → "Run with PowerShell", or in PowerShell:
#   Set-ExecutionPolicy -Scope Process Bypass; .\setup-windows.ps1
# It installs Node.js LTS (if missing), installs the project dependencies and starts the app.

$ErrorActionPreference = 'Stop'
Write-Host "GoMaxi setup" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js not found. Installing Node.js LTS with winget..." -ForegroundColor Yellow
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
    # Make the new install visible to this PowerShell session
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
  } else {
    Write-Host "winget is not available. Please install Node.js LTS from https://nodejs.org/en/download, then run this script again." -ForegroundColor Red
    exit 1
  }
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js was installed but this window cannot see it yet. Close PowerShell, open it again, and run this script once more." -ForegroundColor Yellow
  exit 1
}

Write-Host ("Node " + (node -v) + " / npm " + (npm -v)) -ForegroundColor Green
Set-Location $PSScriptRoot
Write-Host "Installing dependencies (first time takes a minute)..." -ForegroundColor Cyan
npm install --no-audit --no-fund
Write-Host "Starting GoMaxi at http://localhost:5173 (press Ctrl+C to stop)" -ForegroundColor Green
Start-Process "http://localhost:5173"
npm run dev
