import axios from 'axios'

const inferredBase = (() => {
  const envBase = import.meta.env.VITE_API_BASE
  if (envBase) return envBase
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    // 本地开发（直接访问 localhost）时使用本地后端
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8080'
    // 在生产部署时，默认将 API 指向同一主机的 `api.` 子域，保持协议一致（避免 https 页面内嵌 http 内容被阻止）
    try {
      const proto = window.location.protocol // 包括结尾 ':'，例如 'https:'
      const cleanProto = proto.endsWith(':') ? proto.slice(0, -1) : proto
      // 把常见的前缀（如 app. 或 www.）去掉，再加上 api. 前缀，得到类似 api.liuxingyu.fun
      const domain = host.replace(/^app\.|^www\./i, '')
      return `${cleanProto}://api.${domain}`
    } catch (e) {
      return 'http://server:8080'
    }
  }
  return 'http://server:8080'
})()

export const baseURL = inferredBase

export const api = axios.create({ baseURL })

// 自动附带 Authorization header（若 localStorage 中存在 token）
api.interceptors.request.use((cfg) => {
  try {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token')
      if (token) cfg.headers = { ...(cfg.headers || {}), Authorization: `Bearer ${token}` }
    }
  } catch (e) {}
  return cfg
})

// 401 时清理过期 token 并跳转登录
api.interceptors.response.use(
  (res) => res,
  (err) => {
    try {
      if (
        err?.response?.status === 401 &&
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/login') &&
        !window.location.pathname.startsWith('/register')
      ) {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
        window.location.assign('/login')
      }
    } catch (e) {}
    return Promise.reject(err)
  }
)

// Auth helpers
export async function authRegister({ username, email, password }) {
  const { data } = await api.post('/api/auth/register', { username, email, password })
  return data
}

export async function authLogin({ username, password }) {
  const { data } = await api.post('/api/auth/login', { username, password })
  return data
}

export async function getMe() {
  const { data } = await api.get('/api/me')
  return data
}

export async function getMyProfile() {
  const { data } = await api.get('/api/profile/me')
  return data
}

export async function updateMyProfile(payload) {
  const { data } = await api.put('/api/profile/me', payload)
  return data
}

export async function chat(question, sessionId, options = {}) {
  const payload = sessionId ? { question, sessionId, ...options } : { question, ...options }
  const { data } = await api.post('/api/chat', payload)
  return data
}

/** SSE 流式聊天，handlers: onMeta, onToken, onDone, onError */
export async function chatStream(question, sessionId, options = {}, handlers = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
  const payload = { question, ...options }
  if (sessionId) payload.sessionId = sessionId

  const resp = await fetch(`${baseURL}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  })

  if (!resp.ok) {
    let errMsg = `HTTP ${resp.status}`
    try {
      const errBody = await resp.json()
      errMsg = errBody.error || errMsg
    } catch {}
    throw new Error(errMsg)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let meta = { sources: [], rag: {} }
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const part of parts) {
      if (!part.trim()) continue
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
        handlers.onError?.(parsed.error)
        throw new Error(parsed.error || 'stream error')
      } else if (event === 'done') {
        const result = {
          answer: parsed.answer || fullText,
          sources: parsed.sources || meta.sources || [],
          rag: parsed.rag || meta.rag || {},
          sessionId: parsed.sessionId,
        }
        handlers.onDone?.(result)
        return result
      }
    }
  }

  return { answer: fullText, sources: meta.sources || [], rag: meta.rag || {} }
}

export async function getRagConfig() {
  const { data } = await api.get('/api/rag/config')
  return data
}

export async function saveRagConfig(cfg) {
  const { data } = await api.post('/api/rag/config', cfg)
  return data
}

export async function listKnowledgeDocs() {
  const { data } = await api.get('/api/knowledge/docs')
  return data
}

export async function getDocContent(id) {
  const { data } = await api.get(`/api/knowledge/docs/${id}/content`)
  return data
}

export async function deleteKnowledgeDoc(id) {
  const { data } = await api.delete(`/api/knowledge/docs/${id}`)
  return data
}


export async function listSessions() {
  const { data } = await api.get('/api/chat/sessions')
  return data
}

export async function createSession(title) {
  const { data } = await api.post('/api/chat/sessions', { title })
  return data
}

export async function getSessionMessages(sessionId) {
  const { data } = await api.get(`/api/chat/sessions/${sessionId}/messages`)
  return data
}

export async function deleteSession(id) {
  const { data } = await api.delete(`/api/chat/sessions/${id}`)
  return data
}
// RAG APIs
export async function ingestTextFile(id, name, file, type = 'TXT') {
  const form = new FormData()
  form.append('id', id)
  form.append('name', name)
  form.append('type', type)
  form.append('file', file)
  const { data } = await api.post('/api/rag/ingest', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function reindexKnowledgeDoc(id) {
  const { data } = await api.post(`/api/knowledge/docs/${id}/reindex`)
  return data
}

export async function ragSearch(query, topK = 5) {
  const { data } = await api.post('/api/rag/search', { query, topK })
  return data
}

export async function getDashboardSummary() {
  const { data } = await api.get('/api/dashboard/summary')
  return data
}

// Employee APIs
export async function getEmployees(q) {
  const opts = q ? { params: { q } } : undefined
  const { data } = await api.get('/api/employees', opts)
  return data
}

export async function addEmployee(employee) {
  const { data } = await api.post('/api/employees', employee)
  return data
}

export async function updateEmployee(id, employee) {
  const { data } = await api.put(`/api/employees/${id}`, employee)
  return data
}

export async function deleteEmployee(id) {
  const { data } = await api.delete(`/api/employees/${id}`)
  return data
}

// Positions APIs
export async function listPositions() {
  const { data } = await api.get('/api/positions')
  return data
}
export async function postApplication(positionId, formData) {
  const { data } = await api.post(`/api/positions/${positionId}/applications`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}
export async function listApplications(positionId) {
  const { data } = await api.get(`/api/positions/${positionId}/applications`)
  return data
}
export async function deleteApplication(id) {
  const { data } = await api.delete(`/api/applications/${id}`)
  return data
}
export async function createPosition(payload) {
  const { data } = await api.post('/api/positions', payload)
  return data
}
export async function updatePosition(id, payload) {
  const { data } = await api.put(`/api/positions/${id}`, payload)
  return data
}
export async function deletePosition(id) {
  const { data } = await api.delete(`/api/positions/${id}`)
  return data
}

// Application / Interview APIs
export async function getApplication(id) {
  const { data } = await api.get(`/api/applications/${id}`)
  return data
}

export async function updateApplication(id, payload) {
  const { data } = await api.put(`/api/applications/${id}`, payload)
  return data
}

export async function createInterview(applicationId, payload) {
  const { data } = await api.post(`/api/applications/${applicationId}/interviews`, payload)
  return data
}

export async function listInterviews(applicationId) {
  const { data } = await api.get(`/api/applications/${applicationId}/interviews`)
  return data
}

// Attendance APIs
export async function getAttendanceToday() {
  const { data } = await api.get('/api/attendance/today')
  return data
}
export async function getAttendanceByDate(date) {
  const { data } = await api.get(`/api/attendance/date/${date}`)
  return data
}
export async function listAttendance(params) {
  const { data } = await api.get('/api/attendance', { params })
  return data
}
export async function upsertAttendance(record) {
  const { data } = await api.post('/api/attendance', record)
  return data
}
export async function deleteAttendance(id) {
  const { data } = await api.delete(`/api/attendance/${id}`)
  return data
}
export async function getMyAttendance(params) {
  const { data } = await api.get('/api/attendance/me', { params })
  return data
}
export async function punchMyAttendance(type, note) {
  const { data } = await api.post('/api/attendance/me/punch', { type, note })
  return data
}
export async function listMyAttendanceExceptions() {
  const { data } = await api.get('/api/attendance/me/exceptions')
  return data
}
export async function createMyAttendanceException(payload) {
  const { data } = await api.post('/api/attendance/me/exceptions', payload)
  return data
}
export async function listAttendanceExceptions(params) {
  const { data } = await api.get('/api/attendance/exceptions', { params })
  return data
}
export async function reviewAttendanceException(id, payload) {
  const { data } = await api.post(`/api/attendance/exceptions/${id}/review`, payload)
  return data
}

// Feedback APIs
export async function submitFeedback(content) {
  const { data } = await api.post('/api/feedback', { content })
  return data
}

export async function listMyFeedback() {
  const { data } = await api.get('/api/feedback/me')
  return data
}

export async function listFeedback(status) {
  const params = status ? { status } : undefined
  const { data } = await api.get('/api/feedback', { params })
  return data
}

export async function getFeedbackUnreadCount() {
  const { data } = await api.get('/api/feedback/unread-count')
  return data
}

export async function markFeedbackRead(id) {
  const { data } = await api.patch(`/api/feedback/${id}/read`)
  return data
}

export async function markAllFeedbackRead() {
  const { data } = await api.patch('/api/feedback/read-all')
  return data
}

// Salary APIs
export async function listSalaries(month) {
  const { data } = await api.get('/api/salaries', { params: { month } })
  return data
}
export async function updateSalary(id, payload) {
  const { data } = await api.put(`/api/salaries/${id}`, payload)
  return data
}
export async function deleteSalary(id) {
  const { data } = await api.delete(`/api/salaries/${id}`)
  return data
}
