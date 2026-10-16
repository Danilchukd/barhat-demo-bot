import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../db/database.js";

type SourceType = "google_drive" | "yandex_disk" | "external";

type Candidate = {
  sourceRow: number;
  title: string;
  sourceType: SourceType;
  url: string;
};

type Manifest = { entries: Candidate[] };

type DemoRecord = { id: number; title: string };
type LinkRecord = { demo_id: number; url: string };

type ImportStatus =
  | "already_linked"
  | "duplicate_in_sheet"
  | "multiple_title_matches"
  | "title_match"
  | "new_candidate"
  | "needs_review";

type ImportPlanEntry = Candidate & {
  status: ImportStatus;
  matchingDemoIds: number[];
  note: string;
};

const importDir = join(process.cwd(), "data", "imports");
const manifestPath = join(importDir, "sheet-links.json");
const outputPath = join(importDir, "import-plan.json");

function normalizedTitle(title: string): string {
  return title
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[\s_\-]+/g, " ")
    .trim();
}

// Сравниваем не только буквальное написание ссылки:
// Drive-ссылки с разными параметрами ?usp=... обычно указывают на один файл.
function linkKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    const host = url.hostname.toLowerCase();

    if (host === "drive.google.com") {
      const fileId =
        url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] ??
        url.searchParams.get("id");
      if (fileId) return `drive:${fileId}`;
    }

    if ([
  "disk.yandex.ru",
  "disk.yandex.com",
  "disk.yandex.com.am",
  "yadi.sk",
].includes(host)) {
      if (url.pathname.startsWith("/d/") || url.pathname.startsWith("/i/")) {
        return `yandex:${url.pathname.replace(/\/$/, "")}`;
      }
    }

    // Для прочих ссылок не выбрасываем параметры, которые могут быть значимы.
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  if (!Array.isArray(manifest.entries)) {
    throw new Error("В sheet-links.json отсутствует массив entries");
  }

  // Только чтение существующих активных данных.
  const demos = db.prepare(`
    SELECT id, title
    FROM demos
    WHERE deleted_at IS NULL
  `).all() as DemoRecord[];

  const attachedLinks = db.prepare(`
    SELECT f.demo_id, f.url
    FROM demo_files f
    JOIN demos d ON d.id = f.demo_id
    WHERE f.url IS NOT NULL
      AND f.deleted_at IS NULL
      AND d.deleted_at IS NULL
  `).all() as LinkRecord[];

  const demosByName = new Map<string, DemoRecord[]>();
  for (const demo of demos) {
    const key = normalizedTitle(demo.title);
    const items = demosByName.get(key) ?? [];
    items.push(demo);
    demosByName.set(key, items);
  }

  const ownersByLink = new Map<string, Set<number>>();
  for (const link of attachedLinks) {
    const key = linkKey(link.url);
    if (!key) continue;
    const owners = ownersByLink.get(key) ?? new Set<number>();
    owners.add(link.demo_id);
    ownersByLink.set(key, owners);
  }

  const seenInSheet = new Set<string>();
  const entries: ImportPlanEntry[] = [];

  for (const candidate of manifest.entries) {
    const key = linkKey(candidate.url);
    const title = candidate.title?.trim() ?? "";
    const sameTitle = demosByName.get(normalizedTitle(title)) ?? [];
    const ownerIds = key ? [...(ownersByLink.get(key) ?? [])] : [];

    let status: ImportStatus;
    let note: string;
    let matchingDemoIds: number[];

    if (
      !Number.isSafeInteger(candidate.sourceRow) ||
      candidate.sourceRow <= 0 ||
      !title ||
      title.length > 150 ||
      !key ||
      !["google_drive", "yandex_disk"].includes(candidate.sourceType)
    ) {
      status = "needs_review";
      note = "Некорректная запись или неподдерживаемый источник";
      matchingDemoIds = [];
    } else if (ownerIds.length > 0) {
      status = "already_linked";
      note = "Исходная ссылка уже прикреплена в SQLite";
      matchingDemoIds = ownerIds;
    } else if (seenInSheet.has(key)) {
      status = "duplicate_in_sheet";
      note = "Та же ссылка уже встречалась выше в манифесте";
      matchingDemoIds = [];
    } else if (sameTitle.length > 1) {
      status = "multiple_title_matches";
      note = "Несколько демок с таким названием: выбирать вручную";
      matchingDemoIds = sameTitle.map((demo) => demo.id);
    } else if (sameTitle.length === 1) {
      status = "title_match";
      note = "Название совпало: проверить, та ли это музыкальная идея";
      matchingDemoIds = [sameTitle[0]!.id];
    } else {
      status = "new_candidate";
      note = "Совпадений по названию и ссылке нет; не гарантия уникальности";
      matchingDemoIds = [];
    }

    if (key) seenInSheet.add(key);
    entries.push({ ...candidate, title, status, matchingDemoIds, note });
  }

  const labels: Record<ImportStatus, string> = {
    already_linked: "Уже привязана",
    duplicate_in_sheet: "Повтор в Sheets",
    multiple_title_matches: "Несколько совпадений",
    title_match: "Совпало название",
    new_candidate: "Возможно новая",
    needs_review: "Проверить вручную",
  };

  const summary: Record<ImportStatus, number> = {
    already_linked: 0,
    duplicate_in_sheet: 0,
    multiple_title_matches: 0,
    title_match: 0,
    new_candidate: 0,
    needs_review: 0,
  };
  for (const entry of entries) summary[entry.status]++;

  console.table(entries.map((entry) => ({
    row: entry.sourceRow,
    title: entry.title,
    source: entry.sourceType,
    status: labels[entry.status],
    demoIds: entry.matchingDemoIds.join(", ") || "—",
  })));
  console.log("\nВсего кандидатов:", entries.length);
  for (const [status, count] of Object.entries(summary)) {
    console.log(`${labels[status as ImportStatus]}: ${count}`);
  }

  await mkdir(importDir, { recursive: true });
  await writeFile(outputPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalExistingDemos: demos.length,
    summary,
    entries,
  }, null, 2), "utf8");

  console.log("\nПлан сохранён:", outputPath);
  console.log("Ни одна демка или ссылка в SQLite не добавлена.");
}

main().catch((error: unknown) => {
  console.error("Ошибка предпросмотра:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
