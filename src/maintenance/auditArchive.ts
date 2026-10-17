import Database from "better-sqlite3";
import path from "node:path";

type Demo = {
  id: number;
  title: string;
  deleted_at: string | null;
};

type Attachment = {
  id: number;
  demo_id: number;
  source_type: string;
  url: string | null;
  telegram_file_id: string | null;
  telegram_file_unique_id: string | null;
  deleted_at: string | null;
  is_primary: number;
};

type ForeignKeyIssue = {
  table: string;
  rowid: number;
  parent: string;
  fkid: number;
};

const databasePath = path.join(
  process.cwd(),
  "data",
  "barhat.sqlite"
);

const db = new Database(databasePath, {
  readonly: true,
  fileMustExist: true,
});

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[\s_-]+/g, " ")
    .trim();
}

// Та же нормализация облачных ссылок, что в importPreview.ts
function linkKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    const host = url.hostname.toLowerCase();

    if (host === "drive.google.com") {
      const id =
        url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] ??
        url.searchParams.get("id");

      if (id) return `drive:${id}`;
    }

    if ([
      "disk.yandex.ru",
      "disk.yandex.com",
      "disk.yandex.com.am",
      "yadi.sk",
    ].includes(host)) {
      if (
        url.pathname.startsWith("/d/") ||
        url.pathname.startsWith("/i/")
      ) {
        return `yandex:${url.pathname.replace(/\/$/, "")}`;
      }
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function groupByKey<T>(
  items: T[],
  keyOf: (item: T) => string | null
): T[][] {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;

    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .sort((a, b) => b.length - a.length);
}

function show(
  title: string,
  details: string[],
  limit = 20
): void {
  console.log(`\n${title}: ${details.length}`);

  if (details.length === 0) {
    console.log("  Не обнаружено");
    return;
  }

  for (const item of details.slice(0, limit)) {
    console.log(`  • ${item}`);
  }

  if (details.length > limit) {
    console.log(`  ...и ещё ${details.length - limit}`);
  }
}

try {
  // Отдельная транзакция даёт согласованный снимок данных
  // даже если бот в это время записывает новые демки.
  db.exec("BEGIN");

  try {
    const integrity = db.prepare(
      "PRAGMA integrity_check"
    ).all() as Array<{ integrity_check: string }>;

    const foreignKeys = db.prepare(
      "PRAGMA foreign_key_check"
    ).all() as ForeignKeyIssue[];

    const demos = db.prepare(`
      SELECT id, title, deleted_at
      FROM demos
      ORDER BY id
    `).all() as Demo[];

    const attachments = db.prepare(`
      SELECT
        id, demo_id, source_type, url,
        telegram_file_id, telegram_file_unique_id,
        deleted_at, is_primary
      FROM demo_files
      ORDER BY id
    `).all() as Attachment[];

    const activeDemos = demos.filter(
      (demo) => demo.deleted_at === null
    );
    const activeIds = new Set(
      activeDemos.map((demo) => demo.id)
    );
    const activeFiles = attachments.filter(
      (file) =>
        file.deleted_at === null &&
        activeIds.has(file.demo_id)
    );

    const filesByDemo = new Map<number, Attachment[]>();
    for (const file of activeFiles) {
      const group = filesByDemo.get(file.demo_id) ?? [];
      group.push(file);
      filesByDemo.set(file.demo_id, group);
    }

    console.log("=== BARHAT — проверка архива SQLite ===");
    console.log(`Активных демок: ${activeDemos.length}`);
    console.log(`Демок в корзине: ${demos.length - activeDemos.length}`);
    console.log(`Активных вложений: ${activeFiles.length}`);
    console.log(
      `Мягко удалённых вложений: ${
        attachments.filter((file) => file.deleted_at !== null).length
      }`
    );

    const integrityMessages = integrity
      .map((row) => row.integrity_check)
      .filter((value) => value !== "ok");

    show("Ошибки целостности SQLite", integrityMessages);

    show(
      "Нарушения внешних ключей",
      foreignKeys.map(
        (row) =>
          `${row.table}: строка ${row.rowid}, ` +
          `родитель ${row.parent}, ключ ${row.fkid}`
      )
    );

    show(
      "Активные демки без активных вложений",
      activeDemos
        .filter((demo) => !(filesByDemo.get(demo.id)?.length))
        .map((demo) => `#${demo.id} — ${demo.title}`)
    );

    show(
      "Вложения без файла и без ссылки",
      activeFiles
        .filter(
          (file) =>
            !file.url?.trim() &&
            !file.telegram_file_id?.trim()
        )
        .map((file) => `демка #${file.demo_id}, файл #${file.id}`)
    );

    show(
      "Вложения одновременно со ссылкой и Telegram ID",
      activeFiles
        .filter(
          (file) =>
            !!file.url?.trim() &&
            !!file.telegram_file_id?.trim()
        )
        .map((file) => `демка #${file.demo_id}, файл #${file.id}`)
    );

    show(
      "Возможные дубликаты по названию (требуют проверки)",
      groupByKey(activeDemos, (demo) => normalizeTitle(demo.title))
        .map((group) =>
          group.map((demo) => `#${demo.id} ${demo.title}`).join(" | ")
        )
    );

    show(
      "Повторяющиеся облачные ссылки",
      groupByKey(activeFiles, (file) =>
        file.url ? linkKey(file.url) : null
      ).map((group) =>
        group.map(
          (file) => `демка #${file.demo_id}, файл #${file.id}`
        ).join(" | ")
      )
    );

    show(
      "Повторяющиеся Telegram-файлы",
      groupByKey(activeFiles, (file) => {
        if (file.telegram_file_unique_id?.trim()) {
          return `unique:${file.telegram_file_unique_id}`;
        }
        if (file.telegram_file_id?.trim()) {
          return `file:${file.telegram_file_id}`;
        }
        return null;
      }).map((group) =>
        group.map(
          (file) => `демка #${file.demo_id}, файл #${file.id}`
        ).join(" | ")
      )
    );

    show(
      "Больше одного активного основного файла",
      activeDemos
        .filter(
          (demo) =>
            (filesByDemo.get(demo.id) ?? [])
              .filter((file) => file.is_primary === 1).length > 1
        )
        .map((demo) => `#${demo.id} — ${demo.title}`)
    );

    show(
      "Нет явно назначенного основного файла (не ошибка)",
      activeDemos
        .filter((demo) => {
          const files = filesByDemo.get(demo.id) ?? [];
          return (
            files.length > 0 &&
            !files.some((file) => file.is_primary === 1)
          );
        })
        .map((demo) => `#${demo.id} — ${demo.title}`)
    );

    show(
      "Удалённые вложения с флагом основного",
      attachments
        .filter(
          (file) =>
            file.deleted_at !== null &&
            file.is_primary === 1
        )
        .map((file) => `демка #${file.demo_id}, файл #${file.id}`)
    );

    console.log("\nПроверка завершена. База не изменялась.");

    if (integrityMessages.length || foreignKeys.length) {
      process.exitCode = 1;
    }
  } finally {
    db.exec("ROLLBACK");
  }
} finally {
  db.close();
}
