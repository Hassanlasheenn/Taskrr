# Build frontend for same-origin (nginx) and run full stack.
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
if (-not $Root) { $Root = Get-Location }
else { $Root = Split-Path -Parent $Root }

Set-Location "$Root\frontend"

Write-Host "Building frontend (docker config, same-origin API)..."
npm run build -- --configuration=docker

$Out = $null
foreach ($path in @("dist\frontend\browser", "dist\frontend", "dist\browser", "dist")) {
    if (Test-Path "$Root\frontend\$path\index.html") {
        $Out = "$Root\frontend\$path"
        break
    }
}
if (-not $Out) {
    Write-Host "Build output not found. Check frontend\dist\."
    exit 1
}

Write-Host "Copying $Out -> $Root\frontend-dist"
New-Item -ItemType Directory -Force -Path "$Root\frontend-dist" | Out-Null
Copy-Item -Path "$Out\*" -Destination "$Root\frontend-dist" -Recurse -Force

Set-Location $Root
Write-Host "Starting Docker Compose (nginx + backend + redis + postgres)..."
docker compose up -d --build

Write-Host "Done. Open http://localhost (all traffic via nginx)."
