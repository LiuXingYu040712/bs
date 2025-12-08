import axios from 'axios'
import { QdrantClient } from '@qdrant/js-client-rest'
import crypto from 'crypto'
import { get } from './db.js'
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' })

const COLLECTION = 'knowledge_base'
// 默认嵌入模型与维度（DashScope）
const EMBEDDING_MODEL = 'text-embedding-v4'
const EMBEDDING_DIM = 1024

async function loadRagConfig() {
  try {
    const row = await get('SELECT value FROM rag_config WHERE key = ?', ['default'])
    if (!row) return {}
    return JSON.parse(row.value || '{}')
  } catch {
    return {}
  }
}

function inferDimensionFromModel(model) {
  if (!model) return undefined
  const m = String(model).toLowerCase()
  if (m.includes('3-large')) return 3072
  if (m.includes('3-small')) return 1536
  if (m.includes('ada-002')) return 1536
  if (m.includes('bge-large')) return 1024
  if (m.includes('m3e')) return 768
  if (m.includes('deepseek')) return 1536
  return undefined
}

function buildCollectionName(base, modelTag, dim) {
  const tag = modelTag ? String(modelTag).toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'default'
  return `${base}__${tag}__dim${dim}`
}

export async function getActiveEmbeddingSettings() {
  const cfg = await loadRagConfig()
  const provider = cfg.vectorProvider || 'dashscope'
  let requestedModel = cfg.vectorModel || (provider === 'openai' ? 'text-embedding-3-small' : EMBEDDING_MODEL)
  let requestedDim = cfg.vectorDimension || inferDimensionFromModel(cfg.vectorModel) || (provider === 'openai' ? 1536 : EMBEDDING_DIM)

  // 对应提供商的默认与校验
  let model = requestedModel
  let dim = requestedDim
  if (provider === 'dashscope') {
    const isDashScopeEmbedding = /^text-embedding-v\d+$/i.test(String(requestedModel))
    if (!isDashScopeEmbedding) {
      model = EMBEDDING_MODEL
      dim = EMBEDDING_DIM
    }
  } else if (provider === 'openai') {
    // OpenAI 最新嵌入模型维度：3-large=3072，3-small=1536
    if (!/text-embedding-3-(large|small)/i.test(String(requestedModel))) {
      model = 'text-embedding-3-small'
      dim = 1536
    }
    if (!dim) dim = inferDimensionFromModel(model) || 1536
  } else if (provider === 'deepseek') {
    // DeepSeek 默认嵌入模型与维度
    if (!/deepseek/i.test(String(requestedModel))) {
      model = 'deepseek-embedding'
      dim = 1536
    }
    if (!dim) dim = inferDimensionFromModel(model) || 1536
  }
  const chunkSize = Math.max(50, Number(cfg.chunkSize) || 800)
  const chunkOverlap = Math.max(0, Number(cfg.chunkOverlap) || 0)
  const chunkStrategy = cfg.chunkStrategy || 'recursive'
  const topK = Math.max(1, Number(cfg.topK) || 5)
  const similarityThreshold = typeof cfg.similarityThreshold === 'number' ? cfg.similarityThreshold : undefined
  const retrievalMode = cfg.retrievalMode || 'vector'
  const rerankEnabled = !!cfg.rerankEnabled
  const temperature = typeof cfg.temperature === 'number' ? cfg.temperature : 0.2
  const maxTokens = typeof cfg.maxTokens === 'number' ? cfg.maxTokens : undefined
  const collection = buildCollectionName(COLLECTION, model, dim)
  return { provider, model, dim, chunkSize, chunkOverlap, chunkStrategy, topK, similarityThreshold, retrievalMode, rerankEnabled, temperature, maxTokens, collection }
}

function extractVectorSize(vectors) {
  if (!vectors) return undefined
  // Single-vector config: { size, distance }
  if (typeof vectors.size === 'number') return vectors.size
  // Multi-vector config: { name1: { size, distance }, name2: { ... } }
  if (typeof vectors === 'object') {
    const first = Object.values(vectors)[0]
    if (first && typeof first.size === 'number') return first.size
  }
  return undefined
}

export async function ensureCollection(name, dim) {
  const collections = await qdrant.getCollections()
  const exists = collections.collections.some((c) => c.name === name)
  if (!exists) {
    await qdrant.createCollection(name, {
      vectors: { size: dim, distance: 'Cosine' },
    })
    return
  }

  // If exists, verify vector dimension; recreate if mismatched and allowed
  try {
    const info = await qdrant.getCollection(name)
    const existingDim = extractVectorSize(info?.result?.config?.params?.vectors)
    if (existingDim && existingDim !== dim) {
      const autoRecreate = `${process.env.QDRANT_AUTO_RECREATE || ''}`.toLowerCase() === 'true'
      const msg = `Qdrant collection \"${name}\" dimension mismatch: existing=${existingDim}, expected=${dim}`
      if (!autoRecreate) {
        throw new Error(`${msg}. Set QDRANT_AUTO_RECREATE=true to auto recreate, or delete the collection manually.`)
      }
      await qdrant.deleteCollection(name)
      await qdrant.createCollection(name, {
        vectors: { size: dim, distance: 'Cosine' },
      })
    }
  } catch (e) {
    if (e?.message?.includes('dimension mismatch') || e?.status === 400) throw e
  }
}

export async function embedTexts(texts, { provider = 'dashscope', model, dim }) {
  const vectors = []
  if (provider === 'openai') {
    const url = 'https://api.openai.com/v1/embeddings'
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set. Please configure in .env.')
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }
    for (const t of texts) {
      const payload = {
        model: model || 'text-embedding-3-small',
        input: t,
        dimensions: dim, // 注意：OpenAI 3-small/3-large默认维度固定，传入dimensions仅在部分模型可用
      }
      const { data } = await axios.post(url, payload, { headers })
      const emb = data?.data?.[0]?.embedding
      if (!emb) throw new Error('OpenAI embeddings returned empty for a chunk')
      vectors.push(emb)
    }
    return vectors
  } else if (provider === 'deepseek') {
    const url = 'https://api.deepseek.com/v1/embeddings'
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not set. Please configure in .env.')
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }
    for (const t of texts) {
      const payload = {
        model: model || 'deepseek-embedding',
        input: t,
      }
      const { data } = await axios.post(url, payload, { headers })
      const emb = data?.data?.[0]?.embedding
      if (!emb) throw new Error('DeepSeek embeddings returned empty for a chunk')
      vectors.push(emb)
    }
    return vectors
  } else {
    // DashScope（百炼）兼容模式
    const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings'
    const apiKey = process.env.DASHSCOPE_API_KEY
    if (!apiKey) {
      throw new Error('DASHSCOPE_API_KEY is not set. Please configure DashScope API key in environment or .env file.')
    }
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }
    for (const t of texts) {
      const payload = {
        model: model || EMBEDDING_MODEL,
        input: t,
        dimensions: dim || EMBEDDING_DIM,
        encoding_format: 'float',
      }
      const { data } = await axios.post(url, payload, { headers })
      const emb = data?.data?.[0]?.embedding || data?.embedding
      if (!emb) throw new Error('DashScope compatible embeddings returned empty for a chunk')
      vectors.push(emb)
    }
    return vectors
  }
}

function splitBySentences(input) {
  const s = String(input || '')
  // 以中英文句末标点和换行作为分句依据，保留标点
  const segments = []
  let buffer = ''
  for (let i = 0; i < s.length; i++) {
    buffer += s[i]
    if (/([。！？!?；;]|\n)/.test(s[i])) {
      segments.push(buffer)
      buffer = ''
    }
  }
  if (buffer) segments.push(buffer)
  return segments
}

export function chunkText(text, size = 800, overlap = 0, strategy = 'recursive') {
  const parts = []
  if (strategy === 'sentence') {
    const sentences = splitBySentences(text)
    let current = ''
    for (const sent of sentences) {
      if ((current + sent).length <= size) {
        current += sent
      } else {
        if (current) parts.push(current)
        current = sent
      }
    }
    if (current) parts.push(current)
    // 处理重叠：按前一块尾部添加重叠字符
    if (overlap > 0 && parts.length > 1) {
      const withOverlap = []
      for (let i = 0; i < parts.length; i++) {
        const prevTail = i > 0 ? parts[i - 1].slice(Math.max(parts[i - 1].length - overlap, 0)) : ''
        withOverlap.push((prevTail + parts[i]).slice(0, size))
      }
      return withOverlap
    }
    return parts
  }

  if (strategy === 'recursive') {
    // 先按段落分割，再合并到目标大小
    const paragraphs = String(text || '').split(/\n\n+/)
    let current = ''
    for (const p of paragraphs) {
      const block = p + '\n\n'
      if ((current + block).length <= size) {
        current += block
      } else {
        if (current) parts.push(current)
        current = block
      }
    }
    if (current) parts.push(current)
    // 若仍有超长段，退化为固定大小切分
    const fixed = []
    const step = Math.max(1, size - Math.max(0, overlap))
    for (const part of parts) {
      if (part.length <= size) {
        fixed.push(part)
      } else {
        let start = 0
        while (start < part.length) {
          fixed.push(part.slice(start, start + size))
          start += step
        }
      }
    }
    return fixed
  }

  // 默认：固定大小切分
  const step = Math.max(1, size - Math.max(0, overlap))
  let start = 0
  const s = String(text || '')
  while (start < s.length) {
    parts.push(s.slice(start, start + size))
    start += step
  }
  return parts
}

export async function upsertDocument({ id, name, type, content }) {
  const settings = await getActiveEmbeddingSettings()
  await ensureCollection(settings.collection, settings.dim)
  const chunks = chunkText(content, settings.chunkSize, settings.chunkOverlap, settings.chunkStrategy)
  const embeddings = await embedTexts(chunks, { provider: settings.provider, model: settings.model, dim: settings.dim })

  const points = embeddings.map((vec, idx) => ({
    id: Number(BigInt('0x' + crypto.createHash('sha1').update(id + ':' + idx).digest('hex')) % 9007199254740991n),
    vector: vec,
    payload: { doc_id: id, name, type, chunk_index: idx, text: chunks[idx] },
  }))

  try {
    await qdrant.upsert(settings.collection, { points })
  } catch (err) {
    const msg = err?.response?.data?.status?.error || err?.message || ''
    if (/Vector dimension error/i.test(msg)) {
      const autoRecreate = `${process.env.QDRANT_AUTO_RECREATE || ''}`.toLowerCase() === 'true'
      if (!autoRecreate) throw err
      // Auto-fix: drop & recreate collection with expected dim, then retry once
      await qdrant.deleteCollection(settings.collection)
      await qdrant.createCollection(settings.collection, {
        vectors: { size: settings.dim, distance: 'Cosine' },
      })
      await qdrant.upsert(settings.collection, { points })
    } else {
      throw err
    }
  }
  return { chunks: chunks.length }
}

export async function search(query, topKOverride) {
  const settings = await getActiveEmbeddingSettings()
  await ensureCollection(settings.collection, settings.dim)
  const limit = topKOverride || settings.topK || 5

  // 关键词检索：简单的包含与频次评分
  async function keywordRetrieve(q) {
    const terms = String(q).toLowerCase().split(/\s+/).filter(Boolean)
    const collected = []
    let offset = undefined
    const BATCH = 500
    while (true) {
      const resp = await qdrant.scroll(settings.collection, {
        limit: BATCH,
        offset,
        with_payload: true,
      })
      const points = resp.points || []
      for (const p of points) {
        const text = String(p.payload?.text || '')
        const low = text.toLowerCase()
        let score = 0
        for (const t of terms) {
          if (!t) continue
          const occurrences = (low.match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
          score += occurrences
        }
        if (score > 0) {
          collected.push({
            score,
            text,
            name: p.payload?.name,
            doc_id: p.payload?.doc_id,
            chunk_index: p.payload?.chunk_index,
          })
        }
      }
      if (!resp.next_page_offset) break
      offset = resp.next_page_offset
    }
    collected.sort((a, b) => b.score - a.score)
    return collected.slice(0, limit)
  }

  // 向量检索
  async function vectorRetrieve(q) {
    const [queryVec] = await embedTexts([q], { provider: settings.provider, model: settings.model, dim: settings.dim })
    const result = await qdrant.search(settings.collection, {
      vector: queryVec,
      limit,
      with_payload: true,
    })
    return result.map((r) => ({
      score: r.score,
      text: r.payload.text,
      name: r.payload.name,
      doc_id: r.payload.doc_id,
      chunk_index: r.payload.chunk_index,
    }))
  }

  let retrieved = []
  if (settings.retrievalMode === 'keyword') {
    retrieved = await keywordRetrieve(query)
  } else if (settings.retrievalMode === 'hybrid') {
    const [vecRes, keyRes] = await Promise.all([vectorRetrieve(query), keywordRetrieve(query)])
    // 归一化后融合
    const all = [...vecRes, ...keyRes]
    const byKey = new Map()
    for (const r of all) {
      const k = `${r.doc_id}:${r.chunk_index}`
      const prev = byKey.get(k)
      const sc = r.score
      byKey.set(k, prev ? { ...prev, score: prev.score + sc } : r)
    }
    retrieved = Array.from(byKey.values())
    retrieved.sort((a, b) => b.score - a.score)
    retrieved = retrieved.slice(0, limit)
  } else {
    retrieved = await vectorRetrieve(query)
  }

  // 相似度阈值过滤（仅对向量/混合有效，关键词评分不适用该阈值）
  if (typeof settings.similarityThreshold === 'number' && settings.retrievalMode !== 'keyword') {
    retrieved = retrieved.filter((r) => r.score >= settings.similarityThreshold)
  }

  // 简单重排序（伪 rerank）：按长度与分数综合，启用时略微提升高分短片段
  if (settings.rerankEnabled) {
    retrieved = retrieved
      .map((r) => ({ ...r, _len: (r.text || '').length }))
      .sort((a, b) => (b.score - a.score) || (a._len - b._len))
  }

  return retrieved
}

export async function getActiveCollectionName() {
  const settings = await getActiveEmbeddingSettings()
  await ensureCollection(settings.collection, settings.dim)
  return settings.collection
}
