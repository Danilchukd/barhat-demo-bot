import { db } from "./database.js";

// Типы музыкальных идей
export type DemoType =
  | "riff"
  | "vocal"
  | "song_sketch"
  | "full_demo"
  | "other";

// Названия типов для интерфейса Telegram
export const DEMO_TYPE_LABELS: Record<DemoType, string> = {
  riff: "Рифф",
  vocal: "Вокальная идея",
  song_sketch: "Набросок песни",
  full_demo: "Полная демка",
  other: "Другое",
};

// Тип строки списка демок
export type DemoRow = {
  id: number;
  title: string;
  url: string | null;
};

// Тип подробной записи
export type DemoFileRow = {
  title: string;
  description: string | null;
  idea_type: DemoType | null;
  source_type: string | null;
  url: string | null;
  telegram_file_id: string | null;
};

// Поддерживаемые Telegram-вложения
export type TelegramFileType =
  | "telegram_voice"
  | "telegram_audio"
  | "telegram_document"
  | "telegram_video_note";

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
    WHERE deleted_at IS NULL
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
    WHERE d.deleted_at IS NULL
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
      d.description,
      d.idea_type,
      f.source_type,
      f.url,
      f.telegram_file_id
    FROM demos d
    LEFT JOIN demo_files f
      ON f.id = (
        SELECT MAX(df.id)
        FROM demo_files df
        WHERE df.demo_id = d.id
        AND d.deleted_at IS NULL
      )
    WHERE d.id = ?
  `).get(demoId) as DemoFileRow | undefined;
}


export type DemoSearchRow = {
  id: number;
  title: string;
};

// Нормализация строки для поиска
function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .trim();
}

// Поиск демок по названию

export function searchDemos(
  query: string,
  limit: number = 10
): DemoSearchRow[] {
  const searchText = normalizeSearchText(query);

  if (!searchText) {
    return [];
  }

  type SearchRow = DemoSearchRow & {
    description: string | null;
  };

  const demos = db.prepare(`
    SELECT
      id,
      title,
      description
    FROM demos
    WHERE deleted_at IS NULL
    ORDER BY id DESC
  `).all() as SearchRow[];

  const matches = demos.filter((demo) => {
    const title = normalizeSearchText(demo.title);
    const description = normalizeSearchText(
      demo.description ?? ""
    );

    return (
      title.includes(searchText) ||
      description.includes(searchText)
    );
  });

  return matches
    .slice(0, limit)
    .map(({ id, title }) => ({ id, title }));
}



export type DemoProperties = {
  description: string | null;
  ideaType: DemoType | null;
};

// Обновление свойств существующей демки
export function updateDemoProperties(
  demoId: number,
  properties: DemoProperties
): boolean {
  if (properties.description &&
      properties.description.length > 500) {
    throw new Error("Описание слишком длинное");
  }

  const result = db.prepare(`
    UPDATE demos
    SET
      description = ?,
      idea_type = ?
    WHERE id = ?
    AND deleted_at IS NULL
  `).run(
    properties.description,
    properties.ideaType,
    demoId
  );

  return result.changes > 0;
}


export function getDemosByType(
  ideaType: DemoType | null,
  limit: number = 10
): DemoSearchRow[] {
  // Ограничиваем количество результатов
  const safeLimit = Math.max(
    1,
    Math.min(10, Math.trunc(limit))
  );

  // Демки без указанного типа
  if (ideaType === null) {
    return db.prepare(`
      SELECT id, title
      FROM demos
      WHERE idea_type IS NULL
      AND deleted_at IS NULL
      ORDER BY id DESC
      LIMIT ?
    `).all(safeLimit) as DemoSearchRow[];
  }

  // Демки выбранного типа
  return db.prepare(`
    SELECT id, title
    FROM demos
    WHERE idea_type = ?
    AND deleted_at IS NULL
    ORDER BY id DESC
    LIMIT ?
  `).all(ideaType, safeLimit) as DemoSearchRow[];
}


/**
 * Изменение названия существующей демки.
 * Возвращает true, если запись обновлена.
 */
export function updateDemoTitle(
  demoId: number,
  newTitle: string
): boolean {
  const title = newTitle.trim();

  if (
    !Number.isSafeInteger(demoId) ||
    demoId <= 0
  ) {
    throw new Error("Некорректный ID демки");
  }

  if (!title || title.length > 150) {
    throw new Error(
      "Название должно содержать от 1 до 150 символов"
    );
  }

  const result = db.prepare(`
    UPDATE demos
    SET title = ?
    WHERE id = ?
    AND deleted_at IS NULL
  `).run(title, demoId);

  return result.changes > 0;
}


// Перемещение демки в корзину
export function softDeleteDemo(demoId: number): boolean {
  const result = db.prepare(`
    UPDATE demos
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND deleted_at IS NULL
  `).run(demoId);

  return result.changes > 0;
}

// Восстановление демки из корзины
export function restoreDemo(demoId: number): boolean {
  const result = db.prepare(`
    UPDATE demos
    SET deleted_at = NULL
    WHERE id = ?
      AND deleted_at IS NOT NULL
  `).run(demoId);

  return result.changes > 0;
}


export type DeletedDemoRow = {
  id: number;
  title: string;
  deleted_at: string;
};

// Получение демок из корзины
export function getDeletedDemos(
  limit: number = 10
): DeletedDemoRow[] {
  const safeLimit = Math.max(
    1,
    Math.min(50, Math.trunc(limit))
  );

  return db.prepare(`
    SELECT
      id,
      title,
      deleted_at
    FROM demos
    WHERE deleted_at IS NOT NULL
    ORDER BY deleted_at DESC, id DESC
    LIMIT ?
  `).all(safeLimit) as DeletedDemoRow[];
}






