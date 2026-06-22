# Docker one-click start (Windows PowerShell)
# Usage:
#   .\scripts\docker-start.cmd          # 快速启动（用已有镜像，几秒）
#   .\scripts\docker-start.cmd -Build   # 重新构建镜像（改代码后 / 首次）
#   .\scripts\docker-start.cmd -Dev
#   .\scripts\docker-start.cmd -Down
#   .\scripts\docker-start.cmd -Logs

param(
    [switch]$Dev,
    [switch]$Down,
    [switch]$Logs,
    [switch]$Build
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Ensure-EnvFile {
    if (-not (Test-Path ".env")) {
        if (Test-Path ".env.example") {
            Copy-Item ".env.example" ".env"
            Write-Host "[docker] Created .env from .env.example - set DASHSCOPE_API_KEY" -ForegroundColor Yellow
        } else {
            throw ".env not found and .env.example missing"
        }
    }
    $content = Get-Content ".env" -Raw
    if ($content -match "your_dashscope_key") {
        Write-Host "[docker] WARN: set a valid DASHSCOPE_API_KEY in .env" -ForegroundColor Yellow
    }
}

if ($Down) {
    if ($Dev) { docker compose -f docker-compose.yml -f docker-compose.dev.yml down }
    else { docker compose down }
    exit 0
}

if ($Logs) {
    if ($Dev) { docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f }
    else { docker compose logs -f }
    exit 0
}

Ensure-EnvFile

$needBuild = $Build
if (-not $needBuild) {
    $required = @("liu-frontend", "liu-server", "liu-rag_service")
    foreach ($img in $required) {
        $found = docker images --format "{{.Repository}}" 2>$null | Select-String -Pattern "^$([regex]::Escape($img))$" -Quiet
        if (-not $found) { $needBuild = $true; break }
    }
}

if ($needBuild) {
    Write-Host "[docker] Building images (first run or -Build; may take 10-30 min)..." -ForegroundColor Cyan
    if ($Dev) {
        docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
    } else {
        docker compose up --build -d
    }
} else {
    Write-Host "[docker] Starting services (using cached images)..." -ForegroundColor Cyan
    if ($Dev) {
        docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
    } else {
        docker compose up -d
    }
}

Write-Host ""
Write-Host "Waiting for services..." -ForegroundColor Cyan
$maxWait = 120
$elapsed = 0
while ($elapsed -lt $maxWait) {
    try {
        $raw = docker compose ps --format json 2>$null
        if ($raw) {
            $lines = @($raw) | Where-Object { $_.Trim() -ne "" }
            $ps = @()
            foreach ($line in $lines) {
                try { $ps += ($line | ConvertFrom-Json) } catch {}
            }
            if ($ps.Count -ge 4) {
                $allHealthy = $true
                foreach ($svc in $ps) {
                    if ($svc.State -ne "running") { $allHealthy = $false }
                    if ($svc.Health -and $svc.Health -notin @("healthy", "")) { $allHealthy = $false }
                }
                if ($allHealthy) { break }
            }
        }
    } catch {}
    Start-Sleep -Seconds 3
    $elapsed += 3
}

docker compose ps

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Frontend:  http://localhost:3000" -ForegroundColor Green
Write-Host "  Node API:  http://localhost:8080" -ForegroundColor Green
Write-Host "  RAG API:   http://localhost:8000" -ForegroundColor Green
Write-Host "  Qdrant:    http://localhost:6333/dashboard" -ForegroundColor Green
Write-Host "  Login:     admin / admin123" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Logs:    .\scripts\docker-start.cmd -Logs" -ForegroundColor Gray
Write-Host "Stop:    .\scripts\docker-start.cmd -Down" -ForegroundColor Gray
Write-Host "Rebuild: .\scripts\docker-start.cmd -Build" -ForegroundColor Gray
