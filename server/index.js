import dotenv from 'dotenv'
dotenv.config({ override: true })
import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import { query, get, run } from './db.js'
import multer from 'multer'
import { upsertDocument, search as ragSearch, getActiveCollectionName, getActiveEmbeddingSettings } from './rag.js'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import axios from 'axios'
import crypto from 'crypto'

const app = express()
app.use(cors())
app.use(bodyParser.json())
const upload = multer({ storage: multer.memoryStorage() })

// RAG 配置接口
app.get('/api/rag/config', async (req, res) => {
  try {
    const row = await get('SELECT value FROM rag_config WHERE key = ?', ['default'])
    if (row) {
      res.json(JSON.parse(row.value))
    } else {
      res.status(404).json({ error: 'Config not found' })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 系统设置接口
app.get('/api/settings', async (req, res) => {
  try {
    const row = await get('SELECT value FROM system_settings WHERE key = ?', ['app'])
    if (row?.value) return res.json(JSON.parse(row.value))
    return res.json({})
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/settings', async (req, res) => {
  try {
    const current = await get('SELECT value FROM system_settings WHERE key = ?', ['app'])
    const merged = { ...(current?.value ? JSON.parse(current.value) : {}), ...req.body }
    await run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['app', JSON.stringify(merged)])
    res.json({ ok: true, settings: merged })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/rag/config', async (req, res) => {
  try {
    // 先获取现有配置
    const row = await get('SELECT value FROM rag_config WHERE key = ?', ['default'])
    let currentConfig = row ? JSON.parse(row.value) : {}
    
    // 合并新配置
    const newConfig = { ...currentConfig, ...req.body }
    
    await run('INSERT OR REPLACE INTO rag_config (key, value) VALUES (?, ?)', ['default', JSON.stringify(newConfig)])
    res.json({ ok: true, ragConfig: newConfig })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 知识库接口
app.get('/api/knowledge/docs', async (req, res) => {
  try {
    const docs = await query('SELECT * FROM knowledge_docs')
    res.json(docs)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 删除知识库文档：删除 SQLite 记录并清理 Qdrant 中 doc_id 对应的向量
app.delete('/api/knowledge/docs/:id', async (req, res) => {
  try {
    const { id } = req.params
    // 先删除向量库中的对应点（按 payload.doc_id 过滤）
    const { QdrantClient } = await import('@qdrant/js-client-rest')
    const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' })
    const collectionName = await getActiveCollectionName()
    try {
      await qdrant.delete(collectionName, {
        filter: { must: [{ key: 'doc_id', match: { value: id } }] },
      })
    } catch (e) {
      // 若集合不存在或无匹配点，忽略错误以保证幂等
      console.warn('[KB-DELETE] qdrant delete warning:', e?.message || e)
    }
    // 再删除业务库记录
    await run('DELETE FROM knowledge_docs WHERE id = ?', [id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 查看指定文档的内容（从向量库按 doc_id 聚合所有块文本）
app.get('/api/knowledge/docs/:id/content', async (req, res) => {
  try {
    const { id } = req.params
    // 从向量库检索 doc_id 对应的所有块（使用 scroll/过滤）
    // 这里复用 rag.js 的 ensureCollection 和 qdrant 客户端
    const { QdrantClient } = await import('@qdrant/js-client-rest')
    const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' })
    const collectionName = await getActiveCollectionName()

    const collected = []
    let offset = undefined
    const LIMIT = 200
    // 通过 scroll 过滤 payload.doc_id
    // 注意：js-client-rest 支持 scroll(collection, { limit, offset, with_payload, filter })
    while (true) {
      const resp = await qdrant.scroll(collectionName, {
        limit: LIMIT,
        offset,
        with_payload: true,
        filter: { must: [{ key: 'doc_id', match: { value: id } }] },
      })
      const points = resp.points || []
      for (const p of points) {
        const text = p.payload?.text || ''
        const idx = p.payload?.chunk_index ?? 0
        collected.push({ index: idx, text })
      }
      if (!resp.next_page_offset) break
      offset = resp.next_page_offset
    }

    // 按块索引排序并拼接
    collected.sort((a, b) => a.index - b.index)
    const content = collected.map((c) => c.text).join('\n\n')
    res.json({ id, content, chunks: collected.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/knowledge/docs', async (req, res) => {
  try {
    const { id, name, type, chunks, vectors } = req.body
    await run('INSERT INTO knowledge_docs (id, name, type, chunks, vectors) VALUES (?, ?, ?, ?, ?)', 
      [id, name, type, chunks, vectors])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 员工管理接口
app.get('/api/employees', async (req, res) => {
  try {
    const employees = await query('SELECT * FROM employees')
    res.json(employees)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/employees', async (req, res) => {
  try {
    const { id, name, department, position, email, phone, status, joinDate, level } = req.body
    await run(`INSERT INTO employees (id, name, department, position, email, phone, status, joinDate, level) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, department, position, email, phone, status, joinDate, level])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, department, position, email, phone, status, joinDate, level } = req.body
    await run(`UPDATE employees SET name=?, department=?, position=?, email=?, phone=?, status=?, joinDate=?, level=? WHERE id=?`,
      [name, department, position, email, phone, status, joinDate, level, id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params
    await run('DELETE FROM employees WHERE id = ?', [id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 招聘职位接口
app.get('/api/positions', async (req, res) => {
  try {
    const rows = await query('SELECT id, title, department, status FROM positions ORDER BY id ASC')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/positions', async (req, res) => {
  try {
    const { id, title, department, status } = req.body
    await run('INSERT INTO positions (id, title, department, status) VALUES (?, ?, ?, ?)', [id, title, department, status || 'open'])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/positions/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { title, department, status } = req.body
    await run('UPDATE positions SET title=?, department=?, status=? WHERE id=?', [title, department, status, id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/positions/:id', async (req, res) => {
  try {
    const { id } = req.params
    await run('DELETE FROM positions WHERE id=?', [id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 出勤接口
app.get('/api/attendance/today', async (req, res) => {
  try {
    const presentRow = await get(`SELECT COUNT(DISTINCT employee_id) as c FROM attendance WHERE date = date('now') AND status='present'`)
    const leaveRow = await get(`SELECT COUNT(DISTINCT employee_id) as c FROM attendance WHERE date = date('now') AND status='leave'`)
    const totalEmpRow = await get('SELECT COUNT(*) as c FROM employees')
    const present = presentRow?.c || 0
    const leave = leaveRow?.c || 0
    const total = totalEmpRow?.c || 0
    const shouldArrive = Math.max(total - leave, 0)
    const rate = shouldArrive > 0 ? Math.round((present / shouldArrive) * 1000) / 10 : 0
    res.json({ date: new Date().toISOString().slice(0, 10), present, leave, totalEmployees: total, shouldArrive, rate })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/attendance/:date', async (req, res) => {
  try {
    const { date } = req.params
    const rows = await query('SELECT id, employee_id, date, status FROM attendance WHERE date = ?', [date])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/attendance', async (req, res) => {
  try {
    const { id, employee_id, date, status } = req.body
    await run('INSERT OR REPLACE INTO attendance (id, employee_id, date, status) VALUES (?, ?, ?, ?)', [id, employee_id, date, status])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 薪资接口（返回联表信息，便于前端展示）
app.get('/api/salaries', async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7)
    const rows = await query(
      `SELECT s.id, s.employee_id as employeeId, s.month, s.baseSalary, s.performance, s.bonus, s.tax, s.total, s.actual,
              e.name, e.department, e.position
       FROM salaries s LEFT JOIN employees e ON e.id = s.employee_id
       WHERE s.month = ?
       ORDER BY e.department ASC, e.name ASC`,
      [month]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/salaries/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { baseSalary, performance, bonus } = req.body
    const total = Number(baseSalary || 0) + Number(performance || 0) + Number(bonus || 0)
    const tax = Math.round(total * 0.1)
    const actual = total - tax
    await run(
      `UPDATE salaries SET baseSalary=?, performance=?, bonus=?, tax=?, total=?, actual=? WHERE id=?`,
      [baseSalary, performance, bonus, tax, total, actual, id]
    )
    res.json({ ok: true, total, tax, actual })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// AI 助手聊天接口（百炼 LLM + RAG 上下文）
app.post('/api/chat', async (req, res) => {
  try {
    const { question, topK = 5, sessionId, useRAG = true } = req.body
    const settings = await getActiveEmbeddingSettings()
    // 读取聊天模型配置（与嵌入配置分离，避免默认回退）
    let llmProvider = 'dashscope'
    let llmModel = 'qwen-plus'
    try {
      const row = await get('SELECT value FROM rag_config WHERE key = ?', ['default'])
      if (row?.value) {
        const cfg = JSON.parse(row.value)
        if (cfg.llmProvider) llmProvider = cfg.llmProvider
        if (cfg.llmModel) llmModel = cfg.llmModel
      }
    } catch {}
    const results = useRAG ? await ragSearch(question, topK) : []
    // 对每个检索到的片段做长度保护，避免将整段文档塞入上下文
    const MAX_SNIPPET_LEN = 500
    const safeSnippet = (t) => {
      const s = String(t || '')
      return s.length > MAX_SNIPPET_LEN ? s.slice(0, MAX_SNIPPET_LEN) + '…' : s
    }
    const context = results
      .map((r, i) => `# 段落${i + 1}（${r.name} - 第${r.chunk_index}块）\n${safeSnippet(r.text)}`)
      .join('\n\n')

    // 构建提示词：支持普通聊天（不依赖知识库）
    const systemPrompt = useRAG
      ? '你是企业人事与行政领域的 AI 助手。基于提供的知识库上下文，优先准确、简洁地回答用户问题。若上下文没有答案，请明确说明无法在当前知识中找到。回答使用中文。严禁原样粘贴长段文本或整篇内容，只提炼关键点。'
      : '你是一个专业且友好的中文 AI 助手。请用简洁清晰的要点或段落回答用户问题，必要时给出示例与步骤。'

    const userPrompt = useRAG && context.trim()
      ? `问题：${question}\n\n已检索到的知识库上下文如下（已截断）：\n\n${context}\n\n请基于以上内容回答问题：\n- 以不超过5条要点或不超过200字的简明回答为主\n- 引用必要的关键术语即可，避免长段原文\n- 如需引用，请精简到一句话\n- 若无法回答，请说明原因`
      : `问题：${question}`
    // 根据配置选择提供商（dashscope 或 deepseek）
    const provider = llmProvider || 'dashscope'
    const modelName = llmModel || (provider === 'deepseek' ? 'deepseek-chat' : 'qwen-plus')

    let answer = '（无回答）'
    if (provider === 'deepseek') {
      // DeepSeek Chat Completions（OpenAI兼容风格）
      const url = 'https://api.deepseek.com/v1/chat/completions'
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      }
      const { data } = await axios.post(
        url,
        {
          model: modelName, // deepseek-chat 或 deepseek-reasoner
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: settings.temperature ?? 0.2,
          max_tokens: settings.maxTokens ?? 512,
        },
        { headers }
      )
      answer = data?.choices?.[0]?.message?.content || '（无回答）'
    } else {
      // DashScope（百炼）OpenAI 兼容接口
      const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      }
      const { data } = await axios.post(
        url,
        {
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: settings.temperature ?? 0.2,
          max_tokens: settings.maxTokens ?? 512,
        },
        { headers }
      )
      answer = data?.choices?.[0]?.message?.content || data?.output?.text || '（无回答）'
    }

    // 可选：持久化消息
    // 如果没有提供 sessionId，则自动创建一个会话并写入消息
    let activeSessionId = sessionId
    if (!activeSessionId) {
      activeSessionId = crypto.randomUUID()
      const now = new Date().toISOString()
      await run('INSERT INTO chat_sessions (id, title, created_at) VALUES (?, ?, ?)', [activeSessionId, '临时会话', now])
      await run('INSERT INTO chat_messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)', [activeSessionId, 'user', question, now])
      await run('INSERT INTO chat_messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)', [activeSessionId, 'assistant', answer, now])
    } else {
      const now = new Date().toISOString()
      await run('INSERT INTO chat_messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)', [activeSessionId, 'user', question, now])
      await run('INSERT INTO chat_messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)', [activeSessionId, 'assistant', answer, now])
    }

    res.json({
      answer,
      sources: results.map((r) => ({ name: r.name, relevance: r.score, chunk_index: r.chunk_index })),
      rag: { retrievedChunks: results.length },
      sessionId: activeSessionId,
    })
  } catch (err) {
    // 模型调用失败时的降级策略：返回精简摘要而非直接上下文全文
    console.warn('Chat error, fallback to raw context:', err?.message)
    try {
      const { question, topK = 5, useRAG = true } = req.body
      const results = useRAG ? await ragSearch(question, topK) : []
      const MAX_SNIPPET_LEN = 300
      const snippets = results.map((r) => {
        const s = String(r.text || '')
        const short = s.length > MAX_SNIPPET_LEN ? s.slice(0, MAX_SNIPPET_LEN) + '…' : s
        return `• 来自「${r.name}」第${r.chunk_index}块：${short}`
      })
      const summary = useRAG && snippets.length
        ? `模型暂不可用，提供检索到的精简参考要点：\n${snippets.join('\n')}`
        : '模型暂不可用，请稍后重试。'
      return res.json({
        answer: summary,
        sources: results.map((r) => ({ name: r.name, relevance: r.score, chunk_index: r.chunk_index })),
        rag: { retrievedChunks: results.length },
      })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }
})

// 创建新会话
app.post('/api/chat/sessions', async (req, res) => {
  try {
    const { title } = req.body
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await run('INSERT INTO chat_sessions (id, title, created_at) VALUES (?, ?, ?)', [id, title || '新会话', now])
    res.json({ id, title: title || '新会话', created_at: now })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 获取会话消息
app.get('/api/chat/sessions/:id/messages', async (req, res) => {
  try {
    const { id } = req.params
    const msgs = await query('SELECT id, role, content, timestamp FROM chat_messages WHERE session_id = ? ORDER BY id ASC', [id])
    res.json(msgs)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 会话列表
app.get('/api/chat/sessions', async (req, res) => {
  try {
    const rows = await query('SELECT id, title, created_at FROM chat_sessions ORDER BY created_at DESC')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// RAG 文档上传与入库
app.post('/api/rag/ingest', upload.single('file'), async (req, res) => {
  try {
    const { name, type, id } = req.body
    if (!req.file) return res.status(400).json({ error: '未提供文件' })

    console.log('[INGEST] start', { id, name, type, mime: req.file.mimetype, size: req.file.size })

    const ext = (type || (name?.split('.').pop() || '').toUpperCase()).toUpperCase()
    let content = ''
    if (ext === 'PDF') {
      const parsed = await pdfParse(req.file.buffer)
      content = parsed.text || ''
    } else if (ext === 'DOCX') {
      const resultDocx = await mammoth.extractRawText({ buffer: req.file.buffer })
      content = resultDocx.value || ''
    } else {
      content = req.file.buffer.toString('utf-8')
    }

    if (!content.trim()) {
      console.warn('[INGEST] empty parsed text', { id, name, ext })
      return res.status(400).json({ error: '解析到的文本为空（可能是扫描版 PDF 或内容为空）' })
    }

    const result = await upsertDocument({ id, name, type: ext, content })
    // 记录到 knowledge_docs 表
    await run('INSERT OR REPLACE INTO knowledge_docs (id, name, type, chunks, vectors) VALUES (?, ?, ?, ?, ?)',
      [id, name, ext || 'TXT', result.chunks, result.chunks])
    console.log('[INGEST] success', { id, name, ext, chunks: result.chunks })
    res.json({ ok: true, ...result })
  } catch (err) {
    console.error('[INGEST] error', err?.response?.data || err?.message || err)
    res.status(500).json({ error: err.message })
  }
})

// RAG 搜索接口（直接返回检索结果）
app.post('/api/rag/search', async (req, res) => {
  try {
    const { query: q, topK = 5 } = req.body
    const results = await ragSearch(q, topK)
    res.json(results)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 仪表盘汇总数据
app.get('/api/dashboard/summary', async (req, res) => {
  try {
    // 员工总数
    const empCountRow = await get('SELECT COUNT(*) as c FROM employees')
    const totalEmployees = empCountRow?.c || 0

    // 最近入职员工（按入职时间倒序，最多 8 条）
    const recentEmployees = await query(
      `SELECT id, name, department, position, status, joinDate
       FROM employees
       ORDER BY datetime(joinDate) DESC
       LIMIT 8`
    )

    // 部门分布
    const deptRows = await query(
      'SELECT department, COUNT(*) as cnt FROM employees GROUP BY department'
    )
    const departments = deptRows.map((r) => ({
      name: r.department || '未分配',
      count: r.cnt,
      percent: totalEmployees ? Math.round((r.cnt / totalEmployees) * 1000) / 10 : 0,
    }))

    // RAG 相关统计
    const kbCountRow = await get('SELECT COUNT(*) as c FROM knowledge_docs')
    const vecSumRow = await get('SELECT COALESCE(SUM(vectors), 0) as s FROM knowledge_docs')
    // 以用户消息条数近似“检索次数”（因为聊天流程包含检索）
    const todaySearchRow = await get(
      `SELECT COUNT(*) as c FROM chat_messages
       WHERE role = 'user' AND date(timestamp) = date('now')`
    )
    const rag = {
      todaySearchCount: todaySearchRow?.c || 0,
      knowledgeDocs: kbCountRow?.c || 0,
      vectorIndexTotal: vecSumRow?.s || 0,
      avgResponseTime: null, // 暂无采集
    }

    // 今日出勤率 = 出勤人数 / 应到人数（应到 = 员工总数 - 今日请假人数）
    const presentRow = await get(
      `SELECT COUNT(DISTINCT employee_id) as c FROM attendance
       WHERE date = date('now') AND status = 'present'`
    )
    const leaveRow = await get(
      `SELECT COUNT(DISTINCT employee_id) as c FROM attendance
       WHERE date = date('now') AND status = 'leave'`
    )
    const present = presentRow?.c || 0
    const leave = leaveRow?.c || 0
    const shouldArrive = Math.max((totalEmployees || 0) - leave, 0)
    const todayAttendanceRate = shouldArrive > 0 ? Math.round((present / shouldArrive) * 1000) / 10 : 0

    // 招聘中职位
    const openPosRow = await get(`SELECT COUNT(*) as c FROM positions WHERE status = 'open'`)
    const recruitmentOpenPositions = openPosRow?.c || 0

    // 本月实发薪资总额
    const salarySumRow = await get(
      `SELECT COALESCE(SUM(actual), 0) as s FROM salaries
       WHERE month = strftime('%Y-%m','now')`
    )
    const salaryTotalCurrentMonth = salarySumRow?.s || 0

    res.json({
      totalEmployees,
      recentEmployees,
      departments,
      rag,
      todayAttendanceRate,
      recruitmentOpenPositions,
      salaryTotalCurrentMonth,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 根路径健康检查与提示
app.get('/', (req, res) => {
  res.type('text/plain').send('API server is running with SQLite database.')
})

const port = process.env.PORT || 8080
app.listen(port, () => {
  console.log(`API server listening on http://0.0.0.0:${port}`)
})
