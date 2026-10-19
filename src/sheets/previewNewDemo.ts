import "dotenv/config";
import { google } from "googleapis";
import { previewNewDemoRow, type PreviewDemo } from "./sheetInsertPlan.js";

// Режим только чтения; API записи сюда не импортируется и не вызывается.
function getArgs(): PreviewDemo {
  const flags = new Map<string, string>();
  const allowed = new Set([
    "--demo-id", "--title", "--url", "--description", "--bot-username"
  ]);
  for (let index = 2; index < process.argv.length; index += 2) {
    const flag = process.argv[index];
    const value = process.argv[index + 1];
    if (!flag || !allowed.has(flag) || value === undefined || value.startsWith("--") || flags.has(flag)) {
      throw new Error(
        "Использование: --demo-id 130 --title \"Новая демка\" " +
        "[--url \"https://drive.google.com/...\"] " +
        "[--bot-username BARHATDFunBOT] [--description \"Описание\"]"
      );
    }
    flags.set(flag, value);
  }

  return {
    id: Number(flags.get("--demo-id")),
    title: flags.get("--title") ?? "",
    description: flags.get("--description") ?? null,
    source: flags.has("--url")
      ? { kind: "link", url: flags.get("--url")! }
      : { kind: "telegram", botUsername: flags.get("--bot-username") ?? "" },
  };
}

async function main(): Promise<void> {
  const demo = getArgs();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const sheetName = process.env.GOOGLE_SHEET_TAB;
  const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH?.trim();

  if (!spreadsheetId || !sheetName || !credentialsPath) {
    throw new Error("Заполни GOOGLE_SHEET_ID, GOOGLE_SHEET_TAB и GOOGLE_CREDENTIALS_PATH в .env");
  }

  // В имени вкладки «Песни » действительно может быть пробел в конце.
  const escapedSheetName = sheetName.replace(/'/g, "''");
  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'" + escapedSheetName + "'!A:J",
    valueRenderOption: "FORMATTED_VALUE",
  });

  const rows = (response.data.values ?? []).map((row) =>
    row.map((value) => String(value ?? ""))
  );
  const plan = previewNewDemoRow(rows, demo);

  console.log("=== BARHAT / Google Sheets: READ-ONLY PREVIEW ===");
  console.log("Запись выключена. Таблица и SQLite не изменяются.");
  console.log("Вкладка:", JSON.stringify(sheetName));
  console.log("Последняя заполненная строка A:J:", plan.lastUsedRow);
  if (plan.status === "duplicate") {
    console.log("Совпадает название: новую строку не создаём.");
    console.log("Существующие строки:", plan.matchingRows.join(", "));
    return;
  }
  console.log("Предполагаемая новая строка:", plan.nextRow);
  console.log("A (название):", plan.cells.A);
  console.log("I (ссылка):", plan.cells.I);
  console.log("J (описание):", plan.cells.J || "(пусто)");
  console.log("C–F и существующие строки: без изменений.");
}

main().catch((error: unknown) => {
  console.error(
    "Ошибка предпросмотра:",
    error instanceof Error ? error.message : "неизвестная ошибка"
  );
  process.exitCode = 1;
});
