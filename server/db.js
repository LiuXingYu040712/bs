import sqlite3 from 'sqlite3'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = process.env.DB_PATH || path.resolve(__dirname, 'database.sqlite')

try {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
} catch {}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not connect to database', err)
  } else {
    console.log('Connected to database')
    initDb()
  }
})

function initDb() {
  db.serialize(() => {
    const seedOnStartup = `${process.env.DB_SEED_ON_STARTUP || 'false'}`.toLowerCase() === 'true'

    // 定义日期变量
    const now = new Date()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const todayStr = `${yyyy}-${mm}-${dd}`
    const monthStr = `${yyyy}-${mm}`

    // RAG Config
    db.run(`CREATE TABLE IF NOT EXISTS rag_config (
      key TEXT PRIMARY KEY,
      value TEXT
    )`)

    db.get('SELECT * FROM rag_config WHERE key = ?', ['default'], (err, row) => {
      if (!row) {
        const defaultConfig = {
          vectorProvider: 'dashscope',
          vectorModel: 'text-embedding-v4',
          chunkSize: 800,
          chunkOverlap: 50,
          topK: 8,
          similarityThreshold: 0.35,
          retrievalMode: 'hybrid',
          rerankEnabled: false,
          strictKbOnly: true,
          temperature: 0.2,
          maxTokens: 1000,
          llmProvider: 'dashscope',
          llmModel: 'qwen-plus',
        }
        db.run('INSERT INTO rag_config (key, value) VALUES (?, ?)', ['default', JSON.stringify(defaultConfig)])
      }
    })

    // Knowledge Docs: 增加 uploadTime 和 indexTime 字段以记录上传与索引时间
    db.run(`CREATE TABLE IF NOT EXISTS knowledge_docs (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      chunks INTEGER,
      vectors INTEGER,
      uploadTime TEXT,
      indexTime TEXT
    )`)

    // 向后兼容：若表已存在但缺少列，尝试添加（若已存在则会报错，忽略）
    db.run(`ALTER TABLE knowledge_docs ADD COLUMN uploadTime TEXT`, (err) => {})
    db.run(`ALTER TABLE knowledge_docs ADD COLUMN indexTime TEXT`, (err) => {})

    // 兼容性：若老表缺少 positions.requirements 列，尝试添加（若已存在会报错，忽略）
    db.run(`ALTER TABLE positions ADD COLUMN requirements TEXT`, (err) => {})

    // 不再写入系统内置知识库文档（KB001/KB002），知识库仅由用户手动上传维护

    // Employees
    db.run(`CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT,
      department TEXT,
      position TEXT,
      email TEXT,
      phone TEXT,
      status TEXT,
      joinDate TEXT,
      level TEXT,
      address TEXT,
      emergency_contact TEXT,
      emergency_phone TEXT,
      bio TEXT
    )`)

    // 向后兼容：个人信息中心字段
    db.run(`ALTER TABLE employees ADD COLUMN address TEXT`, (err) => {})
    db.run(`ALTER TABLE employees ADD COLUMN emergency_contact TEXT`, (err) => {})
    db.run(`ALTER TABLE employees ADD COLUMN emergency_phone TEXT`, (err) => {})
    db.run(`ALTER TABLE employees ADD COLUMN bio TEXT`, (err) => {})

    // 兜底检查并补列
    db.all(`PRAGMA table_info(employees)`, (err, cols) => {
      if (err || !Array.isArray(cols)) return
      const names = new Set(cols.map((c) => c.name))
      const ensureCols = [
        ['address', 'TEXT'],
        ['emergency_contact', 'TEXT'],
        ['emergency_phone', 'TEXT'],
        ['bio', 'TEXT'],
      ]
      for (const [name, type] of ensureCols) {
        if (!names.has(name)) {
          db.run(`ALTER TABLE employees ADD COLUMN ${name} ${type}`, (e) => {})
        }
      }
    })

    if (seedOnStartup) {
      db.get('SELECT count(*) as count FROM employees', (err, row) => {
        if (row && row.count === 0) {
          const stmt = db.prepare('INSERT INTO employees (id, name, department, position, email, phone, status, joinDate, level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          stmt.run('E001', '张三', '技术部', '高级前端工程师', 'zhangsan@company.com', '13800138001', '在职', '2022-03-15', 'P6')
          stmt.run('E002', '李四', '销售部', '销售经理', 'lisi@company.com', '13800138002', '在职', '2021-08-20', 'P5')
          stmt.run('E003', '王五', '行政部', '人事专员', 'wangwu@company.com', '13800138003', '在职', '2023-01-10', 'P4')
          stmt.run('E004', '赵六', '技术部', '后端工程师', 'zhaoliu@company.com', '13800138004', '试用期', '2024-01-15', 'P3')
          stmt.finalize()
        }
      })
    }

    // Chat sessions
    db.run(`CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at TEXT
    )`)

    // Chat messages
    db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      role TEXT,
      content TEXT,
      timestamp TEXT
    )`)

    // Attendance (日出勤)
    db.run(`CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      employee_id TEXT,
      date TEXT,
      status TEXT
    )`)
    // 向后兼容：增加签到/签退、工时与备注字段
    db.run(`ALTER TABLE attendance ADD COLUMN check_in TEXT`, (err) => {})
    db.run(`ALTER TABLE attendance ADD COLUMN check_out TEXT`, (err) => {})
    db.run(`ALTER TABLE attendance ADD COLUMN work_hours REAL`, (err) => {})
    db.run(`ALTER TABLE attendance ADD COLUMN note TEXT`, (err) => {})
    // 真实考勤场景字段：考勤类型、休息时长、迟到早退、加班、结果状态、打卡来源
    db.run(`ALTER TABLE attendance ADD COLUMN attendance_type TEXT`, (err) => {})
    db.run(`ALTER TABLE attendance ADD COLUMN break_minutes INTEGER`, (err) => {})
    db.run(`ALTER TABLE attendance ADD COLUMN late_minutes INTEGER`, (err) => {})
    db.run(`ALTER TABLE attendance ADD COLUMN early_leave_minutes INTEGER`, (err) => {})
    db.run(`ALTER TABLE attendance ADD COLUMN overtime_minutes INTEGER`, (err) => {})
    db.run(`ALTER TABLE attendance ADD COLUMN attendance_result TEXT`, (err) => {})
    db.run(`ALTER TABLE attendance ADD COLUMN punch_source TEXT`, (err) => {})

    // 向后兼容：部分老库可能未添加成功，二次兜底检查并补列
    db.all(`PRAGMA table_info(attendance)`, (err, cols) => {
      if (err || !Array.isArray(cols)) return
      const names = new Set(cols.map((c) => c.name))
      const ensureCols = [
        ['attendance_type', 'TEXT'],
        ['break_minutes', 'INTEGER'],
        ['late_minutes', 'INTEGER'],
        ['early_leave_minutes', 'INTEGER'],
        ['overtime_minutes', 'INTEGER'],
        ['attendance_result', 'TEXT'],
        ['punch_source', 'TEXT'],
        ['work_minutes', 'INTEGER'],
      ]
      for (const [name, type] of ensureCols) {
        if (!names.has(name)) {
          db.run(`ALTER TABLE attendance ADD COLUMN ${name} ${type}`, (e) => {})
        }
      }
    })

    // 考勤异常/补卡申请
    db.run(`CREATE TABLE IF NOT EXISTS attendance_exceptions (
      id TEXT PRIMARY KEY,
      employee_id TEXT,
      date TEXT,
      type TEXT,
      reason TEXT,
      expected_check_in TEXT,
      expected_check_out TEXT,
      status TEXT,
      reviewer_id TEXT,
      review_note TEXT,
      created_at TEXT,
      reviewed_at TEXT
    )`)

    // 员工意见箱消息（员工提交，管理员接收）
    db.run(`CREATE TABLE IF NOT EXISTS feedback_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      employee_id TEXT,
      employee_name TEXT,
      department TEXT,
      content TEXT,
      status TEXT,
      created_at TEXT,
      read_at TEXT
    )`)

    // Positions (招聘职位) — 增加 requirements 字段用于存储职位要求
    db.run(`CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      title TEXT,
      department TEXT,
      status TEXT,
      requirements TEXT
    )`)

    // Applications (候选人/简历)
    db.run(`CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      position_id TEXT,
      name TEXT,
      email TEXT,
      phone TEXT,
      status TEXT,
      resume_path TEXT,
      submitDate TEXT
    )`)

    // 向 applications 表添加扩展字段：stage, notes, interviewer, interview_time（向后兼容）
    db.run(`ALTER TABLE applications ADD COLUMN stage TEXT`, (err) => {})
    db.run(`ALTER TABLE applications ADD COLUMN notes TEXT`, (err) => {})
    db.run(`ALTER TABLE applications ADD COLUMN interviewer TEXT`, (err) => {})
    db.run(`ALTER TABLE applications ADD COLUMN interview_time TEXT`, (err) => {})

    // Interviews 表：存储面试安排与反馈
    db.run(`CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY,
      application_id TEXT,
      interviewer TEXT,
      time TEXT,
      mode TEXT,
      feedback TEXT,
      outcome TEXT,
      created_at TEXT
    )`)

    // Users 表：用于存储注册用户与权限（管理员/普通用户）
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      email TEXT,
      password TEXT,
      role TEXT,
      created_at TEXT
    )`)

    // Sessions 表：简易会话凭证存储（token -> user_id）
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT,
      expires_at TEXT
    )`)

    // Salaries (月度薪资)
    db.run(`CREATE TABLE IF NOT EXISTS salaries (
      id TEXT PRIMARY KEY,
      employee_id TEXT,
      month TEXT,
      baseSalary INTEGER,
      performance INTEGER,
      bonus INTEGER,
      tax INTEGER,
      total INTEGER,
      actual INTEGER
    )`)

    // 考勤：为示例员工插入今日考勤记录
    if (seedOnStartup) {
      db.get('SELECT count(*) as count FROM attendance WHERE date = ?', [todayStr], (err, row) => {
        if (row && row.count === 0) {
          const stmt = db.prepare('INSERT INTO attendance (id, employee_id, date, status, check_in, check_out, attendance_type, break_minutes, work_hours, attendance_result, punch_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          stmt.run(`ATT-${todayStr}-E001`, 'E001', todayStr, 'present', '09:03', '18:25', 'office', 60, 8.4, 'normal', 'web')
          stmt.run(`ATT-${todayStr}-E002`, 'E002', todayStr, 'present', '09:26', '18:02', 'office', 60, 7.6, 'late', 'web')
          stmt.run(`ATT-${todayStr}-E003`, 'E003', todayStr, 'leave', null, null, 'office', 0, 0, 'leave', 'admin')
          stmt.run(`ATT-${todayStr}-E004`, 'E004', todayStr, 'present', '09:01', '17:32', 'remote', 60, 7.5, 'early_leave', 'web')
          stmt.finalize()
        }
      })
    }

    // 薪资：若当月无记录则为示例员工插入

    // 招聘：若为空则插入示例职位
    if (seedOnStartup) {
      db.get('SELECT count(*) as count FROM positions', (err, row) => {
        if (row && row.count === 0) {
          const stmt = db.prepare('INSERT OR IGNORE INTO positions (id, title, department, status) VALUES (?, ?, ?, ?)')
          stmt.run('P001', '前端工程师', '技术部', 'open')
          stmt.run('P002', '后端工程师', '技术部', 'open')
          stmt.run('P003', '人事专员', '行政部', 'closed')
          stmt.run('P004', '销售主管', '销售部', 'open')
          stmt.finalize()
        }
      })

      // 若启用启动种子，确保存在一个管理员账号（可通过环境变量覆盖）
      if (seedOnStartup) {
        const adminUser = process.env.ADMIN_USERNAME || 'admin'
        const adminPass = process.env.ADMIN_PASSWORD || 'admin123'
        db.get('SELECT * FROM users WHERE username = ?', [adminUser], (err, row) => {
          if (!row) {
            // 简单的密码哈希（scrypt + salt），以 hex 存储：salt:hash
            try {
              const salt = crypto.randomBytes(16).toString('hex')
              const hash = crypto.scryptSync(adminPass, salt, 64).toString('hex')
              const stored = `${salt}:${hash}`
              const now = new Date().toISOString()
              db.run('INSERT INTO users (id, username, email, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
                'U_ADMIN', adminUser, null, stored, 'admin', now
              ])
              console.log('[DB] seeded admin user:', adminUser)
            } catch (e) {
              console.warn('[DB] failed to seed admin user', e?.message || e)
            }
          }
        })
      }
    }

    // 薪资：若当月无记录则为示例员工插入
    if (seedOnStartup) {
      db.get('SELECT count(*) as count FROM salaries WHERE month = ?', [monthStr], (err, row) => {
        if (row && row.count === 0) {
          const insertSalary = (id, employee_id, base, perf, bonus) => {
            const total = base + perf + bonus
            const tax = Math.round(total * 0.1)
            const actual = total - tax
            db.run(
              'INSERT OR IGNORE INTO salaries (id, employee_id, month, baseSalary, performance, bonus, tax, total, actual) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [id, employee_id, monthStr, base, perf, bonus, tax, total, actual]
            )
          }
          insertSalary(`SAL-${monthStr}-E001`, 'E001', 15000, 5000, 3000)
          insertSalary(`SAL-${monthStr}-E002`, 'E002', 12000, 8000, 2000)
          insertSalary(`SAL-${monthStr}-E003`, 'E003', 8000, 2000, 1000)
          insertSalary(`SAL-${monthStr}-E004`, 'E004', 13000, 4000, 2500)
        }
      })
    }
  })
}

// Helper functions to promisify db operations
export const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

export const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

export const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this)
    })
  })
}

export default db
