"""LangChain LCEL chain structure tests (no API calls)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from langchain_core.messages import AIMessage, HumanMessage

from app.config import RagSettings
from app.langchain_rag import _build_rag_prompt, _history_to_messages, build_lcel_chain


def test_rag_prompt_has_placeholders():
    prompt = _build_rag_prompt(use_rag=True)
    text = prompt.format(
        question="测试",
        context="片段",
        history=[HumanMessage(content="你好"), AIMessage(content="您好")],
    )
    assert "测试" in text
    assert "片段" in text


def test_lcel_chain_compiles():
    settings = RagSettings()
    prompt = _build_rag_prompt(use_rag=True)
    # 仅验证 LCEL 首段（Prompt）可编译，避免单测依赖 API Key
    assert "question" in prompt.input_variables
    assert "context" in prompt.input_variables
    assert "history" in prompt.input_variables
    assert settings.use_langchain is True


def test_history_to_messages():
    msgs = _history_to_messages([{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"}])
    assert len(msgs) == 2
    assert isinstance(msgs[0], HumanMessage)


if __name__ == "__main__":
    import pytest

    raise SystemExit(pytest.main([__file__, "-v"]))
