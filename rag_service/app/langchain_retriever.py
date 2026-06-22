"""LangChain retriever backed by Qdrant hybrid search."""

from __future__ import annotations

from typing import Any, Dict, List

from langchain_core.callbacks import AsyncCallbackManagerForRetrieverRun, CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from pydantic import ConfigDict

from .config import RagSettings
from .embedder import embed_texts
from .qdrant_store import QdrantStore


class QdrantHybridRetriever(BaseRetriever):
    """Custom retriever: embed query -> Qdrant vector/keyword/hybrid search."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    store: QdrantStore
    settings: RagSettings

    def _results_to_documents(self, results: List[Dict[str, Any]]) -> List[Document]:
        docs = []
        for r in results:
            docs.append(
                Document(
                    page_content=str(r.get("text") or ""),
                    metadata={
                        "name": r.get("name"),
                        "doc_id": r.get("doc_id"),
                        "chunk_index": r.get("chunk_index"),
                        "score": r.get("score"),
                    },
                )
            )
        return docs

    def _get_relevant_documents(
        self,
        query: str,
        *,
        run_manager: CallbackManagerForRetrieverRun,
    ) -> List[Document]:
        import asyncio

        return asyncio.get_event_loop().run_until_complete(self._aget_relevant_documents(query, run_manager=run_manager))

    async def _aget_relevant_documents(
        self,
        query: str,
        *,
        run_manager: AsyncCallbackManagerForRetrieverRun | None = None,
    ) -> List[Document]:
        vectors = await embed_texts([query], self.settings)
        if not vectors:
            return []
        results = self.store.search(query, self.settings, vectors[0])
        return self._results_to_documents(results)
