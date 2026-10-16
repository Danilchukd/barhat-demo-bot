
import "dotenv/config";

import { Bot, InputFile } from "grammy";
import { HttpsProxyAgent } from "https-proxy-agent";

import {
  mkdir,
  stat,
  writeFile,
} from "node:fs/promises";

import {
  basename,
  extname,
  join,
  resolve,
} from "node:path";

const token = process.env.BOT_TOKEN;
const proxyUrl = process.env.PROXY_URL;
const chatIdRaw = process.env.IMPORT_TEST_CHAT_ID;

if (!token || !proxyUrl || !chatIdRaw) {
  throw new Error(
    "Проверь BOT_TOKEN, PROXY_URL и IMPORT_TEST_CHAT_ID в .env"
  );
}

const chatId = Number(chatIdRaw);

if (
  !Number.isSafeInteger(chatId) ||
  chatId <= 0
) {
  throw new Error("Некорректный IMPORT_TEST_CHAT_ID");
}

const MAX_UPLOAD_SIZE = 48_000_000;

// По умолчанию берём тестовый MP3 из Google Drive
const inputPath =
  process.argv[2] ??
  "data/imports/downloads/drive-test.mp3";

// Используем существующий NEOvpn
const proxyAgent = new HttpsProxyAgent(proxyUrl);

const bot = new Bot(token, {
  client: {
    baseFetchConfig: {
      agent: proxyAgent,
      compress: true,
    },
  },
});

async function main() {
  console.log("🎵 BARHAT Telegram Upload\n");

  const filePath = resolve(inputPath);

  // Проверяем локальный файл
  if (extname(filePath).toLowerCase() !== ".mp3") {
    throw new Error("Для теста требуется MP3");
  }

  const fileInfo = await stat(filePath);

  if (!fileInfo.isFile() || fileInfo.size === 0) {
    throw new Error("Файл пустой или недоступен");
  }

  if (fileInfo.size > MAX_UPLOAD_SIZE) {
    throw new Error(
      "MP3 больше 48 000 000 байт. " +
      "Необходимо уменьшить размер."
    );
  }

  const fileName = basename(filePath);

  console.log("Файл:", fileName);
  console.log("Размер:", fileInfo.size);
  console.log("Чат:", chatId);

  console.log("\n📤 Отправляем через Telegram Bot API...");

  // Загружаем файл в Telegram.
  // bot.start() здесь не нужен.
  const message = await bot.api.sendAudio(
    chatId,
    new InputFile(filePath),
    {
      title: fileName.replace(/\.mp3$/i, ""),
      performer: "BARHAT",
      caption:
        "🧪 Тестовая загрузка BARHAT Demo Archive\n\n" +
        "Файл отправлен автоматически.\n" +
        "В SQLite пока ничего не записываем.",
      disable_notification: true,
    }
  );

  const audio = message.audio;

  if (!audio) {
    throw new Error(
      "Telegram не вернул объект audio"
    );
  }

  // Сохраняем результат локально
  const outputDir = join(
    process.cwd(),
    "data",
    "imports"
  );

  await mkdir(outputDir, {
    recursive: true,
  });

  const result = {
    uploadedAt: new Date().toISOString(),
    sourcePath: filePath,
    sourceName: fileName,
    chatId: message.chat.id,
    messageId: message.message_id,
    fileId: audio.file_id,
    fileUniqueId: audio.file_unique_id,
    fileSize: audio.file_size ?? fileInfo.size,
  };

  const outputPath = join(
    outputDir,
    "test-upload-result.json"
  );

  await writeFile(
    outputPath,
    JSON.stringify(result, null, 2),
    "utf8"
  );

  console.log("\n✅ Файл отправлен успешно!");
  console.log("Message ID:", result.messageId);
  console.log("File ID:", result.fileId);
  console.log("File Unique ID:", result.fileUniqueId);

  console.log(
    "\n📁 Результат сохранён:",
    outputPath
  );
}

main().catch((error: unknown) => {
  console.error(
    "\n❌ Ошибка загрузки:",
    error instanceof Error
      ? error.message
      : String(error)
  );

  process.exitCode = 1;
});
