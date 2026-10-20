import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// Создаём папку для базы данных
// Для тестового бота можно указать отдельную SQLite, не затрагивая основную.
const dbPath = path.resolve(process.env.BARHAT_DB_PATH || path.join(process.cwd(), "data", "barhat.sqlite"));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Подключаем SQLite
export const db = new Database(dbPath);

// Настройки базы
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Создаём таблицы
db.exec(`
  CREATE TABLE IF NOT EXISTS demos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  idea_type TEXT,
  status TEXT NOT NULL DEFAULT 'idea',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
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

type TableColumn = {
  name: string;
};

// Получаем список существующих столбцов
const columns = db
  .prepare("PRAGMA table_info(demos)")
  .all() as TableColumn[];

// Добавляем новый столбец, если его ещё нет
if (!columns.some((column) => column.name === "idea_type")) {
  db.exec(`
    ALTER TABLE demos
    ADD COLUMN idea_type TEXT
  `);

  console.log("Миграция: добавлен столбец idea_type");
}


if (!columns.some((column) => column.name === "deleted_at")) {
  db.exec(`
    ALTER TABLE demos
    ADD COLUMN deleted_at TEXT
  `);

  console.log("Миграция: добавлен столбец deleted_at");
}


//
// Миграции таблицы demo_files
//

const fileColumns = db
  .prepare("PRAGMA table_info(demo_files)")
  .all() as TableColumn[];

// Название конкретного файла или версии
if (!fileColumns.some((col) => col.name === "label")) {
  db.exec(`
    ALTER TABLE demo_files
    ADD COLUMN label TEXT
  `);

  console.log("Миграция: добавлен demo_files.label");
}

// Уникальный идентификатор файла в Telegram
if (!fileColumns.some(
  (col) => col.name === "telegram_file_unique_id"
)) {
  db.exec(`
    ALTER TABLE demo_files
    ADD COLUMN telegram_file_unique_id TEXT
  `);

  console.log(
    "Миграция: добавлен telegram_file_unique_id"
  );
}


if (!fileColumns.some(
  (column) => column.name === "deleted_at"
)) {
  db.exec(`
    ALTER TABLE demo_files
    ADD COLUMN deleted_at TEXT
  `);

  console.log(
    "Миграция: добавлен demo_files.deleted_at"
  );
}


//
// Основной файл музыкальной идеи
//

if (!fileColumns.some(
  (column) => column.name === "is_primary"
)) {
  db.exec(`
    ALTER TABLE demo_files
    ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0
  `);

  console.log(
    "Миграция: добавлен demo_files.is_primary"
  );
}

// Только один активный основной файл на демку
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS
    idx_demo_files_primary
  ON demo_files(demo_id)
  WHERE is_primary = 1
    AND deleted_at IS NULL
`);



// Только новые INSERT после установки триггера попадают в очередь.
// Старые демки не затрагиваются и автоматически не экспортируются.
db.exec(`
  CREATE TABLE IF NOT EXISTS sheet_sync_jobs (
    demo_id INTEGER PRIMARY KEY REFERENCES demos(id),
    state TEXT NOT NULL DEFAULT 'pending'
      CHECK (state IN ('pending', 'synced', 'conflict')),
    revision INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    synced_title TEXT,
    synced_link TEXT,
    last_error TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TRIGGER IF NOT EXISTS trg_sheet_sync_new_demo
  AFTER INSERT ON demos
  BEGIN
    INSERT INTO sheet_sync_jobs (demo_id) VALUES (NEW.id);
  END;

  CREATE TRIGGER IF NOT EXISTS trg_sheet_sync_changed_demo
  AFTER UPDATE OF title, description ON demos
  WHEN NEW.title IS NOT OLD.title OR NEW.description IS NOT OLD.description
  BEGIN
    UPDATE sheet_sync_jobs
    SET revision = revision + 1,
        state = 'pending',
        last_error = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE demo_id = NEW.id;
  END;
`);

console.log("База данных SQLite подключена!");
