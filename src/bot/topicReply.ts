import type { MyContext } from "./session.js";
import { getThreadId } from "./forum.js";

// Telegram не всегда автоматически направляет sendMessage/sendAudio
// в исходный топик. Указываем message_thread_id явно.
function routing(ctx: MyContext) {
  const threadId = getThreadId(ctx);
  return ctx.chat?.type === "supergroup" && threadId !== undefined
    ? { message_thread_id: threadId }
    : {};
}

export function replyInTopic(
  ctx: MyContext,
  text: string,
  options?: Parameters<MyContext["reply"]>[1]
) {
  return ctx.reply(text, { ...options, ...routing(ctx) });
}

export function replyVoiceInTopic(
  ctx: MyContext,
  file: string,
  options?: Parameters<MyContext["replyWithVoice"]>[1]
) {
  return ctx.replyWithVoice(file, { ...options, ...routing(ctx) });
}

export function replyAudioInTopic(
  ctx: MyContext,
  file: string,
  options?: Parameters<MyContext["replyWithAudio"]>[1]
) {
  return ctx.replyWithAudio(file, { ...options, ...routing(ctx) });
}

export function replyDocumentInTopic(
  ctx: MyContext,
  file: string,
  options?: Parameters<MyContext["replyWithDocument"]>[1]
) {
  return ctx.replyWithDocument(file, { ...options, ...routing(ctx) });
}

export function replyVideoInTopic(
  ctx: MyContext,
  file: string,
  options?: Parameters<MyContext["replyWithVideo"]>[1]
) {
  return ctx.replyWithVideo(file, { ...options, ...routing(ctx) });
}

export function replyVideoNoteInTopic(
  ctx: MyContext,
  file: string,
  options?: Parameters<MyContext["replyWithVideoNote"]>[1]
) {
  return ctx.replyWithVideoNote(file, { ...options, ...routing(ctx) });
}
