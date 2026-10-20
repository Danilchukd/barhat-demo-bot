import { google, type sheets_v4 } from "googleapis";
import { db } from "../db/database.js";
import { previewNewDemoRow } from "./sheetInsertPlan.js";
import { makeAppendRow } from "./sheetTestWrite.js";
import { assertSafeTestTarget } from "./sheetTestWrite.js";
import { findSyncedRow, ensureNoOtherTitle, SheetConflictError } from "./syncPlanner.js";
import { buildDemoDeepLink } from "../bot/demoDeepLinks.js";

type Mode = "off" | "test" | "production";
type Job = {
  demo_id: number;
  title: string;
  description: string | null;
  url: string | null;
  revision: number;
  synced_title: string | null;
  synced_link: string | null;
};
type SheetContext = {
  spreadsheetId: string;
  tab: string;
  sheets: sheets_v4.Sheets;
};

const selectJobs = db.prepare(
  'SELECT j.demo_id, j.revision, j.synced_title, j.synced_link, d.title, d.description, ' +
  '(SELECT f.url FROM demo_files f WHERE f.demo_id = d.id AND f.deleted_at IS NULL ' +
  'ORDER BY f.is_primary DESC, f.id DESC LIMIT 1) AS url ' +
  'FROM sheet_sync_jobs j JOIN demos d ON d.id = j.demo_id ' +
  "WHERE j.state = 'pending' AND d.deleted_at IS NULL ORDER BY j.demo_id LIMIT 20"
);

const ack = db.prepare(
  "UPDATE sheet_sync_jobs SET state = CASE WHEN revision = ? THEN 'synced' ELSE 'pending' END, " +
  "synced_title = ?, synced_link = ?, last_error = NULL, updated_at = CURRENT_TIMESTAMP " +
  "WHERE demo_id = ?"
);

const fail = db.prepare(
  "UPDATE sheet_sync_jobs SET state = ?, attempts = attempts + 1, " +
  "last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE demo_id = ?"
);

function config(): { mode: Mode; id: string; tab: string; credentialsPath: string } | null {
  const mode = (process.env.GOOGLE_SYNC_MODE ?? "off").trim() as Mode;
  if (mode === "off") return null;
  if (mode !== "test" && mode !== "production") {
    throw new Error("GOOGLE_SYNC_MODE должен быть off, test или production");
  }
  const prodId = process.env.GOOGLE_SHEET_ID?.trim();
  const testId = process.env.GOOGLE_TEST_SHEET_ID?.trim();
  const tab = process.env.GOOGLE_SHEET_TAB;
  const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH?.trim();
  if (!prodId || !tab || !credentialsPath) {
    throw new Error("Заполни GOOGLE_SHEET_ID, GOOGLE_SHEET_TAB и GOOGLE_CREDENTIALS_PATH");
  }
  if (mode === "test" && (!testId || testId === prodId)) {
    throw new Error("Для теста нужен отличный от основного GOOGLE_TEST_SHEET_ID");
  }
  if (mode === "production" && process.env.GOOGLE_SYNC_CONFIRM !== "BARHAT_MX") {
    throw new Error("Для production требуется GOOGLE_SYNC_CONFIRM=BARHAT_MX");
  }
  return { mode, id: mode === "test" ? testId! : prodId, tab, credentialsPath };
}

async function connect(): Promise<SheetContext | null> {
  const cfg = config();
  if (!cfg) return null;
  const auth = new google.auth.GoogleAuth({
    keyFile: cfg.credentialsPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: cfg.id,
    fields: "properties(title),sheets(properties(title))",
  });
  if (cfg.mode === "test") {
    assertSafeTestTarget(process.env.GOOGLE_SHEET_ID, cfg.id, meta.data.properties?.title ?? "");
  }
  if (!meta.data.sheets?.some(s => s.properties?.title === cfg.tab)) {
    throw new Error("В таблице не найдена вкладка " + JSON.stringify(cfg.tab));
  }
  return { spreadsheetId: cfg.id, tab: cfg.tab, sheets };
}

async function currentRows(ctx: SheetContext): Promise<string[][]> {
  const escaped = ctx.tab.replace(/'/g, "''");
  const response = await ctx.sheets.spreadsheets.values.get({
    spreadsheetId: ctx.spreadsheetId,
    range: "'" + escaped + "'!A:J",
    valueRenderOption: "FORMATTED_VALUE",
  });
  return (response.data.values ?? []).map(row => row.map(v => String(v ?? "")));
}

async function processJob(ctx: SheetContext, job: Job, username: string): Promise<void> {
  const escaped = ctx.tab.replace(/'/g, "''");
  const range = "'" + escaped + "'!A:J";
  // Для обновлений сохраняем исходный экспортированный URL даже если вложения изменились.
  const link = job.synced_link ?? job.url ?? buildDemoDeepLink(job.demo_id, username);
  const rows = await currentRows(ctx);
  const oldRow = job.synced_title && job.synced_link
    ? findSyncedRow(rows, job.synced_title, job.synced_link)
    : null;
  const desiredRow = findSyncedRow(rows, job.title, link);

  if (job.synced_title && !oldRow && !desiredRow) {
    throw new SheetConflictError(
      "Синхронизированная строка изменена вручную или удалена; автоматическую перезапись блокируем"
    );
  }

  const current = oldRow ?? desiredRow;
  if (current) {
    ensureNoOtherTitle(rows, job.title, current.row);
    if (!desiredRow || current.name !== job.title ||
        (rows[current.row - 1]?.[9] ?? "") !== (job.description ?? "")) {
      // Обновляем только A и J. Никогда не трогаем C–F, I и чужие строки.
      await ctx.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: ctx.spreadsheetId,
        requestBody: {
          valueInputOption: "RAW",
          data: [
            { range: "'" + escaped + "'!A" + current.row, values: [[job.title]] },
            { range: "'" + escaped + "'!J" + current.row, values: [[job.description ?? ""]] },
          ],
        },
      });
    }
  } else {
    const plan = previewNewDemoRow(rows, {
      id: job.demo_id,
      title: job.title,
      description: job.description,
      source: { kind: "link", url: link },
    });
    if (plan.status === "duplicate") {
      throw new SheetConflictError("Название уже есть в Google Sheets, строки " + plan.matchingRows.join(", "));
    }
    const result = await ctx.sheets.spreadsheets.values.append({
      spreadsheetId: ctx.spreadsheetId,
      range,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { majorDimension: "ROWS", values: [makeAppendRow(plan)] },
    });
    if (!result.data.updates?.updatedRange || result.data.updates?.updatedRows !== 1) {
      throw new Error("Google Sheets не подтвердил создание строки; проверим повторно по названию и ссылке");
    }
  }

  // Ревизия защищает от потери правок, сделанных во время запроса к Google API.
  ack.run(job.revision, job.title, link, job.demo_id);
  console.log("[Sheets] синхронизирована демка #" + job.demo_id);
}

let busy = false;

// Можно вызвать отдельно из тестового CLI, не запуская Telegram-бота.
export async function runSheetsSyncOnce(botUsername: string): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const ctx = await connect();
    if (!ctx) {
      console.log("[Sheets] синхронизация выключена");
      return;
    }
    const jobs = selectJobs.all() as Job[];
    console.log("[Sheets] заданий к обработке:", jobs.length);
    for (const job of jobs) {
      try {
        await processJob(ctx, job, botUsername);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Неизвестная ошибка";
        const conflict = error instanceof SheetConflictError;
        fail.run(conflict ? "conflict" : "pending", message.slice(0, 300), job.demo_id);
        console.error("[Sheets] #" + job.demo_id + (conflict ? " конфликт: " : " повторим: ") + message);
      }
    }
  } catch (error) {
    console.error("[Sheets] подключение не удалось; демки остаются в очереди:",
      error instanceof Error ? error.message : "неизвестная ошибка");
  } finally {
    busy = false;
  }
}

export function startSheetsWorker(botUsername: string): void {
  if ((process.env.GOOGLE_SYNC_MODE ?? "off").trim() === "off") {
    console.log("[Sheets] синхронизация отключена (GOOGLE_SYNC_MODE=off)");
    return;
  }
  void runSheetsSyncOnce(botUsername);
  setInterval(() => { void runSheetsSyncOnce(botUsername); }, 60_000);
}
