"""Document chunking via LangChain text splitters."""

from __future__ import annotations

from typing import List

from langchain_text_splitters import RecursiveCharacterTextSplitter


def chunk_text(
    text: str,
    size: int = 800,
    overlap: int = 0,
    strategy: str = "recursive",
) -> List[str]:
    content = (text or "").strip()
    if not content:
        return []

    if strategy == "fixed":
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=size,
            chunk_overlap=max(0, overlap),
            separators=[""],
        )
    else:
        # recursive / sentence：LangChain 递归字符切分（中英文友好）
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=size,
            chunk_overlap=max(0, overlap),
            separators=["\n\n", "\n", "。", "！", "？", ".", "!", "?", "；", ";", " ", ""],
        )

    return [c.strip() for c in splitter.split_text(content) if c.strip()]
