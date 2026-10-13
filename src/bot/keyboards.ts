import { InlineKeyboard } from "grammy";
import {
  DEMO_TYPE_LABELS,
  type DemoType,
} from "../db/demoRepository.js";

// Главное меню

export const mainKeyboard = () =>
  new InlineKeyboard()
    .text("🔎 Найти демку", "menu_search")
    .row()
    .text("➕ Добавить демку", "menu_add")
    .row()
    .text("📁 Последние демки", "menu_list")
    .row()
    .text("📊 Статистика", "menu_stats");


// Возвращение в главное меню
export const backKeyboard = () =>
  new InlineKeyboard()
    .text("⬅️ Главное меню", "menu_home");

// Отмена добавления
export const cancelKeyboard = () =>
  new InlineKeyboard()
    .text("❌ Отмена", "menu_cancel");


type DemoListItem = {
  id: number;
  title: string;
};

// Список демок с кнопками
export const demoListKeyboard = (
  demos: DemoListItem[],
  mode: "search" | "type" = "search"
) => {
  const keyboard = new InlineKeyboard();

  for (const demo of demos) {
    const title = demo.title.length > 40
      ? demo.title.slice(0, 40) + "..."
      : demo.title;

    keyboard
      .text(
        `🎵 #${demo.id} — ${title}`,
        `demo_open:${demo.id}`
      )
      .row();
  }

  // Куда возвращаемся из результатов
  const backText = mode === "type"
    ? "🎼 Выбрать другой тип"
    : "🔎 Новый поиск";

  const backAction = mode === "type"
    ? "search_types"
    : "menu_search";

  return keyboard
    .text(backText, backAction)
    .row()
    .text("⬅️ Главное меню", "menu_home");
};


// Кнопки после получения демки
export const demoViewKeyboard = (demoId: number) =>
  new InlineKeyboard()
    .text("✏️ Изменить свойства", `demo_edit:${demoId}`)
    .row()
    .text("📁 К списку демок", "menu_list")
    .row()
    .text("🏠 Главное меню", "menu_home");


// Клавиатура редактирования свойств
export const demoPropertiesKeyboard = (demoId: number) =>
  new InlineKeyboard()
    .text("🎸 Рифф", `prop_type:${demoId}:riff`)
    .row()
    .text("🎤 Вокальная идея", `prop_type:${demoId}:vocal`)
    .row()
    .text("🎶 Набросок песни", `prop_type:${demoId}:song_sketch`)
    .row()
    .text("🎧 Полная демка", `prop_type:${demoId}:full_demo`)
    .row()
    .text("📦 Другое", `prop_type:${demoId}:other`)
    .row()
    .text("❌ Без типа", `prop_type:${demoId}:none`)
    .row()
    .text("📝 Изменить описание", `prop_desc:${demoId}`)
    .row()
    .text("▶️ Получить демку", `demo_open:${demoId}`)
    .row()
    .text("🏠 Главное меню", "menu_home");


export const searchMenuKeyboard = () =>
  new InlineKeyboard()
    .text("🔤 По названию и описанию", "search_text")
    .row()
    .text("🎼 По типу идеи", "search_types")
    .row()
    .text("⬅️ Главное меню", "menu_home");


export const ideaTypeFilterKeyboard = () => {
  const keyboard = new InlineKeyboard();

  const types = Object.keys(
    DEMO_TYPE_LABELS
  ) as DemoType[];

  // Создаём кнопку для каждого типа
  for (const type of types) {
    keyboard
      .text(
        `🎼 ${DEMO_TYPE_LABELS[type]}`,
        `filter_type:${type}`
      )
      .row();
  }

  // Показываем демки без классификации
  return keyboard
    .text("❔ Без типа", "filter_type:none")
    .row()
    .text("⬅️ К выбору поиска", "menu_search")
    .row()
    .text("🏠 Главное меню", "menu_home");
};




