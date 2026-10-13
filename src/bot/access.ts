
import type { MyContext } from "./session.js";

export function canEditDemo(ctx: MyContext): boolean {
  const editorId = process.env.EDITOR_TELEGRAM_ID;

  return (
    ctx.chat?.type === "private" &&
    editorId !== undefined &&
    String(ctx.from?.id) === editorId.trim()
  );
}
