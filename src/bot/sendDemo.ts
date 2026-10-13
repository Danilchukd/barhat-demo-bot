
import { getDemoById } from "../db/demoRepository.js";
import { demoViewKeyboard } from "./keyboards.js";
import type { MyContext } from "./session.js";
import {
  DEMO_TYPE_LABELS,
} from "../db/demoRepository.js";

// Отправка демки пользователю
export async function sendDemo(
  ctx: MyContext,
  demoId: number
): Promise<void> {
  const demo = getDemoById(demoId);

  if (!demo) {
    await ctx.reply("❌ Демка не найдена.");
    return;
  }

  
const lines = [
  `🎵 #${demoId} — ${demo.title}`,
];

if (demo.idea_type) {
  lines.push(
    `🎼 Тип: ${DEMO_TYPE_LABELS[demo.idea_type]}`
  );
}

if (demo.description) {
  lines.push(
    `📝 Описание: ${demo.description}`
  );
}

const caption = lines.join("\n\n");

  const keyboard = demoViewKeyboard(demoId);

  // Демка по ссылке
  if (demo.url) {
    await ctx.reply(
      `${caption}\n\n🔗 ${demo.url}`,
      {
        reply_markup: keyboard,
      }
    );
    return;
  }

  const fileId = demo.telegram_file_id;

  if (!fileId) {
    await ctx.reply("У этой демки нет файла.", {
      reply_markup: keyboard,
    });
    return;
  }

  // Демка из Telegram
  switch (demo.source_type) {
    case "telegram_voice":
      await ctx.replyWithVoice(fileId, {
        caption,
        reply_markup: keyboard,
      });
      break;

    case "telegram_audio":
      await ctx.replyWithAudio(fileId, {
        caption,
        reply_markup: keyboard,
      });
      break;

    case "telegram_document":
      await ctx.replyWithDocument(fileId, {
        caption,
        reply_markup: keyboard,
      });
      break;

    default:
      await ctx.reply(
        "Неизвестный тип файла.",
        { reply_markup: keyboard }
      );
  }
}