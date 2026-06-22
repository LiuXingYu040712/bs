@echo off
REM 一键 Docker 启动（绕过 PowerShell 执行策略限制）
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0docker-start.ps1" %*
