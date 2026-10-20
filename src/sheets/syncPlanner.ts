import { normalizeTitle } from "./sheetInsertPlan.js";

export type TargetRow = { row: number; name: string; link: string };
export class SheetConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetConflictError";
  }
}

// Находим запись по уникальной паре название + ссылка, независимо от её позиции.
// Это переживает ручную сортировку листа. Если совпадений несколько — не пишем.
export function findSyncedRow(
  rows: readonly (readonly string[])[],
  title: string,
  link: string
): TargetRow | null {
  const matches: TargetRow[] = [];
  rows.forEach((row, index) => {
    if (normalizeTitle(row[0] ?? "") === normalizeTitle(title) &&
        (row[8] ?? "").trim() === link.trim()) {
      matches.push({ row: index + 1, name: row[0] ?? "", link: row[8] ?? "" });
    }
  });
  if (matches.length > 1) {
    throw new SheetConflictError("Несколько строк с одинаковыми названием и ссылкой");
  }
  return matches[0] ?? null;
}

export function ensureNoOtherTitle(
  rows: readonly (readonly string[])[],
  title: string,
  currentRow: number
): void {
  const matches = rows.flatMap((row, index) =>
    normalizeTitle(row[0] ?? "") === normalizeTitle(title) && index + 1 !== currentRow
      ? [index + 1]
      : []
  );
  if (matches.length) {
    throw new SheetConflictError("В Google Sheets уже существует другое совпадающее название, строка " + matches.join(", "));
  }
}
