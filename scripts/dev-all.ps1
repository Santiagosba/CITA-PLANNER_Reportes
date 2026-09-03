$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$server = Join-Path (Split-Path -Parent $root) 'CitaplannerServer'

if (-not (Test-Path $server)) {
  Write-Error "No se encontró CitaplannerServer en: $server"
}

Write-Host "Iniciando API en CitaplannerServer (puerto 3002)..."
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$server'; npm run dev"

Start-Sleep -Seconds 2
Write-Host "Iniciando frontend Vite (puerto 3001)..."
Set-Location $root
npm run dev
