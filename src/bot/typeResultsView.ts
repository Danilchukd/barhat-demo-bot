
import {
  getTypePage,
  DEMO_TYPE_LABELS,
  type DemoType,
} from "../db/demoRepository.js";

import { demoListKeyboard } from "./keyboards.js";

export function buildTypeResultsView(
  rawType: DemoType | "none",
  requestedPage: number = 0
) {
  const ideaType: DemoType | null =
    rawType === "none" ? null : rawType;

  const result = getTypePage(
    ideaType,
    requestedPage
  );

  const typeName = ideaType === null
    ? "Без типа"
    : DEMO_TYPE_LABELS[ideaType];

  const text = result.total === 0
    ? `🎼 Тип: ${typeName}\n\n` +
      "Демок с таким типом пока нет."
    : `🎼 Тип: ${typeName}\n\n` +
      `Найдено демок: ${result.total}\n` +
      `Страница ${result.page + 1} из ${result.totalPages}\n\n` +
      "Выбери демку для прослушивания:";

  return {
    text,
    keyboard: demoListKeyboard(
      result.demos,
      "type",
      result.page,
      result.totalPages
    ),
  };
}
