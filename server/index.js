import dotenv from 'dotenv'
dotenv.config({ override: true })
import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import { query, get, run } from './db.js'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  search as ragSearch,
  chatViaPython,
  chatStreamViaPython,
  pushRagConfigToPython,
  deleteDocumentVectors,
  getDocumentContent,
  reindexDocument,
  ingestFile,
  loadRagConfig,
  RAG_SERVICE_URL,
} from './rag.js'
import mammoth from 'mammoth'
import crypto from 'crypto'

const app = express()
// 更严格的 CORS 配置：允许白名单 origin，启用预检；在部署时把 whitelist 限制为你的前端域名
const corsOptions = {
  origin: (origin, callback) => {
    // 当 origin 为 undefined（例如直接用 curl 或 server-to-server 请求）时允许
    const whitelist = [
      'https://app.liuxingyu.fun',
      'https://api.liuxingyu.fun',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
    ]
    if (!origin || whitelist.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}

app.use(cors(corsOptions))
app.options('*', cors(corsOptions))

// 兜底：确保所有响应包含 CORS 相关头（防止反向代理或中间件覆盖）
app.use((req, res, next) => {
  try {
    const origin = req.headers.origin || '*'
    // 若 origin 在白名单里则返回具体 origin，否则返回 '*'
    const whitelist = [
      'https://app.liuxingyu.fun',
      'https://api.liuxingyu.fun',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
    ]
    if (whitelist.indexOf(origin) !== -1) {
      res.setHeader('Access-Control-Allow-Origin', origin)
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*')
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept')
  } catch (e) {
    // ignore
  }
  // 对 OPTIONS 直接短路返回 204（预检请求）
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
app.use(bodyParser.json())
const upload = multer({ storage: multer.memoryStorage() })

// __dirname for ES module
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Ensure uploads directory exists
const uploadsDir = path.resolve(__dirname, 'uploads')
try { fs.mkdirSync(uploadsDir, { recursive: true }) } catch (e) {}

// --- Authentication helpers ---
// 密码哈希：scrypt + salt，存储格式 salt:hash
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

const verifyPassword = (password, stored) => {
  if (!stored) return false
  const parts = String(stored).split(':')
  if (parts.length !== 2) return false
  const [salt, hash] = parts
  try {
    const h2 = crypto.scryptSync(password, salt, 64).toString('hex')
    return h2 === hash
  } catch (e) {
    return false
  }
}

const createSession = async (userId, ttlDays = 7) => {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString()
  await run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [token, userId, expires])
  return { token, expires }
}

// 从 Authorization: Bearer <token> 读取会话并附加 req.user
const authMiddleware = async (req, res, next) => {
  try {
    const h = req.headers.authorization || ''
    const m = String(h).match(/^Bearer\s+(.+)$/i)
    if (!m) return res.status(401).json({ error: 'Unauthorized' })
    const token = m[1]
    const row = await get('SELECT user_id, expires_at FROM sessions WHERE token = ?', [token])
    if (!row) return res.status(401).json({ error: 'Invalid token' })
    if (new Date(row.expires_at) < new Date()) return res.status(401).json({ error: 'Token expired' })
    const user = await get('SELECT id, username, email, role, created_at FROM users WHERE id = ?', [row.user_id])
    if (!user) return res.status(401).json({ error: 'User not found' })
    req.user = user
    next()
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin only' })
  next()
}

// 允许管理员或被标记为 assistant 的在职员工访问（用于 AI 助手）
const requireAssistantOrAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  if (req.user.role !== 'admin' && req.user.role !== 'assistant') return res.status(403).json({ error: 'Forbidden: admin or assistant only' })
  next()
}

const resolveEmployeeByUser = async (user) => {
  if (!user) return null
  const username = String(user.username || '').trim()
  const email = String(user.email || '').trim()

  let emp = null
  if (username) {
    emp = await get('SELECT id, name, department, status, email FROM employees WHERE lower(name) = ? LIMIT 1', [username.toLowerCase()])
    if (!emp && /^E\d+$/i.test(username)) {
      emp = await get('SELECT id, name, department, status, email FROM employees WHERE id = ? LIMIT 1', [username.toUpperCase()])
    }
  }
  if (!emp && email) {
    emp = await get('SELECT id, name, department, status, email FROM employees WHERE lower(email) = ? LIMIT 1', [email.toLowerCase()])
  }
  // 兜底：assistant 账号若无法精确匹配，且系统仅有唯一“在职”员工时自动关联
  if (!emp && user.role === 'assistant') {
    const activeCountRow = await get("SELECT COUNT(*) as c FROM employees WHERE status = '在职'")
    const activeCount = Number(activeCountRow?.c || 0)
    if (activeCount === 1) {
      emp = await get("SELECT id, name, department, status, email FROM employees WHERE status = '在职' LIMIT 1")
    }
  }
  return emp || null
}

const APP_TIMEZONE = process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Shanghai'

const getZonedParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const map = {}
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  return map
}

const getLocalDateStr = () => {
  const p = getZonedParts()
  return `${p.year}-${p.month}-${p.day}`
}

const getLocalTimeStr = () => {
  const p = getZonedParts()
  return `${p.hour}:${p.minute}`
}

const ATTENDANCE_POLICY = {
  shiftStart: '09:00',
  shiftEnd: '18:00',
  graceMinutes: 10,
  defaultBreakMinutes: 60,
  standardWorkMinutes: 8 * 60,
}

const toMinutes = (hhmm) => {
  if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return null
  const [h, m] = hhmm.split(':').map((x) => Number(x))
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

const calcAttendanceMetrics = ({ date, checkIn, checkOut, status, breakMinutes }) => {
  const safeStatus = status || 'present'
  if (!checkIn || !checkOut) {
    return {
      work_hours: safeStatus === 'present' ? 0 : 0,
      work_minutes: 0,
      late_minutes: 0,
      early_leave_minutes: 0,
      overtime_minutes: 0,
      attendance_result: safeStatus,
      break_minutes: Number(breakMinutes || 0),
    }
  }

  const inM = toMinutes(checkIn)
  const outM = toMinutes(checkOut)
  if (inM == null || outM == null || outM <= inM) {
    return {
      work_hours: 0,
      work_minutes: 0,
      late_minutes: 0,
      early_leave_minutes: 0,
      overtime_minutes: 0,
      attendance_result: 'abnormal',
      break_minutes: Number(breakMinutes || 0),
    }
  }

  const shiftStartM = toMinutes(ATTENDANCE_POLICY.shiftStart)
  const shiftEndM = toMinutes(ATTENDANCE_POLICY.shiftEnd)
  const realBreak = Number(
    breakMinutes == null || breakMinutes === ''
      ? (outM - inM >= 6 * 60 ? ATTENDANCE_POLICY.defaultBreakMinutes : 0)
      : breakMinutes
  )

  const lateMinutes = Math.max(0, inM - (shiftStartM + ATTENDANCE_POLICY.graceMinutes))
  const earlyLeaveMinutes = Math.max(0, shiftEndM - outM)
  const overtimeMinutes = Math.max(0, outM - shiftEndM)
  const workMinutes = Math.max(0, outM - inM - realBreak)
  const workHours = Math.round((workMinutes / 60) * 10) / 10

  let attendanceResult = 'normal'
  if (safeStatus === 'leave' || safeStatus === 'absent' || safeStatus === 'business_trip') {
    attendanceResult = safeStatus
  } else if (lateMinutes > 0 && earlyLeaveMinutes > 0) {
    attendanceResult = 'late_early'
  } else if (lateMinutes > 0) {
    attendanceResult = 'late'
  } else if (earlyLeaveMinutes > 0) {
    attendanceResult = 'early_leave'
  }

  return {
    work_hours: workHours,
    work_minutes: workMinutes,
    late_minutes: lateMinutes,
    early_leave_minutes: earlyLeaveMinutes,
    overtime_minutes: overtimeMinutes,
    attendance_result: attendanceResult,
    break_minutes: realBreak,
  }
}

// Auth routes: 注册 / 登录 / 当前用户
// 接口：用户注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body
    if (!username || !password) return res.status(400).json({ error: 'username and password required' })
    const exists = await get('SELECT id FROM users WHERE username = ?', [username])
    if (exists) return res.status(409).json({ error: 'Username already exists' })
    const id = crypto.randomUUID()
    const stored = hashPassword(password)
    const now = new Date().toISOString()
    await run('INSERT INTO users (id, username, email, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, username, email || null, stored, 'user', now])
    const session = await createSession(id)
    res.json({ ok: true, user: { id, username, email, role: 'user' }, token: session.token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：用户登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) return res.status(400).json({ error: 'username and password required' })
    const row = await get('SELECT id, password, username, email, role, created_at FROM users WHERE username = ?', [username])
    if (!row) return res.status(401).json({ error: 'Invalid credentials' })
    const ok = verifyPassword(password, row.password)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
    // 若能匹配到在职员工（姓名/工号/邮箱），则将该用户角色标记为 assistant
    let assignedRole = row.role
    try {
      const emp = await resolveEmployeeByUser({ username: row.username, email: row.email })
      if (emp && String(emp.status || '').trim() === '在职') {
        assignedRole = 'assistant'
        try {
          await run('UPDATE users SET role = ? WHERE id = ?', [assignedRole, row.id])
        } catch (e) {
          // 忽略更新失败（非致命）
          console.warn('[AUTH] failed to update user role to assistant', e?.message || e)
        }
      }
    } catch (e) {
      // 若查询 employees 失败，继续使用原有角色
    }

    const session = await createSession(row.id)
    res.json({ ok: true, user: { id: row.id, username: row.username, email: row.email, role: assignedRole }, token: session.token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：获取当前用户信息
app.get('/api/me', authMiddleware, async (req, res) => {
  res.json({ ok: true, user: req.user })
})

// 接口：获取个人资料
app.get('/api/profile/me', authMiddleware, async (req, res) => {
  try {
    const empBase = await resolveEmployeeByUser(req.user)
    let employee = null
    if (empBase?.id) {
      employee = await get(
        `SELECT id, name, department, position, email, phone, status, joinDate, level, address, emergency_contact, emergency_phone, bio
         FROM employees WHERE id = ?`,
        [empBase.id]
      )
    }
    res.json({ ok: true, user: req.user, employee })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：更新个人资料
app.put('/api/profile/me', authMiddleware, async (req, res) => {
  try {
    const normalize = (v) => {
      if (v === undefined) return undefined
      if (v === null) return null
      const s = String(v).trim()
      return s === '' ? null : s
    }

    const email = normalize(req.body?.email)
    const phone = normalize(req.body?.phone)
    const address = normalize(req.body?.address)
    const emergencyContact = normalize(req.body?.emergency_contact)
    const emergencyPhone = normalize(req.body?.emergency_phone)
    const bio = normalize(req.body?.bio)

    if (email !== undefined) {
      await run('UPDATE users SET email = ? WHERE id = ?', [email, req.user.id])
    }

    const empBase = await resolveEmployeeByUser(req.user)
    if (empBase?.id) {
      const sets = []
      const params = []
      const pushField = (name, value) => {
        if (value !== undefined) {
          sets.push(`${name} = ?`)
          params.push(value)
        }
      }

      pushField('email', email)
      pushField('phone', phone)
      pushField('address', address)
      pushField('emergency_contact', emergencyContact)
      pushField('emergency_phone', emergencyPhone)
      pushField('bio', bio)

      if (sets.length) {
        await run(`UPDATE employees SET ${sets.join(', ')} WHERE id = ?`, [...params, empBase.id])
      }
    }

    const user = await get('SELECT id, username, email, role, created_at FROM users WHERE id = ?', [req.user.id])
    let employee = null
    if (empBase?.id) {
      employee = await get(
        `SELECT id, name, department, position, email, phone, status, joinDate, level, address, emergency_contact, emergency_phone, bio
         FROM employees WHERE id = ?`,
        [empBase.id]
      )
    }
    res.json({ ok: true, user, employee })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


// RAG 配置接口（管理员）
app.get('/api/rag/config', authMiddleware, requireAdmin, async (req, res) => {
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

// 接口：保存 RAG 配置
app.post('/api/rag/config', authMiddleware, requireAdmin, async (req, res) => {
  try {
    // 先获取现有配置
    const row = await get('SELECT value FROM rag_config WHERE key = ?', ['default'])
    let currentConfig = row ? JSON.parse(row.value) : {}
    
    // 合并新配置
    const newConfig = { ...currentConfig, ...req.body }
    
    await run('INSERT OR REPLACE INTO rag_config (key, value) VALUES (?, ?)', ['default', JSON.stringify(newConfig)])
    if (RAG_SERVICE_URL) {
      try {
        await pushRagConfigToPython(newConfig)
      } catch (e) {
        console.warn('[RAG] config sync failed:', e?.message || e)
      }
    }
    res.json({ ok: true, ragConfig: newConfig })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 知识库接口
// 接口：知识库文档列表
app.get('/api/knowledge/docs', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const docs = await query('SELECT * FROM knowledge_docs')
    res.json(docs)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：获取单个文档元数据
app.get('/api/knowledge/docs/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const row = await get('SELECT * FROM knowledge_docs WHERE id = ?', [id])
    if (!row) return res.status(404).json({ error: 'Document not found' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：删除知识库文档（含向量清理）
app.delete('/api/knowledge/docs/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    await deleteDocumentVectors(id)
    await run('DELETE FROM knowledge_docs WHERE id = ?', [id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：查看文档内容（向量库聚合）
app.get('/api/knowledge/docs/:id/content', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const data = await getDocumentContent(id)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：新增文档记录
app.post('/api/knowledge/docs', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id, name, type, chunks, vectors } = req.body
    await run('INSERT INTO knowledge_docs (id, name, type, chunks, vectors) VALUES (?, ?, ?, ?, ?)', 
      [id, name, type, chunks, vectors])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：重新索引文档（重建向量）
app.post('/api/knowledge/docs/:id/reindex', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const row = await get('SELECT id, name, type FROM knowledge_docs WHERE id = ?', [id])
    if (!row) return res.status(404).json({ error: 'Document not found' })

    const result = await reindexDocument({ id: row.id, name: row.name, type: row.type })

    const now = new Date().toISOString()
    await run('INSERT OR REPLACE INTO knowledge_docs (id, name, type, chunks, vectors, uploadTime, indexTime) VALUES (?, COALESCE((SELECT name FROM knowledge_docs WHERE id = ?), ?), COALESCE((SELECT type FROM knowledge_docs WHERE id = ?), ?), COALESCE((SELECT chunks FROM knowledge_docs WHERE id = ?), ?), ?, COALESCE((SELECT uploadTime FROM knowledge_docs WHERE id = ?), ?), ?)', [
      id,
      id, row.name,
      id, row.type,
      id, result.chunks,
      result.chunks,
      id, null,
      now,
    ])

    res.json({ ok: true, chunks: result.chunks })
  } catch (err) {
    console.error('[REINDEX] error', err?.message || err)
    const status = /not found|No chunks/i.test(err?.message || '') ? 404 : 500
    res.status(status).json({ error: err.message })
  }
})

// 员工管理接口
// 接口：员工列表/搜索
app.get('/api/employees', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const q = (req.query.q || '').trim()
    if (q) {
      const like = `%${q.toLowerCase()}%`
      const rows = await query(
        `SELECT * FROM employees WHERE lower(name) LIKE ? OR lower(department) LIKE ? OR lower(position) LIKE ? ORDER BY name ASC`,
        [like, like, like]
      )
      return res.json(rows)
    }
    const employees = await query('SELECT * FROM employees ORDER BY name ASC')
    res.json(employees)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：新增员工
app.post('/api/employees', authMiddleware, requireAdmin, async (req, res) => {
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

// 接口：更新员工
app.put('/api/employees/:id', authMiddleware, requireAdmin, async (req, res) => {
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

// 接口：删除员工
app.delete('/api/employees/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    await run('DELETE FROM employees WHERE id = ?', [id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 招聘职位接口
// 接口：岗位列表
const normalizePositionTitle = (title) => String(title || '').trim()

app.get('/api/positions', async (req, res) => {
  try {
    // Return positions with aggregated candidates count
    const rows = await query(`
      SELECT p.id, p.title, p.department, p.status, p.requirements,
        COALESCE(a.candidates, 0) AS candidates
      FROM positions p
      LEFT JOIN (
        SELECT position_id, COUNT(*) AS candidates FROM applications GROUP BY position_id
      ) a ON a.position_id = p.id
      ORDER BY p.id ASC
    `)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：投递简历（含附件）
app.post('/api/positions/:id/applications', upload.single('resume'), async (req, res) => {
  try {
    const positionId = req.params.id
    const { name, email, phone } = req.body
    const id = `A${Date.now()}`
    const submitDate = new Date().toISOString().slice(0, 10)

    let resumePath = null
    if (req.file) {
      // Save file to uploads dir with a unique name
      const ext = path.extname(req.file.originalname) || ''
      const filename = `${id}${ext}`
      const filepath = path.join(uploadsDir, filename)
      fs.writeFileSync(filepath, req.file.buffer)
      resumePath = `uploads/${filename}`
    }

    await run('INSERT INTO applications (id, position_id, name, email, phone, status, resume_path, submitDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      id, positionId, name || '', email || '', phone || '', 'applied', resumePath, submitDate
    ])

    res.json({ ok: true, id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：岗位申请列表（管理员）
app.get('/api/positions/:id/applications', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const positionId = req.params.id
    const rows = await query('SELECT id, position_id, name, email, phone, status, resume_path, submitDate FROM applications WHERE position_id = ? ORDER BY submitDate DESC', [positionId])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：新增岗位
app.post('/api/positions', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id, title, department, status, requirements } = req.body
    const cleanTitle = normalizePositionTitle(title)
    if (!cleanTitle) return res.status(400).json({ error: 'title is required' })
    const exists = await get('SELECT id FROM positions WHERE lower(title) = lower(?) LIMIT 1', [cleanTitle])
    if (exists) return res.status(409).json({ error: 'Position title already exists' })
    await run('INSERT INTO positions (id, title, department, status, requirements) VALUES (?, ?, ?, ?, ?)', [id, cleanTitle, department, status || 'open', requirements || null])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：更新岗位
app.put('/api/positions/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { title, department, status, requirements } = req.body
    const cleanTitle = normalizePositionTitle(title)
    if (!cleanTitle) return res.status(400).json({ error: 'title is required' })
    const exists = await get('SELECT id FROM positions WHERE lower(title) = lower(?) AND id <> ? LIMIT 1', [cleanTitle, id])
    if (exists) return res.status(409).json({ error: 'Position title already exists' })
    await run('UPDATE positions SET title=?, department=?, status=?, requirements=? WHERE id=?', [cleanTitle, department, status, requirements || null, id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：简历预览
app.get('/api/applications/:id/resume/preview', async (req, res) => {
  try {
    const { id } = req.params
    const row = await get('SELECT resume_path FROM applications WHERE id = ?', [id])
    if (!row || !row.resume_path) return res.status(404).json({ error: 'Resume not found' })

    // resume_path 预期形如 'uploads/<filename>' 或完整 URL
    const rp = row.resume_path
    // 如果是完整 URL，直接重定向到它（浏览器会内嵌或打开）
    if (/^https?:\/\//i.test(rp)) {
      return res.redirect(rp)
    }

    const rel = rp.replace(/^\//, '')
    const filePath = path.join(uploadsDir, path.basename(rel))
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on server' })

    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', 'inline; filename="' + path.basename(filePath) + '"')
      const stream = fs.createReadStream(filePath)
      return stream.pipe(res)
    }

    if (ext === '.docx') {
      // 使用 mammoth 将 docx 转为 HTML 并返回
      const buffer = fs.readFileSync(filePath)
      try {
        const result = await mammoth.convertToHtml({ buffer })
        const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>简历预览</title></head><body>${result.value}</body></html>`
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        return res.send(html)
      } catch (e) {
        return res.status(500).json({ error: 'Failed to convert docx' })
      }
    }

    if (ext === '.txt' || ext === '.md') {
      const text = fs.readFileSync(filePath, 'utf8')
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      return res.send(text)
    }

    // 其它未知格式：尝试以二进制流返回并让浏览器处理（可能会触发下载）
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', 'inline; filename="' + path.basename(filePath) + '"')
    const s = fs.createReadStream(filePath)
    return s.pipe(res)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：删除申请与简历（管理员）
app.delete('/api/applications/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    // 先查找是否有文件需要清理
    const row = await get('SELECT resume_path FROM applications WHERE id = ?', [id])
    if (row && row.resume_path) {
      const rp = row.resume_path.replace(/^\//, '')
      const filePath = path.join(uploadsDir, path.basename(rp))
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      } catch (e) {
        // 忽略文件删除错误，继续删除数据库记录
        console.warn('[APP-DELETE] file remove warning:', e?.message || e)
      }
    }

    await run('DELETE FROM applications WHERE id = ?', [id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：获取单个申请详情
app.get('/api/applications/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const appRow = await get('SELECT * FROM applications WHERE id = ?', [id])
    if (!appRow) return res.status(404).json({ error: 'Application not found' })
    const interviews = await query('SELECT id, interviewer, time, mode, outcome, created_at FROM interviews WHERE application_id = ? ORDER BY created_at DESC', [id])
    res.json({ ...appRow, interviews })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：更新申请信息（管理员）
app.put('/api/applications/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { status, stage, notes, interviewer, interview_time } = req.body
    await run('UPDATE applications SET status = COALESCE(?, status), stage = COALESCE(?, stage), notes = COALESCE(?, notes), interviewer = COALESCE(?, interviewer), interview_time = COALESCE(?, interview_time) WHERE id = ?', [status, stage, notes, interviewer, interview_time, id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：创建面试记录
app.post('/api/applications/:id/interviews', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { interviewer, time, mode, feedback, outcome } = req.body
    const iid = `I${Date.now()}`
    const now = new Date().toISOString()
    await run('INSERT INTO interviews (id, application_id, interviewer, time, mode, feedback, outcome, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [iid, id, interviewer || null, time || null, mode || null, feedback || null, outcome || null, now])
    res.json({ ok: true, id: iid })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：面试记录列表（管理员）
app.get('/api/applications/:id/interviews', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const rows = await query('SELECT id, interviewer, time, mode, feedback, outcome, created_at FROM interviews WHERE application_id = ? ORDER BY created_at DESC', [id])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：删除岗位
app.delete('/api/positions/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    await run('DELETE FROM positions WHERE id=?', [id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 出勤接口（管理端）
// 接口：今日出勤概览
app.get('/api/attendance/today', authMiddleware, requireAdmin, async (req, res) => {
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

// 接口：考勤列表/筛选
app.get('/api/attendance', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, department, status, keyword, attendanceResult, attendanceType } = req.query
    const where = []
    const params = []

    if (startDate) {
      where.push('a.date >= ?')
      params.push(startDate)
    }
    if (endDate) {
      where.push('a.date <= ?')
      params.push(endDate)
    }
    if (department) {
      where.push('e.department = ?')
      params.push(department)
    }
    if (status) {
      where.push('a.status = ?')
      params.push(status)
    }
    if (attendanceResult) {
      where.push('a.attendance_result = ?')
      params.push(attendanceResult)
    }
    if (attendanceType) {
      where.push('a.attendance_type = ?')
      params.push(attendanceType)
    }
    if (keyword) {
      where.push('(lower(e.name) LIKE ? OR lower(a.employee_id) LIKE ?)')
      const like = `%${String(keyword).toLowerCase()}%`
      params.push(like, like)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const rows = await query(
      `SELECT a.id, a.employee_id, a.date, a.status, a.check_in, a.check_out, a.work_hours, a.work_minutes,
              a.break_minutes, a.late_minutes, a.early_leave_minutes, a.overtime_minutes,
              a.attendance_result, a.attendance_type, a.punch_source, a.note, e.name, e.department
       FROM attendance a
       LEFT JOIN employees e ON a.employee_id = e.id
       ${whereSql}
       ORDER BY a.date DESC, e.department ASC, e.name ASC`,
      params
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：指定日期考勤
app.get('/api/attendance/date/:date', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { date } = req.params
    const rows = await query(`
      SELECT a.id, a.employee_id, a.date, a.status, a.check_in, a.check_out, a.work_hours, a.work_minutes,
             a.break_minutes, a.late_minutes, a.early_leave_minutes, a.overtime_minutes,
             a.attendance_result, a.attendance_type, a.punch_source, a.note, e.name, e.department
      FROM attendance a
      LEFT JOIN employees e ON a.employee_id = e.id
      WHERE a.date = ?
      ORDER BY e.name
    `, [date])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：新增/更新考勤
app.post('/api/attendance', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id, employee_id, date, status, check_in, check_out, note, attendance_type, break_minutes, punch_source } = req.body
    const metrics = calcAttendanceMetrics({
      date,
      checkIn: check_in,
      checkOut: check_out,
      status,
      breakMinutes: break_minutes,
    })

    await run(
      `INSERT OR REPLACE INTO attendance
       (id, employee_id, date, status, check_in, check_out, work_hours, work_minutes, break_minutes,
        late_minutes, early_leave_minutes, overtime_minutes, attendance_result, attendance_type, punch_source, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        employee_id,
        date,
        status,
        check_in || null,
        check_out || null,
        metrics.work_hours,
        metrics.work_minutes,
        metrics.break_minutes,
        metrics.late_minutes,
        metrics.early_leave_minutes,
        metrics.overtime_minutes,
        metrics.attendance_result,
        attendance_type || 'office',
        punch_source || 'admin',
        note || null,
      ]
    )
    res.json({ ok: true, metrics })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：删除考勤记录
app.delete('/api/attendance/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const exists = await get('SELECT id FROM attendance WHERE id = ?', [id])
    if (!exists) return res.status(404).json({ error: '考勤记录不存在' })
    await run('DELETE FROM attendance WHERE id = ?', [id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 员工端：获取本人考勤
// 接口：我的考勤列表
app.get('/api/attendance/me', authMiddleware, async (req, res) => {
  try {
    const emp = await resolveEmployeeByUser(req.user)
    if (!emp) return res.status(404).json({ error: '未找到关联员工信息，请联系管理员绑定账号' })

    const { startDate, endDate } = req.query
    const defaultEnd = getLocalDateStr()
    const defaultStart = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)
    const defaultStartStr = `${defaultStart.getFullYear()}-${String(defaultStart.getMonth() + 1).padStart(2, '0')}-${String(defaultStart.getDate()).padStart(2, '0')}`

    const s = startDate || defaultStartStr
    const e = endDate || defaultEnd
    const rows = await query(
      `SELECT id, employee_id, date, status, check_in, check_out, work_hours, work_minutes,
              break_minutes, late_minutes, early_leave_minutes, overtime_minutes,
              attendance_result, attendance_type, punch_source, note
       FROM attendance
       WHERE employee_id = ? AND date >= ? AND date <= ?
       ORDER BY date DESC`,
      [emp.id, s, e]
    )

    const today = rows.find((r) => r.date === defaultEnd) || null
    const monthStats = {
      normalDays: rows.filter((r) => r.attendance_result === 'normal').length,
      lateTimes: rows.filter((r) => r.late_minutes > 0).length,
      earlyLeaveTimes: rows.filter((r) => r.early_leave_minutes > 0).length,
      overtimeHours: Math.round((rows.reduce((s2, r) => s2 + Number(r.overtime_minutes || 0), 0) / 60) * 10) / 10,
    }
    res.json({ employee: emp, todayDate: defaultEnd, today, rows, monthStats, policy: ATTENDANCE_POLICY })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 员工端：本人签到/签退
// 接口：签到/签退
app.post('/api/attendance/me/punch', authMiddleware, async (req, res) => {
  try {
    const emp = await resolveEmployeeByUser(req.user)
    if (!emp) return res.status(404).json({ error: '未找到关联员工信息，请联系管理员绑定账号' })

    const { type, note } = req.body
    if (type !== 'check_in' && type !== 'check_out') return res.status(400).json({ error: 'type must be check_in or check_out' })

    const date = getLocalDateStr()
    const time = getLocalTimeStr()
    const id = `ATT-${date}-${emp.id}`
    const existing = await get('SELECT * FROM attendance WHERE id = ?', [id])

    const next = {
      id,
      employee_id: emp.id,
      date,
      status: existing?.status || 'present',
      check_in: existing?.check_in || null,
      check_out: existing?.check_out || null,
      attendance_type: existing?.attendance_type || 'office',
      break_minutes: existing?.break_minutes,
      note: existing?.note || null,
    }

    if (type === 'check_in') {
      if (next.check_in) return res.status(409).json({ error: '今日已签到' })
      next.check_in = time
      next.status = 'present'
    } else {
      if (!next.check_in) return res.status(400).json({ error: '请先签到再签退' })
      if (next.check_out) return res.status(409).json({ error: '今日已签退' })
      next.check_out = time
      next.status = 'present'
    }

    if (note) next.note = note
    const metrics = calcAttendanceMetrics({
      date,
      checkIn: next.check_in,
      checkOut: next.check_out,
      status: next.status,
      breakMinutes: next.break_minutes,
    })

    await run(
      `INSERT OR REPLACE INTO attendance
       (id, employee_id, date, status, check_in, check_out, work_hours, work_minutes, break_minutes,
        late_minutes, early_leave_minutes, overtime_minutes, attendance_result, attendance_type, punch_source, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        next.id,
        next.employee_id,
        next.date,
        next.status,
        next.check_in,
        next.check_out,
        metrics.work_hours,
        metrics.work_minutes,
        metrics.break_minutes,
        metrics.late_minutes,
        metrics.early_leave_minutes,
        metrics.overtime_minutes,
        metrics.attendance_result,
        next.attendance_type,
        'web',
        next.note || null,
      ]
    )

    const row = await get(
      `SELECT id, employee_id, date, status, check_in, check_out, work_hours, work_minutes,
              break_minutes, late_minutes, early_leave_minutes, overtime_minutes,
              attendance_result, attendance_type, punch_source, note
       FROM attendance WHERE id = ?`,
      [id]
    )
    res.json({ ok: true, row })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 员工端：提交异常/补卡申请
// 接口：提交异常申请
app.post('/api/attendance/me/exceptions', authMiddleware, async (req, res) => {
  try {
    const emp = await resolveEmployeeByUser(req.user)
    if (!emp) return res.status(404).json({ error: '未找到关联员工信息，请联系管理员绑定账号' })
    const { date, type, reason, expected_check_in, expected_check_out } = req.body
    if (!date || !type || !reason) return res.status(400).json({ error: 'date/type/reason 为必填' })

    const id = `EX-${Date.now()}-${emp.id}`
    const now = new Date().toISOString()
    await run(
      `INSERT INTO attendance_exceptions
       (id, employee_id, date, type, reason, expected_check_in, expected_check_out, status, reviewer_id, review_note, created_at, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, emp.id, date, type, reason, expected_check_in || null, expected_check_out || null, 'pending', null, null, now, null]
    )
    res.json({ ok: true, id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：我的异常申请列表
app.get('/api/attendance/me/exceptions', authMiddleware, async (req, res) => {
  try {
    const emp = await resolveEmployeeByUser(req.user)
    if (!emp) return res.status(404).json({ error: '未找到关联员工信息，请联系管理员绑定账号' })
    const rows = await query(
      `SELECT id, employee_id, date, type, reason, expected_check_in, expected_check_out, status, reviewer_id, review_note, created_at, reviewed_at
       FROM attendance_exceptions
       WHERE employee_id = ?
       ORDER BY created_at DESC`,
      [emp.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 管理端：异常申请列表与审批
// 接口：异常申请列表
app.get('/api/attendance/exceptions', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { status, department } = req.query
    const where = []
    const params = []
    if (status) {
      where.push('x.status = ?')
      params.push(status)
    }
    if (department) {
      where.push('e.department = ?')
      params.push(department)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const rows = await query(
      `SELECT x.id, x.employee_id, x.date, x.type, x.reason, x.expected_check_in, x.expected_check_out,
              x.status, x.reviewer_id, x.review_note, x.created_at, x.reviewed_at,
              e.name, e.department
       FROM attendance_exceptions x
       LEFT JOIN employees e ON e.id = x.employee_id
       ${whereSql}
       ORDER BY x.created_at DESC`,
      params
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 接口：异常申请审核
app.post('/api/attendance/exceptions/:id/review', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { action, review_note } = req.body
    if (action !== 'approved' && action !== 'rejected') return res.status(400).json({ error: 'action must be approved or rejected' })

    const row = await get('SELECT * FROM attendance_exceptions WHERE id = ?', [id])
    if (!row) return res.status(404).json({ error: '申请不存在' })
    if (row.status !== 'pending') return res.status(409).json({ error: '该申请已处理' })

    const reviewedAt = new Date().toISOString()
    await run(
      'UPDATE attendance_exceptions SET status = ?, reviewer_id = ?, review_note = ?, reviewed_at = ? WHERE id = ?',
      [action, req.user.id, review_note || null, reviewedAt, id]
    )

    if (action === 'approved') {
      const aid = `ATT-${row.date}-${row.employee_id}`
      const existing = await get('SELECT * FROM attendance WHERE id = ?', [aid])
      const nextStatus = row.type === 'leave' ? 'leave' : (existing?.status || 'present')
      const nextCheckIn = row.expected_check_in || existing?.check_in || null
      const nextCheckOut = row.expected_check_out || existing?.check_out || null
      const nextBreak = existing?.break_minutes
      const metrics = calcAttendanceMetrics({
        date: row.date,
        checkIn: nextCheckIn,
        checkOut: nextCheckOut,
        status: nextStatus,
        breakMinutes: nextBreak,
      })
      await run(
        `INSERT OR REPLACE INTO attendance
         (id, employee_id, date, status, check_in, check_out, work_hours, work_minutes, break_minutes,
          late_minutes, early_leave_minutes, overtime_minutes, attendance_result, attendance_type, punch_source, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          aid,
          row.employee_id,
          row.date,
          nextStatus,
          nextCheckIn,
          nextCheckOut,
          metrics.work_hours,
          metrics.work_minutes,
          metrics.break_minutes,
          metrics.late_minutes,
          metrics.early_leave_minutes,
          metrics.overtime_minutes,
          metrics.attendance_result,
          existing?.attendance_type || 'office',
          'exception',
          existing?.note || row.reason || null,
        ]
      )
    }

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 薪资接口（返回联表信息，便于前端展示）
// 接口：薪资列表
app.get('/api/salaries', authMiddleware, requireAdmin, async (req, res) => {
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

// 接口：更新薪资
app.put('/api/salaries/:id', authMiddleware, requireAdmin, async (req, res) => {
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

// 接口：删除薪资记录
app.delete('/api/salaries/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    await run('DELETE FROM salaries WHERE id = ?', [id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

async function resolveChatRagOptions(body = {}) {
  const cfg = await loadRagConfig()
  const useRAG = body.useRAG !== false
  const strictKbOnly = body.strictKbOnly ?? cfg.strictKbOnly ?? true
  return { useRAG, strictKbOnly }
}

// 接口：AI 问答（多轮 + RAG）
app.post('/api/chat', authMiddleware, requireAssistantOrAdmin, async (req, res) => {
  try {
    const { question, topK = 5, sessionId, history: clientHistory = [] } = req.body
    if (!question?.trim()) return res.status(400).json({ error: 'question is required' })

    let history = Array.isArray(clientHistory) ? clientHistory : []
    if (sessionId) {
      const rows = await query(
        'SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT 12',
        [sessionId]
      )
      history = rows.reverse().map((r) => ({ role: r.role, content: r.content }))
    }

    const { useRAG, strictKbOnly } = await resolveChatRagOptions(req.body)

    const py = await chatViaPython({
      question,
      topK,
      useRAG,
      strictKbOnly,
      history,
    })

    let activeSessionId = sessionId
    const now = new Date().toISOString()
    if (!activeSessionId) {
      activeSessionId = crypto.randomUUID()
      await run('INSERT INTO chat_sessions (id, title, created_at) VALUES (?, ?, ?)', [activeSessionId, '临时会话', now])
    }
    await run('INSERT INTO chat_messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)', [activeSessionId, 'user', question, now])
    await run('INSERT INTO chat_messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)', [activeSessionId, 'assistant', py.answer, now])
    return res.json({
      answer: py.answer,
      sources: py.sources || [],
      rag: py.rag || {},
      sessionId: activeSessionId,
    })
  } catch (err) {
    console.warn('Chat error:', err?.response?.data || err?.message || err)
    const detail = err?.response?.data?.detail || err?.message || 'RAG service unavailable'
    return res.status(err?.response?.status || 503).json({ error: String(detail) })
  }
})

// 接口：AI 问答（SSE 流式）
app.post('/api/chat/stream', authMiddleware, requireAssistantOrAdmin, async (req, res) => {
  try {
    const { question, topK = 5, sessionId, history: clientHistory = [] } = req.body
    if (!question?.trim()) return res.status(400).json({ error: 'question is required' })

    let history = Array.isArray(clientHistory) ? clientHistory : []
    if (sessionId) {
      const rows = await query(
        'SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT 12',
        [sessionId]
      )
      history = rows.reverse().map((r) => ({ role: r.role, content: r.content }))
    }

    const { useRAG, strictKbOnly } = await resolveChatRagOptions(req.body)

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    let activeSessionId = sessionId || crypto.randomUUID()
    let fullAnswer = ''
    let metaPayload = { sources: [], rag: {} }

    await chatStreamViaPython(
      { question, topK, useRAG, strictKbOnly, history },
      {
        onMeta: (meta) => {
          metaPayload = meta
          res.write(`event: meta\ndata: ${JSON.stringify(meta)}\n\n`)
        },
        onToken: (token, accumulated) => {
          fullAnswer = accumulated
          res.write(`event: token\ndata: ${JSON.stringify({ text: token })}\n\n`)
        },
        onDone: () => {},
      }
    )

    const now = new Date().toISOString()
    if (!sessionId) {
      await run('INSERT INTO chat_sessions (id, title, created_at) VALUES (?, ?, ?)', [activeSessionId, '临时会话', now])
    }
    await run('INSERT INTO chat_messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)', [activeSessionId, 'user', question, now])
    await run('INSERT INTO chat_messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)', [activeSessionId, 'assistant', fullAnswer, now])

    res.write(`event: done\ndata: ${JSON.stringify({
      sessionId: activeSessionId,
      answer: fullAnswer,
      sources: metaPayload.sources || [],
      rag: metaPayload.rag || {},
    })}\n\n`)
    res.end()
  } catch (err) {
    console.warn('Chat stream error:', err?.message || err)
    if (!res.headersSent) {
      return res.status(503).json({ error: err.message || 'RAG stream unavailable' })
    }
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`)
    res.end()
  }
})

// 创建新会话
// 接口：创建聊天会话
app.post('/api/chat/sessions', authMiddleware, requireAdmin, async (req, res) => {
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
// 接口：会话消息列表
app.get('/api/chat/sessions/:id/messages', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const msgs = await query('SELECT id, role, content, timestamp FROM chat_messages WHERE session_id = ? ORDER BY id ASC', [id])
    res.json(msgs)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 会话列表
// 接口：会话列表
app.get('/api/chat/sessions', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const rows = await query('SELECT id, title, created_at FROM chat_sessions ORDER BY created_at DESC')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 删除会话及其消息（用于清理临时会话）
// 接口：删除会话
app.delete('/api/chat/sessions/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    // 先删除消息，再删除会话记录，保证引用完整性
    await run('DELETE FROM chat_messages WHERE session_id = ?', [id])
    await run('DELETE FROM chat_sessions WHERE id = ?', [id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// RAG 文档上传与入库（需管理员）
app.post('/api/rag/ingest', authMiddleware, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const { name, type, id } = req.body
    if (!req.file) return res.status(400).json({ error: '未提供文件' })

    console.log('[INGEST] start', { id, name, type, mime: req.file.mimetype, size: req.file.size })

    const ext = (type || (name?.split('.').pop() || '').toUpperCase()).toUpperCase()

    const result = await ingestFile({
      id,
      name,
      type: ext,
      buffer: req.file.buffer,
      filename: req.file.originalname || name,
    })

    await run('INSERT OR REPLACE INTO knowledge_docs (id, name, type, chunks, vectors) VALUES (?, ?, ?, ?, ?)',
      [id, name, ext || 'TXT', result.chunks, result.chunks])
    console.log('[INGEST] success', { id, name, ext, chunks: result.chunks })
    res.json({ ok: true, ...result })
  } catch (err) {
    console.error('[INGEST] error', err?.response?.data || err?.message || err)
    res.status(500).json({ error: err.response?.data?.detail || err.message })
  }
})

// RAG 搜索接口（需 AI 助手或管理员权限）
app.post('/api/rag/search', authMiddleware, requireAssistantOrAdmin, async (req, res) => {
  try {
    const { query: q, topK = 5 } = req.body
    const results = await ragSearch(q, topK)
    // 计算简要统计信息供前端展示
    const retrievedChunks = results.length
    const avgScore = results.length ? results.reduce((s, r) => s + (Number(r.score) || Number(r.relevance) || 0), 0) / results.length : 0
    const totalChars = results.reduce((s, r) => s + String(r.text || '').length, 0)
    const contextTokens = Math.round(totalChars / 4)
    res.json({ results, rag: { retrievedChunks, similarityScore: avgScore, contextTokens } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 仪表盘汇总数据
// 接口：仪表盘汇总
app.get('/api/dashboard/summary', authMiddleware, requireAdmin, async (req, res) => {
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

// 员工意见箱：提交意见
// 接口：提交意见
app.post('/api/feedback', authMiddleware, async (req, res) => {
  try {
    const content = String(req.body?.content || '').trim()
    if (!content) return res.status(400).json({ error: '意见内容不能为空' })
    if (content.length > 2000) return res.status(400).json({ error: '意见内容不能超过 2000 字' })

    const emp = await resolveEmployeeByUser(req.user)
    const id = `FB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = new Date().toISOString()

    await run(
      `INSERT INTO feedback_messages
       (id, user_id, username, employee_id, employee_name, department, content, status, created_at, read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        req.user.id,
        req.user.username || null,
        emp?.id || null,
        emp?.name || null,
        emp?.department || null,
        content,
        'unread',
        now,
        null,
      ]
    )

    res.json({ ok: true, id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 员工意见箱：查看我提交的意见
// 接口：我的意见列表
app.get('/api/feedback/me', authMiddleware, async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, content, status, created_at, read_at
       FROM feedback_messages
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.user.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 管理端：意见消息列表
// 接口：意见列表（管理员）
app.get('/api/feedback', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || '').trim()
    const params = []
    let whereSql = ''
    if (status === 'unread' || status === 'read') {
      whereSql = 'WHERE status = ?'
      params.push(status)
    }

    const rows = await query(
      `SELECT id, user_id, username, employee_id, employee_name, department, content, status, created_at, read_at
       FROM feedback_messages
       ${whereSql}
       ORDER BY created_at DESC`,
      params
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 管理端：右上角铃铛未读数
// 接口：未读数
app.get('/api/feedback/unread-count', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const row = await get(`SELECT COUNT(*) as c FROM feedback_messages WHERE status = 'unread'`)
    res.json({ count: Number(row?.c || 0) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 管理端：标记单条意见为已读
// 接口：标记已读
app.patch('/api/feedback/:id/read', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const row = await get('SELECT id, status FROM feedback_messages WHERE id = ?', [id])
    if (!row) return res.status(404).json({ error: '意见不存在' })
    if (row.status === 'read') return res.json({ ok: true })

    await run('UPDATE feedback_messages SET status = ?, read_at = ? WHERE id = ?', ['read', new Date().toISOString(), id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 管理端：全部标记为已读
// 接口：全部已读
app.patch('/api/feedback/read-all', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await run(`UPDATE feedback_messages SET status = 'read', read_at = ? WHERE status = 'unread'`, [new Date().toISOString()])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 健康检查（Docker / 负载均衡探活）
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    ragService: RAG_SERVICE_URL || null,
    timestamp: new Date().toISOString(),
  })
})

// 根路径健康检查与提示
// 接口：服务健康检查
app.get('/', (req, res) => {
  res.type('text/plain').send('API server is running with SQLite database.')
})

const port = process.env.PORT || 8080
app.listen(port, async () => {
  console.log(`API server listening on http://0.0.0.0:${port}`)
  if (!RAG_SERVICE_URL) {
    console.error('[RAG] FATAL: RAG_SERVICE_URL is not set. Configure it in .env (e.g. http://localhost:8000) and start the Python RAG service.')
    return
  }
  console.log(`[RAG] Python service: ${RAG_SERVICE_URL}`)
  try {
    const row = await get('SELECT value FROM rag_config WHERE key = ?', ['default'])
    if (row?.value) {
      await pushRagConfigToPython(JSON.parse(row.value))
      console.log('[RAG] synced config to python service on startup')
    }
  } catch (e) {
    console.warn('[RAG] startup config sync failed:', e?.message || e)
  }
})
