import type { Context } from "grammy";

// Доступ к архиву разрешён только в одном заранее выбранном топике.
// Пока оба параметра не указаны, групповой режим выключен.
const chatIdText = process.env.BARHAT_FORUM_CHAT_ID?.trim() ?? "";
const topicIdText = process.env.BARHAT_FORUM_TOPIC_ID?.trim() ?? "";

if (Boolean(chatIdText) !== Boolean(topicIdText)) {
  throw new Error(
    "Укажи оба параметра BARHAT_FORUM_CHAT_ID и BARHAT_FORUM_TOPIC_ID"
  );
}

if (
  (chatIdText && !/^-?\d+$/.test(chatIdText)) ||
  (topicIdText && !/^\d+$/.test(topicIdText))
) {
  throw new Error("Некорректный ID группы или топика BARHAT");
}

const chatId = chatIdText ? Number(chatIdText) : undefined;
const topicId = topicIdText ? Number(topicIdText) : undefined;

if (
  (chatId !== undefined && !Number.isSafeInteger(chatId)) ||
  (topicId !== undefined && (!Number.isSafeInteger(topicId) || topicId <= 0))
) {
  throw new Error("Некорректный ID группы или топика BARHAT");
}

export function getThreadId(ctx: Context): number | undefined {
  const direct = ctx.message?.message_thread_id;
  if (typeof direct === "number") return direct;

  const message = ctx.callbackQuery?.message;
  if (message && "message_thread_id" in message) {
    const id = message.message_thread_id;
    if (typeof id === "number") return id;
  }
  return undefined;
}

export function isArchiveContext(ctx: Context): boolean {
  if (ctx.chat?.type === "private") return true;

  return (
    ctx.chat?.type === "supergroup" &&
    chatId !== undefined &&
    topicId !== undefined &&
    ctx.chat.id === chatId &&
    getThreadId(ctx) === topicId
  );
}
