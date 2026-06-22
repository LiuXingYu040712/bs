const path = require('path');
const fs = require('fs');

const dbFile = path.join(__dirname, 'database.sqlite');
if (!fs.existsSync(dbFile)) {
  console.error('Error: database file not found at', dbFile);
  process.exit(1);
}

let sqlite3;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (e) {
  console.error('The Node package "sqlite3" is not installed for this project.');
  console.error('Install it by running:');
  console.error('  npm install sqlite3 --save');
  process.exit(2);
}

const db = new sqlite3.Database(dbFile, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
    process.exit(1);
  }

  console.log('Opened DB:', dbFile);

  db.all("SELECT id, username, role, email, created_at FROM users", (err, rows) => {
    if (err) {
      console.error('Query users failed:', err.message);
    } else {
      console.log('\nUsers table rows:');
      console.table(rows || []);
    }

    db.get('SELECT COUNT(*) AS count FROM sessions', (err2, r) => {
      if (err2) {
        console.error('Query sessions failed:', err2.message);
      } else {
        console.log('\nSessions count:', r && r.count ? r.count : 0);
      }
      db.close();
    });
  });
});
