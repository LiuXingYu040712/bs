"""Unit tests for document chunking."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.chunking import chunk_text


def test_empty_text_returns_empty():
    assert chunk_text("") == []
    assert chunk_text("   ") == []


def test_recursive_splits_long_text():
    text = "第一段内容。" * 50 + "\n\n" + "第二段内容。" * 50
    chunks = chunk_text(text, size=200, overlap=20)
    assert len(chunks) >= 2
    assert all(len(c) <= 250 for c in chunks)


def test_fixed_strategy():
    text = "abcdefghij" * 20
    chunks = chunk_text(text, size=50, overlap=10, strategy="fixed")
    assert len(chunks) >= 2


def test_chinese_sentence_boundaries():
    text = "公司上班时间为09:00-18:00。迟到按分钟累计。漏打卡需提交异常申请。"
    chunks = chunk_text(text, size=30, overlap=0)
    assert len(chunks) >= 1
    joined = "".join(chunks)
    assert "09:00" in joined


if __name__ == "__main__":
    import pytest

    raise SystemExit(pytest.main([__file__, "-v"]))
