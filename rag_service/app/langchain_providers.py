"""LangChain model factories (ChatOpenAI / OpenAIEmbeddings via compatible APIs)."""

from __future__ import annotations

import os
from typing import Tuple

from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from .config import RagSettings


def _llm_base_and_key(settings: RagSettings) -> Tuple[str, str]:
    if settings.llm_provider == "deepseek":
        key = os.getenv("DEEPSEEK_API_KEY")
        if not key:
            raise RuntimeError("DEEPSEEK_API_KEY is not set")
        return "https://api.deepseek.com/v1", key
    key = os.getenv("DASHSCOPE_API_KEY")
    if not key:
        raise RuntimeError("DASHSCOPE_API_KEY is not set")
    return "https://dashscope.aliyuncs.com/compatible-mode/v1", key


def _embedding_base_and_key(settings: RagSettings) -> Tuple[str, str]:
    provider = settings.provider
    if provider == "openai":
        key = os.getenv("OPENAI_API_KEY")
        if not key:
            raise RuntimeError("OPENAI_API_KEY is not set")
        return "https://api.openai.com/v1", key
    if provider == "deepseek":
        key = os.getenv("DEEPSEEK_API_KEY")
        if not key:
            raise RuntimeError("DEEPSEEK_API_KEY is not set")
        return "https://api.deepseek.com/v1", key
    key = os.getenv("DASHSCOPE_API_KEY")
    if not key:
        raise RuntimeError("DASHSCOPE_API_KEY is not set")
    return os.getenv("EMBEDDING_BASE_URL") or "https://dashscope.aliyuncs.com/compatible-mode/v1", key


def get_chat_model(settings: RagSettings, *, temperature: float | None = None) -> ChatOpenAI:
    base_url, api_key = _llm_base_and_key(settings)
    temp = settings.temperature if temperature is None else temperature
    kwargs = {
        "model": settings.llm_model,
        "api_key": api_key,
        "base_url": base_url,
        "temperature": temp,
        "max_tokens": settings.max_tokens,
        "streaming": True,
    }
    return ChatOpenAI(**kwargs)


def get_embeddings(settings: RagSettings) -> OpenAIEmbeddings:
    base_url, api_key = _embedding_base_and_key(settings)
    kwargs = {
        "model": settings.model,
        "api_key": api_key,
        "base_url": base_url,
        "check_embedding_ctx_length": False,
    }
    if settings.provider in ("dashscope", "openai") and settings.dim:
        kwargs["dimensions"] = settings.dim
    return OpenAIEmbeddings(**kwargs)


def langchain_enabled(settings: RagSettings) -> bool:
    env = os.getenv("USE_LANGCHAIN", "").lower()
    if env in ("0", "false", "no"):
        return False
    if env in ("1", "true", "yes"):
        return True
    return getattr(settings, "use_langchain", True)
