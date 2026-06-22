import os

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional

from .config import get_settings, set_runtime_config
from . import rag_service as svc

load_dotenv()

app = FastAPI(title="RAG Service", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConfigBody(BaseModel):
    config: Dict[str, Any] = Field(default_factory=dict)


class UpsertBody(BaseModel):
    id: str
    name: str
    type: str = "TXT"
    content: str
    config: Dict[str, Any] = Field(default_factory=dict)


class SearchIn(BaseModel):
    query: str
    topK: int = 5
    config: Dict[str, Any] = Field(default_factory=dict)


class HistoryMessage(BaseModel):
    role: str
    content: str


class ChatIn(BaseModel):
    question: Optional[str] = None
    query: Optional[str] = None
    topK: int = 5
    config: Dict[str, Any] = Field(default_factory=dict)
    strictKbOnly: bool = True
    useRAG: bool = True
    history: List[HistoryMessage] = Field(default_factory=list)


class ReindexBody(BaseModel):
    name: str
    type: str = "TXT"
    config: Dict[str, Any] = Field(default_factory=dict)


@app.get("/")
async def root():
    return {
        "service": "RAG Service",
        "status": "ok",
        "health": "/api/rag/health",
        "docs": "/docs",
        "features": [
            "rag",
            "streaming",
            "multi-turn",
            "langchain-lcel",
            "langchain-retriever",
            "langchain-embeddings",
        ],
    }


@app.get("/api/rag/health")
async def health():
    settings = get_settings()
    store = svc.get_store()
    active_points = store.count_points(settings.collection)
    return {
        "status": "ok",
        "collection": settings.collection,
        "activeCollectionPoints": active_points,
        "collections": store.list_collections_summary(),
        "provider": settings.provider,
        "model": settings.model,
        "retrievalMode": settings.retrieval_mode,
        "similarityThreshold": settings.similarity_threshold,
        "topK": settings.top_k,
        "qdrant": os.getenv("QDRANT_URL", "http://localhost:6333"),
    }


@app.post("/api/rag/config")
async def update_config(body: ConfigBody):
    settings = set_runtime_config(body.config)
    return {"ok": True, "collection": settings.collection}


@app.post("/api/rag/upsert")
async def upsert_json(body: UpsertBody):
    try:
        return await svc.upsert_content(
            doc_id=body.id,
            name=body.name,
            doc_type=body.type,
            content=body.content,
            config=body.config,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/rag/ingest")
async def ingest(
    id: str = Form(...),
    name: str = Form(...),
    type: str = Form("TXT"),
    file: UploadFile = File(...),
    config: str = Form("{}"),
):
    import json

    try:
        cfg = json.loads(config or "{}")
    except json.JSONDecodeError:
        cfg = {}
    raw = await file.read()
    try:
        return await svc.upsert_file(doc_id=id, name=name, declared_type=type, raw=raw, config=cfg)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/rag/search")
async def search(body: SearchIn):
    try:
        payload = await svc.search_query(body.query, top_k=body.topK, config=body.config)
        payload["items"] = payload.get("results") or []
        return payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


def _history_payload(body: ChatIn) -> List[Dict[str, str]]:
    return [{"role": m.role, "content": m.content} for m in body.history]


@app.post("/api/chat")
async def chat(body: ChatIn):
    question = body.question or body.query
    if not question:
        raise HTTPException(status_code=400, detail="question/query is required")
    try:
        return await svc.chat_query(
            question,
            top_k=body.topK,
            config=body.config,
            strict_kb_only=body.strictKbOnly,
            use_rag=body.useRAG,
            history=_history_payload(body),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/chat/stream")
async def chat_stream(body: ChatIn):
    question = body.question or body.query
    if not question:
        raise HTTPException(status_code=400, detail="question/query is required")

    async def event_gen():
        try:
            async for chunk in svc.chat_query_stream(
                question,
                top_k=body.topK,
                config=body.config,
                strict_kb_only=body.strictKbOnly,
                use_rag=body.useRAG,
                history=_history_payload(body),
            ):
                yield chunk
        except Exception as e:
            import json
            yield f"event: error\ndata: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.get("/api/rag/docs/{doc_id}/content")
async def doc_content(doc_id: str, config: str = "{}"):
    import json

    try:
        cfg = json.loads(config or "{}")
    except json.JSONDecodeError:
        cfg = {}
    try:
        return await svc.get_doc_content(doc_id, config=cfg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.delete("/api/rag/docs/{doc_id}")
async def delete_doc(doc_id: str, config: str = "{}"):
    import json

    try:
        cfg = json.loads(config or "{}")
    except json.JSONDecodeError:
        cfg = {}
    try:
        return await svc.delete_doc(doc_id, config=cfg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/rag/docs/{doc_id}/reindex")
async def reindex_doc(doc_id: str, body: ReindexBody):
    try:
        return await svc.reindex_doc(doc_id, body.name, body.type, config=body.config)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
