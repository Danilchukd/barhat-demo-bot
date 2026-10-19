import assert from "node:assert/strict";
import { test } from "node:test";
import { assertSafeTestTarget, makeAppendRow } from "./sheetTestWrite.js";

test("нельзя писать в основную таблицу", () => {
  assert.throws(() => assertSafeTestTarget("production-id", "production-id", "BARHAT SYNC TEST"));
  assert.throws(() => assertSafeTestTarget("production-id", undefined, "BARHAT SYNC TEST"));
  assert.throws(() => assertSafeTestTarget(undefined, "test-id", "BARHAT SYNC TEST"));
});

test("в имени тестовой таблицы нужна явная метка BARHAT SYNC TEST", () => {
  assert.throws(() => assertSafeTestTarget("production-id", "test-id", "BARHAT MX"));
  assert.equal(assertSafeTestTarget("production-id", "test-id", "BARHAT SYNC TEST"), "test-id");
  assert.equal(assertSafeTestTarget("production-id", "test-id", "Моя BARHAT SYNC TEST — копия"), "test-id");
});

test("в новой строке заполняем только A, I и J", () => {
  assert.deepEqual(
    makeAppendRow({
      status: "new",
      nextRow: 151,
      lastUsedRow: 150,
      cells: {
        A: "Новая демка",
        I: "https://drive.google.com/file/d/TEST",
        J: "Описание",
      },
    }),
    ["Новая демка", "", "", "", "", "", "", "", "https://drive.google.com/file/d/TEST", "Описание"]
  );
});

test("запрещаем создание дублирующей строки", () => {
  assert.throws(() => makeAppendRow({
    status: "duplicate",
    lastUsedRow: 150,
    matchingRows: [28],
  }));
});
