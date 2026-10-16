
import "dotenv/config";

import { google } from "googleapis";
import { createWriteStream } from "node:fs";
import {
  readFile,
  mkdir,
  rm,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// Структура записи из sheet-links.json
type ImportCandidate = {
  sourceRow: number;
  title: string;
  sourceType: "google_drive" | "yandex_disk" | "external";
  url: string;
};

type ImportManifest = {
  entries: ImportCandidate[];
};

// Пока тестируем строку 15 — "Структура"
const TEST_ROW = 15;

// Ограничение для тестового скачивания — 30 МБ
const MAX_TEST_SIZE = 30 * 1024 * 1024;

// Путь к JSON со ссылками
const manifestPath = join(
  process.cwd(),
  "data",
  "imports",
  "sheet-links.json"
);

// Папка для скачанных файлов
const downloadDir = join(
  process.cwd(),
  "data",
  "imports",
  "downloads"
);

// Получаем ID файла из Google Drive URL
function extractDriveFileId(link: string): string {
  const url = new URL(link);

  const match = url.pathname.match(
    /\/file\/d\/([a-zA-Z0-9_-]+)/
  );

  const fileId =
    match?.[1] ??
    url.searchParams.get("id");

  if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
    throw new Error(
      "Не удалось определить Google Drive file ID"
    );
  }

  return fileId;
}

async function main() {
  console.log("🔍 Начинаем проверку Google Drive...\n");

  // 1. Читаем сохранённый JSON
  const content = await readFile(
    manifestPath,
    "utf8"
  );

  const manifest = JSON.parse(content) as ImportManifest;

  // 2. Находим тестовую запись
  const candidate = manifest.entries.find(
    (entry) =>
      entry.sourceRow === TEST_ROW &&
      entry.sourceType === "google_drive"
  );

  if (!candidate) {
    throw new Error(
      `Google Drive файл в строке ${TEST_ROW} не найден`
    );
  }

  console.log("Демка:", candidate.title);
  console.log("Строка:", candidate.sourceRow);

  const fileId = extractDriveFileId(candidate.url);
  const resourceKey = new URL(candidate.url)
    .searchParams.get("resourcekey");

  // Ключ для некоторых файлов с доступом по ссылке
  const requestOptions = resourceKey
    ? {
        headers: {
          "X-Goog-Drive-Resource-Keys":
            `${fileId}/${resourceKey}`,
        },
      }
    : {};

  // 3. Авторизация Google Drive
  const credentialsPath =
    process.env.GOOGLE_CREDENTIALS_PATH;

  if (!credentialsPath) {
    throw new Error(
      "GOOGLE_CREDENTIALS_PATH не указан в .env"
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });

  const drive = google.drive({
    version: "v3",
    auth,
  });

  // 4. Получаем информацию о файле
  console.log("\n📁 Получаем метаданные...");

  const metadata = await drive.files.get(
    {
      fileId,
      fields:
        "id,name,mimeType,size,capabilities(canDownload)",
      supportsAllDrives: true,
    },
    requestOptions
  );

  const file = metadata.data;

  console.log("Название:", file.name);
  console.log("MIME:", file.mimeType);
  console.log("Размер (байт):", file.size);

  if (file.capabilities?.canDownload === false) {
    throw new Error(
      "Google Drive запрещает скачивание этого файла"
    );
  }

  // Пока тестируем только MP3
  if (
    !file.name?.toLowerCase().endsWith(".mp3") &&
    file.mimeType !== "audio/mpeg"
  ) {
    throw new Error(
      "Тестовая запись не является MP3"
    );
  }

  const fileSize = Number(file.size);

  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) {
    throw new Error(
      "Не удалось определить размер файла"
    );
  }

  if (fileSize > MAX_TEST_SIZE) {
    throw new Error(
      "Файл больше 30 МБ. Для теста выбери другой."
    );
  }

  // 5. Создаём папку загрузок
  await mkdir(downloadDir, {
    recursive: true,
  });

  const outputPath = join(
    downloadDir,
    "drive-test.mp3"
  );

  console.log("\n⬇️ Скачиваем MP3...");

  // 6. Скачиваем содержимое файла
  const response = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true,
    },
    {
      responseType: "stream",
      ...requestOptions,
    }
  );

  try {
    await pipeline(
      response.data as Readable,
      createWriteStream(outputPath)
    );

    const downloaded = await stat(outputPath);

    if (downloaded.size !== fileSize) {
      throw new Error(
        "Размер скачанного файла не совпадает с оригиналом"
      );
    }

    console.log("\n✅ Файл скачан успешно!");
    console.log("Путь:", outputPath);
    console.log("Размер:", downloaded.size);
  } catch (error) {
    // Удаляем неполный файл при ошибке
    await rm(outputPath, { force: true });
    throw error;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : String(error);

  console.error("\n❌ Ошибка:", message);
  process.exitCode = 1;
});
