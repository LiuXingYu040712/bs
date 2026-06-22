import axios from 'axios'
import { get } from './db.js'

const RAG_SERVICE_URL = (process.env.RAG_SERVICE_URL || '').replace(/\/$/, '')

const COLLECTION = 'knowledge_base'
const EMBEDDING_MODEL = 'text-embedding-v4'
const EMBEDDING_DIM = 1024

function assertRagService() {
  if (!RAG_SERVICE_URL) {
    throw new Error(
      'RAG_SERVICE_URL is not configured. Start the Python RAG service and set RAG_SERVICE_URL in .env (e.g. http://localhost:8000).'
    )
  }
}

export async function loadRagConfig() {
  try {
    const row = await get('SELECT value FROM rag_config WHERE key = ?', ['default'])
    if (!row) return {}
    return JSON.parse(row.value || '{}')
  } catch {
    return {}
  }
}

async function syncConfigToPython(config) {
  assertRagService()
  await axios.post(`${RAG_SERVICE_URL}/api/rag/config`, { config }, { timeout: 10000 })
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

  let model = requestedModel
  let dim = requestedDim
  if (provider === 'dashscope') {
    if (!/^text-embedding-v\d+$/i.test(String(requestedModel))) {
      model = EMBEDDING_MODEL
      dim = EMBEDDING_DIM
    }
  } else if (provider === 'openai') {
    if (!/text-embedding-3-(large|small)/i.test(String(requestedModel))) {
      model = 'text-embedding-3-small'
      dim = 1536
    }
    if (!dim) dim = inferDimensionFromModel(model) || 1536
  } else if (provider === 'deepseek') {
    if (!/deepseek/i.test(String(requestedModel))) {
      model = 'deepseek-embedding'
      dim = 1536
    }
    if (!dim) dim = inferDimensionFromModel(model) || 1536
  }

  const collection = buildCollectionName(COLLECTION, model, dim)
  return {
    provider,
    model,
    dim,
    topK: Math.max(1, Number(cfg.topK) || 5),
    temperature: typeof cfg.temperature === 'number' ? cfg.temperature : 0.2,
    maxTokens: typeof cfg.maxTokens === 'number' ? cfg.maxTokens : undefined,
    collection,
    llmProvider: cfg.llmProvider || 'dashscope',
    llmModel: cfg.llmModel || 'qwen-plus',
    rawConfig: cfg,
  }
}

async function withConfig() {
  const settings = await getActiveEmbeddingSettings()
  await syncConfigToPython(settings.rawConfig)
  return settings
}

export async function upsertDocument({ id, name, type, content }) {
  const settings = await withConfig()
  const { data } = await axios.post(
    `${RAG_SERVICE_URL}/api/rag/upsert`,
    { id, name, type, content, config: settings.rawConfig },
    { timeout: 120000 }
  )
  return { chunks: data.chunks }
}

export async function search(query, topKOverride) {
  const settings = await withConfig()
  const { data } = await axios.post(
    `${RAG_SERVICE_URL}/api/rag/search`,
    { query, topK: topKOverride || settings.topK || 5, config: settings.rawConfig },
    { timeout: 60000 }
  )
  return data.results || data.items || []
}

export async function chatViaPython({ question, topK, useRAG, strictKbOnly, history = [] }) {
  const settings = await withConfig()
  const { data } = await axios.post(
    `${RAG_SERVICE_URL}/api/chat`,
    {
      question,
      topK: topK || settings.topK || 5,
      config: settings.rawConfig,
      strictKbOnly: !!strictKbOnly,
      useRAG: useRAG !== false,
      history: history.slice(-12),
    },
    { timeout: 120000 }
  )
  return data
}

export function chatStreamViaPython({ question, topK, useRAG, strictKbOnly, history = [] }, handlers = {}) {
  assertRagService()
  return withConfig().then((settings) => {
    const payload = {
      question,
      topK: topK || settings.topK || 5,
      config: settings.rawConfig,
      strictKbOnly: !!strictKbOnly,
      useRAG: useRAG !== false,
      history: history.slice(-12),
    }
    return fetch(`${RAG_SERVICE_URL}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (resp) => {
      if (!resp.ok) {
        const errText = await resp.text()
        throw new Error(errText || `stream failed: ${resp.status}`)
      }
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let meta = null
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const lines = part.split('\n')
          let event = 'message'
          let dataLine = ''
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            if (line.startsWith('data:')) dataLine = line.slice(5).trim()
          }
          if (!dataLine) continue
          const parsed = JSON.parse(dataLine)
          if (event === 'meta') {
            meta = parsed
            handlers.onMeta?.(parsed)
          } else if (event === 'token') {
            fullText += parsed.text || ''
            handlers.onToken?.(parsed.text || '', fullText)
          } else if (event === 'error') {
            throw new Error(parsed.error || 'stream error')
          } else if (event === 'done') {
            handlers.onDone?.({ answer: fullText, ...meta })
          }
        }
      }
      return { answer: fullText, ...meta }
    })
  })
}

export async function getActiveCollectionName() {
  const settings = await getActiveEmbeddingSettings()
  return settings.collection
}

export async function pushRagConfigToPython(config) {
  await syncConfigToPython(config)
}

export async function deleteDocumentVectors(docId) {
  const settings = await withConfig()
  const config = encodeURIComponent(JSON.stringify(settings.rawConfig))
  await axios.delete(`${RAG_SERVICE_URL}/api/rag/docs/${encodeURIComponent(docId)}?config=${config}`, {
    timeout: 60000,
  })
  return { ok: true }
}

export async function getDocumentContent(docId) {
  const settings = await withConfig()
  const config = encodeURIComponent(JSON.stringify(settings.rawConfig))
  const { data } = await axios.get(
    `${RAG_SERVICE_URL}/api/rag/docs/${encodeURIComponent(docId)}/content?config=${config}`,
    { timeout: 60000 }
  )
  return data
}

export async function reindexDocument({ id, name, type }) {
  const settings = await withConfig()
  const { data } = await axios.post(
    `${RAG_SERVICE_URL}/api/rag/docs/${encodeURIComponent(id)}/reindex`,
    { name, type: type || 'TXT', config: settings.rawConfig },
    { timeout: 120000 }
  )
  return { chunks: data.chunks }
}

export async function ingestFile({ id, name, type, buffer, filename }) {
  const settings = await withConfig()
  const form = new FormData()
  form.append('id', id)
  form.append('name', name)
  form.append('type', type || 'TXT')
  form.append('config', JSON.stringify(settings.rawConfig))
  form.append('file', new Blob([buffer]), filename || name)
  const { data } = await axios.post(`${RAG_SERVICE_URL}/api/rag/ingest`, form, {
    timeout: 120000,
  })
  return { chunks: data.chunks }
}

export { RAG_SERVICE_URL }
