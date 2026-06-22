# 公网生产部署：Docker 四服务 + Cloudflare Tunnel
# Usage:
#   .\scripts\deploy-prod.cmd           # 构建并启动
#   .\scripts\deploy-prod.cmd -Tunnel   # 同时启动 cloudflared（需已安装并配置 tunnel）
#   .\scripts\deploy-prod.cmd -Down

param(
    [switch]$Tunnel,
    [switch]$Down,
    [switch]$Build
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$ComposeFile = "docker-compose.prod.yml"

function Ensure-EnvFile {
    if (-not (Test-Path ".env")) {
        if (Test-Path ".env.example") {
            Copy-Item ".env.example" ".env"
            Write-Host "[deploy] Created .env from .env.example" -ForegroundColor Yellow
        } else {
            throw ".env not found"
        }
    }
    $content = Get-Content ".env" -Raw
    if ($content -notmatch "DASHSCOPE_API_KEY=sk-") {
        Write-Host "[deploy] WARN: set DASHSCOPE_API_KEY in .env" -ForegroundColor Yellow
    }
}

if ($Down) {
    docker compose -f $ComposeFile down
    Write-Host "[deploy] Stopped production stack." -ForegroundColor Green
    exit 0
}

Ensure-EnvFile

# 生产构建参数（写入前端镜像）
if (-not $env:VITE_API_BASE) {
    $env:VITE_API_BASE = "https://api.liuxingyu.fun"
}

$composeArgs = @("-f", $ComposeFile, "up", "-d")
if ($Build) { $composeArgs += "--build" }

Write-Host "[deploy] Starting production stack (VITE_API_BASE=$($env:VITE_API_BASE))..." -ForegroundColor Cyan
& docker compose @composeArgs

Write-Host ""
Write-Host "Waiting for health checks..." -ForegroundColor Cyan
Start-Sleep -Seconds 15
docker compose -f $ComposeFile ps

Write-Host ""
Write-Host "Local checks:" -ForegroundColor Green
Write-Host "  Frontend  http://localhost:3000"
Write-Host "  API       http://localhost:8080/api/health"
Write-Host "  Qdrant UI http://localhost:6333/dashboard"
Write-Host ""
Write-Host "Public (after cloudflared tunnel):" -ForegroundColor Green
Write-Host "  https://app.liuxingyu.fun"
Write-Host "  https://api.liuxingyu.fun/api/health"
Write-Host ""

if ($Tunnel) {
    $cfg = Join-Path $Root "deploy\cloudflared\config.yml"
    $cred = Join-Path $Root "deploy\cloudflared\qdrant.json"
    if (-not (Test-Path $cfg)) { throw "Missing $cfg" }
    if (-not (Test-Path $cred)) { throw "Missing $cred - run: cloudflared tunnel login" }
    $cf = Get-Command cloudflared -ErrorAction SilentlyContinue
    if (-not $cf) { throw "cloudflared not in PATH. Install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" }
    Write-Host "[deploy] Starting Cloudflare Tunnel (foreground). Ctrl+C to stop tunnel only." -ForegroundColor Cyan
    & cloudflared tunnel --config $cfg run
} else {
    Write-Host "Tip: run with -Tunnel to start cloudflared after Docker is up." -ForegroundColor Yellow
}
