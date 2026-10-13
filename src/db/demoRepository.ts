
import { db } from "./database.js";

// Тип строки списка демок
export type DemoRow = {
  id: number;
  title: string;
  url: string | null;
};

// Тип подробной записи
export type DemoFileRow = {
  title: string;
  source_type: string | null;
  url: string | null;
  telegram_file_id: string | null;
};

// Поддерживаемые Telegram-вложения
export type TelegramFileType =
  | "telegram_voice"
  | "telegram_audio"
  | "telegram_document";

// Определяем источник ссылки
export function getSourceType(url: URL): string {
  const host = url.hostname.toLowerCase();

  if (host === "drive.google.com") {
    return "google_drive";
  }

  if (
    host === "disk.yandex.ru" ||
    host === "disk.yandex.com" ||
    host === "yadi.sk"
  ) {
    return "yandex_disk";
  }

  return "external";
}

// Добавление демки по ссылке
const insertLinkDemo = db.transaction(
  (title: string, url: string, sourceType: string): number => {
    const result = db.prepare(`
      INSERT INTO demos (title)
      VALUES (?)
    `).run(title);

    const demoId = Number(result.lastInsertRowid);

    db.prepare(`
      INSERT INTO demo_files (
        demo_id,
        source_type,
        url
      )
      VALUES (?, ?, ?)
    `).run(demoId, sourceType, url);

    return demoId;
  }
);

export function saveDemo(
  title: string,
  url: string,
  sourceType: string
): number {
  return insertLinkDemo(title, url, sourceType);
}

// Добавление Telegram-аудио
const insertTelegramDemo = db.transaction(
  (
    title: string,
    fileId: string,
    sourceType: TelegramFileType
  ): number => {
    const result = db.prepare(`
      INSERT INTO demos (title)
      VALUES (?)
    `).run(title);

    const demoId = Number(result.lastInsertRowid);

    db.prepare(`
      INSERT INTO demo_files (
        demo_id,
        source_type,
        telegram_file_id
      )
      VALUES (?, ?, ?)
    `).run(demoId, sourceType, fileId);

    return demoId;
  }
);

export function saveTelegramDemo(
  title: string,
  fileId: string,
  sourceType: TelegramFileType
): number {
  return insertTelegramDemo(title, fileId, sourceType);
}

// Количество демок
export function countDemos(): number {
  const result = db.prepare(`
    SELECT COUNT(*) AS total
    FROM demos
  `).get() as { total: number };

  return result.total;
}

// Последние демки
export function getRecentDemos(
  limit: number = 10
): DemoRow[] {
  return db.prepare(`
    SELECT
      d.id,
      d.title,
      (
        SELECT f.url
        FROM demo_files f
        WHERE f.demo_id = d.id
        ORDER BY f.id DESC
        LIMIT 1
      ) AS url
    FROM demos d
    ORDER BY d.id DESC
    LIMIT ?
  `).all(limit) as DemoRow[];
}

// Получение демки по ID
export function getDemoById(
  demoId: number
): DemoFileRow | undefined {
  return db.prepare(`
    SELECT
      d.title,
      f.source_type,
      f.url,
      f.telegram_file_id
    FROM demos d
    LEFT JOIN demo_files f
      ON f.id = (
        SELECT MAX(df.id)
        FROM demo_files df
        WHERE df.demo_id = d.id
      )
    WHERE d.id = ?
  `).get(demoId) as DemoFileRow | undefined;
}
