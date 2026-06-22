"""Qdrant vector store operations."""

from __future__ import annotations

import hashlib
from typing import Any, Dict, List, Optional

from qdrant_client import QdrantClient
from qdrant_client.http import models as rest

from .config import RagSettings, qdrant_auto_recreate


def _point_id(doc_id: str, idx: int) -> int:
    digest = hashlib.sha1(f"{doc_id}:{idx}".encode()).hexdigest()
    return int(digest, 16) % 9007199254740991


class QdrantStore:
    def __init__(self, url: str = "http://localhost:6333"):
        self.client = QdrantClient(url=url)

    def _extract_vector_size(self, vectors: Any) -> Optional[int]:
        if vectors is None:
            return None
        if hasattr(vectors, "size"):
            return vectors.size
        if isinstance(vectors, dict):
            first = next(iter(vectors.values()), None)
            if first is not None and hasattr(first, "size"):
                return first.size
        return None

    def count_points(self, collection: str) -> int:
        try:
            info = self.client.get_collection(collection)
            return int(getattr(info, "points_count", 0) or 0)
        except Exception:
            return 0

    def list_collections_summary(self) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        try:
            for c in self.client.get_collections().collections:
                try:
                    info = self.client.get_collection(c.name)
                    out.append(
                        {
                            "name": c.name,
                            "points_count": int(getattr(info, "points_count", 0) or 0),
                            "indexed_vectors_count": int(getattr(info, "indexed_vectors_count", 0) or 0),
                        }
                    )
                except Exception:
                    out.append({"name": c.name, "points_count": -1, "indexed_vectors_count": -1})
        except Exception:
            pass
        return out

    def ensure_collection(self, name: str, dim: int) -> None:
        collections = self.client.get_collections().collections
        exists = any(c.name == name for c in collections)
        if not exists:
            self.client.create_collection(
                collection_name=name,
                vectors_config=rest.VectorParams(size=dim, distance=rest.Distance.COSINE),
            )
            return

        info = self.client.get_collection(name)
        existing_dim = self._extract_vector_size(info.config.params.vectors)
        if existing_dim and existing_dim != dim:
            msg = f'Qdrant collection "{name}" dimension mismatch: existing={existing_dim}, expected={dim}'
            if not qdrant_auto_recreate():
                raise RuntimeError(
                    f"{msg}. Set QDRANT_AUTO_RECREATE=true to auto recreate, or delete the collection manually."
                )
            self.client.delete_collection(name)
            self.client.create_collection(
                collection_name=name,
                vectors_config=rest.VectorParams(size=dim, distance=rest.Distance.COSINE),
            )

    def upsert_chunks(
        self,
        collection: str,
        doc_id: str,
        name: str,
        doc_type: str,
        chunks: List[str],
        vectors: List[List[float]],
    ) -> None:
        points = []
        for idx, (text, vec) in enumerate(zip(chunks, vectors)):
            points.append(
                rest.PointStruct(
                    id=_point_id(doc_id, idx),
                    vector=vec,
                    payload={
                        "doc_id": doc_id,
                        "name": name,
                        "type": doc_type,
                        "chunk_index": idx,
                        "text": text,
                    },
                )
            )
        try:
            self.client.upsert(collection_name=collection, points=points)
        except Exception as err:
            msg = str(err)
            if "Vector dimension error" in msg and qdrant_auto_recreate():
                self.client.delete_collection(collection)
                self.client.create_collection(
                    collection_name=collection,
                    vectors_config=rest.VectorParams(size=len(vectors[0]), distance=rest.Distance.COSINE),
                )
                self.client.upsert(collection_name=collection, points=points)
            else:
                raise

    def delete_doc(self, collection: str, doc_id: str) -> None:
        self.client.delete(
            collection_name=collection,
            points_selector=rest.FilterSelector(
                filter=rest.Filter(must=[rest.FieldCondition(key="doc_id", match=rest.MatchValue(value=doc_id))])
            ),
        )

    def scroll_doc_chunks(self, collection: str, doc_id: str) -> List[Dict[str, Any]]:
        collected: List[Dict[str, Any]] = []
        offset = None
        while True:
            resp = self.client.scroll(
                collection_name=collection,
                limit=200,
                offset=offset,
                with_payload=True,
                scroll_filter=rest.Filter(
                    must=[rest.FieldCondition(key="doc_id", match=rest.MatchValue(value=doc_id))]
                ),
            )
            points = getattr(resp, "points", None) or (resp[0] if isinstance(resp, tuple) else [])
            next_offset = getattr(resp, "next_page_offset", None) if not isinstance(resp, tuple) else resp[1]
            for p in points:
                payload = p.payload or {}
                collected.append(
                    {
                        "index": payload.get("chunk_index", 0),
                        "text": payload.get("text", ""),
                        "name": payload.get("name"),
                    }
                )
            if next_offset is None:
                break
            offset = next_offset
        collected.sort(key=lambda x: x["index"])
        return collected

    def _query_terms(self, query: str) -> List[str]:
        """Split query for keyword match; add 2-char slices for Chinese phrases."""
        q = (query or "").strip().lower()
        if not q:
            return []
        terms = [t for t in q.split() if t]
        if len(terms) == 1 and len(terms[0]) >= 2:
            token = terms[0]
            if any("\u4e00" <= c <= "\u9fff" for c in token):
                for i in range(len(token) - 1):
                    terms.append(token[i : i + 2])
        return list(dict.fromkeys(terms))

    def _vector_query_hits(self, collection: str, query_vector: List[float], limit: int) -> List[Any]:
        """qdrant-client >=1.16 removed search(); use query_points with legacy fallback."""
        if hasattr(self.client, "query_points"):
            resp = self.client.query_points(
                collection_name=collection,
                query=query_vector,
                limit=limit,
                with_payload=True,
            )
            return list(getattr(resp, "points", None) or [])
        return self.client.search(
            collection_name=collection,
            query_vector=query_vector,
            limit=limit,
            with_payload=True,
        )

    def vector_search(self, collection: str, query_vector: List[float], limit: int) -> List[Dict[str, Any]]:
        hits = self._vector_query_hits(collection, query_vector, limit)
        return [
            {
                "score": hit.score,
                "text": (hit.payload or {}).get("text", ""),
                "name": (hit.payload or {}).get("name"),
                "doc_id": (hit.payload or {}).get("doc_id"),
                "chunk_index": (hit.payload or {}).get("chunk_index"),
            }
            for hit in hits
        ]

    def keyword_search(self, collection: str, query: str, limit: int) -> List[Dict[str, Any]]:
        terms = self._query_terms(query)
        collected: List[Dict[str, Any]] = []
        offset = None
        while True:
            resp = self.client.scroll(
                collection_name=collection,
                limit=500,
                offset=offset,
                with_payload=True,
            )
            points = getattr(resp, "points", None) or (resp[0] if isinstance(resp, tuple) else [])
            next_offset = getattr(resp, "next_page_offset", None) if not isinstance(resp, tuple) else resp[1]
            for p in points:
                payload = p.payload or {}
                text = str(payload.get("text") or "")
                low = text.lower()
                score = 0.0
                for term in terms:
                    score += low.count(term)
                if score > 0:
                    collected.append(
                        {
                            "score": score,
                            "text": text,
                            "name": payload.get("name"),
                            "doc_id": payload.get("doc_id"),
                            "chunk_index": payload.get("chunk_index"),
                        }
                    )
            if next_offset is None:
                break
            offset = next_offset

        collected.sort(key=lambda x: x["score"], reverse=True)
        return collected[:limit]

    def search(self, query: str, settings: RagSettings, query_vector: List[float]) -> List[Dict[str, Any]]:
        limit = settings.top_k
        mode = settings.retrieval_mode

        if mode == "keyword":
            retrieved = self.keyword_search(settings.collection, query, limit)
        elif mode == "hybrid":
            vec_res = self.vector_search(settings.collection, query_vector, limit)
            key_res = self.keyword_search(settings.collection, query, limit)
            vec_max = max(1.0, max((float(r["score"]) for r in vec_res), default=1.0))
            key_max = max(1.0, max((float(r["score"]) for r in key_res), default=1.0))
            v_weight, k_weight = 0.7, 0.3
            merged: Dict[str, Dict[str, Any]] = {}
            for r in vec_res:
                key = f"{r['doc_id']}:{r['chunk_index']}"
                norm = float(r["score"]) / vec_max
                prev = merged.get(key, {**r, "score": 0.0})
                prev["score"] = float(prev["score"]) + norm * v_weight
                merged[key] = prev
            for r in key_res:
                key = f"{r['doc_id']}:{r['chunk_index']}"
                norm = float(r["score"]) / key_max
                prev = merged.get(key, {**r, "score": 0.0})
                prev["score"] = float(prev["score"]) + norm * k_weight
                merged[key] = prev
            retrieved = sorted(merged.values(), key=lambda x: x["score"], reverse=True)[:limit]
            for r in retrieved:
                r["score"] = min(1.0, float(r["score"]))
        else:
            retrieved = self.vector_search(settings.collection, query_vector, limit)

        if settings.similarity_threshold is not None and mode != "keyword":
            threshold = float(settings.similarity_threshold)
            filtered = [r for r in retrieved if float(r["score"]) >= threshold]
            # 阈值过高会把全部结果滤掉：保留原始 top 结果，避免“库里有数据却检索为 0”
            retrieved = filtered if filtered else retrieved[:limit]

        if settings.rerank_enabled:
            retrieved = sorted(
                retrieved,
                key=lambda r: (-float(r["score"]), len(r.get("text") or "")),
            )

        return retrieved
