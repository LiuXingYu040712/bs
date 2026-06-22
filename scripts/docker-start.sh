#!/usr/bin/env bash
# 一键 Docker 启动（Linux / macOS / Git Bash）
# 用法: ./scripts/docker-start.sh
#       ./scripts/docker-start.sh --dev

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEV=false
DOWN=false
LOGS=false

for arg in "$@"; do
  case "$arg" in
    --dev) DEV=true ;;
    --down) DOWN=true ;;
    --logs) LOGS=true ;;
  esac
done

ensure_env() {
  if [[ ! -f .env ]]; then
    if [[ -f .env.example ]]; then
      cp .env.example .env
      echo "[docker] 已从 .env.example 创建 .env，请填写 DASHSCOPE_API_KEY"
    else
      echo "错误: 缺少 .env 和 .env.example" >&2
      exit 1
    fi
  fi
  if grep -q 'your_dashscope_key' .env 2>/dev/null; then
    echo "[docker] 警告: 请在 .env 中配置有效的 DASHSCOPE_API_KEY"
  fi
}

if $DOWN; then
  if $DEV; then docker compose -f docker-compose.yml -f docker-compose.dev.yml down
  else docker compose down; fi
  exit 0
fi

if $LOGS; then
  if $DEV; then docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f
  else docker compose logs -f; fi
  exit 0
fi

ensure_env

echo "[docker] 构建并启动全部服务..."
if $DEV; then
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
else
  docker compose up --build -d
fi

echo ""
echo "等待服务就绪..."
sleep 15
docker compose ps

cat <<'EOF'

========================================
  前端:     http://localhost:3000
  Node API: http://localhost:8080
  RAG API:  http://localhost:8000
  Qdrant:   http://localhost:6333/dashboard
  默认账号: admin / admin123
========================================

查看日志: ./scripts/docker-start.sh --logs
停止服务: ./scripts/docker-start.sh --down
EOF
