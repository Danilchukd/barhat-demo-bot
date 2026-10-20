
import type { MiddlewareFn } from "grammy";
import type { MyContext } from "./session.js";
import { isArchiveContext } from "./forum.js";
import { replyInTopic } from "./topicReply.js";

// Роли пользователей
export type UserRole = "admin" | "member" | "none";

// ID администратора
const adminId = process.env.EDITOR_TELEGRAM_ID?.trim();

if (!adminId || !/^\d+$/.test(adminId)) {
  throw new Error(
    "Укажи корректный EDITOR_TELEGRAM_ID в .env"
  );
}

// Список участников BARHAT
const memberIds = (
  process.env.ALLOWED_TELEGRAM_IDS ?? ""
)
  .split(/[,\s;]+/)
  .map((id) => id.trim())
  .filter(Boolean);

if (memberIds.some((id) => !/^\d+$/.test(id))) {
  throw new Error(
    "Некорректный ALLOWED_TELEGRAM_IDS в .env"
  );
}

const allowedMembers = new Set(memberIds);

// Определяем роль пользователя
export function getUserRole(
  userId: number | undefined
): UserRole {
  if (userId === undefined) {
    return "none";
  }

  const id = String(userId);

  if (id === adminId) {
    return "admin";
  }

  if (allowedMembers.has(id)) {
    return "member";
  }

  return "none";
}

// Проверка прав на редактирование
export function canEditDemo(
  ctx: MyContext
): boolean {
  return (
    isArchiveContext(ctx) &&
    getUserRole(ctx.from?.id) === "admin"
  );
}

// Общая проверка доступа. Всё вне разрешённого топика игнорируем.
export const accessMiddleware: MiddlewareFn<MyContext> =
  async (ctx, next) => {
    const command = ctx.message?.text ?? "";

    // Диагностика ID для настройки топика: доступна только админу
    // в любой супергруппе, даже пока топик ещё не подключён.
    if (
      ctx.chat?.type === "supergroup" &&
      /^\/topicid(?:@[a-zA-Z0-9_]+)?(?:\s|$)/i.test(command)
    ) {
      if (getUserRole(ctx.from?.id) === "admin") {
        await next();
      }
      return;
    }

    if (!isArchiveContext(ctx)) return;

    // Пользователь может узнать ID до включения в allowlist.
    if (/^\/myid(?:@[a-zA-Z0-9_]+)?(?:\s|$)/i.test(command)) {
      await next();
      return;
    }

    const role = getUserRole(ctx.from?.id);

    if (role === "none") {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({
          text: "⛔ Нет доступа к архиву BARHAT",
          show_alert: true,
        });
      } else if (ctx.message && /^\/[a-z]/i.test(command)) {
        // Не отвечаем на каждое обычное сообщение в группе.
        await replyInTopic(
          ctx,
          "⛔ Доступ к BARHAT Demo Archive закрыт.\n\n" +
          "Обратись к администратору. Telegram ID: /myid"
        );
      }
      return;
    }

    await next();
  };
