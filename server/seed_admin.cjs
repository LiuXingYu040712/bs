const path = require('path')
const sqlite3 = require('sqlite3').verbose()
const crypto = require('crypto')
const fs = require('fs')

const dbFile = path.join(__dirname, 'database.sqlite')
if (!fs.existsSync(dbFile)) {
  console.error('database file not found at', dbFile)
  process.exit(1)
}

const adminUser = process.env.ADMIN_USERNAME || 'admin'
const adminPass = process.env.ADMIN_PASSWORD || 'admin123'
const adminId = process.env.ADMIN_ID || 'U_ADMIN'

const db = new sqlite3.Database(dbFile, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('Failed to open DB:', err.message)
    process.exit(1)
  }

  db.get('SELECT * FROM users WHERE username = ?', [adminUser], (err, row) => {
    if (err) {
      console.error('Query failed:', err.message)
      db.close()
      process.exit(1)
    }

    if (row) {
      console.log('Admin user already exists:', adminUser)
      console.table([{ id: row.id, username: row.username, role: row.role, created_at: row.created_at }])
      db.close()
      return
    }

    try {
      const salt = crypto.randomBytes(16).toString('hex')
      const hash = crypto.scryptSync(adminPass, salt, 64).toString('hex')
      const stored = `${salt}:${hash}`
      const now = new Date().toISOString()
      db.run(
        'INSERT INTO users (id, username, email, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [adminId, adminUser, null, stored, 'admin', now],
        function (insErr) {
          if (insErr) {
            console.error('Failed to insert admin:', insErr.message)
            db.close()
            process.exit(1)
          }
          console.log('[DB] seeded admin user:', adminUser)
          console.log('Credentials: username=%s password=%s', adminUser, adminPass)
          db.get('SELECT id, username, role, created_at FROM users WHERE username = ?', [adminUser], (qErr, newRow) => {
            if (!qErr && newRow) console.table([newRow])
            db.close()
          })
        }
      )
    } catch (e) {
      console.error('Hashing/insert failed:', e.message || e)
      db.close()
      process.exit(1)
    }
  })
})
