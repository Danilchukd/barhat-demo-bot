import type { Bot } from "grammy";
import {
  countDemos,
  getRecentDemos,
  getSourceType,
  saveDemo,
  getDemoAttachments,
  getDemoById,
} from "../db/demoRepository.js";
import {
  mainKeyboard,
  demoListKeyboard,
} from "./keyboards.js";
import { initialSession, type MyContext } from "./session.js";
import { sendDemo } from "./sendDemo.js";
import { buildArchiveView } from "./archiveView.js";

export function registerCommands(bot: Bot<MyContext>): void {
  bot.command("start", async (ctx) => {
    if (ctx.chat.type === "private") {
      ctx.session = initialSession();
    }

    await ctx.reply(
      "Джон Бархат на связи\n\n" +
        "Здесь можно находить и сохранять музыкальные идеи группы.\n\n" +
        "Выбери действие:",
      { reply_markup: mainKeyboard(ctx) }
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
  const view = buildArchiveView(0);

  await ctx.reply(view.text, {
    reply_markup: view.keyboard,
  });
});

bot.command("demo", async (ctx) => {
  const demoId = Number(ctx.match.trim());

  if (!Number.isSafeInteger(demoId) || demoId <= 0) {
    await ctx.reply("Использование: /demo ID");
    return;
  }

  ctx.session.returnTo = undefined;
  await sendDemo(ctx, demoId);
});


bot.command("files", async (ctx) => {
  const demoId = Number(ctx.match.trim());

  if (!Number.isSafeInteger(demoId) || demoId <= 0) {
    await ctx.reply("Использование: /files ID");
    return;
  }

  const demo = getDemoById(demoId);

  if (!demo) {
    await ctx.reply("❌ Демка не найдена.");
    return;
  }

  const files = getDemoAttachments(demoId);

  if (files.length === 0) {
    await ctx.reply("У демки нет прикреплённых файлов.");
    return;
  }

  const sourceLabels: Record<string, string> = {
    telegram_voice: "🎤 Голосовое",
    telegram_audio: "🎧 Аудио",
    telegram_document: "📄 Документ",
    telegram_video_note: "🎥 Кружок",
    google_drive: "☁️ Google Drive",
    yandex_disk: "☁️ Яндекс Диск",
    external: "🔗 Внешняя ссылка",
    telegram_video: "🎬 Видео",
    telegram_video_document: "🎞️ Видеодокумент",
  };

  const lines = files.slice(0, 20).map((file, index) => {
    const source =
      sourceLabels[file.source_type] ?? file.source_type;

    const label = file.label ?? `Файл ${index + 1}`;

    return `${index + 1}. ${label}\n${source} • ID файла: ${file.id}`;
  });

  await ctx.reply(
    `📎 Файлы демки #${demoId}\n` +
    `🎵 ${demo.title}\n\n` +
    `Всего файлов: ${files.length}\n\n` +
    lines.join("\n\n") +
    (files.length > 20 ? "\n\nПоказаны первые 20 файлов." : "")
  );
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
