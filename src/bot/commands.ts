import type { Bot } from "grammy";
import {
  countDemos,
  getRecentDemos,
  getSourceType,
  saveDemo,
} from "../db/demoRepository.js";
import {
  mainKeyboard,
  demoListKeyboard,
} from "./keyboards.js";
import { initialSession, type MyContext } from "./session.js";
import { sendDemo } from "./sendDemo.js";

export function registerCommands(bot: Bot<MyContext>): void {
  bot.command("start", async (ctx) => {
    if (ctx.chat.type === "private") {
      ctx.session = initialSession();
    }

    await ctx.reply(
      "🎸 Добро пожаловать в архив демок BARHAT!\n\n" +
        "Здесь можно находить и сохранять музыкальные идеи группы.\n\n" +
        "Выбери действие:",
      { reply_markup: mainKeyboard() }
    );
  });

  bot.command("ping", async (ctx) => {
    await ctx.reply("BARHAT Demo Archive работает!");
  });

  bot.command("stats", async (ctx) => {
    const total = countDemos();
    await ctx.reply(`📊 Статистика BARHAT\n\nДемок в архиве: ${total}`);
  });

  bot.command("add", async (ctx) => {
    const [rawTitle, rawUrl, ...extra] = ctx.match.split("|");

    if (rawTitle === undefined || rawUrl === undefined || extra.length > 0) {
      await ctx.reply("Использование:\n/add Название | Ссылка");
      return;
    }

    const title = rawTitle.trim();
    const url = rawUrl.trim();

    if (!title || !url || title.length > 150) {
      await ctx.reply("Укажи название до 150 символов и ссылку.");
      return;
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(url);
      if (!["http:", "https:"].includes(parsedUrl.protocol) || url.length > 2048) {
        throw new Error("Invalid URL");
      }
    } catch {
      await ctx.reply("Некорректная ссылка на файл.");
      return;
    }

    const sourceType = getSourceType(parsedUrl);
    const demoId = saveDemo(title, url, sourceType);

    await ctx.reply(
      `✅ Демка добавлена!\n\n` +
        `ID: ${demoId}\n` +
        `Название: ${title}\n` +
        `Источник: ${sourceType}`
    );
  });

  bot.command("list", async (ctx) => {
    const demos = getRecentDemos();

    const message = demos.length === 0
      ? "📁 В архиве пока нет демок."
      : "🎧 Последние демки\n\n" +
      "Выбери демку для прослушивания:";

    await ctx.reply(message, {
      reply_markup: demoListKeyboard(demos),
    });
  });


bot.command("demo", async (ctx) => {
  const demoId = Number(ctx.match.trim());

  if (!Number.isSafeInteger(demoId) || demoId <= 0) {
    await ctx.reply("Использование: /demo ID");
    return;
  }

  await sendDemo(ctx, demoId);
});

bot.command("myid", async (ctx) => {
  const userId = ctx.from?.id;

  if (userId === undefined) {
    await ctx.reply("Не удалось определить Telegram ID.");
    return;
  }

  await ctx.reply(`Твой Telegram ID: ${userId}`);
});

}
