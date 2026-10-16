import { readFile } from "node:fs/promises";
import { join } from "node:path";

type ManifestEntry = {
  sourceRow: number;
  title: string;
};

type Exclusion = {
  row: number;
  title: string;
  reason: string;
};

const exclusionsPath = join(
  process.cwd(),
  "data", "imports", "exclusions.json"
);

function normalizeTitle(title: string): string {
  return title.normalize("NFKC").trim().toLocaleLowerCase("ru-RU");
}

/**
 * Проверяет исключения по номеру строки и названию.
 * Если Google Sheets изменится, прекращает работу,
 * чтобы не пропустить по ошибке другую демку.
 */
export async function loadImportExclusions(
  manifestEntries: ManifestEntry[]
): Promise<Map<number, string>> {
  let raw: string;

  try {
    raw = await readFile(exclusionsPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Не найден файл исключений: ${exclusionsPath}. ` +
        "Создай его перед пакетным импортом."
      );
    }
    throw error;
  }

  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" || parsed === null ||
    !("excluded" in parsed) || !Array.isArray(parsed.excluded)
  ) {
    throw new Error("В exclusions.json ожидается массив excluded");
  }

  const result = new Map<number, string>();
  for (const item of parsed.excluded as unknown[]) {
    if (typeof item !== "object" || item === null) {
      throw new Error("Некорректная запись в exclusions.json");
    }
    const entry = item as Partial<Exclusion>;
    if (
      typeof entry.row !== "number" ||
      !Number.isSafeInteger(entry.row) || entry.row <= 0 ||
      typeof entry.title !== "string" || !entry.title.trim() ||
      typeof entry.reason !== "string" || !entry.reason.trim()
    ) {
      throw new Error("У каждой записи исключения нужны row, title и reason");
    }
    if (result.has(entry.row)) {
      throw new Error(`Строка ${entry.row} дважды указана в exclusions.json`);
    }

    const expectedTitle = normalizeTitle(entry.title);
    const matchingRows = manifestEntries.filter(
      (candidate) => candidate.sourceRow === entry.row
    );
    if (
      matchingRows.length === 0 ||
      matchingRows.some(
        (candidate) => normalizeTitle(candidate.title) !== expectedTitle
      )
    ) {
      throw new Error(
        `Строка ${entry.row} (${entry.title}) больше не совпадает с ` +
        "sheet-links.json. Проверь исключения после изменений в Google Sheets."
      );
    }

    result.set(entry.row, entry.reason);
  }
  return result;
}
