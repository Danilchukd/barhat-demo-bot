
import { getSearchPage } from "../db/demoRepository.js";
import { demoListKeyboard } from "./keyboards.js";

export function buildSearchResultsView(
  query: string,
  requestedPage: number = 0
) {
  const result = getSearchPage(
    query,
    requestedPage
  );

  const text = result.total === 0
    ? `🔎 По запросу «${query}» ничего не найдено.\n\n` +
      "Отправь другое название следующим сообщением."
    : `🔎 Результаты поиска: «${query}»\n\n` +
      `Найдено демок: ${result.total}\n` +
      `Страница ${result.page + 1} из ${result.totalPages}\n\n` +
      "Выбери демку для прослушивания:";

  return {
    text,
    hasResults: result.total > 0,
    keyboard: demoListKeyboard(
      result.demos,
      "search",
      result.page,
      result.totalPages
    ),
  };
}
