/**
 * BARHAT Demo Archive — безопасный выбор следующей партии.
 *
 * npx tsx src/import/suggestBatch.ts       // 3 строки
 * npx tsx src/import/suggestBatch.ts 8     // до 8 строк
 *
 * Только читает import-plan.json, sheet-links.json и SQLite.
 * Ничего не скачивает, не отправляет в Telegram и не изменяет базу.
 */
import "dotenv/config";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../db/database.js";
import { loadImportExclusions } from "./exclusions.js";

type Source = "google_drive" | "yandex_disk" | "external";
type Candidate = {
  sourceRow: number;
  title: string;
  sourceType: Source;
  url: string;
};
type PlanEntry = Candidate & {
  status: string;
  matchingDemoIds: number[];
  note: string;
};
type Plan = { generatedAt?: string; entries: PlanEntry[] };
type Manifest = { entries: Candidate[] };
type Demo = { title: string };
type LinkRow = { url: string };

const importsPath = join(process.cwd(), "data", "imports");
const MAX_BATCH = 8;

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[\s_\-]+/g, " ")
    .trim();
}

// Та же логика сравнения облачных ссылок, что и в importBatch.ts.
function canonicalLink(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    const host = url.hostname.toLowerCase();
    if (host === "drive.google.com") {
      const fileId =
        url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1] ??
        url.searchParams.get("id");
      if (fileId) return `drive:${fileId}`;
    }

    if (["disk.yandex.ru", "disk.yandex.com", "disk.yandex.com.am", "yadi.sk"].includes(host)) {
      return `yandex:${url.pathname.replace(/\/$/, "")}`;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function readBatchSize(): number {
  const args = process.argv.slice(2);
  if (args.length === 0) return 3;
  if (args.length !== 1 || !/^[1-8]$/.test(args[0] ?? "")) {
    throw new Error("Использование: npx tsx src/import/suggestBatch.ts [1-8]");
  }
  return Number(args[0]);
}

async function main(): Promise<void> {
  const requested = readBatchSize();
  const plan = JSON.parse(
    await readFile(join(importsPath, "import-plan.json"), "utf8"),
  ) as Plan;
  const manifest = JSON.parse(
    await readFile(join(importsPath, "sheet-links.json"), "utf8"),
  ) as Manifest;

  if (!Array.isArray(plan.entries) || !Array.isArray(manifest.entries)) {
    throw new Error("План или манифест не содержит entries. Обнови importPreview.ts.");
  }

  const exclusions = await loadImportExclusions(manifest.entries);

  const demos = db.prepare(`
    SELECT title FROM demos WHERE deleted_at IS NULL
  `).all() as Demo[];

  const links = db.prepare(`
    SELECT f.url
    FROM demo_files f
    JOIN demos d ON d.id = f.demo_id
    WHERE f.url IS NOT NULL
      AND f.deleted_at IS NULL
      AND d.deleted_at IS NULL
  `).all() as LinkRow[];

  const existingNames = new Set(demos.map((demo) => normalizeTitle(demo.title)));
  const existingLinks = new Set(links.map((item) => canonicalLink(item.url)).filter((key): key is string => key !== null));

  const selected: PlanEntry[] = [];
  const selectedNames = new Set<string>();
  const selectedLinks = new Set<string>();
  let skippedAsExcluded = 0;
  let skippedAsAlreadyPresent = 0;
  let skippedAsUnclear = 0;

  const orderedEntries = [...plan.entries].sort((a, b) => a.sourceRow - b.sourceRow);

  for (const entry of orderedEntries) {
    if (entry.status !== "new_candidate") continue;
    if (selected.length >= requested) break;
    if (exclusions.has(entry.sourceRow)) {
      skippedAsExcluded++;
      continue;
    }

    const matching = manifest.entries.filter((item) => item.sourceRow === entry.sourceRow);
    const key = canonicalLink(entry.url);
    const title = entry.title.trim();
    const name = normalizeTitle(title);

    if (
      matching.length !== 1 ||
      matching[0]?.url !== entry.url ||
      matching[0]?.title.trim() !== title ||
      !Number.isSafeInteger(entry.sourceRow) ||
      entry.sourceRow <= 0 ||
      !name || title.length > 150 || !key ||
      !["google_drive", "yandex_disk"].includes(entry.sourceType)
    ) {
      skippedAsUnclear++;
      continue;
    }

    // План может устареть: проверяем актуальную SQLite в момент выбора.
    if (existingNames.has(name) || existingLinks.has(key)) {
      skippedAsAlreadyPresent++;
      continue;
    }

    // Не допускаем повторов в пределах одной предлагаемой партии.
    if (selectedNames.has(name) || selectedLinks.has(key)) {
      skippedAsUnclear++;
      continue;
    }

    selected.push(entry);
    selectedNames.add(name);
    selectedLinks.add(key);
  }

  console.log("\n🎵 BARHAT — следующая партия импорта");
  console.log("План создан:", plan.generatedAt ?? "неизвестно");
  console.log("Активных демок в SQLite:", demos.length);
  console.log("Пропущено по exclusions.json:", skippedAsExcluded);
  console.log("Уже присутствуют в базе:", skippedAsAlreadyPresent);
  console.log("Пропущено неоднозначных:", skippedAsUnclear);

  if (selected.length === 0) {
    console.log("\nНет безопасных кандидатов для автоматического предложения.");
    console.log("Обнови план: npx tsx src/import/importPreview.ts");
    return;
  }

  console.table(selected.map((item) => ({
    row: item.sourceRow,
    title: item.title,
    source: item.sourceType,
    action: "Создать новую (после проверки)",
  })));

  const rows = selected.map((item) => item.sourceRow).join(",");
  console.log("\n🔒 Только рекомендации: файлы не скачивались, Telegram и SQLite не изменены.");
  console.log("Проверь названия, чтобы не объединить и не продублировать разные версии одной идеи.");
  console.log("\n1. Предпросмотр партии:");
  console.log(`npx tsx src/import/importBatch.ts --rows ${rows}`);
  console.log("\n2. После проверки и резервной копии SQLite — импорт:");
  console.log(`npx tsx src/import/importBatch.ts --rows ${rows} --apply`);
}

main().catch((error: unknown) => {
  console.error("\n❌ Ошибка:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
