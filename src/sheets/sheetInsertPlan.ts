import { buildDemoDeepLink } from "../bot/demoDeepLinks.js";

export type PreviewDemo = {
  id: number;
  title: string;
  description: string | null;
  source:
    | { kind: "link"; url: string }
    | { kind: "telegram"; botUsername: string };
};

export type SheetInsertPlan =
  | { status: "duplicate"; matchingRows: number[]; lastUsedRow: number }
  | {
      status: "new";
      nextRow: number;
      lastUsedRow: number;
      cells: { A: string; I: string; J: string };
    };

export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е");
}

// Только план новой строки. Существующие строки никогда не изменяем.
export function previewNewDemoRow(
  existingRows: readonly (readonly string[])[],
  demo: PreviewDemo
): SheetInsertPlan {
  if (!Number.isSafeInteger(demo.id) || demo.id <= 0) {
    throw new Error("ID демки должен быть положительным целым числом");
  }
  const title = demo.title.trim().replace(/\s+/g, " ");
  if (!title || title.length > 150) {
    throw new Error("Название должно содержать от 1 до 150 символов");
  }
  const description = demo.description?.trim() ?? "";
  if (description.length > 500) {
    throw new Error("Описание слишком длинное");
  }

  let link: string;
  if (demo.source.kind === "link") {
    link = demo.source.url.trim();
    let parsed: URL;
    try {
      parsed = new URL(link);
    } catch {
      throw new Error("Некорректная ссылка на демку");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Допустимы только ссылки http/https");
    }
  } else {
    link = buildDemoDeepLink(demo.id, demo.source.botUsername);
  }

  let lastUsedRow = 0;
  const matchingRows: number[] = [];
  const normalized = normalizeTitle(title);

  existingRows.forEach((row, index) => {
    if (row.some((cell) => String(cell).trim() !== "")) {
      lastUsedRow = index + 1;
    }
    const otherTitle = row[0];
    if (otherTitle && normalizeTitle(otherTitle) === normalized) {
      matchingRows.push(index + 1);
    }
  });

  if (matchingRows.length > 0) {
    return { status: "duplicate", matchingRows, lastUsedRow };
  }
  return {
    status: "new",
    nextRow: lastUsedRow + 1,
    lastUsedRow,
    cells: { A: title, I: link, J: description },
  };
}
