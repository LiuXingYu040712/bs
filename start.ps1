# 一键启动（公网版：Docker 四服务 + Cloudflare Tunnel 后台）
# Usage:
#   .\start.cmd              # 公网一键（推荐）
#   .\start.cmd -Build       # 改代码后重建再启动
#   .\start.cmd -Local       # 仅本地开发（localhost API）
#   .\start.cmd -Down        # 全部停止

param(
    [switch]$Local,
    [switch]$Down,
    [switch]$Build
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if ($Down) {
    Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    & "$Root\scripts\deploy-prod.ps1" -Down
    docker compose down 2>$null
    Write-Host "[start] All stopped." -ForegroundColor Green
    exit 0
}

if ($Local) {
    $argsList = @()
    if ($Build) { $argsList += "-Build" }
    & "$Root\scripts\docker-start.ps1" @argsList
    exit 0
}

# 公网生产栈
$deployArgs = @()
if ($Build) { $deployArgs += "-Build" }
& "$Root\scripts\deploy-prod.ps1" @deployArgs

$cfg = Join-Path $Root "deploy\cloudflared\config.yml"
$cred = Join-Path $Root "deploy\cloudflared\qdrant.json"
if ((Test-Path $cfg) -and (Test-Path $cred) -and (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Process -FilePath "cloudflared" -ArgumentList @("tunnel", "--config", $cfg) -WorkingDirectory $Root -WindowStyle Minimized
    Write-Host "[start] Cloudflare Tunnel started (background)." -ForegroundColor Green
} else {
    Write-Host "[start] WARN: cloudflared not configured — public domain unavailable." -ForegroundColor Yellow
    Write-Host "        Local only: http://localhost:3000" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  https://app.liuxingyu.fun" -ForegroundColor Green
Write-Host "  http://localhost:3000" -ForegroundColor Green
Write-Host "  admin / admin123" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
