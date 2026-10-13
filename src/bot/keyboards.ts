import { InlineKeyboard } from "grammy";

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
  demos: DemoListItem[]
) => {
  const keyboard = new InlineKeyboard();

  for (const demo of demos) {
    // Ограничиваем длинные названия
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

  return keyboard
  .text("🔎 Новый поиск", "menu_search")
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



