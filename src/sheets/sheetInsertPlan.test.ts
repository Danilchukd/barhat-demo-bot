import assert from "node:assert/strict";
import { test } from "node:test";
import { previewNewDemoRow, normalizeTitle } from "./sheetInsertPlan.js";

test("нормализация названий учитывает ё, пробелы и регистр", () => {
  assert.equal(normalizeTitle("  Ёлка   Идея "), normalizeTitle("елка идея"));
});

test("предпросмотр формирует только A, I и J и не меняет старые строки", () => {
  const rows = [
    ["Трек", "", "Аранжировка", "Запись", "Сведение", "Продюсирование", "", "", "Ссылки", "Заметки"],
    ["Старая демка", "", "Частично", "Нет", "Нет", "Нет", "", "", "https://drive.google.com/old"],
  ];
  const snapshot = JSON.stringify(rows);
  const plan = previewNewDemoRow(rows, {
    id: 130,
    title: "Новая демка",
    description: "Новая идея",
    source: { kind: "link", url: "https://drive.google.com/file/abc" },
  });
  assert.deepEqual(plan, {
    status: "new", nextRow: 3, lastUsedRow: 2,
    cells: { A: "Новая демка", I: "https://drive.google.com/file/abc", J: "Новая идея" },
  });
  assert.equal(JSON.stringify(rows), snapshot);
});

test("дубли по названию в таблице не проходят", () => {
  const plan = previewNewDemoRow([["Трек"], ["  Ёлка  Идея  "]], {
    id: 130, title: "елка идея", description: null,
    source: { kind: "telegram", botUsername: "BARHATDFunBOT" },
  });
  assert.deepEqual(plan, { status: "duplicate", matchingRows: [2], lastUsedRow: 2 });
});

test("Telegram-вложение получает ссылку на демку в боте", () => {
  const plan = previewNewDemoRow([["Трек"]], {
    id: 131, title: "Голосовая идея", description: null,
    source: { kind: "telegram", botUsername: "BARHATDFunBOT" },
  });
  assert.equal(plan.status, "new");
  if (plan.status === "new") {
    assert.equal(plan.cells.I, "https://t.me/BARHATDFunBOT?start=demo_131");
    assert.equal(plan.cells.J, "");
  }
});

test("занятые строки учитываем даже при пустой ячейке A", () => {
  const plan = previewNewDemoRow([["Трек"], ["Песня"], ["", "", "", "", "", "", "Ссылка"]], {
    id: 132, title: "Новый трек", description: null,
    source: { kind: "telegram", botUsername: "BARHATDFunBOT" },
  });
  assert.equal(plan.status, "new");
  if (plan.status === "new") assert.equal(plan.nextRow, 4);
});

test("некорректные ссылки и ID отклоняются", () => {
  const base = { id: 1, title: "Демо", description: null } as const;
  assert.throws(() => previewNewDemoRow([], {
    ...base, id: 0, source: { kind: "telegram", botUsername: "BARHATDFunBOT" }
  }));
  assert.throws(() => previewNewDemoRow([], {
    ...base, source: { kind: "link", url: "javascript:alert(1)" }
  }));
});
