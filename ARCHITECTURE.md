# 人事管理系统 + RAG 智能助手 — 架构说明

## 总览

本项目是一个全栈 HR 管理系统，集成基于 **LangChain + FastAPI + Qdrant** 的 RAG 问答能力。适合作为 AI 应用开发岗位（6k 档）作品集展示。

```
┌─────────────┐     HTTP      ┌──────────────────┐     HTTP      ┌─────────────────┐
│  React 前端  │ ────────────► │  Node.js API     │ ────────────► │  Python RAG     │
│  :3000      │               │  Express :8080   │               │  FastAPI :8000  │
└─────────────┘               └────────┬─────────┘               └────────┬────────┘
                                       │                                    │
                                       ▼                                    ▼
                               ┌──────────────┐                   ┌──────────────┐
                               │  SQLite      │                   │  Qdrant      │
                               │  业务 + 会话  │                   │  向量库 :6333 │
                               └──────────────┘                   └──────────────┘
```

## 职责划分

| 层 | 技术 | 职责 |
|----|------|------|
| 前端 | React + Ant Design | HR 业务 UI、AI 助手（SSE 流式）、知识库管理 |
| Node API | Express + SQLite | 鉴权、人事 CRUD、会话持久化、RAG 代理 |
| Python RAG | FastAPI + LangChain | 文档解析、分块、嵌入、检索、LLM 生成 |
| 向量库 | Qdrant | 文档块向量存储与相似度检索 |

**设计原则**：Node 不直接操作 Qdrant/LLM；所有 RAG 能力经 `RAG_SERVICE_URL` 代理到 Python 服务。

## RAG 流水线

1. **入库**：上传 PDF/DOCX/TXT → Python 解析 → LangChain `RecursiveCharacterTextSplitter` 分块 → 批量嵌入 → Qdrant upsert
2. **检索**：用户问题嵌入 → Qdrant top-K 检索 → 构建上下文
3. **生成**：多轮 history + 检索上下文 → DashScope/DeepSeek Chat Completions（支持 SSE 流式）
4. **严格模式**：`strictKbOnly=true` 时，无检索结果则拒绝编造答案

## 关键 API

### Node（需鉴权）

| 路径 | 权限 | 说明 |
|------|------|------|
| `POST /api/chat` | assistant/admin | 同步 RAG 问答（多轮） |
| `POST /api/chat/stream` | assistant/admin | SSE 流式问答 |
| `POST /api/rag/ingest` | admin | 文档上传入库 |
| `POST /api/rag/search` | assistant/admin | 纯检索 |
| `GET/POST /api/rag/config` | admin | RAG 运行时配置 |

### Python RAG（内网，Node 代理）

| 路径 | 说明 |
|------|------|
| `POST /api/rag/upsert` | JSON 文本入库 |
| `POST /api/rag/search` | 向量检索 |
| `POST /api/chat` | RAG 问答 |
| `POST /api/chat/stream` | SSE 流式问答 |

## 多轮对话

- 有 `sessionId` 时：Node 从 `chat_messages` 表加载最近 12 条作为 history
- 无 session 时：前端传递 `history` 数组
- Python 侧 `normalize_history` 截断至最近 6 轮

## 鉴权模型

- JWT Bearer Token（`Authorization: Bearer <token>`）
- 角色：`admin`（全权限）、`assistant`（AI 助手 + 检索）、普通员工（业务自助）

## 本地启动

```powershell
# 1. Qdrant
docker run -p 6333:6333 qdrant/qdrant

# 2. Python RAG
cd rag_service
python -m uvicorn app.main:app --reload --port 8000

# 3. Node API
cd ..
node ./server/index.js

# 4. 前端
npm.cmd run dev
```

`.env` 需配置：`DASHSCOPE_API_KEY`、`RAG_SERVICE_URL=http://localhost:8000`、`VITE_API_BASE=http://localhost:8080`、`QDRANT_URL=http://localhost:6333`

## Docker 一键启动

```powershell
copy .env.example .env   # 填入 DASHSCOPE_API_KEY
.\scripts\docker-start.ps1
```

等价于 `docker compose up --build -d`，自动拉起 Qdrant + Python RAG + Node + 前端。详见 [README.md](README.md)。

## 测试

```powershell
# 分块单元测试
cd rag_service && python -m pytest tests/test_chunking.py -v

# RAG 召回评测（需 Qdrant + API Key）
python tests/eval_rag.py

# 端到端（需完整服务）
python tests/e2e_test.py
```

## 技术亮点（面试可讲）

1. **微服务拆分**：业务与 RAG 解耦，Python 专注 AI 链路
2. **LangChain 分块**：中英文友好分隔符，可配置 chunk size/overlap
3. **批量嵌入**：减少 API 调用次数
4. **SSE 流式输出**：首 token 延迟低，用户体验好
5. **多轮上下文**：DB + 前端双通道 history
6. **strictKbOnly**：防幻觉，知识库无命中则明确拒答
7. **评测脚本**：Recall@K 可量化检索质量
