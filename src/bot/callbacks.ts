import { InlineKeyboard, type Bot } from "grammy";
import { countDemos, getRecentDemos } from "../db/demoRepository.js";
import {
  backKeyboard,
  cancelKeyboard,
  mainKeyboard,
  demoListKeyboard,
  searchMenuKeyboard,
  ideaTypeFilterKeyboard,
} from "./keyboards.js";
import { initialSession, type MyContext } from "./session.js";
import { sendDemo } from "./sendDemo.js";
import {
  getDemoById,
  updateDemoProperties,
  getDemosByType,
  DEMO_TYPE_LABELS,
  type DemoType,
} from "../db/demoRepository.js";

import { demoPropertiesKeyboard } from "./keyboards.js";
import { canEditDemo } from "./access.js";


function getPropertiesText(demoId: number): string {
  const demo = getDemoById(demoId);

  if (!demo) {
    return "❌ Демка не найдена.";
  }

  const typeName = demo.idea_type
    ? DEMO_TYPE_LABELS[demo.idea_type]
    : "Не указан";

  return (
    `🎵 #${demoId} — ${demo.title}\n\n` +
    `🎼 Тип: ${typeName}\n\n` +
    `📝 Описание: ${demo.description || "Не указано"}\n\n` +
    "Выбери свойство, которое хочешь изменить:"
  );
}

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


  // Поиск демок
  bot.callbackQuery("menu_search", async (ctx) => {
    await ctx.answerCallbackQuery();

    if (ctx.chat?.type !== "private") {
      await ctx.reply(
        "Поиск пока доступен в личном чате с ботом."
      );
      return;
    }

    ctx.session = initialSession();

    const message =
      "🔎 Поиск демок BARHAT\n\n" +
      "Как будем искать демки?";

    const keyboard = searchMenuKeyboard();

    const callbackMessage = ctx.callbackQuery.message;

    if (callbackMessage && "text" in callbackMessage) {
      await ctx.editMessageText(message, {
        reply_markup: keyboard,
      });
    } else {
      await ctx.reply(message, {
        reply_markup: keyboard,
      });
    }
  });

bot.callbackQuery("search_text", async (ctx) => {
  await ctx.answerCallbackQuery();

  if (ctx.chat?.type !== "private") {
    await ctx.reply(
      "Поиск доступен в личном чате с ботом."
    );
    return;
  }

  ctx.session = {
    step: "search",
    title: "",
  };

  const message =
    "🔤 Поиск по названию и описанию\n\n" +
    "Введи название или часть описания демки:";

  const callbackMessage = ctx.callbackQuery.message;

  if (callbackMessage && "text" in callbackMessage) {
    await ctx.editMessageText(message, {
      reply_markup: cancelKeyboard(),
    });
  } else {
    await ctx.reply(message, {
      reply_markup: cancelKeyboard(),
    });
  }
});


bot.callbackQuery("search_types", async (ctx) => {
  await ctx.answerCallbackQuery();

  if (ctx.chat?.type !== "private") {
    await ctx.reply(
      "Поиск доступен в личном чате с ботом."
    );
    return;
  }

  ctx.session = initialSession();

  const message =
    "🎼 Поиск по типу идеи\n\n" +
    "Выбери интересующую категорию:";

  const keyboard = ideaTypeFilterKeyboard();

  const callbackMessage = ctx.callbackQuery.message;

  if (callbackMessage && "text" in callbackMessage) {
    await ctx.editMessageText(message, {
      reply_markup: keyboard,
    });
  } else {
    await ctx.reply(message, {
      reply_markup: keyboard,
    });
  }
});


bot.callbackQuery(
  /^filter_type:(riff|vocal|song_sketch|full_demo|other|none)$/,
  async (ctx) => {
    await ctx.answerCallbackQuery();

    if (ctx.chat?.type !== "private") {
      await ctx.reply(
        "Поиск доступен в личном чате с ботом."
      );
      return;
    }

    ctx.session = initialSession();

    const rawType = ctx.match[1] as DemoType | "none";

    const ideaType: DemoType | null =
      rawType === "none" ? null : rawType;

    // Получаем демки нужного типа
    const demos = getDemosByType(ideaType);

    const typeName = ideaType === null
      ? "Без типа"
      : DEMO_TYPE_LABELS[ideaType];

    const message = demos.length === 0
      ? `🎼 Тип: ${typeName}\n\n` +
        "Демок с таким типом пока нет."
      : `🎼 Тип: ${typeName}\n\n` +
        `Показано демок: ${demos.length}\n\n` +
        "Выбери демку для прослушивания:";

    const keyboard = demoListKeyboard(
      demos,
      "type"
    );

    const callbackMessage = ctx.callbackQuery.message;

    if (callbackMessage && "text" in callbackMessage) {
      await ctx.editMessageText(message, {
        reply_markup: keyboard,
      });
    } else {
      await ctx.reply(message, {
        reply_markup: keyboard,
      });
    }
  }
);

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
      "Действие отменено.\n\nВыбери следующее действие:",
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


  bot.callbackQuery(/^demo_edit:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();

    if (!canEditDemo(ctx)) {
      await ctx.reply("⛔ У тебя нет прав на редактирование.");
      return;
    }

    const demoId = Number(ctx.match[1]);

    if (!Number.isSafeInteger(demoId) || demoId <= 0) {
      await ctx.reply("Некорректный ID демки.");
      return;
    }

    if (!getDemoById(demoId)) {
      await ctx.reply("Демка не найдена.");
      return;
    }

    ctx.session = initialSession();

    // Отправляем отдельное сообщение,
    // чтобы не заменять исходное аудио.
    await ctx.reply(getPropertiesText(demoId), {
      reply_markup: demoPropertiesKeyboard(demoId),
    });
  });


  bot.callbackQuery(
    /^prop_type:(\d+):(riff|vocal|song_sketch|full_demo|other|none)$/,
    async (ctx) => {
      if (!canEditDemo(ctx)) {
        await ctx.answerCallbackQuery({
          text: "Нет прав на редактирование",
          show_alert: true,
        });
        return;
      }

      const demoId = Number(ctx.match[1]);
      const rawType = ctx.match[2];

      if (!Number.isSafeInteger(demoId) || demoId <= 0) {
        await ctx.answerCallbackQuery({
          text: "Некорректный ID",
        });
        return;
      }

      const demo = getDemoById(demoId);

      if (!demo) {
        await ctx.answerCallbackQuery({
          text: "Демка не найдена",
        });
        return;
      }

      const ideaType: DemoType | null =
        rawType === "none" ? null : rawType as DemoType;

      if (demo.idea_type === ideaType) {
        await ctx.answerCallbackQuery({
          text: "Этот тип уже выбран",
        });
        return;
      }

      await ctx.answerCallbackQuery();

      // Сохраняем существующее описание
      updateDemoProperties(demoId, {
        description: demo.description,
        ideaType,
      });

      await ctx.editMessageText(
        getPropertiesText(demoId),
        {
          reply_markup: demoPropertiesKeyboard(demoId),
        }
      );
    }
  );


  bot.callbackQuery(/^prop_desc:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();

    if (!canEditDemo(ctx)) {
      await ctx.reply("⛔ У тебя нет прав на редактирование.");
      return;
    }

    const demoId = Number(ctx.match[1]);

    if (!Number.isSafeInteger(demoId) ||
      demoId <= 0 ||
      !getDemoById(demoId)) {
      await ctx.reply("Демка не найдена.");
      return;
    }

    ctx.session = {
      step: "edit_description",
      title: "",
      editDemoId: demoId,
    };

    await ctx.editMessageText(
      `📝 Описание демки #${demoId}\n\n` +
      "Отправь новое описание (до 500 символов).\n\n" +
      "Отправь один символ «-», чтобы очистить описание.",
      {
        reply_markup: new InlineKeyboard()
          .text("❌ Отмена", `demo_edit:${demoId}`),
      }
    );
  });

}
