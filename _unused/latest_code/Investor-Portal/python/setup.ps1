# Setup script for Windows (PowerShell)
# Run from python folder:
#   .\setup.ps1

$ErrorActionPreference = "Stop"

if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment (Python 3.13)..."
    py -3.13 -m venv venv
}

Write-Host "Installing dependencies into venv..."
& .\venv\Scripts\pip install --upgrade pip
& .\venv\Scripts\pip install -r requirements.txt

Write-Host ""
Write-Host "Setup complete. Start the service with:"
Write-Host "  .\venv\Scripts\python run.py"
Write-Host ""
Write-Host "Then set in backend/.env:"
Write-Host "  ONBOARDING_FIELDS_SERVICE_URL=http://localhost:5008"
