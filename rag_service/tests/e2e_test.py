import os
import sys
import time
import uuid
import httpx


SERVICE_URL = os.getenv('SERVICE_URL', 'http://localhost:8000')


def fail(msg):
    print('ERROR:', msg)
    sys.exit(2)


def main():
    print('Service URL:', SERVICE_URL)
    client = httpx.Client(timeout=60)

    # 1) Health
    try:
        r = client.get(f'{SERVICE_URL}/api/rag/health')
        r.raise_for_status()
        print('Health OK:', r.json())
    except Exception as e:
        fail(f'health check failed: {e}')

    config = {
        'vectorProvider': 'dashscope',
        'vectorModel': os.getenv('VECTOR_MODEL', 'text-embedding-v4'),
        'vectorDimension': 1024,
        'chunkSize': 400,
        'topK': 3,
        'llmProvider': 'dashscope',
        'llmModel': 'qwen-plus',
    }

    try:
        r = client.post(f'{SERVICE_URL}/api/rag/config', json={'config': config})
        r.raise_for_status()
        print('Config sync OK:', r.json())
    except Exception as e:
        fail(f'config sync failed: {e}')

    # 2) Upsert via JSON (same path Node proxy uses)
    doc_id = str(uuid.uuid4())
    name = 'e2e-test-doc'
    text = '公司制度示例：禁止在办公区吸烟。\n\n请遵守考勤制度，上班时间为 09:00-18:00。'
    try:
        r = client.post(
            f'{SERVICE_URL}/api/rag/upsert',
            json={'id': doc_id, 'name': name, 'type': 'TXT', 'content': text, 'config': config},
        )
        r.raise_for_status()
        print('Upsert OK:', r.json())
    except Exception as e:
        fail(f'upsert failed: {e}')

    print('Waiting 2s for Qdrant consistency...')
    time.sleep(2)

    # 3) Search
    try:
        r = client.post(
            f'{SERVICE_URL}/api/rag/search',
            json={'query': '禁止 吸烟', 'topK': 3, 'config': config},
        )
        r.raise_for_status()
        js = r.json()
        results = js.get('results') or js.get('items') or []
        print('Search returned:', len(results), 'items')
        if not results:
            fail('search returned no items')
    except Exception as e:
        fail(f'search failed: {e}')

    # 4) Chat (RAG + history)
    try:
        r = client.post(
            f'{SERVICE_URL}/api/chat',
            json={
                'question': '办公区可以吸烟吗？',
                'topK': 3,
                'config': config,
                'strictKbOnly': True,
                'useRAG': True,
                'history': [{'role': 'user', 'content': '公司制度有哪些？'}],
            },
        )
        r.raise_for_status()
        body = r.json()
        print('Chat answer preview:', (body.get('answer') or '')[:200])
        if not body.get('answer'):
            fail('chat returned empty answer')
    except Exception as e:
        fail(f'chat failed: {e}')

    # 5) Stream chat (smoke test)
    try:
        with client.stream(
            'POST',
            f'{SERVICE_URL}/api/chat/stream',
            json={
                'question': '上班时间是什么？',
                'topK': 3,
                'config': config,
                'strictKbOnly': True,
                'useRAG': True,
            },
        ) as r:
            r.raise_for_status()
            got_token = False
            for line in r.iter_lines():
                if line.startswith('event: token'):
                    got_token = True
            if not got_token:
                print('WARN: stream returned no tokens (LLM may be unavailable)')
    except Exception as e:
        fail(f'stream chat failed: {e}')

    print('E2E test completed successfully')


if __name__ == '__main__':
    main()
