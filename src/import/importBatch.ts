/**
 * BARHAT Demo Archive — безопасный пакетный импорт.
 * Пример:
 *   npx tsx src/import/importBatch.ts --rows 13,17,23
 *   npx tsx src/import/importBatch.ts --rows 13,17,23 --apply
 *
 * Делает только новые демки со статусом new_candidate.
 * Для совпадений по названию используйте importOne.ts --demo ID вручную.
 */
import "dotenv/config";

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../db/database.js";
import { loadImportExclusions } from "./exclusions.js";

type Source = "google_drive" | "yandex_disk" | "external";
type ManifestEntry = {
  sourceRow: number;
  title: string;
  sourceType: Source;
  url: string;
};
type PlanEntry = ManifestEntry & {
  status: string;
  matchingDemoIds: number[];
  note: string;
};
type Plan = { generatedAt?: string; entries: PlanEntry[] };
type Manifest = { entries: ManifestEntry[] };
type Demo = { id: number; title: string };
type Link = { demo_id: number; url: string };
type BatchResult = {
  row: number;
  title: string;
  outcome: "ok" | "failed" | "not_started";
  reason?: string;
};

const importDir = join(process.cwd(), "data", "imports");
const MAX_BATCH = 8;

function normalizedTitle(title: string): string {
  return title
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[\s_\-]+/g, " ")
    .trim();
}

// Проверяем совпадения Google Drive ID даже при разных параметрах URL.
function canonicalLink(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Не HTTP(S)-ссылка");
  }
  if (url.hostname === "drive.google.com") {
    const id = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1] ?? url.searchParams.get("id");
    if (id) return `drive:${id}`;
  }
  if (["disk.yandex.ru", "disk.yandex.com", "disk.yandex.com.am", "yadi.sk"].includes(url.hostname)) {
    return `yandex:${url.pathname.replace(/\/$/, "")}`;
  }
  url.hash = "";
  return url.toString();
}

function readRows(): number[] {
  const args = process.argv.slice(2);
  const optionIndex = args.indexOf("--rows");
  if (optionIndex < 0 || !args[optionIndex + 1]) {
    throw new Error('Использование: --rows 13,17,23 [--apply]');
  }
  const supported = new Set(["--rows", "--apply"]);
  for (let i = 0; i < args.length; i++) {
    if (i === optionIndex + 1) continue;
    if (!supported.has(args[i]!)) throw new Error(`Неизвестный аргумент: ${args[i]}`);
  }
  const raw = args[optionIndex + 1]!;
  const pieces = raw.split(",").map((x) => x.trim());
  if (pieces.length < 1 || pieces.length > MAX_BATCH) {
    throw new Error(`Выбери от 1 до ${MAX_BATCH} строк на один запуск`);
  }
  const rows = pieces.map((part) => {
    if (!/^\d+$/.test(part)) throw new Error(`Некорректный номер строки: ${part}`);
    const n = Number(part);
    if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`Некорректный номер строки: ${part}`);
    return n;
  });
  if (new Set(rows).size !== rows.length) throw new Error("Номера строк повторяются");
  return rows;
}

function runOne(row: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // Работаем через Node + установленный tsx, не зависим от npx.cmd в Windows.
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/import/importOne.ts", "--row", String(row), "--new", "--download", "--apply"],
      { cwd: process.cwd(), env: process.env, stdio: "inherit", windowsHide: false },
    );
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`importOne.ts для строки ${row} завершился с кодом ${code}`));
    });
  });
}

async function main(): Promise<void> {
  const rows = readRows();
  const apply = process.argv.includes("--apply");
  const plan = JSON.parse(await readFile(join(importDir, "import-plan.json"), "utf8")) as Plan;
  const manifest = JSON.parse(await readFile(join(importDir, "sheet-links.json"), "utf8")) as Manifest;
  if (!Array.isArray(plan.entries) || !Array.isArray(manifest.entries)) {
    throw new Error("Нет entries в плане или манифесте. Запусти importPreview.ts повторно.");
  }

  // Блокируем исключения ДО любых скачиваний и отправок в Telegram.
  // Защита работает даже для вручную набранной команды --rows.
  const exclusions = await loadImportExclusions(manifest.entries);
  const blocked = rows.filter((row) => exclusions.has(row));
  if (blocked.length > 0) {
    throw new Error(
      "Партия отменена. В exclusions.json исключены строки:\n" +
      blocked.map((row) => `  ${row}: ${exclusions.get(row)}`).join("\n") +
      "\nУбери исключение осознанно, если хочешь его импортировать."
    );
  }

  const activeDemos = db.prepare("SELECT id, title FROM demos WHERE deleted_at IS NULL").all() as Demo[];
  const activeLinks = db.prepare(`
    SELECT f.demo_id, f.url
    FROM demo_files f JOIN demos d ON d.id = f.demo_id
    WHERE f.url IS NOT NULL AND f.deleted_at IS NULL AND d.deleted_at IS NULL
  `).all() as Link[];
  const linkKeys = new Set(activeLinks.map((x) => canonicalLink(x.url)));
  const titles = new Set(activeDemos.map((x) => normalizedTitle(x.title)));
  const candidates: PlanEntry[] = [];
  const problems: string[] = [];

  for (const row of rows) {
    const matchingPlan = plan.entries.filter((x) => x.sourceRow === row);
    const matchingManifest = manifest.entries.filter((x) => x.sourceRow === row);
    if (matchingPlan.length !== 1 || matchingManifest.length !== 1) {
      problems.push(`Строка ${row}: ожидалась одна ссылка в плане и манифесте`);
      continue;
    }
    const entry = matchingPlan[0]!;
    const source = matchingManifest[0]!;
    if (entry.url !== source.url || entry.title.trim() !== source.title.trim()) {
      problems.push(`Строка ${row}: манифест изменился после создания плана`);
      continue;
    }
    if (entry.status !== "new_candidate") {
      problems.push(`Строка ${row}: статус «${entry.status}»; автоматическое создание запрещено`);
      continue;
    }
    if (entry.sourceType !== "google_drive" && entry.sourceType !== "yandex_disk") {
      problems.push(`Строка ${row}: источник ${entry.sourceType} пока не поддерживается`);
      continue;
    }
    if (!entry.title.trim() || entry.title.length > 150) {
      problems.push(`Строка ${row}: некорректное название`);
      continue;
    }
    if (titles.has(normalizedTitle(entry.title))) {
      problems.push(`Строка ${row}: название уже есть в SQLite; нужна ручная проверка`);
      continue;
    }
    if (linkKeys.has(canonicalLink(entry.url))) {
      problems.push(`Строка ${row}: ссылка уже встречается в SQLite`);
      continue;
    }
    candidates.push(entry);
  }

  // Защита от одинаковых ссылок или названий ВНУТРИ выбранной партии.
  const batchNames = new Set<string>();
  const batchLinks = new Set<string>();
  for (const entry of candidates) {
    const name = normalizedTitle(entry.title);
    const url = canonicalLink(entry.url);
    if (batchNames.has(name) || batchLinks.has(url)) {
      problems.push(`Строка ${entry.sourceRow}: повтор названия или файла внутри выбранной партии`);
    }
    batchNames.add(name);
    batchLinks.add(url);
  }

  console.log("\n🎵 BARHAT — пакетный импорт");
  console.log("Режим:", apply ? "ЗАГРУЗКА" : "ПРЕДПРОСМОТР");
  console.log("План сформирован:", plan.generatedAt ?? "дата неизвестна");
  console.table(candidates.map((x) => ({ row: x.sourceRow, title: x.title, source: x.sourceType, action: "Создать новую" })));
  if (problems.length > 0 || candidates.length !== rows.length) {
    for (const issue of problems) console.error("❌", issue);
    throw new Error("Партия отклонена целиком: исправь выбор строк, ничего не было загружено");
  }

  if (!apply) {
    console.log("\n🔒 Предпросмотр: ничего не скачиваем, не отправляем и не меняем в SQLite.");
    console.log(`Для запуска добавь --apply. Максимум ${MAX_BATCH} строк за раз.`);
    return;
  }

  // Каждая строка обрабатывается последовательно.
  // Неудача прерывает партию, успешные предыдущие строки не откатываются.
  const results: BatchResult[] = candidates.map((x) => ({ row: x.sourceRow, title: x.title, outcome: "not_started" }));
  const reportDir = join(importDir, "batches");
  await mkdir(reportDir, { recursive: true });
  const reportPath = join(reportDir, `batch-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  try {
    for (const item of results) {
      console.log(`\n========== Строка ${item.row}: ${item.title} ==========`);
      try {
        await runOne(item.row);
        item.outcome = "ok";
      } catch (error) {
        item.outcome = "failed";
        item.reason = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        await writeFile(reportPath, JSON.stringify({ savedAt: new Date().toISOString(), results }, null, 2), "utf8");
      }
    }
    console.log("\n✅ Все выбранные строки обработаны. Проверь /demo ID в Telegram.");
  } finally {
    console.log("\nОтчёт:", reportPath);
    console.table(results);
  }
}

main().catch((error: unknown) => {
  console.error("\n❌ Ошибка:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
