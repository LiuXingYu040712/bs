"""Core RAG operations shared by API routes."""

from __future__ import annotations

import json
from typing import Any, AsyncIterator, Dict, List, Optional

from .chunking import chunk_text
from .config import RagSettings, get_settings
from .embedder import embed_texts
from .parsers import detect_type, parse_bytes
from .qdrant_store import QdrantStore
from .rag_chain import (
    build_context,
    compute_rag_meta,
    generate_answer,
    stream_generate_answer,
)


def get_store() -> QdrantStore:
    import os

    return QdrantStore(url=os.getenv("QDRANT_URL", "http://localhost:6333"))


async def upsert_content(
    *,
    doc_id: str,
    name: str,
    doc_type: str,
    content: str,
    config: Optional[dict] = None,
) -> Dict[str, Any]:
    settings = get_settings(config)
    store = get_store()
    store.ensure_collection(settings.collection, settings.dim)

    chunks = chunk_text(content, settings.chunk_size, settings.chunk_overlap, settings.chunk_strategy)
    chunks = [c for c in chunks if c.strip()]
    if not chunks:
        raise ValueError("解析到的文本为空（可能是扫描版 PDF 或内容为空）")

    vectors = await embed_texts(chunks, settings)
    store.upsert_chunks(settings.collection, doc_id, name, doc_type, chunks, vectors)
    return {"ok": True, "chunks": len(chunks), "collection": settings.collection}


async def upsert_file(
    *,
    doc_id: str,
    name: str,
    declared_type: str,
    raw: bytes,
    config: Optional[dict] = None,
) -> Dict[str, Any]:
    doc_type, _ = detect_type(name, declared_type)
    content = parse_bytes(raw, doc_type, name)
    return await upsert_content(
        doc_id=doc_id,
        name=name,
        doc_type=doc_type,
        content=content,
        config=config,
    )


async def search_query(
    query: str,
    top_k: Optional[int] = None,
    config: Optional[dict] = None,
) -> Dict[str, Any]:
    settings = get_settings(config)
    if top_k:
        settings.top_k = max(1, int(top_k))

    store = get_store()
    store.ensure_collection(settings.collection, settings.dim)

    vectors = await embed_texts([query], settings)
    if not vectors:
        raise RuntimeError("embed failed")
    results = store.search(query, settings, vectors[0])
    rag_meta = compute_rag_meta(results)
    return {"results": results, "rag": rag_meta}


def _format_sources(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        {"name": r.get("name"), "relevance": r.get("score"), "chunk_index": r.get("chunk_index")}
        for r in results
    ]


async def chat_query(
    question: str,
    top_k: Optional[int] = None,
    config: Optional[dict] = None,
    *,
    strict_kb_only: bool = True,
    use_rag: bool = True,
    history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    settings = get_settings(config)
    if top_k:
        settings.top_k = max(1, int(top_k))

    results: List[Dict[str, Any]] = []
    rag_meta: Dict[str, Any] = {"retrievedChunks": 0}

    if use_rag:
        search_payload = await search_query(question, top_k=settings.top_k, config=config)
        results = search_payload.get("results") or []
        rag_meta = search_payload.get("rag") or compute_rag_meta(results)

    if strict_kb_only and use_rag and (not results or not build_context(results).strip()):
        return {
            "answer": "未在当前知识库检索到可支撑答案的内容，无法回答该问题。请先上传相关文档后再提问。",
            "sources": [],
            "rag": {**rag_meta, "retrievedChunks": 0, "strictKbOnly": True},
        }

    answer = await generate_answer(
        question,
        results,
        settings,
        strict_kb_only=strict_kb_only,
        use_rag=use_rag,
        history=history,
    )

    return {
        "answer": answer,
        "sources": _format_sources(results),
        "rag": {**rag_meta, "items": results},
    }


async def chat_query_stream(
    question: str,
    top_k: Optional[int] = None,
    config: Optional[dict] = None,
    *,
    strict_kb_only: bool = True,
    use_rag: bool = True,
    history: Optional[List[Dict[str, str]]] = None,
) -> AsyncIterator[str]:
    """SSE events: meta -> token* -> done"""
    settings = get_settings(config)
    if top_k:
        settings.top_k = max(1, int(top_k))

    results: List[Dict[str, Any]] = []
    rag_meta: Dict[str, Any] = {"retrievedChunks": 0}

    if use_rag:
        search_payload = await search_query(question, top_k=settings.top_k, config=config)
        results = search_payload.get("results") or []
        rag_meta = search_payload.get("rag") or compute_rag_meta(results)

    meta = {
        "sources": _format_sources(results),
        "rag": {**rag_meta, "items": results},
    }
    yield f"event: meta\ndata: {json.dumps(meta, ensure_ascii=False)}\n\n"

    async for token in stream_generate_answer(
        question,
        results,
        settings,
        strict_kb_only=strict_kb_only,
        use_rag=use_rag,
        history=history,
    ):
        yield f"event: token\ndata: {json.dumps({'text': token}, ensure_ascii=False)}\n\n"

    yield "event: done\ndata: {}\n\n"


async def get_doc_content(doc_id: str, config: Optional[dict] = None) -> Dict[str, Any]:
    settings = get_settings(config)
    store = get_store()
    chunks = store.scroll_doc_chunks(settings.collection, doc_id)
    content = "\n\n".join(c["text"] for c in chunks if c.get("text"))
    return {"id": doc_id, "content": content, "chunks": len(chunks)}


async def delete_doc(doc_id: str, config: Optional[dict] = None) -> Dict[str, Any]:
    settings = get_settings(config)
    store = get_store()
    try:
        store.delete_doc(settings.collection, doc_id)
    except Exception:
        pass
    return {"ok": True}


async def reindex_doc(doc_id: str, name: str, doc_type: str, config: Optional[dict] = None) -> Dict[str, Any]:
    settings = get_settings(config)
    store = get_store()
    chunks = store.scroll_doc_chunks(settings.collection, doc_id)
    if not chunks:
        raise ValueError("No chunks found to reindex")
    content = "\n\n".join(c["text"] for c in chunks if c.get("text"))
    result = await upsert_content(doc_id=doc_id, name=name, doc_type=doc_type, content=content, config=config)
    return {"ok": True, "chunks": result["chunks"]}
