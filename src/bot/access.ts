
import type { MiddlewareFn } from "grammy";
import type { MyContext } from "./session.js";

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
    ctx.chat?.type === "private" &&
    getUserRole(ctx.from?.id) === "admin"
  );
}

// Общая проверка доступа к боту
export const accessMiddleware: MiddlewareFn<MyContext> =
  async (ctx, next) => {

    // Групповые чаты подключим на отдельном этапе
    if (ctx.chat?.type !== "private") {
      if (ctx.message?.text?.startsWith("/start")) {
        await ctx.reply(
          "🎸 BARHAT Demo Archive пока работает " +
          "только в личных сообщениях с ботом."
        );
      }

      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({
          text: "Открой бота в личном чате",
          show_alert: true,
        });
      }

      return;
    }

    // Команда /myid доступна всем:
    // она нужна для получения Telegram ID
    const messageText = ctx.message?.text ?? "";

    if (
      /^\/myid(?:@[a-zA-Z0-9_]+)?(?:\s|$)/i.test(messageText)
    ) {
      await next();
      return;
    }

    const role = getUserRole(ctx.from?.id);

    // Неизвестный пользователь
    if (role === "none") {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({
          text: "⛔ Нет доступа к архиву BARHAT",
          show_alert: true,
        });
      } else if (ctx.message) {
        await ctx.reply(
          "⛔ Доступ к BARHAT Demo Archive закрыт.\n\n" +
          "Для получения доступа обратись " +
          "к администратору группы.\n\n" +
          "Узнать свой Telegram ID: /myid"
        );
      }

      return;
    }

    // Пользователь авторизован
    await next();
  };
