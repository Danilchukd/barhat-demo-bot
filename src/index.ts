import "dotenv/config";

import { Bot, session } from "grammy";
import { HttpsProxyAgent } from "https-proxy-agent";

import { accessMiddleware } from "./bot/access.js";
import { registerCommands } from "./bot/commands.js";
import { registerCallbacks } from "./bot/callbacks.js";
import { registerMessages } from "./bot/messages.js";
import { initialSession, type MyContext } from "./bot/session.js";
import { getThreadId } from "./bot/forum.js";


const token = process.env.BOT_TOKEN;
const proxyUrl = process.env.PROXY_URL?.trim();

if (!token) {
  throw new Error("BOT_TOKEN не найден в .env");
}

// Если PROXY_URL указан, используем прокси.
// Иначе подключаемся к Telegram напрямую.
const bot = new Bot<MyContext>(token, {
  client: {
    baseFetchConfig: {
      ...(proxyUrl
        ? { agent: new HttpsProxyAgent(proxyUrl) }
        : {}),
      compress: true,
    },
  },
});

// Сначала проверяем права пользователя
bot.use(accessMiddleware);

bot.use(
  session({
    initial: initialSession,
    getSessionKey: (ctx) => {
      if (!ctx.chat || !ctx.from) {
        return undefined;
      }
      const thread = ctx.chat.type === "supergroup" ? `:${getThreadId(ctx) ?? 0}` : "";
      return `${ctx.chat.id}:${ctx.from.id}${thread}`;
    },
  })
);

// Порядок важен: сообщения регистрируем ПОСЛЕ команд.
registerCommands(bot);
registerCallbacks(bot);
registerMessages(bot);


bot.catch((botError) => {
  const error = botError.error;

  if (error instanceof Error) {
    console.error(
      "Ошибка бота:",
      error.name,
      error.message
    );
  } else {
    console.error(
      "Ошибка бота: неизвестная ошибка"
    );
  }
});


console.log(
  proxyUrl
    ? "Подключаемся к Telegram через прокси..."
    : "Подключаемся к Telegram напрямую..."
);

bot.start({
  onStart: (botInfo) => {
    console.log(`Бот успешно запущен: @${botInfo.username}`);
  },
}).catch((error) => {
  console.error("Ошибка подключения:", error);
});
