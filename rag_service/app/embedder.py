"""Multi-provider text embeddings (LangChain OpenAIEmbeddings + httpx fallback)."""

from __future__ import annotations

import logging
import os
from typing import List

import httpx

from .config import RagSettings

logger = logging.getLogger(__name__)

API_TIMEOUT = 60.0
BATCH_SIZE = 16


async def embed_texts(texts: List[str], settings: RagSettings) -> List[List[float]]:
    if not texts:
        return []

    from .langchain_providers import get_embeddings, langchain_enabled

    if langchain_enabled(settings):
        try:
            return await _embed_langchain(texts, settings)
        except Exception as exc:
            logger.warning("LangChain embeddings failed, fallback to httpx: %s", exc)

    provider = settings.provider
    if provider == "openai":
        return await _embed_openai_batch(texts, settings)
    if provider == "deepseek":
        return await _embed_deepseek_batch(texts, settings)
    return await _embed_dashscope_batch(texts, settings)


async def _embed_langchain(texts: List[str], settings: RagSettings) -> List[List[float]]:
    embeddings = get_embeddings(settings)
    if len(texts) == 1:
        return [await embeddings.aembed_query(texts[0])]
    return await embeddings.aembed_documents(texts)


async def _embed_dashscope_batch(texts: List[str], settings: RagSettings) -> List[List[float]]:
    key = os.getenv("DASHSCOPE_API_KEY")
    if not key:
        raise RuntimeError("DASHSCOPE_API_KEY is not set")

    url = os.getenv("EMBEDDING_URL") or "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings"
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    out: List[List[float]] = []

    async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i : i + BATCH_SIZE]
            payload = {
                "model": settings.model,
                "input": batch if len(batch) > 1 else batch[0],
                "dimensions": settings.dim,
                "encoding_format": "float",
            }
            r = await client.post(url, json=payload, headers=headers)
            r.raise_for_status()
            data = r.json()
            rows = data.get("data") or []
            if rows:
                rows = sorted(rows, key=lambda x: x.get("index", 0))
                out.extend([row.get("embedding") for row in rows if row.get("embedding")])
            else:
                emb = data.get("embedding")
                if emb:
                    out.append(emb)
            if len(out) < i + len(batch):
                raise RuntimeError("DashScope embeddings returned incomplete batch")
    return out


async def _embed_openai_batch(texts: List[str], settings: RagSettings) -> List[List[float]]:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    url = "https://api.openai.com/v1/embeddings"
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    out: List[List[float]] = []

    async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i : i + BATCH_SIZE]
            payload = {"model": settings.model, "input": batch, "dimensions": settings.dim}
            r = await client.post(url, json=payload, headers=headers)
            r.raise_for_status()
            data = r.json()
            rows = sorted(data.get("data") or [], key=lambda x: x.get("index", 0))
            out.extend([row.get("embedding") for row in rows if row.get("embedding")])
    return out


async def _embed_deepseek_batch(texts: List[str], settings: RagSettings) -> List[List[float]]:
    key = os.getenv("DEEPSEEK_API_KEY")
    if not key:
        raise RuntimeError("DEEPSEEK_API_KEY is not set")

    url = "https://api.deepseek.com/v1/embeddings"
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    out: List[List[float]] = []

    async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i : i + BATCH_SIZE]
            payload = {"model": settings.model, "input": batch if len(batch) > 1 else batch[0]}
            r = await client.post(url, json=payload, headers=headers)
            r.raise_for_status()
            data = r.json()
            rows = sorted(data.get("data") or [], key=lambda x: x.get("index", 0))
            out.extend([row.get("embedding") for row in rows if row.get("embedding")])
    return out
