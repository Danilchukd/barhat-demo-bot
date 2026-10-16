
import "dotenv/config";
import { google, type sheets_v4 } from "googleapis";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const spreadsheetId = process.env.GOOGLE_SHEET_ID ?? "";
const sheetName = process.env.GOOGLE_SHEET_TAB ?? "";
const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH ?? "";

if (!spreadsheetId || !sheetName || !credentialsPath) {
  throw new Error("Не заполнены настройки Google Sheets");
}

// Авторизация сервисного аккаунта
const auth = new google.auth.GoogleAuth({
  keyFile: credentialsPath,
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
  ],
});

const sheets = google.sheets({
  version: "v4",
  auth,
});

type Cell = sheets_v4.Schema$CellData;

// Извлекаем реальные URL из ячеек
function extractLinks(cell?: Cell): string[] {
  if (!cell) return [];

  const links = new Set<string>();

  const add = (value?: string | null) => {
    if (!value) return;

    try {
      const url = new URL(value);

      if (url.protocol === "https:" || url.protocol === "http:") {
        links.add(url.href);
      }
    } catch {
      // Пропускаем значения, которые не являются URL
    }
  };

  // Обычные гиперссылки
  add(cell.hyperlink);
  add(cell.userEnteredFormat?.textFormat?.link?.uri);

  // Ссылки внутри текста
  for (const run of cell.textFormatRuns ?? []) {
    add(run.format?.link?.uri);
  }

  // Файловые чипы Google Drive
  for (const run of cell.chipRuns ?? []) {
    add(run.chip?.richLinkProperties?.uri);
  }

  // Обычные текстовые ссылки
  add(cell.userEnteredValue?.stringValue);
  add(cell.formattedValue);

  // Формулы HYPERLINK
  const formula = cell.userEnteredValue?.formulaValue ?? "";
  const match = formula.match(/HYPERLINK\(\s*"([^"]+)"/i);

  add(match?.[1]);

  return [...links];
}


type ImportCandidate = {
  sourceRow: number;
  title: string;
  sourceType: "google_drive" | "yandex_disk" | "external";
  url: string;
};

// Определяем источник файла
function detectSource(
  url: string
): ImportCandidate["sourceType"] {
  const host = new URL(url).hostname.toLowerCase();

  if (
    host === "drive.google.com" ||
    host === "docs.google.com"
  ) {
    return "google_drive";
  }

  if (
    host === "disk.yandex.ru" ||
    host === "disk.yandex.com" ||
    host === "disk.yandex.com.am" ||
    host === "yadi.sk"
  ) {
    return "yandex_disk";
  }

  return "external";
}


async function main() {
  console.log("Подключаемся к Google Sheets...");


  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields:
      "properties(title),sheets(properties(title,sheetId))",
  });

  console.log(
    "Название таблицы:",
    metadata.data.properties?.title
  );

  console.log("Доступные вкладки:");

  for (const sheet of metadata.data.sheets ?? []) {
    console.log({
      title: sheet.properties?.title,
      sheetId: sheet.properties?.sheetId,
      exactTitle: JSON.stringify(sheet.properties?.title),
    });
  }

  if (process.argv.includes("--tabs-only")) {
    return;
  }


  const escapedSheetName = sheetName.replace(/'/g, "''");

  const response = await sheets.spreadsheets.get({
    spreadsheetId: spreadsheetId,
    ranges: [`'${escapedSheetName}'!A1:I150`],
    includeGridData: true,
    fields:
      "sheets(data(startRow,rowData(values(formattedValue,hyperlink,userEnteredValue,userEnteredFormat,textFormatRuns,chipRuns))))",
  });

  const grid = response.data.sheets?.[0]?.data?.[0];

  if (!grid) {
    throw new Error("Не удалось получить данные листа");
  }

  const rows = grid.rowData ?? [];

  const results: {
    row: number;
    title: string;
    links: number;
    source: string;
  }[] = [];

  const candidates: ImportCandidate[] = [];

  rows.forEach((row, index) => {
    const cells = row.values ?? [];

    const title = cells[0]?.formattedValue?.trim();
    const links = extractLinks(cells[8]);

    if (!title || links.length === 0) return;

    const sources = links.map((link) => {
      const host = new URL(link).hostname;

      if (host.includes("google.com")) return "Google Drive";
      if (host.includes("yandex") || host === "yadi.sk") {
        return "Яндекс Диск";
      }

      return "Другой";
    });

    results.push({
      row: (grid.startRow ?? 0) + index + 1,
      title,
      links: links.length,
      source: [...new Set(sources)].join(", "),
    });

    for (const link of links) {
      candidates.push({
        sourceRow: (grid.startRow ?? 0) + index + 1,
        title,
        sourceType: detectSource(link),
        url: link,
      });
    }
  });


  // Папка для результатов импорта
  const outputDir = join(
    process.cwd(),
    "data",
    "imports"
  );

  await mkdir(outputDir, {
    recursive: true,
  });

  // Файл с найденными ссылками
  const outputPath = join(
    outputDir,
    "sheet-links.json"
  );

  // Сохраняем данные
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        sheetName,
        generatedAt: new Date().toISOString(),
        total: candidates.length,
        entries: candidates,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    `\n✅ Сохранено ссылок: ${candidates.length}`
  );

  console.log(`📁 Файл: ${outputPath}`);


  console.table(results);

  console.log(`Найдено строк со ссылками: ${results.length}`);
  console.log("Предпросмотр завершён. База не изменена.");
}

main().catch((error: unknown) => {
  console.error("Ошибка импорта:", error);
  process.exitCode = 1;
});
