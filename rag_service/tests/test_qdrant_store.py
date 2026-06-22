"""Qdrant store API compatibility tests."""

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.qdrant_store import QdrantStore


def test_vector_search_uses_query_points():
    store = QdrantStore.__new__(QdrantStore)
    store.client = MagicMock()
    store.client.query_points.return_value = SimpleNamespace(
        points=[
            SimpleNamespace(
                score=0.9,
                payload={"text": "hello", "name": "doc", "doc_id": "d1", "chunk_index": 0},
            )
        ]
    )

    results = store.vector_search("kb", [0.1, 0.2], 3)

    store.client.query_points.assert_called_once_with(
        collection_name="kb",
        query=[0.1, 0.2],
        limit=3,
        with_payload=True,
    )
    assert results[0]["text"] == "hello"
    assert results[0]["score"] == 0.9


def test_ensure_collection_creates_when_missing():
    store = QdrantStore.__new__(QdrantStore)
    store.client = MagicMock()
    store.client.get_collections.return_value = SimpleNamespace(collections=[])
    store.ensure_collection("kb_new", 1024)
    store.client.create_collection.assert_called_once()


def test_vector_search_falls_back_to_search():
    store = QdrantStore.__new__(QdrantStore)
    store.client = MagicMock(spec=["search"])
    store.client.search.return_value = [
        SimpleNamespace(
            score=0.5,
            payload={"text": "legacy", "name": "doc", "doc_id": "d2", "chunk_index": 1},
        )
    ]

    results = store.vector_search("kb", [0.3], 2)

    store.client.search.assert_called_once()
    assert results[0]["text"] == "legacy"
