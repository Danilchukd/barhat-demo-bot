import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Изолированная SQLite: тест не обращается к архиву на VPS или к рабочей базе.
const testDir = mkdtempSync(path.join(tmpdir(), "barhat-search-retry-"));
process.env.BARHAT_DB_PATH = path.join(testDir, "search-test.sqlite");

const { buildSearchResultsView } = await import("./searchResultsView.js");
const { saveDemo } = await import("../db/demoRepository.js");
const { db } = await import("../db/database.js");

after(() => {
  db.close();
  rmSync(testDir, { recursive: true, force: true });
});

function hasRetryButton(view: ReturnType<typeof buildSearchResultsView>): boolean {
  return view.keyboard.inline_keyboard.some(row =>
    row.some(button => "callback_data" in button && button.callback_data === "search_text")
  );
}

test("После неудачного поиска можно сразу вводить новое название", () => {
  const view = buildSearchResultsView("несуществующая демка для теста");
  assert.equal(view.hasResults, false);
  assert.match(view.text, /Отправь другое название следующим сообщением/);
  assert.equal(hasRetryButton(view), true);
});

test("После успешного поиска кнопка Новый поиск сразу открывает ввод названия", () => {
  saveDemo("Тестовая демка поиска", "https://example.com/demo.mp3", "external");
  const view = buildSearchResultsView("Тестовая демка");
  assert.equal(view.hasResults, true);
  assert.equal(hasRetryButton(view), true);
});
