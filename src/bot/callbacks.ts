import type { Bot } from "grammy";
import { countDemos, getRecentDemos } from "../db/demoRepository.js";
import {
  backKeyboard,
  cancelKeyboard,
  mainKeyboard,
  demoListKeyboard,
} from "./keyboards.js";
import { initialSession, type MyContext } from "./session.js";
import { sendDemo } from "./sendDemo.js";

export function registerCallbacks(bot: Bot<MyContext>): void {
  bot.callbackQuery("menu_home", async (ctx) => {
    await ctx.answerCallbackQuery();

    if (ctx.chat?.type === "private") {
      ctx.session = initialSession();
    }

    const menuText = "🎸 BARHAT Demo Archive\n\nВыбери действие:";

    // Текстовое сообщение можно заменить главным меню.
    // Голосовое, аудио и документ редактировать как текст нельзя.
    const callbackMessage = ctx.callbackQuery.message;
    if (callbackMessage && "text" in callbackMessage) {
      await ctx.editMessageText(menuText, {
        reply_markup: mainKeyboard(),
      });
    } else {
      // Сохраняем присланное аудио и отправляем меню отдельным сообщением.
      await ctx.reply(menuText, {
        reply_markup: mainKeyboard(),
      });
    }
  });

  bot.callbackQuery("menu_add", async (ctx) => {
    await ctx.answerCallbackQuery();

    if (ctx.chat?.type !== "private") {
      await ctx.reply("Добавление демок пока доступно в личном чате с ботом.");
      return;
    }

    ctx.session = { step: "title", title: "" };
    await ctx.editMessageText(
      "➕ Добавление новой демки\n\nВведи название демки:",
      { reply_markup: cancelKeyboard() }
    );
  });


bot.callbackQuery("menu_list", async (ctx) => {
  await ctx.answerCallbackQuery();

  const demos = getRecentDemos();

  const message = demos.length === 0
    ? "📁 В архиве пока нет демок."
    : "🎧 Последние демки\n\n" +
      "Выбери демку для прослушивания:";

  const keyboard = demoListKeyboard(demos);

  // Если нажали кнопку в текстовом сообщении,
  // меняем его на список демок
  const callbackMessage = ctx.callbackQuery.message;

  if (callbackMessage && "text" in callbackMessage) {
    await ctx.editMessageText(message, {
      reply_markup: keyboard,
    });
  } else {
    // Если нажали кнопку под аудио,
    // отправляем список новым сообщением
    await ctx.reply(message, {
      reply_markup: keyboard,
    });
  }
});


  bot.callbackQuery("menu_stats", async (ctx) => {
    await ctx.answerCallbackQuery();
    const total = countDemos();
    await ctx.editMessageText(
      `📊 Статистика BARHAT\n\nДемок в архиве: ${total}`,
      { reply_markup: backKeyboard() }
    );
  });

  bot.callbackQuery("menu_cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session = initialSession();
    await ctx.editMessageText(
      "Добавление демки отменено.\n\nВыбери следующее действие:",
      { reply_markup: mainKeyboard() }
    );
  });

// Выбор демки из списка
bot.callbackQuery(/^demo_open:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  // Получаем ID из callback_data
  const demoId = Number(ctx.match[1] ?? "");

  if (!Number.isSafeInteger(demoId) || demoId <= 0) {
    await ctx.reply("❌ Некорректный ID демки.");
    return;
  }

  // Отправляем выбранную демку
  await sendDemo(ctx, demoId);
});
}
