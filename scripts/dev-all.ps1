# 本地一键启动：Node 后端 + Python RAG + Vite 前端
# 用法: npm run dev:all  或  .\scripts\dev-all.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "[dev:all] Starting server, RAG service, and Vite..." -ForegroundColor Cyan

Start-Job -Name "server" -ScriptBlock {
    Set-Location $using:Root
    node ./server/index.js
} | Out-Null

Start-Job -Name "rag" -ScriptBlock {
    Set-Location (Join-Path $using:Root "rag_service")
    python -m uvicorn app.main:app --reload --port 8000
} | Out-Null

Write-Host "  Node API:  http://localhost:8080" -ForegroundColor Green
Write-Host "  RAG API:   http://localhost:8000" -ForegroundColor Green
Write-Host "  Frontend:  http://localhost:3000" -ForegroundColor Green

npm.cmd run dev
