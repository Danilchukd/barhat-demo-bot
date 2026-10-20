import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureNoOtherTitle, findSyncedRow, SheetConflictError } from "./syncPlanner.js";

test("ищем строку по названию и URL после ручной сортировки", () => {
  const rows = [
    ["Трек", "", "", "", "", "", "", "", "Ссылки"],
    ["Новая песня", "", "", "", "", "", "", "", "https://drive.google.com/d/abc"],
  ];
  assert.equal(findSyncedRow(rows, "новая песня", "https://drive.google.com/d/abc")?.row, 2);
  assert.equal(findSyncedRow(rows, "Другая", "https://drive.google.com/d/abc"), null);
});
test("несколько одинаковых пар не перезаписываем", () => {
  assert.throws(() => findSyncedRow([["Song", "", "", "", "", "", "", "", "x"], ["Song", "", "", "", "", "", "", "", "x"]], "Song", "x"), SheetConflictError);
});
test("не разрешаем переименование в существующий трек", () => {
  assert.throws(() => ensureNoOtherTitle([["Foo"], ["BAR"]], "bar", 1), SheetConflictError);
  assert.doesNotThrow(() => ensureNoOtherTitle([["Foo"], ["BAR"]], "bar", 2));
});
