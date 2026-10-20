import "dotenv/config";
import path from "node:path";

// Безопасный тест всей цепочки: отдельная SQLite -> очередь -> копия Google Sheets.
// Не запускает Telegram, поэтому рабочий токен не используется.
async function main(): Promise<void> {
  if (process.env.GOOGLE_SYNC_MODE !== "test") {
    throw new Error("Тест запрещён: установи GOOGLE_SYNC_MODE=test");
  }
  const testDb = process.env.BARHAT_DB_PATH?.trim();
  if (!testDb || !path.basename(testDb).toLowerCase().includes("test")) {
    throw new Error("Укажи BARHAT_DB_PATH с именем файла, содержащим 'test'");
  }
  const resolved = path.resolve(testDb);
  const productionDb = path.resolve("data/barhat.sqlite");
  if (resolved === productionDb) {
    throw new Error("Нельзя использовать основную SQLite");
  }

  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--title" || args[2] !== "--url") {
    throw new Error('Использование: --title "BARHAT AUTO TEST 1" --url "https://drive.google.com/file/d/TEST"');
  }
  const title = args[1]?.trim() ?? "";
  const url = args[3] ?? "";
  if (!title || title.length > 150) throw new Error("Название пустое или слишком длинное");
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Некорректная ссылка");

  // Подключаем базу только ПОСЛЕ проверки пути.
  const [{ saveDemo, getSourceType }, { db }, { runSheetsSyncOnce }] = await Promise.all([
    import("../db/demoRepository.js"),
    import("../db/database.js"),
    import("./syncWorker.js"),
  ]);

  const demoId = saveDemo(title, url, getSourceType(parsed));
  console.log("[TEST] Новая демка в отдельной SQLite: #" + demoId, title);
  await runSheetsSyncOnce("BARHATDFunBOT");

  const state = db.prepare(
    "SELECT state, attempts, last_error FROM sheet_sync_jobs WHERE demo_id = ?"
  ).get(demoId) as { state: string; attempts: number; last_error: string | null } | undefined;

  console.log("[TEST] Состояние:", state?.state ?? "не найдено");
  if (state?.state !== "synced") {
    console.error("[TEST] Google Sheets не подтвердил синхронизацию:", state?.last_error ?? "нет данных");
    process.exitCode = 1;
    return;
  }
  console.log("✅ Полный тест успешен. Основная таблица, база VPS и Telegram не изменены.");
}

main().catch((error: unknown) => {
  console.error(
    "Ошибка полного теста:",
    error instanceof Error ? error.message : "неизвестная ошибка"
  );
  process.exitCode = 1;
});
