import axios from 'axios'

const inferredBase = (() => {
  const envBase = import.meta.env.VITE_API_BASE
  if (envBase) return envBase
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8080'
  }
  return 'http://server:8080'
})()

const baseURL = inferredBase

export const api = axios.create({ baseURL })

export async function chat(question, sessionId, options = {}) {
  const payload = sessionId ? { question, sessionId, ...options } : { question, ...options }
  const { data } = await api.post('/api/chat', payload)
  return data
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

export async function ragSearch(query, topK = 5) {
  const { data } = await api.post('/api/rag/search', { query, topK })
  return data
}

export async function getDashboardSummary() {
  const { data } = await api.get('/api/dashboard/summary')
  return data
}

// Employee APIs
export async function getEmployees() {
  const { data } = await api.get('/api/employees')
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

// Attendance APIs
export async function getAttendanceToday() {
  const { data } = await api.get('/api/attendance/today')
  return data
}
export async function getAttendanceByDate(date) {
  const { data } = await api.get(`/api/attendance/${date}`)
  return data
}
export async function upsertAttendance(record) {
  const { data } = await api.post('/api/attendance', record)
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

// Settings APIs
export async function getSettings() {
  const { data } = await api.get('/api/settings')
  return data
}
export async function saveSettings(values) {
  const { data } = await api.post('/api/settings', values)
  return data
}
