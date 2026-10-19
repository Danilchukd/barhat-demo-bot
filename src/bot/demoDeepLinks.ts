// Универсальная ссылка открывает демку в личном чате с нужным ботом.
// Для тестового бота передавай его username, а не username рабочего бота.
export function buildDemoDeepLink(demoId: number, botUsername: string): string {
  if (!Number.isSafeInteger(demoId) || demoId <= 0) {
    throw new Error("Некорректный ID демки");
  }

  const username = botUsername.trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9_]{5,32}$/.test(username)) {
    throw new Error("Некорректный username Telegram-бота");
  }

  return `https://t.me/${username}?start=demo_${demoId}`;
}

export function parseDemoStartPayload(payload: string): number | null {
  const match = /^demo_([1-9]\d*)$/.exec(payload.trim());
  if (!match) return null;

  const demoId = Number(match[1]);
  return Number.isSafeInteger(demoId) ? demoId : null;
}
