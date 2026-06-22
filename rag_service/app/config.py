"""RAG runtime configuration (mirrors Node server/rag.js settings)."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any, Optional


COLLECTION_BASE = "knowledge_base"
DEFAULT_EMBEDDING_MODEL = "text-embedding-v4"
DEFAULT_EMBEDDING_DIM = 1024


def infer_dimension_from_model(model: Optional[str]) -> Optional[int]:
    if not model:
        return None
    m = model.lower()
    if "3-large" in m:
        return 3072
    if "3-small" in m:
        return 1536
    if "ada-002" in m:
        return 1536
    if "bge-large" in m:
        return 1024
    if "m3e" in m:
        return 768
    if "deepseek" in m:
        return 1536
    return None


def build_collection_name(base: str, model_tag: str, dim: int) -> str:
    tag = re.sub(r"[^a-z0-9]+", "-", (model_tag or "default").lower())
    return f"{base}__{tag}__dim{dim}"


@dataclass
class RagSettings:
    provider: str = "dashscope"
    model: str = DEFAULT_EMBEDDING_MODEL
    dim: int = DEFAULT_EMBEDDING_DIM
    chunk_size: int = 800
    chunk_overlap: int = 0
    chunk_strategy: str = "recursive"
    top_k: int = 5
    similarity_threshold: Optional[float] = None
    retrieval_mode: str = "vector"
    rerank_enabled: bool = False
    temperature: float = 0.2
    max_tokens: int = 512
    llm_provider: str = "dashscope"
    llm_model: str = "qwen-plus"
    use_langchain: bool = True
    collection: str = field(default="")

    @classmethod
    def from_dict(cls, cfg: Optional[dict[str, Any]]) -> "RagSettings":
        cfg = cfg or {}
        provider = cfg.get("vectorProvider") or cfg.get("provider") or "dashscope"
        requested_model = cfg.get("vectorModel") or (
            "text-embedding-3-small" if provider == "openai" else DEFAULT_EMBEDDING_MODEL
        )
        requested_dim = cfg.get("vectorDimension") or infer_dimension_from_model(requested_model)
        if requested_dim is None:
            requested_dim = 1536 if provider == "openai" else DEFAULT_EMBEDDING_DIM

        model = requested_model
        dim = int(requested_dim)

        if provider == "dashscope":
            if not re.match(r"^text-embedding-v\d+$", str(requested_model), re.I):
                model = DEFAULT_EMBEDDING_MODEL
                dim = DEFAULT_EMBEDDING_DIM
        elif provider == "openai":
            if not re.match(r"text-embedding-3-(large|small)", str(requested_model), re.I):
                model = "text-embedding-3-small"
                dim = 1536
            if not dim:
                dim = infer_dimension_from_model(model) or 1536
        elif provider == "deepseek":
            if "deepseek" not in str(requested_model).lower():
                model = "deepseek-embedding"
                dim = 1536
            if not dim:
                dim = infer_dimension_from_model(model) or 1536

        collection = build_collection_name(COLLECTION_BASE, model, dim)
        return cls(
            provider=provider,
            model=model,
            dim=dim,
            chunk_size=max(50, int(cfg.get("chunkSize") or 800)),
            chunk_overlap=max(0, int(cfg.get("chunkOverlap") or 0)),
            chunk_strategy=cfg.get("chunkStrategy") or "recursive",
            top_k=max(1, int(cfg.get("topK") or 5)),
            similarity_threshold=cfg.get("similarityThreshold"),
            retrieval_mode=cfg.get("retrievalMode") or "vector",
            rerank_enabled=bool(cfg.get("rerankEnabled")),
            temperature=float(cfg.get("temperature") if cfg.get("temperature") is not None else 0.2),
            max_tokens=int(cfg.get("maxTokens") or 512),
            llm_provider=cfg.get("llmProvider") or "dashscope",
            llm_model=cfg.get("llmModel") or ("deepseek-chat" if cfg.get("llmProvider") == "deepseek" else "qwen-plus"),
            use_langchain=bool(cfg.get("useLangChain", True)),
            collection=collection,
        )


# In-memory config updated via API (Node pushes on save / before calls)
_runtime_config: dict[str, Any] = {}


def set_runtime_config(cfg: dict[str, Any]) -> RagSettings:
    global _runtime_config
    _runtime_config = dict(cfg or {})
    return RagSettings.from_dict(_runtime_config)


def get_settings(override: Optional[dict[str, Any]] = None) -> RagSettings:
    merged = {**_runtime_config, **(override or {})}
    return RagSettings.from_dict(merged)


def qdrant_auto_recreate() -> bool:
    return os.getenv("QDRANT_AUTO_RECREATE", "").lower() == "true"
