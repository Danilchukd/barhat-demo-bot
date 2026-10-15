import type { Bot } from "grammy";
import {
  getSourceType,
  saveDemo,
  saveTelegramDemo,
  searchDemos,
  getDemoById,
  updateDemoProperties,
  updateDemoTitle,
  addAttachmentToDemo,
  getDemoAttachmentById,
  updateDemoAttachmentLabel,
  type TelegramFileType,
} from "../db/demoRepository.js";
import {
  mainKeyboard,
  demoListKeyboard,
  attachmentResultKeyboard,
} from "./keyboards.js";
import { initialSession, type MyContext } from "./session.js";
import { demoPropertiesKeyboard } from "./keyboards.js";
import { canEditDemo } from "./access.js";

export function registerMessages(bot: Bot<MyContext>): void {
  // Важно: регистрировать ПОСЛЕ registerCommands и registerCallbacks.
  bot.on("message:text", async (ctx, next) => {
    if (ctx.chat.type !== "private") {
      await next();
      return;
    }

    const text = ctx.message.text.trim();
    const { step } = ctx.session;

    if (step === "idle" || text.startsWith("/")) {
      await next();
      return;
    }

    
// Изменение названия вложения
if (step === "edit_attachment_label") {
  if (!canEditDemo(ctx)) {
    ctx.session = initialSession();
    await ctx.reply("⛔ Нет прав на редактирование.");
    return;
  }

  const demoId = ctx.session.editAttachmentDemoId;
  const attachmentId = ctx.session.editAttachmentId;

  if (
    demoId === undefined ||
    attachmentId === undefined ||
    !Number.isSafeInteger(demoId) ||
    !Number.isSafeInteger(attachmentId) ||
    demoId <= 0 ||
    attachmentId <= 0
  ) {
    ctx.session = initialSession();
    await ctx.reply("Ошибка: вложение не выбрано.");
    return;
  }

  // Символ "-" очищает название
  const newLabel = text === "-" ? null : text;

  if (
    newLabel !== null &&
    (newLabel.length === 0 || newLabel.length > 80)
  ) {
    await ctx.reply(
      "Название должно содержать от 1 до 80 символов."
    );
    return;
  }

  const file = getDemoAttachmentById(
    demoId,
    attachmentId
  );

  if (!file) {
    ctx.session = initialSession();
    await ctx.reply("❌ Вложение не найдено.");
    return;
  }

  if ((file.label ?? null) === newLabel) {
    await ctx.reply(
      "Это название уже установлено.\n" +
      "Отправь другое название или нажми «Отмена»."
    );
    return;
  }

  const updated = updateDemoAttachmentLabel(
    demoId,
    attachmentId,
    newLabel
  );

  ctx.session = initialSession();

  if (!updated) {
    await ctx.reply(
      "❌ Не удалось изменить название файла."
    );
    return;
  }

  await ctx.reply(
    `✅ Название вложения изменено!\n\n` +
    `Демка: #${demoId}\n` +
    `Файл: #${attachmentId}\n\n` +
    `📎 ${newLabel ?? "Без названия"}`,
    {
      reply_markup: attachmentResultKeyboard(demoId),
    }
  );

  return;
}

    // Прикрепление ссылки к существующей демке
    if (step === "attach_source") {
      const demoId = ctx.session.attachDemoId;

      if (!demoId) {
        ctx.session = initialSession();
        await ctx.reply("Ошибка: демка не выбрана.");
        return;
      }

      let parsedUrl: URL;

      try {
        parsedUrl = new URL(text);

        if (
          !["http:", "https:"].includes(parsedUrl.protocol) ||
          text.length > 2048
        ) {
          throw new Error("Invalid URL");
        }
      } catch {
        await ctx.reply(
          "❌ Некорректная ссылка.\n" +
          "Отправь обычную HTTP/HTTPS-ссылку."
        );
        return;
      }

      const result = addAttachmentToDemo(demoId, {
        kind: "link",
        url: text,
        sourceType: getSourceType(parsedUrl),
      });

      if (result === "duplicate") {
        await ctx.reply(
          "⚠️ Такая ссылка уже прикреплена к этой демке.\n" +
          "Отправь другой файл или нажми «Отмена»."
        );
        return;
      }

      if (result === "not_found") {
        ctx.session = initialSession();
        await ctx.reply("❌ Демка не найдена.");
        return;
      }

      ctx.session = initialSession();

      await ctx.reply(
        `✅ Файл прикреплён к демке #${demoId}!\n\n` +
        "Источник: ссылка\n\n" +
        "Новая демка не создавалась.",
        {
          reply_markup: attachmentResultKeyboard(demoId),
        }
      );

      return;
    }

    // Переименование существующей демки
    if (step === "edit_title") {
      if (!canEditDemo(ctx)) {
        ctx.session = initialSession();
        await ctx.reply("⛔ Нет прав на редактирование.");
        return;
      }

      const demoId = ctx.session.editDemoId;

      if (
        demoId === undefined ||
        !Number.isSafeInteger(demoId) ||
        demoId <= 0
      ) {
        ctx.session = initialSession();
        await ctx.reply("Ошибка: демка не выбрана.");
        return;
      }

      const newTitle = text.trim();

      // Проверяем новое название
      if (!newTitle || newTitle.length > 150) {
        await ctx.reply(
          "Название должно содержать от 1 до 150 символов."
        );
        return;
      }

      const demo = getDemoById(demoId);

      if (!demo) {
        ctx.session = initialSession();
        await ctx.reply("❌ Демка не найдена.");
        return;
      }

      // Не обновляем запись без необходимости
      if (demo.title === newTitle) {
        await ctx.reply(
          "Это название уже используется для данной демки.\n" +
          "Введи другое название."
        );
        return;
      }

      // Сохраняем название
      const updated = updateDemoTitle(demoId, newTitle);

      ctx.session = initialSession();

      if (!updated) {
        await ctx.reply("❌ Не удалось изменить название.");
        return;
      }

      await ctx.reply(
        `✅ Название демки #${demoId} изменено!\n\n` +
        `🎵 ${newTitle}`,
        {
          reply_markup: demoPropertiesKeyboard(demoId),
        }
      );

      return;
    }



    if (step === "edit_description") {
      if (!canEditDemo(ctx)) {
        ctx.session = initialSession();
        await ctx.reply("⛔ Нет прав на редактирование.");
        return;
      }

      const demoId = ctx.session.editDemoId;

      if (!demoId) {
        ctx.session = initialSession();
        await ctx.reply("Ошибка: не выбрана демка.");
        return;
      }

      if (text.length > 500 || text.length === 0) {
        await ctx.reply(
          "Описание должно содержать до 500 символов."
        );
        return;
      }

      const demo = getDemoById(demoId);

      if (!demo) {
        ctx.session = initialSession();
        await ctx.reply("Демка не найдена.");
        return;
      }

      const description = text === "-" ? null : text;

      updateDemoProperties(demoId, {
        description,
        ideaType: demo.idea_type,
      });

      ctx.session = initialSession();

      await ctx.reply(
        `✅ Описание демки #${demoId} обновлено!\n\n` +
        `📝 ${description ?? "Описание удалено"}`,
        {
          reply_markup: demoPropertiesKeyboard(demoId),
        }
      );

      return;
    }



    // Обработка поискового запроса
    if (step === "search") {
      if (text.length < 2 || text.length > 80) {
        await ctx.reply(
          "Введи от 2 до 80 символов для поиска."
        );
        return;
      }

      // Получаем подходящие демки
      const demos = searchDemos(text);

      // Завершаем режим поиска
      ctx.session = initialSession();

      // Совпадений нет
      if (demos.length === 0) {
        await ctx.reply(
          `🔎 По запросу «${text}» ничего не найдено.\n\n` +
          "Попробуй другое название.",
          {
            reply_markup: demoListKeyboard([]),
          }
        );
        return;
      }

      // Формируем сообщение с результатами
      const message =
        `🔎 Результаты поиска: «${text}»\n\n` +
        `Показано демок: ${demos.length}\n\n` +
        "Выбери демку для прослушивания:";

      await ctx.reply(message, {
        reply_markup: demoListKeyboard(demos),
      });

      return;
    }


    if (step === "title") {
      if (!text || text.length > 150) {
        await ctx.reply("Название должно содержать от 1 до 150 символов.");
        return;
      }

      ctx.session.title = text;
      ctx.session.step = "source";

      await ctx.reply(
        `🎵 Название: ${text}\n\n` +
        "Теперь отправь демку одним из способов:\n\n" +
        "🔗 Ссылкой на Google Drive или Яндекс Диск\n" +
        "🎤 Голосовым сообщением\n" +
        "🎧 Аудиофайлом\n" +
        "🎥 Кружком Telegram\n\n" +
        "Можно также переслать существующее сообщение."
      );
      return;
    }

    if (step === "source") {
      let parsedUrl: URL;

      try {
        parsedUrl = new URL(text);
        if (!["http:", "https:"].includes(parsedUrl.protocol) || text.length > 2048) {
          throw new Error("Invalid URL");
        }
      } catch {
        await ctx.reply("❌ Некорректная ссылка.\nОтправь обычную HTTP/HTTPS-ссылку.");
        return;
      }

      const title = ctx.session.title;
      const sourceType = getSourceType(parsedUrl);
      const demoId = saveDemo(title, text, sourceType);
      ctx.session = initialSession();

      await ctx.reply(
        `✅ Демка успешно добавлена!\n\n` +
        `ID: ${demoId}\n` +
        `Название: ${title}\n` +
        `Источник: ${sourceType}`,
        { reply_markup: mainKeyboard(ctx) }
      );
    }
  });

  // Вложения: голосовые, аудио и документы с аудиофайлом.

  bot.on("message", async (ctx) => {
    if (ctx.chat.type !== "private") {
      return;
    }

    const step = ctx.session.step;

    if (
      step !== "source" &&
      step !== "attach_source"
    ) {
      return;
    }

    // Текстовые сообщения обрабатываются выше
    if (ctx.message.text) {
      return;
    }

    let fileId: string;
    let fileUniqueId: string;
    let sourceType: TelegramFileType;

    // Голосовое сообщение
    if (ctx.message.voice) {
      fileId = ctx.message.voice.file_id;
      fileUniqueId = ctx.message.voice.file_unique_id;
      sourceType = "telegram_voice";
    }

    // Кружок Telegram
    else if (ctx.message.video_note) {
      fileId = ctx.message.video_note.file_id;
      fileUniqueId = ctx.message.video_note.file_unique_id;
      sourceType = "telegram_video_note";
    }

    // Аудиофайл
    else if (ctx.message.audio) {
      fileId = ctx.message.audio.file_id;
      fileUniqueId = ctx.message.audio.file_unique_id;
      sourceType = "telegram_audio";
    }

    // Аудио, отправленное как документ
    else if (ctx.message.document) {
      const document = ctx.message.document;

      const mimeType = document.mime_type ?? "";
      const fileName = document.file_name ?? "";

      const isAudio =
        mimeType.startsWith("audio/") ||
        /\.(mp3|wav|flac|ogg|m4a|aac|opus)$/i.test(
          fileName
        );

      if (!isAudio) {
        await ctx.reply(
          "❌ Этот документ не похож на аудиофайл."
        );
        return;
      }

      fileId = document.file_id;
      fileUniqueId = document.file_unique_id;
      sourceType = "telegram_document";
    }

    else {
      await ctx.reply(
        "Отправь голосовое, кружок, аудиофайл " +
        "или ссылку."
      );
      return;
    }

    // Прикрепление к существующей демке
    if (step === "attach_source") {
      const demoId = ctx.session.attachDemoId;

      if (!demoId) {
        ctx.session = initialSession();
        await ctx.reply("Ошибка: демка не выбрана.");
        return;
      }

      const result = addAttachmentToDemo(demoId, {
        kind: "telegram",
        fileId,
        fileUniqueId,
        sourceType,
      });

      if (result === "duplicate") {
        await ctx.reply(
          "⚠️ Этот файл уже прикреплён к демке.\n" +
          "Отправь другой файл или нажми «Отмена»."
        );
        return;
      }

      if (result === "not_found") {
        ctx.session = initialSession();
        await ctx.reply("❌ Демка не найдена.");
        return;
      }

      ctx.session = initialSession();

      await ctx.reply(
        `✅ Файл прикреплён к демке #${demoId}!\n\n` +
        `Источник: Telegram\n\n` +
        "Все предыдущие вложения сохранены.",
        {
          reply_markup: attachmentResultKeyboard(demoId),
        }
      );

      return;
    }

    // Обычное создание новой демки
    const title = ctx.session.title;

    const demoId = saveTelegramDemo(
      title,
      fileId,
      sourceType
    );

    ctx.session = initialSession();

    await ctx.reply(
      `✅ Демка сохранена!\n\n` +
      `ID: ${demoId}\n` +
      `Название: ${title}\n` +
      `Источник: Telegram\n\n` +
      `Для прослушивания: /demo ${demoId}`,
      {
        reply_markup: mainKeyboard(ctx),
      }
    );
  });

}
