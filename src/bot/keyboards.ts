import { InlineKeyboard } from "grammy";

// Главное меню
export const mainKeyboard = () =>
  new InlineKeyboard()
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

  return keyboard.text(
    "⬅️ Главное меню",
    "menu_home"
  );
};

// Кнопки после получения демки
export const demoViewKeyboard = () =>
  new InlineKeyboard()
    .text("📁 К списку демок", "menu_list")
    .row()
    .text("🏠 Главное меню", "menu_home");

