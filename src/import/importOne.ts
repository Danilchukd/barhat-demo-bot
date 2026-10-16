import "dotenv/config";

import { Bot, InputFile } from "grammy";
import { HttpsProxyAgent } from "https-proxy-agent";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { db } from "../db/database.js";
import { prepareAudioForTelegram } from "./audio/prepareAudio.js";
import { downloadCloudAudio, type CloudCandidate } from "./downloadCloudAudio.js";

type Candidate = {
  sourceRow: number;
  title: string;
  sourceType: "google_drive" | "yandex_disk" | "external";
  url: string;
};

type Manifest = { entries: Candidate[] };

type UploadReceipt = {
  sourceRow: number;
  sourceUrl: string;
  sourcePath: string;
  telegramFileId: string;
  telegramFileUniqueId: string;
  messageId: number;
};

type RegisterResult = {
  demoId: number;
  attachmentId: number;
  createdDemo: boolean;
};

function option(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
}

function validId(value: string | undefined, label: string): number {
  const n = Number(value);
  if (!value || !Number.isSafeInteger(n) || n <= 0) {
    throw new Error(`${label}: требуется положительное целое число`);
  }
  return n;
}

function cleanFileName(value: string): string {
  const name = value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim()
    .replace(/[. ]+$/g, "");
  return (name.slice(0, 100) || "BARHAT demo") + ".mp3";
}

// Одна транзакция: музыкальная идея, исходная ссылка,
// Telegram MP3 и выбор основного вложения.
const registerImport = db.transaction(
  (input: {
    candidate: Candidate;
    requestedDemoId?: number;
    receipt: UploadReceipt;
  }): RegisterResult => {
    const { candidate, requestedDemoId, receipt } = input;
    let demoId = requestedDemoId;
    let createdDemo = false;

    if (demoId !== undefined) {
      const existing = db.prepare(`
        SELECT id FROM demos
        WHERE id = ? AND deleted_at IS NULL
      `).get(demoId);
      if (!existing) throw new Error("Выбранная демка не найдена или в корзине");
    } else {
      const result = db.prepare(`
        INSERT INTO demos (title) VALUES (?)
      `).run(candidate.title);
      demoId = Number(result.lastInsertRowid);
      createdDemo = true;
    }

    // Запоминаем, какой файл открывался бы через /demo ID
    // до импорта: если файл уже был, не меняем выбор пользователя.
    const previousDefault = !createdDemo
      ? db.prepare(`
          SELECT id
          FROM demo_files
          WHERE demo_id = ? AND deleted_at IS NULL
          ORDER BY is_primary DESC, id DESC
          LIMIT 1
        `).get(demoId) as { id: number } | undefined
      : undefined;

    const owner = db.prepare(`
      SELECT f.demo_id AS demoId
      FROM demo_files f
      JOIN demos d ON d.id = f.demo_id
      WHERE f.url = ?
        AND f.deleted_at IS NULL
        AND d.deleted_at IS NULL
      LIMIT 1
    `).get(candidate.url) as { demoId: number } | undefined;

    if (owner && owner.demoId !== demoId) {
      throw new Error(
        `Исходная ссылка уже привязана к демке #${owner.demoId}`
      );
    }

    if (!owner) {
      db.prepare(`
        INSERT INTO demo_files (demo_id, source_type, url, label)
        VALUES (?, ?, ?, ?)
      `).run(
        demoId,
        candidate.sourceType,
        candidate.url,
        candidate.sourceType === "google_drive"
          ? "Оригинал (Google Drive)"
          : "Оригинал (Яндекс Диск)"
      );
    }

    // Не прикрепляем одинаковую Telegram-копию повторно.
    const existingFile = db.prepare(`
      SELECT id FROM demo_files
      WHERE demo_id = ?
        AND telegram_file_unique_id = ?
        AND deleted_at IS NULL
      LIMIT 1
    `).get(
      demoId,
      receipt.telegramFileUniqueId
    ) as { id: number } | undefined;

    let attachmentId: number;

    if (existingFile) {
      attachmentId = existingFile.id;
    } else {
      const otherOwner = db.prepare(`
        SELECT f.demo_id AS demoId
        FROM demo_files f
        JOIN demos d ON d.id = f.demo_id
        WHERE f.telegram_file_unique_id = ?
          AND f.deleted_at IS NULL
          AND d.deleted_at IS NULL
          AND f.demo_id <> ?
        LIMIT 1
      `).get(receipt.telegramFileUniqueId, demoId) as
        | { demoId: number }
        | undefined;

      if (otherOwner) {
        throw new Error(
          `Такая Telegram-копия уже прикреплена к демке #${otherOwner.demoId}`
        );
      }

      const result = db.prepare(`
        INSERT INTO demo_files (
          demo_id, source_type, telegram_file_id,
          telegram_file_unique_id, label
        ) VALUES (?, 'telegram_audio', ?, ?, ?)
      `).run(
        demoId,
        receipt.telegramFileId,
        receipt.telegramFileUniqueId,
        `${candidate.title} — MP3 для прослушивания`
      );
      attachmentId = Number(result.lastInsertRowid);
    }

    // У существующей демки сохраняем прежнюю основную версию.
    // Для новой демки (либо если файлов не было) основным станет MP3.
    const primaryAttachmentId = previousDefault?.id ?? attachmentId;

    db.prepare(`
      UPDATE demo_files SET is_primary = 0
      WHERE demo_id = ? AND deleted_at IS NULL AND is_primary = 1
    `).run(demoId);

    db.prepare(`
      UPDATE demo_files SET is_primary = 1
      WHERE id = ? AND demo_id = ? AND deleted_at IS NULL
    `).run(primaryAttachmentId, demoId);

    return { demoId, attachmentId, createdDemo };
  }
);

async function main(): Promise<void> {
  const row = validId(option("--row"), "--row");
  const localPath = option("--file");
  const download = process.argv.includes("--download");
  if (download === (localPath !== undefined)) {
    throw new Error("Укажи ровно один источник: --download или --file ПУТЬ");
  }
  const sourcePathArg = localPath ? resolve(localPath) : undefined;

  const isNew = process.argv.includes("--new");
  const existingArg = option("--demo");
  if (isNew === (existingArg !== undefined)) {
    throw new Error("Выбери ровно один вариант: --new или --demo ID");
  }
  const requestedDemoId = existingArg
    ? validId(existingArg, "--demo")
    : undefined;
  const apply = process.argv.includes("--apply");

  const manifestPath = join(process.cwd(), "data", "imports", "sheet-links.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  const candidates = manifest.entries.filter((entry) => entry.sourceRow === row);
  if (candidates.length !== 1) {
    throw new Error(
      `В строке ${row} найдено ${candidates.length} ссылок. ` +
      "Для этого теста требуется ровно одна."
    );
  }
  const candidate = candidates[0];
  if (!candidate || !candidate.title?.trim() || !candidate.url?.startsWith("https://")) {
    throw new Error("Некорректная запись в манифесте");
  }
  const cloudSource = candidate.sourceType;
  if (cloudSource !== "google_drive" && cloudSource !== "yandex_disk") {
    throw new Error("Для автоматического скачивания нужна ссылка Google или Яндекс Диска");
  }
  candidate.title = candidate.title.trim();
  const cloudCandidate: CloudCandidate = {
    sourceRow: candidate.sourceRow,
    title: candidate.title,
    sourceType: cloudSource,
    url: candidate.url,
  };

  const sameTitles = db.prepare(`
    SELECT id, title FROM demos WHERE deleted_at IS NULL
  `).all() as { id: number; title: string }[];
  const matches = sameTitles.filter(
    (d) => d.title.trim().toLocaleLowerCase("ru-RU") ===
      candidate.title.toLocaleLowerCase("ru-RU")
  );

  if (requestedDemoId !== undefined) {
    const target = sameTitles.find((d) => d.id === requestedDemoId);
    if (!target) throw new Error(`Демка #${requestedDemoId} не найдена`);
    console.log(`Существующая демка: #${target.id} — ${target.title}`);
  } else if (matches.length > 0) {
    throw new Error(
      "Уже есть демка с таким названием: " +
      matches.map((d) => `#${d.id}`).join(", ") +
      ". Используй --demo ID, чтобы избежать дубля."
    );
  }

  const owner = db.prepare(`
    SELECT f.demo_id AS demoId
    FROM demo_files f JOIN demos d ON d.id = f.demo_id
    WHERE f.url = ? AND f.deleted_at IS NULL AND d.deleted_at IS NULL
    LIMIT 1
  `).get(candidate.url) as { demoId: number } | undefined;

  if (owner) {
    throw new Error(
      `Эта облачная ссылка уже привязана к демке #${owner.demoId}. ` +
      "Повторно загружать файл не нужно."
    );
  }

  console.log("\n🎵 BARHAT — предпросмотр импорта");
  console.log("Строка:", row);
  console.log("Название демки:", candidate.title);
  console.log("Название в плеере:", `BARHAT — ${candidate.title}`);
  console.log("Источник:", candidate.sourceType);
  console.log("Источник файла:", download ? "Автоматическое скачивание" : "Локальный MP3/WAV");
  if (sourcePathArg) {
    const fileInfo = await stat(sourcePathArg);
    if (!fileInfo.isFile() || fileInfo.size === 0) {
      throw new Error("Локальный аудиофайл пустой или недоступен");
    }
    console.log("Локальный файл:", basename(sourcePathArg));
    console.log("Размер:", fileInfo.size, "байт");
  }
  console.log("Действие:", isNew ? "Создать демку" : `Добавить к #${requestedDemoId}`);

  if (!apply) {
    console.log("\n🔒 Предпросмотр: загрузки и изменений SQLite нет.");
    console.log("Если всё верно, повтори команду с --apply");
    return;
  }

  const token = process.env.BOT_TOKEN;
  const proxyUrl = process.env.PROXY_URL;
  const chatIdText = process.env.IMPORT_TEST_CHAT_ID;
  if (!token || !proxyUrl || !chatIdText) {
    throw new Error("Проверь BOT_TOKEN, PROXY_URL, IMPORT_TEST_CHAT_ID");
  }
  const chatId = validId(chatIdText, "IMPORT_TEST_CHAT_ID");
  if (chatIdText !== process.env.EDITOR_TELEGRAM_ID?.trim()) {
    throw new Error("Для первого импорта чат должен совпадать с EDITOR_TELEGRAM_ID");
  }

  const receiptDir = join(process.cwd(), "data", "imports", "receipts");
  await mkdir(receiptDir, { recursive: true });
  const receiptPath = join(receiptDir, `row-${row}.json`);
  let receipt: UploadReceipt | undefined;

  try {
    receipt = JSON.parse(await readFile(receiptPath, "utf8")) as UploadReceipt;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  if (receipt) {
    if (
      receipt.sourceRow !== row ||
      receipt.sourceUrl !== candidate.url ||
      (sourcePathArg !== undefined && receipt.sourcePath !== sourcePathArg)
    ) {
      throw new Error(
        "Квитанция row-" + row + ".json относится к другому файлу/URL. " +
        "Не перезаписывай её вслепую — проверь вручную."
      );
    }
    console.log("♻️ Найдена квитанция отправки: повторно не скачиваем и не загружаем файл");
  } else {
    let sourcePath: string;
    if (download) {
      const result = await downloadCloudAudio(cloudCandidate);
      sourcePath = result.localPath;
      console.log("⬇️ Файл скачан:", result.originalName);
      console.log("Размер оригинала:", result.originalSize, "байт");
    } else {
      if (!sourcePathArg) throw new Error("Не указан --file");
      sourcePath = sourcePathArg;
    }

    const prepared = await prepareAudioForTelegram(sourcePath);
    if (prepared.uploadSize > 48_000_000) {
      throw new Error("Подготовленный MP3 превышает лимит 48 000 000 байт");
    }

    const bot = new Bot(token, {
      client: {
        baseFetchConfig: {
          agent: new HttpsProxyAgent(proxyUrl),
          compress: true,
        },
      },
    });

    console.log("📤 Отправляем MP3 в твой личный Telegram...");
    const message = await bot.api.sendAudio(
      chatId,
      new InputFile(prepared.uploadPath, cleanFileName(candidate.title)),
      {
        title: candidate.title,
        performer: "BARHAT",
        caption: `Импорт из BARHAT MX • строка ${row}`,
        disable_notification: true,
      }
    );
    if (!message.audio) throw new Error("Telegram не вернул audio");

    receipt = {
      sourceRow: row,
      sourceUrl: candidate.url,
      sourcePath,
      telegramFileId: message.audio.file_id,
      telegramFileUniqueId: message.audio.file_unique_id,
      messageId: message.message_id,
    };
    // Сохраняем квитанцию ДО записи в SQLite: можно безопасно повторить.
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2), "utf8");
  }

  const result = registerImport({
    candidate,
    ...(requestedDemoId === undefined ? {} : { requestedDemoId }),
    receipt,
  });
  console.log("\n✅ Импорт зарегистрирован в SQLite!");
  console.log("Демка ID:", result.demoId);
  console.log("Вложение MP3 ID:", result.attachmentId);
  console.log("Создана новая демка:", result.createdDemo ? "Да" : "Нет");
  console.log(`Проверь в Telegram: /demo ${result.demoId}`);
}

main().catch((error: unknown) => {
  console.error("\n❌ Ошибка:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
