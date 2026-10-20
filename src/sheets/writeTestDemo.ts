import "dotenv/config";
import { google } from "googleapis";
import { previewNewDemoRow, type PreviewDemo } from "./sheetInsertPlan.js";
import { assertSafeTestTarget, makeAppendRow } from "./sheetTestWrite.js";

function parseArgs(): { demo: PreviewDemo; write: boolean } {
  const args = new Map<string, string>();
  let write = false;
  const allowed = new Set([
    "--demo-id", "--title", "--description", "--url", "--bot-username",
  ]);

  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    if (flag === "--write") {
      if (write) throw new Error("--write указан повторно");
      write = true;
      continue;
    }
    const value = process.argv[++i];
    if (!flag || !allowed.has(flag) || value === undefined || value.startsWith("--") || args.has(flag)) {
      throw new Error(
        'Пример: --demo-id 999 --title "BARHAT TEST SYNC" ' +
        '--url "https://drive.google.com/file/d/TEST" --description "Тест" [--write]'
      );
    }
    args.set(flag, value);
  }

  if (args.has("--url") === args.has("--bot-username")) {
    throw new Error("Укажи ровно один источник: --url или --bot-username");
  }

  return {
    write,
    demo: {
      id: Number(args.get("--demo-id")),
      title: args.get("--title") ?? "",
      description: args.get("--description") ?? null,
      source: args.has("--url")
        ? { kind: "link", url: args.get("--url")! }
        : { kind: "telegram", botUsername: args.get("--bot-username")! },
    },
  };
}

async function main(): Promise<void> {
  const { demo, write } = parseArgs();

  const productionId = process.env.GOOGLE_SHEET_ID;
  const testId = process.env.GOOGLE_TEST_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_TAB;
  const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH?.trim();

  if (!productionId || !testId || !sheetName || !credentialsPath) {
    throw new Error(
      "В локальном .env укажи GOOGLE_SHEET_ID, GOOGLE_TEST_SHEET_ID, " +
      "GOOGLE_SHEET_TAB и GOOGLE_CREDENTIALS_PATH"
    );
  }

  // Проверяем ID до первого обращения к API.
  if (productionId.trim() === testId.trim()) {
    throw new Error("Тестовая таблица совпадает с основной. Операция запрещена");
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: testId.trim(),
    fields: "spreadsheetId,properties(title),sheets(properties(title))",
  });
  const documentTitle = metadata.data.properties?.title ?? "";
  const safeTestId = assertSafeTestTarget(productionId, testId, documentTitle);

  const tabFound = metadata.data.sheets?.some(
    (sheet) => sheet.properties?.title === sheetName
  );
  if (!tabFound) {
    throw new Error(
      "В тестовой копии нет вкладки " + JSON.stringify(sheetName) +
      ". Проверь пробелы в GOOGLE_SHEET_TAB"
    );
  }

  const escapedTabName = sheetName.replace(/'/g, "''");
  const range = "'" + escapedTabName + "'!A:J";
  const read = await sheets.spreadsheets.values.get({
    spreadsheetId: safeTestId,
    range,
    valueRenderOption: "FORMATTED_VALUE",
  });

  const rows = (read.data.values ?? []).map((row) =>
    row.map((cell) => String(cell ?? ""))
  );
  const plan = previewNewDemoRow(rows, demo);

  console.log("Таблица:", documentTitle);
  console.log("Вкладка:", JSON.stringify(sheetName));
  console.log("Существующих заполненных строк A:J:", plan.lastUsedRow);

  if (plan.status === "duplicate") {
    console.log("Совпадение названия в строках:", plan.matchingRows.join(", "));
    console.log("Никаких изменений не выполнено.");
    return;
  }

  console.log("Планируемая строка:", plan.nextRow);
  console.log("A:", plan.cells.A);
  console.log("I:", plan.cells.I);
  console.log("J:", plan.cells.J || "(пусто)");
  if (!write) {
    console.log("РЕЖИМ ПРОСМОТРА. Для записи ТОЛЬКО В КОПИЮ повтори команду с --write.");
    return;
  }

  // Google Sheets сам вставляет новую строку после обнаруженной таблицы.
  // RAW не интерпретирует названия и ссылки как формулы.
  const appended = await sheets.spreadsheets.values.append({
    spreadsheetId: safeTestId,
    range,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      majorDimension: "ROWS",
      values: [makeAppendRow(plan)],
    },
  });

  const updatedRange = appended.data.updates?.updatedRange;
  if (!updatedRange || appended.data.updates?.updatedRows !== 1) {
    throw new Error(
      "Google Sheets не подтвердил запись одной строки. " +
      "Перед повтором обязательно проверь таблицу вручную"
    );
  }

  console.log("✅ Google Sheets подтвердил добавление тестовой строки:", updatedRange);
  console.log("Основная таблица и SQLite не изменены.");
}

main().catch((error: unknown) => {
  console.error(
    "Ошибка тестовой синхронизации:",
    error instanceof Error ? error.message : "неизвестная ошибка"
  );
  process.exitCode = 1;
});
