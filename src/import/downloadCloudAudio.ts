import "dotenv/config";

import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { google } from "googleapis";

export type CloudSource = "google_drive" | "yandex_disk";
export type CloudCandidate = {
  sourceRow: number;
  title: string;
  sourceType: CloudSource;
  url: string;
};

export type DownloadedAudio = {
  sourceRow: number;
  title: string;
  sourceType: CloudSource;
  originalName: string;
  mimeType: string;
  originalSize: number;
  localPath: string;
};

// Промежуточный файл может быть существенно больше лимита Telegram.
// Ограничение передачи в Telegram применяется ПОСЛЕ prepareAudioForTelegram().
const MAX_SOURCE_BYTES = 250_000_000;
const DOWNLOAD_DIR = join(process.cwd(), "data", "imports", "downloads");

function checkAudioFile(name: string, mimeType: string): "mp3" | "wav" {
  const extension = extname(name).toLowerCase();
  if (extension !== ".mp3" && extension !== ".wav") {
    throw new Error(`Пока поддерживаются только MP3 и WAV: ${name}`);
  }
  // Некоторые сервисы отдают application/octet-stream для корректных аудиофайлов.
  if (
    mimeType &&
    !mimeType.startsWith("audio/") &&
    mimeType !== "application/octet-stream"
  ) {
    throw new Error(`Неожиданный MIME-тип ${mimeType} для ${name}`);
  }
  return extension.slice(1) as "mp3" | "wav";
}

function checkSize(size: number | null | undefined): number {
  if (
    size === null || size === undefined ||
    !Number.isSafeInteger(size) || size <= 0
  ) {
    throw new Error("Источник не сообщил корректный размер файла");
  }
  if (size > MAX_SOURCE_BYTES) {
    throw new Error("Исходный файл превышает лимит тестового импортёра (250 МБ)");
  }
  return size;
}

async function saveStream(
  source: Readable,
  outputPath: string,
  expectedSize: number,
): Promise<void> {
  let received = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > MAX_SOURCE_BYTES) {
        callback(new Error("Файл превысил допустимый размер при загрузке"));
      } else {
        callback(null, chunk);
      }
    },
  });

  try {
    await pipeline(source, limiter, createWriteStream(outputPath, { flags: "wx" }));
    if (received !== expectedSize) {
      throw new Error(
        `Скачано ${received} байт, ожидалось ${expectedSize}. Неполный файл.`,
      );
    }
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  }
}

function googleFileId(link: string): { id: string; resourceKey: string | null } {
  const url = new URL(link);
  if (url.hostname.toLowerCase() !== "drive.google.com") {
    throw new Error("Ожидалась ссылка drive.google.com");
  }
  const id = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1]
    ?? url.searchParams.get("id");
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error("Не найден Google Drive file ID");
  }
  return { id, resourceKey: url.searchParams.get("resourcekey") };
}

async function downloadGoogle(candidate: CloudCandidate): Promise<DownloadedAudio> {
  const keyFile = process.env.GOOGLE_CREDENTIALS_PATH;
  if (!keyFile) throw new Error("Не указан GOOGLE_CREDENTIALS_PATH в .env");

  const { id, resourceKey } = googleFileId(candidate.url);
  const opts = resourceKey
    ? { headers: { "X-Goog-Drive-Resource-Keys": `${id}/${resourceKey}` } }
    : {};

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  const drive = google.drive({ version: "v3", auth });
  const metadata = await drive.files.get({
    fileId: id,
    fields: "id,name,mimeType,size,capabilities(canDownload)",
    supportsAllDrives: true,
  }, opts);
  const info = metadata.data;
  if (info.capabilities?.canDownload === false) {
    throw new Error("Google Drive запретил скачивание файла");
  }
  const originalName = info.name ?? "";
  const mimeType = info.mimeType ?? "";
  const extension = checkAudioFile(originalName, mimeType);
  const originalSize = checkSize(Number(info.size));
  await mkdir(DOWNLOAD_DIR, { recursive: true });
  const outputPath = join(
    DOWNLOAD_DIR,
    `row-${candidate.sourceRow}-${randomUUID().slice(0, 8)}.${extension}`,
  );
  const media = await drive.files.get({
    fileId: id,
    alt: "media",
    supportsAllDrives: true,
  }, { ...opts, responseType: "stream" });
  await saveStream(media.data as Readable, outputPath, originalSize);
  return {
    sourceRow: candidate.sourceRow,
    title: candidate.title,
    sourceType: "google_drive",
    originalName,
    mimeType,
    originalSize,
    localPath: outputPath,
  };
}

type YandexMetadata = {
  name?: string;
  type?: string;
  size?: number;
  mime_type?: string;
};
type YandexDownloadLink = { href?: string };

async function yandexApi<T>(endpoint: string, publicUrl: string): Promise<T> {
  const url = new URL(`https://cloud-api.yandex.net/v1/disk/${endpoint}`);
  url.searchParams.set("public_key", publicUrl);
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Яндекс Диск API ответил HTTP ${response.status}`);
  }
  return await response.json() as T;
}

async function downloadYandex(candidate: CloudCandidate): Promise<DownloadedAudio> {
  const host = new URL(candidate.url).hostname.toLowerCase();
  if (![
  "disk.yandex.ru",
  "disk.yandex.com",
  "disk.yandex.com.am",
  "yadi.sk",
].includes(host)) {
    throw new Error("Ожидалась публичная ссылка Яндекс Диска");
  }
  const info = await yandexApi<YandexMetadata>(
    "public/resources", candidate.url,
  );
  if (info.type !== "file") {
    throw new Error("Ссылка Яндекс Диска ведёт не на одиночный файл");
  }
  const originalName = info.name ?? "";
  const mimeType = info.mime_type ?? "";
  const extension = checkAudioFile(originalName, mimeType);
  const originalSize = checkSize(info.size);
  const link = await yandexApi<YandexDownloadLink>(
    "public/resources/download", candidate.url,
  );
  if (!link.href || new URL(link.href).protocol !== "https:") {
    throw new Error("Яндекс Диск не вернул безопасный HTTPS-адрес скачивания");
  }

  const response = await fetch(link.href, {
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Не удалось скачать файл: HTTP ${response.status}`);
  }
  const responseType = response.headers.get("content-type") ?? "";
  if (/text\/html|application\/json/i.test(responseType)) {
    throw new Error("Вместо аудиофайла сервер вернул HTML/JSON");
  }

  await mkdir(DOWNLOAD_DIR, { recursive: true });
  const outputPath = join(
    DOWNLOAD_DIR,
    `row-${candidate.sourceRow}-${randomUUID().slice(0, 8)}.${extension}`,
  );
  const readable = Readable.fromWeb(
    response.body as unknown as NodeReadableStream<Uint8Array>,
  );
  await saveStream(readable, outputPath, originalSize);
  return {
    sourceRow: candidate.sourceRow,
    title: candidate.title,
    sourceType: "yandex_disk",
    originalName,
    mimeType,
    originalSize,
    localPath: outputPath,
  };
}

export async function downloadCloudAudio(
  candidate: CloudCandidate,
): Promise<DownloadedAudio> {
  if (!Number.isSafeInteger(candidate.sourceRow) || candidate.sourceRow <= 0) {
    throw new Error("Некорректный номер строки");
  }
  if (!candidate.title?.trim() || !candidate.url?.startsWith("https://")) {
    throw new Error("Нет названия или корректной HTTPS-ссылки");
  }
  if (candidate.sourceType === "google_drive") {
    return downloadGoogle(candidate);
  }
  return downloadYandex(candidate);
}
