import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(__dirname, '..', 'keys.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS key_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    type TEXT NOT NULL,
    plan TEXT NOT NULL,
    key TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    created_by TEXT NOT NULL
  )
`);

export function logKey(type: string, plan: string, key: string, customerName: string, createdBy: string) {
  db.prepare(
    'INSERT INTO key_log (type, plan, key, customer_name, created_by) VALUES (?, ?, ?, ?, ?)'
  ).run(type, plan, key, customerName, createdBy);
}

export function getStatsToday(): { type: string; plan: string; count: number }[] {
  return db.prepare(`
    SELECT type, plan, COUNT(*) as count
    FROM key_log
    WHERE date(created_at) = date('now','localtime')
    GROUP BY type, plan
  `).all() as any[];
}

export function getStatsRange(days: number): { type: string; plan: string; count: number }[] {
  return db.prepare(`
    SELECT type, plan, COUNT(*) as count
    FROM key_log
    WHERE created_at >= datetime('now','localtime','-' || ? || ' days')
    GROUP BY type, plan
  `).all(days) as any[];
}

export function getKeysToday(): { created_at: string; type: string; plan: string; key: string; customer_name: string }[] {
  return db.prepare(`
    SELECT created_at, type, plan, key, customer_name
    FROM key_log
    WHERE date(created_at) = date('now','localtime')
    ORDER BY created_at DESC
  `).all() as any[];
}

export default db;
