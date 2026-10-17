import { InlineKeyboard } from "grammy";
import {
  DEMO_TYPE_LABELS,
  type DemoType,
} from "../db/demoRepository.js";
import type { MyContext } from "./session.js";
import { canEditDemo } from "./access.js";

// Главное меню


export const mainKeyboard = (ctx: MyContext) => {
  const keyboard = new InlineKeyboard()
    .text("🔎 Найти демку", "menu_search")
    .row()
    .text("➕ Добавить демку", "menu_add")
    .row()
    .text("📁 Все демки", "menu_list")
    .row()
    .text("📊 Статистика", "menu_stats");

  // Корзина доступна только администратору
  if (canEditDemo(ctx)) {
    keyboard
      .row()
      .text("🗑 Корзина", "menu_trash");
  }

  return keyboard;
};


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
  mode: "search" | "type" = "search",
  page?: number,
  totalPages?: number
) => {
  const keyboard = new InlineKeyboard();

  for (const demo of demos) {
    const title = demo.title.length > 40
      ? demo.title.slice(0, 40) + "..."
      : demo.title;

    keyboard
      .text(
        `🎵 #${demo.id} — ${title}`,
        `demo_open:${demo.id}:${mode}:${page ?? 0}`
      )
      .row();
  }


  // Постраничная навигация
  if (
    page !== undefined &&
    totalPages !== undefined &&
    totalPages > 1
  ) {
    if (page > 0) {
      keyboard.text(
        "◀️ Назад",
        `${mode}_page:${page - 1}`
      );
    }

    if (page < totalPages - 1) {
      keyboard.text(
        "Вперёд ▶️",
        `${mode}_page:${page + 1}`
      );
    }

    keyboard.row();
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

export const demoViewKeyboard = (
  demoId: number,
  ctx: MyContext
) => {
  const keyboard = new InlineKeyboard();

  // Редактирование доступно только администратору
  if (canEditDemo(ctx)) {
    keyboard
      .text("✏️ Изменить свойства", `demo_edit:${demoId}`)
      .row();
  }

  // Общие кнопки для всех пользователей
  return keyboard
    .text("📎 Все файлы", `demo_files:${demoId}`)
    .row()
    .text("➕ Прикрепить файл", `demo_attach:${demoId}`)
    .row()
    .text(
      ctx.session.returnTo?.source === "archive"
        ? "📁 К странице архива"
        : ctx.session.returnTo
          ? "↩️ К результатам поиска"
          : "📁 К списку демок",
      ctx.session.returnTo
        ? "return_to_results"
        : "menu_list"
    )
    .row()
    .text("🏠 Главное меню", "menu_home");
};



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
    .text("✏️ Изменить название", `prop_title:${demoId}`)
    .row()
    .text("📝 Изменить описание", `prop_desc:${demoId}`)
    .row()
    .text("🗑 Удалить демку", `demo_delete:${demoId}`)
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


// Подтверждение удаления
export const demoDeleteConfirmKeyboard = (demoId: number) =>
  new InlineKeyboard()
    .text(
      "🗑 Да, переместить в корзину",
      `demo_delete_confirm:${demoId}`
    )
    .row()
    .text(
      "❌ Отмена",
      `demo_delete_cancel:${demoId}`
    );

// После удаления
export const demoDeletedKeyboard = (demoId: number) =>
  new InlineKeyboard()
    .text("↩️ Восстановить", `demo_restore:${demoId}`)
    .row()
    .text("🏠 Главное меню", "menu_home");


type TrashDemoItem = {
  id: number;
  title: string;
};

// Клавиатура корзины
export const trashKeyboard = (
  demos: TrashDemoItem[]
) => {
  const keyboard = new InlineKeyboard();

  for (const demo of demos) {
    const title = demo.title.length > 35
      ? demo.title.slice(0, 35) + "..."
      : demo.title;

    keyboard
      .text(
        `↩️ #${demo.id} — ${title}`,
        `trash_restore:${demo.id}`
      )
      .row();
  }

  return keyboard.text(
    "🏠 Главное меню",
    "menu_home"
  );
};



type AttachmentButtonData = {
  id: number;
  source_type: string;
  label: string | null;
  is_primary: number;
};

export const demoAttachmentsKeyboard = (
  demoId: number,
  files: AttachmentButtonData[],
  canManage: boolean = false,
  hasReturnTo: boolean = false
) => {
  const keyboard = new InlineKeyboard();

  const sourceIcons: Record<string, string> = {
    telegram_voice: "🎤",
    telegram_audio: "🎧",
    telegram_document: "📄",
    telegram_video_note: "🎥",
    google_drive: "☁️",
    yandex_disk: "☁️",
    external: "🔗",
    telegram_video: "🎬",
    telegram_video_document: "🎞️",
  };

  files.slice(0, 20).forEach((file, index) => {
    const icon = sourceIcons[file.source_type] ?? "📎";

    const label = file.label?.trim()
      || `Файл ${index + 1}`;

    const shortLabel = label.length > 35
      ? label.slice(0, 35) + "..."
      : label;

    // Кнопка получения файла
    const primaryMark = file.is_primary === 1
      ? "⭐ "
      : "";

    keyboard.text(
      `${primaryMark}${icon} ${shortLabel}`,
      `file_open:${demoId}:${file.id}`
    );

    // Удаление только для администратора

    if (canManage) {
      // Переименование файла
      keyboard.text(
        "⭐",
        `file_primary:${demoId}:${file.id}`
      );

      keyboard.text(
        "✏️",
        `file_label:${demoId}:${file.id}`
      );

      // Удаление файла
      keyboard.text(
        "🗑",
        `file_delete:${demoId}:${file.id}`
      );
    }


    keyboard.row();
  });

  return keyboard
    .text(
      hasReturnTo
        ? "↩️ К предыдущим результатам"
        : "📁 К списку демок",
      hasReturnTo
        ? "return_to_results"
        : "menu_list"
    )
    .row()
    .text("🏠 Главное меню", "menu_home");
};


export const attachmentResultKeyboard = (
  demoId: number
) =>
  new InlineKeyboard()
    .text("📎 Все файлы", `demo_files:${demoId}`)
    .row()
    .text("➕ Прикрепить ещё", `demo_attach:${demoId}`)
    .row()
    .text("🏠 Главное меню", "menu_home");


type ArchiveDemoItem = {
  id: number;
  title: string;
};

export const archivePageKeyboard = (
  demos: ArchiveDemoItem[],
  page: number,
  totalPages: number
) => {
  const keyboard = new InlineKeyboard();

  // Кнопки открытия демок
  for (const demo of demos) {
    const title = demo.title.length > 40
      ? demo.title.slice(0, 40) + "..."
      : demo.title;

    keyboard
      .text(
        `🎵 #${demo.id} — ${title}`,
        `demo_open:${demo.id}:archive:${page}`
      )
      .row();
  }

  // Навигация между страницами
  if (page > 0) {
    keyboard.text(
      "◀️ Назад",
      `archive_page:${page - 1}`
    );
  }

  if (page < totalPages - 1) {
    keyboard.text(
      "Вперёд ▶️",
      `archive_page:${page + 1}`
    );
  }

  if (totalPages > 1) {
    keyboard.row();
  }

  // Главное меню
  keyboard.text(
    "🏠 Главное меню",
    "menu_home"
  );

  return keyboard;
};









