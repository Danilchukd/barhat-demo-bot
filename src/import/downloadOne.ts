import "dotenv/config";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  downloadCloudAudio,
  type CloudCandidate,
} from "./downloadCloudAudio.js";

type Manifest = { entries: Array<CloudCandidate | {
  sourceRow: number;
  title: string;
  sourceType: "external";
  url: string;
}> };

function getOption(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const requested = getOption("--row");
  const row = Number(requested);
  if (!requested || !Number.isSafeInteger(row) || row <= 0) {
    throw new Error("Укажи --row НОМЕР_СТРОКИ");
  }

  const manifestPath = join(process.cwd(), "data", "imports", "sheet-links.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  if (!Array.isArray(manifest.entries)) {
    throw new Error("В sheet-links.json отсутствует массив entries");
  }
  const matches = manifest.entries.filter((entry) => entry.sourceRow === row);
  if (matches.length !== 1) {
    throw new Error(`В строке ${row} найдено ${matches.length} ссылок — нужна ровно одна`);
  }
  const candidate = matches[0];
  if (!candidate || candidate.sourceType === "external") {
    throw new Error("Неизвестный тип источника: эту ссылку пока разбираем вручную");
  }

  console.log("\n🎵 BARHAT — скачивание одной записи");
  console.log("Строка Google Sheets:", row);
  console.log("Название демки:", candidate.title);
  console.log("Источник:", candidate.sourceType);
  console.log("Режим:", process.argv.includes("--apply") ? "Скачивание" : "Предпросмотр");

  if (!process.argv.includes("--apply")) {
    console.log("\nНичего не скачано. Для загрузки добавь --apply");
    return;
  }

  const result = await downloadCloudAudio(candidate);
  console.log("\n✅ Скачивание завершено");
  console.log("Оригинальное имя:", result.originalName);
  console.log("MIME:", result.mimeType);
  console.log("Размер:", result.originalSize, "байт");
  console.log("Локальный путь:", result.localPath);
  console.log("\nSQLite и Telegram не изменены.");
  console.log("Следующий шаг: используй этот путь в importOne.ts с --row и --file.");
}

main().catch((error: unknown) => {
  console.error("\n❌ Ошибка:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
