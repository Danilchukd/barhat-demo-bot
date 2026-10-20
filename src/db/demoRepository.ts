import { db } from "./database.js";
import { normalizeTitle } from "../sheets/sheetInsertPlan.js";

export class DuplicateDemoTitleError extends Error {
  constructor() {
    super("Демка с таким названием уже существует. Выбери другое название.");
    this.name = "DuplicateDemoTitleError";
  }
}

export function ensureUniqueDemoTitle(title: string, exceptId?: number): void {
  const normalized = normalizeTitle(title);
  const rows = db.prepare("SELECT id, title FROM demos WHERE deleted_at IS NULL").all() as Array<{ id: number; title: string }>;
  if (rows.some((row) => row.id !== exceptId && normalizeTitle(row.title) === normalized)) {
    throw new DuplicateDemoTitleError();
  }
}


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
  | "telegram_video_note"
  | "telegram_video"
  | "telegram_video_document";

// Определяем источник ссылки
export function getSourceType(url: URL): string {
  const host = url.hostname.toLowerCase();

  if (host === "drive.google.com") {
    return "google_drive";
  }

  if (
    host === "disk.yandex.ru" ||
    host === "disk.yandex.com" ||
    host === "disk.yandex.com.am" ||
    host === "yadi.sk"
  ) {
    return "yandex_disk";
  }

  return "external";
}

// Добавление демки по ссылке
const insertLinkDemo = db.transaction(
  (title: string, url: string, sourceType: string): number => {
    ensureUniqueDemoTitle(title);
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
        AND f.deleted_at IS NULL
        ORDER BY f.is_primary DESC, f.id DESC
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
        SELECT df.id
        FROM demo_files df
        WHERE df.demo_id = d.id
          AND df.deleted_at IS NULL
        ORDER BY
          df.is_primary DESC,
          df.id DESC
        LIMIT 1
      )
    WHERE d.id = ?
      AND d.deleted_at IS NULL
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


export function getSearchPage(
  query: string,
  requestedPage: number = 0
): ArchivePage {
  const pageSize = 8;

  // Используем существующий поиск,
  // но получаем все совпадения
  const allDemos = searchDemos(
    query,
    Number.MAX_SAFE_INTEGER
  );

  const total = allDemos.length;

  const totalPages = Math.max(
    1,
    Math.ceil(total / pageSize)
  );

  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(
        0,
        Math.min(requestedPage, totalPages - 1)
      )
    : 0;

  const offset = page * pageSize;

  return {
    demos: allDemos.slice(
      offset,
      offset + pageSize
    ),
    page,
    totalPages,
    total,
  };
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


export function getTypePage(
  ideaType: DemoType | null,
  requestedPage: number = 0
): ArchivePage {
  const pageSize = 8;

  // SQLite: IS ? работает и для NULL,
  // и для обычных строковых значений
  const result = db.prepare(`
    SELECT COUNT(*) AS total
    FROM demos
    WHERE deleted_at IS NULL
      AND idea_type IS ?
  `).get(ideaType) as { total: number };

  const total = result.total;

  const totalPages = Math.max(
    1,
    Math.ceil(total / pageSize)
  );

  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(
        0,
        Math.min(requestedPage, totalPages - 1)
      )
    : 0;

  const demos = db.prepare(`
    SELECT id, title
    FROM demos
    WHERE deleted_at IS NULL
      AND idea_type IS ?
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(
    ideaType,
    pageSize,
    page * pageSize
  ) as DemoSearchRow[];

  return {
    demos,
    page,
    totalPages,
    total,
  };
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

  ensureUniqueDemoTitle(title, demoId);

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


export type DemoAttachmentRow = {
  id: number;
  demo_id: number;
  source_type: string;
  url: string | null;
  telegram_file_id: string | null;
  telegram_file_unique_id: string | null;
  label: string | null;
  created_at: string;
  is_primary: number;
};

// Все файлы, привязанные к одной демке
export function getDemoAttachments(
  demoId: number
): DemoAttachmentRow[] {
  return db.prepare(`
    SELECT
      f.id,
      f.demo_id,
      f.source_type,
      f.url,
      f.telegram_file_id,
      f.telegram_file_unique_id,
      f.label,
      f.is_primary,
      f.created_at
    FROM demo_files f
    JOIN demos d ON d.id = f.demo_id
    WHERE d.id = ?
      AND d.deleted_at IS NULL
      AND f.deleted_at IS NULL
    ORDER BY f.id ASC
  `).all(demoId) as DemoAttachmentRow[];
}


/**
 * Получение конкретного файла демки.
 *
 * demoId — ID музыкальной идеи
 * attachmentId — ID вложения из demo_files
 */
export function getDemoAttachmentById(
  demoId: number,
  attachmentId: number
): DemoAttachmentRow | undefined {
  return db.prepare(`
    SELECT
      f.id,
      f.demo_id,
      f.source_type,
      f.url,
      f.telegram_file_id,
      f.telegram_file_unique_id,
      f.label,
      f.is_primary,
      f.created_at
    FROM demo_files f
    JOIN demos d
      ON d.id = f.demo_id
    WHERE f.demo_id = ?
      AND f.id = ?
      AND d.deleted_at IS NULL
      AND f.deleted_at IS NULL
  `).get(
    demoId,
    attachmentId
  ) as DemoAttachmentRow | undefined;
}


export type NewDemoAttachment =
  | {
    kind: "link";
    url: string;
    sourceType: string;
  }
  | {
    kind: "telegram";
    fileId: string;
    fileUniqueId: string;
    sourceType: TelegramFileType;
  };

export type AddAttachmentResult =
  | "added"
  | "duplicate"
  | "not_found";

// Добавляем вложение к существующей демке
const insertAttachment = db.transaction(
  (
    demoId: number,
    attachment: NewDemoAttachment
  ): AddAttachmentResult => {

    // Проверяем, что демка существует
    // и не находится в корзине
    const demo = db.prepare(`
      SELECT id
      FROM demos
      WHERE id = ?
        AND deleted_at IS NULL
    `).get(demoId);

    if (!demo) {
      return "not_found";
    }

    // Добавление облачной ссылки
    if (attachment.kind === "link") {
      const duplicate = db.prepare(`
        SELECT id
        FROM demo_files
        WHERE demo_id = ?
          AND url = ?
          AND deleted_at IS NULL
        LIMIT 1
      `).get(demoId, attachment.url);

      if (duplicate) {
        return "duplicate";
      }

      db.prepare(`
        INSERT INTO demo_files (
          demo_id,
          source_type,
          url
        )
        VALUES (?, ?, ?)
      `).run(
        demoId,
        attachment.sourceType,
        attachment.url
      );

      return "added";
    }

    // Добавление файла Telegram
    const duplicate = db.prepare(`
      SELECT id
      FROM demo_files
      WHERE demo_id = ?
        AND (
          telegram_file_unique_id = ?
          OR telegram_file_id = ?
        )
        AND deleted_at IS NULL
      LIMIT 1
    `).get(
      demoId,
      attachment.fileUniqueId,
      attachment.fileId
    );

    if (duplicate) {
      return "duplicate";
    }

    db.prepare(`
      INSERT INTO demo_files (
        demo_id,
        source_type,
        telegram_file_id,
        telegram_file_unique_id
      )
      VALUES (?, ?, ?, ?)
    `).run(
      demoId,
      attachment.sourceType,
      attachment.fileId,
      attachment.fileUniqueId
    );

    return "added";
  }
);

export function addAttachmentToDemo(
  demoId: number,
  attachment: NewDemoAttachment
): AddAttachmentResult {
  return insertAttachment(demoId, attachment);
}


// Мягкое удаление конкретного вложения
export function softDeleteDemoAttachment(
  demoId: number,
  attachmentId: number
): boolean {
  const result = db.prepare(`
    UPDATE demo_files
    SET
      deleted_at = CURRENT_TIMESTAMP,
      is_primary = 0
    WHERE demo_id = ?
      AND id = ?
      AND deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM demos
        WHERE id = ?
          AND deleted_at IS NULL
      )
  `).run(demoId, attachmentId, demoId);

  return result.changes > 0;
}

// Восстановление вложения
export function restoreDemoAttachment(
  demoId: number,
  attachmentId: number
): boolean {
  const result = db.prepare(`
    UPDATE demo_files
    SET deleted_at = NULL
    WHERE demo_id = ?
      AND id = ?
      AND deleted_at IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM demos
        WHERE id = ?
          AND deleted_at IS NULL
      )
  `).run(demoId, attachmentId, demoId);

  return result.changes > 0;
}


/**
 * Изменение названия отдельного вложения.
 *
 * null — очистить название.
 * Возвращает true при успешном обновлении.
 */
export function updateDemoAttachmentLabel(
  demoId: number,
  attachmentId: number,
  newLabel: string | null
): boolean {
  const label = newLabel?.trim() ?? null;

  if (
    !Number.isSafeInteger(demoId) ||
    !Number.isSafeInteger(attachmentId) ||
    demoId <= 0 ||
    attachmentId <= 0
  ) {
    throw new Error("Некорректный ID");
  }

  if (
    label !== null &&
    (label.length === 0 || label.length > 80)
  ) {
    throw new Error(
      "Название должно содержать от 1 до 80 символов"
    );
  }

  const result = db.prepare(`
    UPDATE demo_files
    SET label = ?
    WHERE id = ?
      AND demo_id = ?
      AND deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM demos
        WHERE id = ?
          AND deleted_at IS NULL
      )
  `).run(
    label,
    attachmentId,
    demoId,
    demoId
  );

  return result.changes > 0;
}


export type PrimaryAttachmentResult =
  | "updated"
  | "already_primary"
  | "not_found";

const markPrimaryAttachment = db.transaction(
  (
    demoId: number,
    attachmentId: number
  ): PrimaryAttachmentResult => {

    // Проверяем существование активного файла
    const file = db.prepare(`
      SELECT f.is_primary
      FROM demo_files f
      JOIN demos d
        ON d.id = f.demo_id
      WHERE f.id = ?
        AND f.demo_id = ?
        AND f.deleted_at IS NULL
        AND d.deleted_at IS NULL
    `).get(
      attachmentId,
      demoId
    ) as { is_primary: number } | undefined;

    if (!file) {
      return "not_found";
    }

    if (file.is_primary === 1) {
      return "already_primary";
    }

    // Убираем основной статус у других файлов
    db.prepare(`
      UPDATE demo_files
      SET is_primary = 0
      WHERE demo_id = ?
        AND is_primary = 1
    `).run(demoId);

    // Назначаем новый основной файл
    db.prepare(`
      UPDATE demo_files
      SET is_primary = 1
      WHERE id = ?
        AND demo_id = ?
        AND deleted_at IS NULL
    `).run(attachmentId, demoId);

    return "updated";
  }
);

export function setPrimaryDemoAttachment(
  demoId: number,
  attachmentId: number
): PrimaryAttachmentResult {
  if (
    !Number.isSafeInteger(demoId) ||
    !Number.isSafeInteger(attachmentId) ||
    demoId <= 0 ||
    attachmentId <= 0
  ) {
    return "not_found";
  }

  return markPrimaryAttachment(demoId, attachmentId);
}


export type ArchivePage = {
  demos: DemoSearchRow[];
  page: number;
  totalPages: number;
  total: number;
};

// Постраничное получение демок
export function getArchivePage(
  requestedPage: number = 0,
  pageSize: number = 8
): ArchivePage {
  const safeSize = Math.max(
    1,
    Math.min(20, Math.trunc(pageSize) || 8)
  );

  // Общее количество активных демок
  const total = countDemos();

  const totalPages = Math.max(
    1,
    Math.ceil(total / safeSize)
  );

  // Страницы нумеруются с нуля
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(
        0,
        Math.min(requestedPage, totalPages - 1)
      )
    : 0;

  const offset = page * safeSize;

  const demos = db.prepare(`
    SELECT id, title
    FROM demos
    WHERE deleted_at IS NULL
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(safeSize, offset) as DemoSearchRow[];

  return {
    demos,
    page,
    totalPages,
    total,
  };
}










