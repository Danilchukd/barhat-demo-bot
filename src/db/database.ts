
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// Создаём папку для базы данных
const dataDir = path.join(process.cwd(), "data");

fs.mkdirSync(dataDir, { recursive: true });

// Подключаем SQLite
export const db = new Database(
  path.join(dataDir, "barhat.sqlite")
);

// Настройки базы
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Создаём таблицы
db.exec(`
  CREATE TABLE IF NOT EXISTS demos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'idea',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS demo_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    demo_id INTEGER NOT NULL,
    source_type TEXT NOT NULL,
    url TEXT,
    telegram_file_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (demo_id)
      REFERENCES demos(id)
      ON DELETE CASCADE
  );
`);

console.log("База данных SQLite подключена!");
