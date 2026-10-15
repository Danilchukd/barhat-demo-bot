
import { getArchivePage } from "../db/demoRepository.js";
import { archivePageKeyboard } from "./keyboards.js";

// Формируем страницу архива
export function buildArchiveView(
  requestedPage: number = 0
) {
  const {
    demos,
    page,
    totalPages,
    total,
  } = getArchivePage(requestedPage);

  const text = total === 0
    ? "📁 Архив демок BARHAT\n\n" +
      "В архиве пока нет демок."
    : "📁 Архив демок BARHAT\n\n" +
      `Всего демок: ${total}\n` +
      `Страница ${page + 1} из ${totalPages}\n\n` +
      "Выбери демку для прослушивания:";

  return {
    text,
    keyboard: archivePageKeyboard(
      demos,
      page,
      totalPages
    ),
  };
}