import sqlite3 from 'sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = path.resolve(__dirname, 'database.sqlite')

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
    const seedOnStartup = `${process.env.DB_SEED_ON_STARTUP || 'true'}`.toLowerCase() === 'true'
    // RAG Config
    db.run(`CREATE TABLE IF NOT EXISTS rag_config (
      key TEXT PRIMARY KEY,
      value TEXT
    )`)

    db.get('SELECT * FROM rag_config WHERE key = ?', ['default'], (err, row) => {
      if (!row) {
        const defaultConfig = {
          vectorModel: 'text-embedding-3-small',
          topK: 5,
          similarityThreshold: 0.7,
          retrievalMode: 'hybrid',
        }
        db.run('INSERT INTO rag_config (key, value) VALUES (?, ?)', ['default', JSON.stringify(defaultConfig)])
      }
    })

    // Knowledge Docs
    db.run(`CREATE TABLE IF NOT EXISTS knowledge_docs (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      chunks INTEGER,
      vectors INTEGER
    )`)

    if (seedOnStartup) {
      db.get('SELECT count(*) as count FROM knowledge_docs', (err, row) => {
        if (row && row.count === 0) {
          const stmt = db.prepare('INSERT INTO knowledge_docs VALUES (?, ?, ?, ?, ?)')
          stmt.run('KB001', '员工手册.pdf', 'PDF', 156, 156)
          stmt.run('KB002', '人事政策2024.docx', 'DOCX', 98, 98)
          stmt.finalize()
        }
      })
    }

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
      level TEXT
    )`)

    if (seedOnStartup) {
      db.get('SELECT count(*) as count FROM employees', (err, row) => {
        if (row && row.count === 0) {
          const stmt = db.prepare('INSERT INTO employees VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
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

    // System settings
    db.run(`CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`)

    db.get('SELECT * FROM system_settings WHERE key = ?', ['app'], (err, row) => {
      if (!row) {
        const defaultSettings = {
          siteName: '管理系统',
          siteDescription: '这是一个功能强大的管理系统',
          language: 'zh-CN',
          timezone: 'Asia/Shanghai',
          emailNotification: false,
          smsNotification: false,
          autoBackup: false,
          maintenanceMode: false,
        }
        db.run('INSERT INTO system_settings (key, value) VALUES (?, ?)', ['app', JSON.stringify(defaultSettings)])
      }
    })

    // Attendance (日出勤)
    db.run(`CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      employee_id TEXT,
      date TEXT,
      status TEXT
    )`)

    // Positions (招聘职位)
    db.run(`CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      title TEXT,
      department TEXT,
      status TEXT
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

    // 初始化示例数据（基于当前日期）
    const now = new Date()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const todayStr = `${yyyy}-${mm}-${dd}`
    const monthStr = `${yyyy}-${mm}`

    // 出勤：初始化阶段不再自动插入今日示例数据，避免重复重启导致主键冲突。

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
