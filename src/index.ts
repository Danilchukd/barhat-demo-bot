import "dotenv/config";

import { Bot, session } from "grammy";
import { HttpsProxyAgent } from "https-proxy-agent";

import { accessMiddleware } from "./bot/access.js";
import { registerCommands } from "./bot/commands.js";
import { registerCallbacks } from "./bot/callbacks.js";
import { registerMessages } from "./bot/messages.js";
import { initialSession, type MyContext } from "./bot/session.js";

const token = process.env.BOT_TOKEN;
const proxyUrl = process.env.PROXY_URL;

if (!token) {
  throw new Error("BOT_TOKEN не найден в .env");
}

if (!proxyUrl) {
  throw new Error("PROXY_URL не найден в .env");
}

// Создаём бота с подключением через NEOvpn.
const bot = new Bot<MyContext>(token, {
  client: {
    baseFetchConfig: {
      agent: new HttpsProxyAgent(proxyUrl),
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
      return `${ctx.chat.id}:${ctx.from.id}`;
    },
  })
);

// Порядок важен: сообщения регистрируем ПОСЛЕ команд.
registerCommands(bot);
registerCallbacks(bot);
registerMessages(bot);

bot.catch((error) => {
  console.error("Ошибка бота:", error);
});

console.log("Подключаемся к Telegram через NEOvpn...");

bot.start({
  onStart: (botInfo) => {
    console.log(`Бот успешно запущен: @${botInfo.username}`);
  },
}).catch((error) => {
  console.error("Ошибка подключения:", error);
});
