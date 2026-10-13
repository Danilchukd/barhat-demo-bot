import type { Bot } from "grammy";
import {
  getSourceType,
  saveDemo,
  saveTelegramDemo,
  searchDemos,
  getDemoById,
  updateDemoProperties,
  type TelegramFileType,
} from "../db/demoRepository.js";
import {
  mainKeyboard,
  demoListKeyboard,
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
        "🎧 Аудиофайлом\n\n" +
        "Можно переслать существующее сообщение из Telegram."
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
        { reply_markup: mainKeyboard() }
      );
    }
  });

  // Вложения: голосовые, аудио и документы с аудиофайлом.
  bot.on("message", async (ctx) => {
    if (ctx.chat.type !== "private" || ctx.session.step !== "source") {
      return;
    }

    let fileId: string;
    let sourceType: TelegramFileType;

    if (ctx.message.voice) {
      fileId = ctx.message.voice.file_id;
      sourceType = "telegram_voice";
    } else if (ctx.message.audio) {
      fileId = ctx.message.audio.file_id;
      sourceType = "telegram_audio";
    } else if (ctx.message.document) {
      const document = ctx.message.document;
      const mimeType = document.mime_type ?? "";
      const fileName = document.file_name ?? "";
      const isAudio =
        mimeType.startsWith("audio/") ||
        /\.(mp3|wav|flac|ogg|m4a|aac|opus)$/i.test(fileName);

      if (!isAudio) {
        await ctx.reply("❌ Этот документ не похож на аудиофайл.");
        return;
      }

      fileId = document.file_id;
      sourceType = "telegram_document";
    } else {
      await ctx.reply("Отправь ссылку, голосовое сообщение или аудиофайл.");
      return;
    }

    const title = ctx.session.title;
    const demoId = saveTelegramDemo(title, fileId, sourceType);
    ctx.session = initialSession();

    await ctx.reply(
      `✅ Демка сохранена!\n\n` +
      `ID: ${demoId}\n` +
      `Название: ${title}\n` +
      `Источник: Telegram\n\n` +
      `Для прослушивания: /demo ${demoId}`,
      { reply_markup: mainKeyboard() }
    );
  });
}
