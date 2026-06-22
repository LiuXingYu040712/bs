# Admin Management System (HR + AI + RAG)

本项目是一个基于 React + Vite 的人事管理系统，并集成了基于 RAG 的 AI 助手与知识库管理（Python FastAPI + Qdrant，经 Node 代理）。

## 结构
- 前端：`Vite + React + Ant Design`
- 主后端：`Express`（鉴权、人事业务、知识库元数据、API 网关）
- RAG 微服务：`Python + FastAPI + LangChain`（文档切分、向量化、检索、LLM 生成）
- 向量库：`Qdrant`
- 容器：`Dockerfile`、`docker-compose.yml` + `scripts/docker-start.ps1` 支持一键启动

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

# 2. 一键启动（推荐，Windows 用 .cmd 避免执行策略报错）
.\scripts\docker-start.cmd

# 若直接运行 .ps1 报「禁止运行脚本」，改用：
# powershell -ExecutionPolicy Bypass -File .\scripts\docker-start.ps1

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

## 公网部署（Cloudflare Tunnel）

域名：`app.liuxingyu.fun`（前端）、`api.liuxingyu.fun`（API），配置见 `deploy/cloudflared/config.yml`。

**在部署机器上（需已安装 Docker + cloudflared，并完成 tunnel 凭证 `deploy/cloudflared/qdrant.json`）：**

```powershell
cd D:\bs\liu
copy .env.example .env
# 编辑 .env：填入 DASHSCOPE_API_KEY

# 1. 启动生产四服务（nginx 静态前端 + API 指向 https://api.liuxingyu.fun）
.\scripts\deploy-prod.cmd -Build

# 2. 启动 Cloudflare Tunnel（映射 3000/8080/6333 到公网域名）
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

默认管理员：`admin` / `admin123`（首次启动自动创建）

常用命令：

```powershell
.\scripts\docker-start.ps1 -Logs    # 查看日志
.\scripts\docker-start.ps1 -Down    # 停止并移除容器
.\scripts\docker-start.ps1 -Dev       # 开发模式（源码热更新）
```

或使用 npm 脚本：

```powershell
npm run docker:up
npm run docker:logs
npm run docker:down
npm run docker:dev
```

数据持久化：`server_data`（SQLite）、`qdrant_storage`（向量库）Docker 卷，重启不丢失。

## 运行（本地）
```powershell
cd "d:\bs\liu"
npm install

# 1) 启动 Qdrant（若未运行）
docker run -p 6333:6333 qdrant/qdrant

# 2) 启动 Python RAG 服务
cd rag_service
python -m pip install -r requirements.txt
$env:QDRANT_URL="http://localhost:6333"
$env:DASHSCOPE_API_KEY="your_key"
python -m uvicorn app.main:app --reload --port 8000

# 3) 启动 Node 主后端（另开终端）
cd ..
$env:RAG_SERVICE_URL="http://localhost:8000"
npm run dev:server

# 4) 启动前端（另开终端）
npm run dev
```

或一键前后端（PowerShell 后台作业）：
```powershell
npm run dev:all
```

访问：
- 前端：`http://localhost:3000`
- Node API：`http://localhost:8080`
- Python RAG：`http://localhost:8000`

- 配置环境变量：`VITE_API_BASE`（指向 Node 主后端，默认 `http://localhost:8080`）
- RAG 代理：`RAG_SERVICE_URL`（**必填**，Node 所有 RAG 操作均代理至 Python，默认 `http://localhost:8000`）
- API 封装：`src/api/client.js`
	- `chat(question)`：AI 助手聊天接口
	- `getRagConfig()` / `saveRagConfig(cfg)`：RAG 配置读取与保存
	- `listKnowledgeDocs()`：知识库文档列表

## 后续扩展
- ~~接入真实向量数据库（Qdrant/Milvus）与嵌入模型~~（已通过 Python RAG 服务 + Qdrant 实现）
- ~~RAG 后端迁移至 Python FastAPI + LangChain~~（已完成，Node 通过 `RAG_SERVICE_URL` 代理）
- 为 `EmployeeManagement` 页面接入后端增删改查接口与持久化（已基本完成）
- 增加 `.env` 管理密钥与配置、安全与鉴权
 
## 默认管理员 (开发用)

项目会在首次启动时尝试在 SQLite 中创建一个管理员账户。可通过环境变量覆盖：

- `ADMIN_USERNAME`（默认 `admin`）
- `ADMIN_PASSWORD`（默认 `admin123`）

若不设置，种子账号会以 `admin / admin123` 创建（仅用于本地开发，请上线前修改）。
# AI人事管理系统

一个基于 React + Vite + Ant Design 构建的现代化人事管理系统，集成大模型与RAG技术，提供智能人事管理服务。

## 功能特性

- 🤖 **AI智能助手** - 基于RAG技术的智能问答系统，可查询员工信息、解答人事政策
- 🎨 **精美UI设计** - 基于 Ant Design 5.x，采用渐变色彩和动画效果
- 📱 **响应式布局** - 完美支持移动端和桌面端
- 🚀 **快速开发** - 基于 Vite 构建工具，热更新快速
- 👥 **员工管理** - 完整的员工信息管理，包括部门、职位、级别等
- 📊 **数据概览** - 实时人事数据统计和分析
- 💼 **招聘管理** - 职位发布、简历管理、面试跟踪
- 📅 **考勤管理** - 考勤记录、出勤统计、日历视图
- 💰 **薪资管理** - 薪资计算、报表导出、统计分析
- ⚙️ **系统设置** - 灵活的配置选项
- 🌙 **主题切换** - 支持暗色/亮色主题切换

## 技术栈

- React 18
- Vite 5
- Ant Design 5
- React Router 6

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

### 构建生产版本

```bash
npm run build
```

### 预览生产版本

```bash
npm run preview
```

## 项目结构

```
├── src/
│   ├── components/        # 组件目录
│   │   └── Layout/       # 布局组件
│   ├── pages/            # 页面目录
│   │   ├── Dashboard.jsx      # 仪表板
│   │   ├── UserManagement.jsx # 用户管理
│   │   ├── DataManagement.jsx # 数据管理
│   │   ├── Settings.jsx       # 系统设置
│   │   └── Login.jsx         # 登录页面
│   ├── App.jsx           # 主应用组件
│   ├── main.jsx          # 入口文件
│   └── index.css         # 全局样式
├── index.html            # HTML 模板
├── vite.config.js        # Vite 配置
└── package.json          # 项目配置
```

## 页面说明

- **登录页面** (`/login`): AI人事管理系统登录入口
- **数据概览** (`/dashboard`): 人事数据统计和可视化分析
- **员工管理** (`/employees`): 员工信息的增删改查，包括部门、职位、级别管理
- **AI智能助手** (`/ai-assistant`): 基于RAG技术的智能问答，可查询人事相关信息
- **招聘管理** (`/recruitment`): 职位发布、简历管理、面试进度跟踪
- **考勤管理** (`/attendance`): 考勤记录查询、出勤统计、日历视图
- **薪资管理** (`/salary`): 薪资计算、报表导出、统计分析
- **系统设置** (`/settings`): 系统配置和参数设置

## AI功能说明

### RAG智能助手
- 基于检索增强生成（RAG）技术
- 可查询员工信息、人事政策、薪资标准等
- 支持多轮对话和上下文理解
- 显示参考来源，保证信息准确性

## 开发说明

本项目使用 Ant Design 作为 UI 组件库，提供了丰富的组件和样式。所有页面都采用了响应式设计，可以在不同设备上良好显示。

## License

MIT

