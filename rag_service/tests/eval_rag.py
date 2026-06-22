"""Simple RAG evaluation: recall@k on sample Q&A pairs.

Usage:
  SERVICE_URL=http://localhost:8000 python tests/eval_rag.py
"""

from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

SERVICE_URL = os.getenv("SERVICE_URL", "http://localhost:8000")

SAMPLE_DOC = """
员工考勤制度：
1. 标准工作时段为 09:00-18:00，午休 1 小时。
2. 超过规定上班时间记为迟到，按分钟累计。
3. 漏打卡需提交考勤异常申请，填写原因与时间，等待审核。
4. 办公区内禁止吸烟。

薪资说明：
本月工资 = 基本工资 + 绩效 + 奖金 - 个税 - 社保。
如有疑问可查看薪资明细或联系 HR。
"""

EVAL_CASES = [
    {"query": "公司几点上班", "must_contain": ["09:00", "18:00"]},
    {"query": "漏打卡怎么办", "must_contain": ["异常", "申请"]},
    {"query": "办公区可以吸烟吗", "must_contain": ["禁止", "吸烟"]},
    {"query": "工资怎么算", "must_contain": ["基本", "绩效"]},
]


def main():
    client = httpx.Client(timeout=60)
    config = {
        "vectorProvider": "dashscope",
        "vectorModel": os.getenv("VECTOR_MODEL", "text-embedding-v4"),
        "vectorDimension": 1024,
        "chunkSize": 400,
        "topK": 3,
    }

    doc_id = str(uuid.uuid4())
    print(f"Upserting eval doc {doc_id}...")
    r = client.post(
        f"{SERVICE_URL}/api/rag/upsert",
        json={"id": doc_id, "name": "eval-sample", "type": "TXT", "content": SAMPLE_DOC, "config": config},
    )
    r.raise_for_status()

    hits = 0
    for i, case in enumerate(EVAL_CASES, 1):
        r = client.post(
            f"{SERVICE_URL}/api/rag/search",
            json={"query": case["query"], "topK": 3, "config": config},
        )
        r.raise_for_status()
        results = r.json().get("results") or []
        combined = " ".join(str(x.get("text") or "") for x in results)
        ok = all(kw in combined for kw in case["must_contain"])
        hits += int(ok)
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] Q{i}: {case['query']} -> {len(results)} chunks")

    recall = hits / len(EVAL_CASES) if EVAL_CASES else 0
    print(f"\nRecall@{config['topK']}: {hits}/{len(EVAL_CASES)} = {recall:.0%}")
    if recall < 0.75:
        print("WARNING: recall below 75%, check embeddings and chunk settings")
        sys.exit(1)
    print("Eval passed")


if __name__ == "__main__":
    main()
