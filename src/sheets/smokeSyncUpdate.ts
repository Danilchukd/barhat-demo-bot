import "dotenv/config";
import path from "node:path";
import { google } from "googleapis";
import { normalizeTitle } from "./sheetInsertPlan.js";
import { assertSafeTestTarget } from "./sheetTestWrite.js";

// Проверяет новую демку, дальнейшее переименование и изменение описания.
// Только тестовые SQLite и Google-таблица. Telegram не запускается.
async function main(): Promise<void> {
  if (process.env.GOOGLE_SYNC_MODE !== "test") {
    throw new Error("Установи GOOGLE_SYNC_MODE=test");
  }
  const dbFile = process.env.BARHAT_DB_PATH?.trim();
  if (!dbFile || !path.basename(dbFile).toLowerCase().includes("test") ||
      path.resolve(dbFile) === path.resolve("data/barhat.sqlite")) {
    throw new Error("BARHAT_DB_PATH должен указывать на отдельную тестовую SQLite");
  }

  const productionId = process.env.GOOGLE_SHEET_ID?.trim();
  const testId = process.env.GOOGLE_TEST_SHEET_ID?.trim();
  const tab = process.env.GOOGLE_SHEET_TAB;
  const keyFile = process.env.GOOGLE_CREDENTIALS_PATH?.trim();
  if (!productionId || !testId || !tab || !keyFile) {
    throw new Error("Не заполнены параметры Google Sheets");
  }
  if (productionId === testId) throw new Error("Тестовая таблица совпадает с боевой");

  if (process.argv.length !== 4 || process.argv[2] !== "--title") {
    throw new Error('Использование: --title "BARHAT UPDATE TEST 1"');
  }
  const title = process.argv[3]?.trim() ?? "";
  if (!title || title.length > 120) throw new Error("Некорректное название");

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: testId,
    fields: "properties(title),sheets(properties(title))",
  });
  assertSafeTestTarget(productionId, testId, meta.data.properties?.title ?? "");
  if (!meta.data.sheets?.some((s) => s.properties?.title === tab)) {
    throw new Error("Не найдена тестовая вкладка");
  }

  const [{ db }, { saveDemo, getSourceType, updateDemoTitle, updateDemoProperties },
    { runSheetsSyncOnce }] = await Promise.all([
      import("../db/database.js"),
      import("../db/demoRepository.js"),
      import("./syncWorker.js"),
    ]);
  const originalUrl = "https://drive.google.com/file/d/TEST";
  const demoId = saveDemo(title, originalUrl, getSourceType(new URL(originalUrl)));
  console.log("[TEST] Создана демка #" + demoId);

  await runSheetsSyncOnce("BARHATDFunBOT");
  const state = db.prepare("SELECT state FROM sheet_sync_jobs WHERE demo_id = ?")
    .get(demoId) as { state: string } | undefined;
  if (state?.state !== "synced") throw new Error("Первичная запись в Sheets не удалась");
  console.log("[TEST] Первичная синхронизация выполнена");

  const newTitle = title + " EDIT";
  const newDescription = "Проверка изменения описания BARHAT SYNC";
  if (!updateDemoTitle(demoId, newTitle)) throw new Error("Название не обновилось в SQLite");
  if (!updateDemoProperties(demoId, {
    description: newDescription, ideaType: null,
  })) throw new Error("Описание не обновилось в SQLite");

  await runSheetsSyncOnce("BARHATDFunBOT");
  const finalState = db.prepare("SELECT state, last_error FROM sheet_sync_jobs WHERE demo_id = ?")
    .get(demoId) as { state: string; last_error: string | null } | undefined;
  if (finalState?.state !== "synced") {
    throw new Error("Редактирование не синхронизировалось: " + (finalState?.last_error ?? "нет данных"));
  }

  const escapedTab = tab.replace(/'/g, "''");
  const read = await sheets.spreadsheets.values.get({
    spreadsheetId: testId,
    range: "'" + escapedTab + "'!A:J",
    valueRenderOption: "FORMATTED_VALUE",
  });
  const rows = read.data.values ?? [];
  const matches = rows
    .map((row, index) => ({ index: index + 1, row }))
    .filter(({ row }) => normalizeTitle(String(row[0] ?? "")) === normalizeTitle(newTitle));
  if (matches.length !== 1) {
    throw new Error("Ожидалась ровно одна обновлённая строка, найдено " + matches.length);
  }
  const match = matches[0];
  if (!match) throw new Error("Строка пропала после поиска");
  const { index, row } = match;
  if (String(row[8] ?? "") !== originalUrl ||
      String(row[9] ?? "") !== newDescription) {
    throw new Error("Столбцы I/J содержат неправильные данные");
  }
  const oldRows = rows.filter((r) => normalizeTitle(String(r[0] ?? "")) === normalizeTitle(title));
  if (oldRows.length) throw new Error("Старая строка осталась: обновление создало дубль");

  console.log("✅ Обновлена строка:", index);
  console.log("A:", row[0]);
  console.log("I:", row[8]);
  console.log("J:", row[9]);
  console.log("✅ Сквозной тест создания и редактирования завершён. Рабочие данные не тронуты.");
}

main().catch((error: unknown) => {
  console.error("[TEST] Ошибка:", error instanceof Error ? error.message : "неизвестная");
  process.exitCode = 1;
});
