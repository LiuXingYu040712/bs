# Admin Management System (HR + AI + RAG)

本项目是一个基于 React + Vite 的人事管理系统，并集成了基于 RAG 的 AI 助手与知识库管理（Python FastAPI + Qdrant，经 Node 代理）。

## 结构

- 前端：`Vite + React + Ant Design`
- 主后端：`Express`（鉴权、人事业务、知识库元数据、API 网关）
- RAG 微服务：`Python + FastAPI + LangChain`（文档切分、向量化、检索、LLM 生成）
- 向量库：`Qdrant`
- 容器：`Dockerfile`、`docker-compose.yml` + `scripts/docker-start.ps1` 支持一键启动

架构细节见 [ARCHITECTURE.md](ARCHITECTURE.md)；RAG 服务 API、环境变量与测试见 [rag_service/README.md](rag_service/README.md)。

## 功能概览

- 数据概览、员工管理、招聘、考勤、薪资
- AI 智能助手（RAG 问答、SSE 流式、多轮对话）
- 知识库上传与 RAG 配置（管理员）
- 用户注册、个人中心、意见反馈

| 页面 | 路径 |
|------|------|
| 登录 / 注册 | `/login`、`/register` |
| 数据概览 | `/dashboard` |
| 员工管理 | `/employees` |
| AI 助手 | `/ai-assistant` |
| 知识库 / RAG 配置 | `/knowledge-base`、`/rag-config` |
| 考勤 / 薪资 / 招聘 | `/attendance`、`/salary`、`/recruitment` |
| 个人中心 / 反馈 | `/profile`、`/feedback` |

## 一键启动（推荐）

先打开 **Docker Desktop**，然后在项目根目录：

```powershell
cd D:\bs\liu
.\start.cmd              # 公网 + 本地（Docker 四服务 + Tunnel 后台）
.\start.cmd -Build       # 改代码后重建镜像
.\start.cmd -Local       # 仅本地开发（API 走 localhost:8080）
.\start.cmd -Down        # 停止全部
```

| 脚本 | 用途 |
|------|------|
| **`start.cmd`** | **公网一键**（生产前端 + API 域名 + Tunnel） |
| `scripts\docker-start.cmd` | 本地 Docker（dev 前端，localhost API） |
| `scripts\deploy-prod.cmd` | 仅 Docker 生产栈（不自动开 Tunnel） |

## 运行（Docker 本地开发）

**前置条件**：已安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```powershell
cd D:\bs\liu

# 1. 配置密钥（首次）
copy .env.example .env
# 编辑 .env，填入 DASHSCOPE_API_KEY

# 2. 一键启动（Windows 用 .cmd 避免执行策略报错）
.\scripts\docker-start.cmd

# 或手动
docker compose up --build -d
```

启动后访问：

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:3000 |
| Node API | http://localhost:8080 |
| Qdrant 面板 | http://localhost:6333/dashboard |

Python RAG（8000）默认仅 Docker 内网访问，经 Node 代理；本地调试可在 `docker-compose.yml` 中取消 `rag_service` 的 `ports` 注释。

常用命令：

```powershell
.\scripts\docker-start.ps1 -Logs    # 查看日志
.\scripts\docker-start.ps1 -Down    # 停止并移除容器
.\scripts\docker-start.ps1 -Dev     # 开发模式（源码热更新）

npm run docker:up
npm run docker:logs
npm run docker:down
npm run docker:dev
```

数据持久化：`server_data`（SQLite）、`qdrant_storage`（向量库）Docker 卷，重启不丢失。

## 公网部署（Cloudflare Tunnel）

域名：`app.liuxingyu.fun`（前端）、`api.liuxingyu.fun`（API），配置见 `deploy/cloudflared/config.yml`。

**在部署机器上（需已安装 Docker + cloudflared，并完成 tunnel 凭证 `deploy/cloudflared/qdrant.json`）：**

```powershell
cd D:\bs\liu
copy .env.example .env
# 编辑 .env：填入 DASHSCOPE_API_KEY

# 1. 启动生产四服务
.\scripts\deploy-prod.cmd -Build

# 2. 启动 Cloudflare Tunnel
.\scripts\deploy-prod.cmd -Tunnel
```

或分两步：先 `deploy-prod.cmd -Build`，另开终端：

```powershell
cloudflared tunnel --config deploy/cloudflared/config.yml run
```

验证：

- https://app.liuxingyu.fun
- https://api.liuxingyu.fun/api/health

停止：`.\scripts\deploy-prod.cmd -Down`

## 运行（本地，非 Docker）

```powershell
cd D:\bs\liu
npm install

# 1) Qdrant
docker run -p 6333:6333 qdrant/qdrant

# 2) Python RAG — 详见 rag_service/README.md
# 3) Node 主后端（另开终端）
$env:RAG_SERVICE_URL="http://localhost:8000"
npm run dev:server

# 4) 前端（另开终端）
npm run dev
```

或 `npm run dev:all`（PowerShell 后台作业）。

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:3000 |
| Node API | http://localhost:8080 |
| Python RAG | http://localhost:8000 |

环境变量：`VITE_API_BASE`（前端 → Node，默认 `http://localhost:8080`）、`RAG_SERVICE_URL`（Node → Python，默认 `http://localhost:8000`）。

## 默认管理员（开发用）

首次启动会在 SQLite 中创建管理员，可通过环境变量覆盖：

- `ADMIN_USERNAME`（默认 `admin`）
- `ADMIN_PASSWORD`（默认 `admin123`）

**上线前务必修改密码。**

## 项目结构

```
liu/
├── src/                 # React 前端
├── server/              # Node Express 主后端
├── rag_service/         # Python FastAPI RAG 微服务
├── deploy/              # Cloudflare Tunnel、nginx 配置
├── scripts/             # Docker / 部署脚本
├── docker-compose.yml   # 本地开发
├── docker-compose.prod.yml
├── start.cmd            # 公网一键启动
└── ARCHITECTURE.md      # 架构说明
```

## License

MIT
