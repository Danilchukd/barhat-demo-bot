
import "dotenv/config";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

type ImportCandidate = {
  sourceRow: number;
  title: string;
  sourceType: "google_drive" | "yandex_disk" | "external";
  url: string;
};

type ImportManifest = {
  entries: ImportCandidate[];
};

const manifestPath = join(
  process.cwd(),
  "data",
  "imports",
  "sheet-links.json"
);

function inspectUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();

    // Определяем возможный тип источника
    let suggestion = "Неизвестный источник";

    if (
      host === "drive.google.com" ||
      host === "docs.google.com"
    ) {
      suggestion = "Google Drive";
    } else if (
      host === "disk.yandex.ru" ||
      host === "disk.yandex.com" ||
      host === "yadi.sk"
    ) {
      suggestion = "Яндекс Диск";
    } else if (
      host === "cloud.mail.ru"
    ) {
      suggestion = "Облако Mail.ru";
    } else if (
      host === "t.me" ||
      host === "telegram.me"
    ) {
      suggestion = "Telegram";
    } else if (
      host === "vk.com" ||
      host === "m.vk.com"
    ) {
      suggestion = "VK";
    }

    const extension = url.pathname.match(
      /\.(mp3|wav|flac|ogg|m4a)$/i
    )?.[1] ?? "—";

    return {
      host,
      suggestion,
      extension,
      queryKeys: [...url.searchParams.keys()]
        .join(", ") || "—",
    };
  } catch {
    return {
      host: "Некорректный URL",
      suggestion: "Проверить вручную",
      extension: "—",
      queryKeys: "—",
    };
  }
}

async function main() {
  console.log("🔎 BARHAT — анализ external ссылок\n");

  const raw = await readFile(
    manifestPath,
    "utf8"
  );

  const manifest = JSON.parse(raw) as ImportManifest;

  const external = manifest.entries.filter(
    (entry) => entry.sourceType === "external"
  );

  const results = external.map((entry) => ({
    row: entry.sourceRow,
    title: entry.title,
    ...inspectUrl(entry.url),
  }));

  console.table(results);

  console.log(
    `\nВсего external ссылок: ${external.length}`
  );

  console.log(
    "Анализ завершён. SQLite не изменялась."
  );
}

main().catch((error: unknown) => {
  console.error(
    "❌ Ошибка:",
    error instanceof Error ? error.message : String(error)
  );

  process.exitCode = 1;
});
