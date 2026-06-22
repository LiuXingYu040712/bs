"""LangChain LCEL RAG: retriever + ChatPromptTemplate + ChatOpenAI (+ StrOutputParser)."""

from __future__ import annotations

from typing import Any, AsyncIterator, Dict, List, Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import RunnablePassthrough

from .config import RagSettings
from .langchain_providers import get_chat_model
from .rag_chain import (
    STRICT_KB_REPLY,
    build_context,
    normalize_history,
)

RAG_SYSTEM = (
    "你是企业制度问答助手。你必须且只能依据提供的知识库片段回答，不得使用外部知识、常识补全或主观推断。"
    f"若片段证据不足，必须直接回答“{STRICT_KB_REPLY}”。"
    "回答使用中文，保持简洁。输出结构：\n结论：<1-2句>\n依据：\n- <要点1>\n- <要点2>\n来源：\n- <文档名 + 块编号>"
)

CHAT_SYSTEM = "你是一个专业且友好的中文 AI 助手。请用简洁清晰的短段落回答问题。"


def _history_to_messages(history: Optional[List[Dict[str, str]]]) -> List[BaseMessage]:
    messages: List[BaseMessage] = []
    for item in normalize_history(history):
        if item["role"] == "user":
            messages.append(HumanMessage(content=item["content"]))
        else:
            messages.append(AIMessage(content=item["content"]))
    return messages


def _build_rag_prompt(*, use_rag: bool) -> ChatPromptTemplate:
    if use_rag:
        return ChatPromptTemplate.from_messages(
            [
                ("system", RAG_SYSTEM),
                MessagesPlaceholder("history"),
                (
                    "human",
                    "问题：{question}\n\n已检索到的知识库上下文如下（已截断）：\n\n{context}\n\n"
                    f"请仅依据上述片段作答。若证据不足，请直接回复：{STRICT_KB_REPLY}。",
                ),
            ]
        )
    return ChatPromptTemplate.from_messages(
        [
            ("system", CHAT_SYSTEM),
            MessagesPlaceholder("history"),
            ("human", "问题：{question}"),
        ]
    )


def build_lcel_chain(settings: RagSettings, *, strict_kb_only: bool = True, use_rag: bool = True):
    """LCEL: input dict -> prompt -> llm -> StrOutputParser"""
    temperature = 0 if strict_kb_only else settings.temperature
    llm = get_chat_model(settings, temperature=temperature)
    prompt = _build_rag_prompt(use_rag=use_rag)
    return prompt | llm | StrOutputParser()


async def generate_answer_lc(
    question: str,
    results: List[Dict[str, Any]],
    settings: RagSettings,
    *,
    strict_kb_only: bool = True,
    use_rag: bool = True,
    history: Optional[List[Dict[str, str]]] = None,
) -> str:
    if strict_kb_only and use_rag and (not results or not build_context(results).strip()):
        return STRICT_KB_REPLY + "请先上传相关文档后再提问。"

    chain = build_lcel_chain(settings, strict_kb_only=strict_kb_only, use_rag=use_rag)
    payload = {
        "question": question,
        "context": build_context(results) if use_rag else "",
        "history": _history_to_messages(history),
    }
    return await chain.ainvoke(payload)


async def stream_generate_answer_lc(
    question: str,
    results: List[Dict[str, Any]],
    settings: RagSettings,
    *,
    strict_kb_only: bool = True,
    use_rag: bool = True,
    history: Optional[List[Dict[str, str]]] = None,
) -> AsyncIterator[str]:
    if strict_kb_only and use_rag and (not results or not build_context(results).strip()):
        yield STRICT_KB_REPLY + "请先上传相关文档后再提问。"
        return

    temperature = 0 if strict_kb_only else settings.temperature
    llm = get_chat_model(settings, temperature=temperature)
    prompt = _build_rag_prompt(use_rag=use_rag)
    chain = prompt | llm

    payload = {
        "question": question,
        "context": build_context(results) if use_rag else "",
        "history": _history_to_messages(history),
    }

    async for chunk in chain.astream(payload):
        text = chunk.content if hasattr(chunk, "content") else str(chunk)
        if text:
            yield text


def build_retrieval_chain(settings: RagSettings, retriever):
    """Optional LCEL chain: question -> retriever -> format -> prompt -> llm (for demos/tests)."""
    temperature = 0
    llm = get_chat_model(settings, temperature=temperature)
    prompt = _build_rag_prompt(use_rag=True)

    def format_docs(docs):
        return build_context(
            [
                {
                    "name": d.metadata.get("name"),
                    "chunk_index": d.metadata.get("chunk_index"),
                    "text": d.page_content,
                }
                for d in docs
            ]
        )

    chain = (
        RunnablePassthrough.assign(
            context=lambda x: format_docs(retriever.invoke(x["question"])),
            history=lambda x: x.get("history") or [],
        )
        | prompt
        | llm
        | StrOutputParser()
    )
    return chain
