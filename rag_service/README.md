# FastAPI RAG Service (Python + LangChain)



Node 主后端（`server/index.js`）负责鉴权、人事业务与知识库元数据；本服务专注 RAG 能力：文档切分、向量化、检索与 LLM 生成。



## 架构



```

React 前端 → Node API (8080) → Python RAG (8000) → Qdrant

                      ↘ SQLite / 业务数据

```



详见项目根目录 [ARCHITECTURE.md](../ARCHITECTURE.md)。



## 接口



| 方法 | 路径 | 说明 |

|------|------|------|

| GET | `/api/rag/health` | 健康检查 |

| POST | `/api/rag/config` | 同步 RAG 配置 |

| POST | `/api/rag/upsert` | JSON 入库 `{ id, name, type, content, config }` |

| POST | `/api/rag/ingest` | multipart 上传文件入库 |

| POST | `/api/rag/search` | 检索 `{ query, topK, config }` |

| POST | `/api/chat` | RAG 问答（支持多轮 `history`） |

| POST | `/api/chat/stream` | SSE 流式问答（`meta` → `token*` → `done`） |

| GET | `/api/rag/docs/{id}/content` | 聚合文档块内容 |

| DELETE | `/api/rag/docs/{id}?config={json}` | 删除文档向量 |

| POST | `/api/rag/docs/{id}/reindex` | 重建索引 |



### 多轮对话



```json

{

  "question": "漏打卡怎么办？",

  "topK": 5,

  "strictKbOnly": true,

  "useRAG": true,

  "history": [

    { "role": "user", "content": "公司几点上班？" },

    { "role": "assistant", "content": "标准工作时段 09:00-18:00。" }

  ],

  "config": { ... }

}

```



### SSE 流式



`POST /api/chat/stream` 返回 `text/event-stream`：



- `event: meta` — 检索结果与 sources

- `event: token` — 增量文本 `{ "text": "..." }`

- `event: done` — 结束



## 环境变量



- `QDRANT_URL` — Qdrant 地址（默认 `http://localhost:6333`）

- `DASHSCOPE_API_KEY` — 百炼嵌入/对话（推荐）

- `DEEPSEEK_API_KEY` — DeepSeek 嵌入/对话（可选）

- `OPENAI_API_KEY` — OpenAI 嵌入/对话（可选）

- `VECTOR_MODEL` — 嵌入模型（默认 `text-embedding-v4`）



## 本地运行



```powershell

cd rag_service

python -m pip install -r requirements.txt



$env:QDRANT_URL="http://localhost:6333"

$env:DASHSCOPE_API_KEY="your_key"



python -m uvicorn app.main:app --reload --port 8000

```



Node 端：



```powershell

$env:RAG_SERVICE_URL="http://localhost:8000"

node ./server/index.js

```



## 测试



```powershell

# 分块单元测试（无需外部服务）

python -m pytest tests/test_chunking.py -v



# RAG 召回评测（需 Qdrant + API Key）

python tests/eval_rag.py



# 端到端

python tests/e2e_test.py

```



## LangChain 使用（默认开启）

| 环节 | LangChain 组件 | 说明 |
|------|----------------|------|
| 分块 | `RecursiveCharacterTextSplitter` | 中英文友好分隔符 |
| 嵌入 | `OpenAIEmbeddings` | 对接 DashScope/OpenAI 兼容 API |
| 检索 | `QdrantHybridRetriever` | 自定义 `BaseRetriever`，hybrid 检索 |
| 生成 | `ChatPromptTemplate` + `ChatOpenAI` + LCEL | `prompt \| llm \| StrOutputParser` |
| 流式 | `chain.astream()` | SSE 逐 token 输出 |
| 多轮 | `MessagesPlaceholder("history")` | Human/AI 历史消息 |

关闭 LangChain（回退 httpx 直调）：环境变量 `USE_LANGCHAIN=false` 或 RAG 配置 `useLangChain: false`。

