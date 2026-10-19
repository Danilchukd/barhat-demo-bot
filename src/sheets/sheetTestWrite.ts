import type { SheetInsertPlan } from "./sheetInsertPlan.js";

// Явная защита тестового сценария от записи в боевую Google-таблицу.
export function assertSafeTestTarget(
  productionId: string | undefined,
  testId: string | undefined,
  documentTitle: string
): string {
  const id = testId?.trim();
  const prod = productionId?.trim();
  if (!id || !prod) {
    throw new Error("Нужны GOOGLE_SHEET_ID и GOOGLE_TEST_SHEET_ID");
  }
  if (id === prod) {
    throw new Error("GOOGLE_TEST_SHEET_ID совпадает с боевым GOOGLE_SHEET_ID. Запись запрещена");
  }
  if (!documentTitle.toLocaleLowerCase("ru-RU").includes("barhat sync test")) {
    throw new Error("Название тестовой таблицы должно содержать BARHAT SYNC TEST");
  }
  return id;
}

// Одна НОВАЯ строка: A = название, I = URL, J = заметка.
// Между ними только пустые новые ячейки, существующие строки не редактируем.
export function makeAppendRow(plan: SheetInsertPlan): string[] {
  if (plan.status !== "new") {
    throw new Error("Нельзя добавить строку: такое название уже существует");
  }
  return [plan.cells.A, "", "", "", "", "", "", "", plan.cells.I, plan.cells.J];
}
