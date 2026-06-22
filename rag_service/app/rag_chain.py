"""RAG prompt construction, LLM generation (sync + streaming), LangChain optional path."""

from __future__ import annotations

import json
import os
from typing import Any, AsyncIterator, Dict, List, Optional

import httpx

from .config import RagSettings

MAX_SNIPPET_LEN = 1200
STRICT_KB_REPLY = "未在当前知识库检索到可支撑答案的内容，无法回答该问题。"
MAX_HISTORY_TURNS = 6


def _safe_snippet(text: str) -> str:
    s = str(text or "")
    return s if len(s) <= MAX_SNIPPET_LEN else s[:MAX_SNIPPET_LEN] + "…"


def build_context(results: List[Dict[str, Any]]) -> str:
    parts = []
    for i, r in enumerate(results):
        parts.append(
            f"# 段落{i + 1}（{r.get('name')} - 第{r.get('chunk_index')}块）\n{_safe_snippet(r.get('text', ''))}"
        )
    return "\n\n".join(parts)


def compute_rag_meta(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not results:
        return {"retrievedChunks": 0}
    total_chars = sum(len(str(r.get("text") or "")) for r in results)
    avg_score = sum(float(r.get("score") or 0) for r in results) / len(results)
    return {
        "retrievedChunks": len(results),
        "similarityScore": round(avg_score, 4),
        "contextTokens": round(total_chars / 4),
    }


def normalize_history(history: Optional[List[Dict[str, str]]]) -> List[Dict[str, str]]:
    if not history:
        return []
    cleaned = []
    for item in history[-MAX_HISTORY_TURNS * 2 :]:
        role = item.get("role")
        content = str(item.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            cleaned.append({"role": role, "content": content[:2000]})
    return cleaned[-MAX_HISTORY_TURNS * 2 :]


def build_messages(
    question: str,
    results: List[Dict[str, Any]],
    settings: RagSettings,
    *,
    strict_kb_only: bool = True,
    use_rag: bool = True,
    history: Optional[List[Dict[str, str]]] = None,
) -> List[Dict[str, str]]:
    context = build_context(results) if use_rag else ""
    if use_rag and context.strip():
        system_prompt = (
            "你是企业制度问答助手。你必须且只能依据提供的知识库片段回答，不得使用外部知识、常识补全或主观推断。"
            f"若片段证据不足，必须直接回答“{STRICT_KB_REPLY}”。"
            "回答使用中文，保持简洁。输出结构：\n结论：<1-2句>\n依据：\n- <要点1>\n- <要点2>\n来源：\n- <文档名 + 块编号>"
        )
        user_prompt = (
            f"问题：{question}\n\n已检索到的知识库上下文如下（已截断）：\n\n{context}\n\n"
            f"请仅依据上述片段作答。若证据不足，请直接回复：{STRICT_KB_REPLY}。"
        )
    else:
        system_prompt = "你是一个专业且友好的中文 AI 助手。请用简洁清晰的短段落回答问题。"
        user_prompt = f"问题：{question}"

    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
    messages.extend(normalize_history(history))
    messages.append({"role": "user", "content": user_prompt})
    return messages


def _llm_endpoint(settings: RagSettings) -> tuple[str, str]:
    if settings.llm_provider == "deepseek":
        api_key = os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            raise RuntimeError("DEEPSEEK_API_KEY is not set")
        return "https://api.deepseek.com/v1/chat/completions", api_key
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY is not set")
    return "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", api_key


async def generate_answer(
    question: str,
    results: List[Dict[str, Any]],
    settings: RagSettings,
    *,
    strict_kb_only: bool = True,
    use_rag: bool = True,
    history: Optional[List[Dict[str, str]]] = None,
) -> str:
    from .langchain_providers import langchain_enabled

    if langchain_enabled(settings):
        try:
            from .langchain_rag import generate_answer_lc

            return await generate_answer_lc(
                question, results, settings,
                strict_kb_only=strict_kb_only, use_rag=use_rag, history=history,
            )
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("LangChain generate failed, fallback httpx: %s", exc)

    if strict_kb_only and use_rag and (not results or not build_context(results).strip()):
        return STRICT_KB_REPLY + "请先上传相关文档后再提问。"

    url, api_key = _llm_endpoint(settings)
    messages = build_messages(
        question, results, settings,
        strict_kb_only=strict_kb_only, use_rag=use_rag, history=history,
    )
    temperature = 0 if strict_kb_only else settings.temperature
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": settings.max_tokens,
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return (
            ((data.get("choices") or [{}])[0].get("message") or {}).get("content")
            or data.get("output", {}).get("text")
            or "（无回答）"
        )


async def stream_generate_answer(
    question: str,
    results: List[Dict[str, Any]],
    settings: RagSettings,
    *,
    strict_kb_only: bool = True,
    use_rag: bool = True,
    history: Optional[List[Dict[str, str]]] = None,
) -> AsyncIterator[str]:
    from .langchain_providers import langchain_enabled

    if langchain_enabled(settings):
        try:
            from .langchain_rag import stream_generate_answer_lc

            async for token in stream_generate_answer_lc(
                question, results, settings,
                strict_kb_only=strict_kb_only, use_rag=use_rag, history=history,
            ):
                yield token
            return
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("LangChain stream failed, fallback httpx: %s", exc)

    if strict_kb_only and use_rag and (not results or not build_context(results).strip()):
        yield STRICT_KB_REPLY + "请先上传相关文档后再提问。"
        return

    url, api_key = _llm_endpoint(settings)
    messages = build_messages(
        question, results, settings,
        strict_kb_only=strict_kb_only, use_rag=use_rag, history=history,
    )
    temperature = 0 if strict_kb_only else settings.temperature
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": settings.max_tokens,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                raw = line[5:].strip()
                if raw == "[DONE]":
                    break
                try:
                    chunk = json.loads(raw)
                    delta = ((chunk.get("choices") or [{}])[0].get("delta") or {}).get("content")
                    if delta:
                        yield delta
                except json.JSONDecodeError:
                    continue
