import {
  getDemoById,
  getDemoAttachmentById,
  DEMO_TYPE_LABELS,
} from "../db/demoRepository.js";
import { demoViewKeyboard } from "./keyboards.js";
import type { MyContext } from "./session.js";
import { replyInTopic, replyVoiceInTopic, replyAudioInTopic, replyDocumentInTopic, replyVideoInTopic, replyVideoNoteInTopic } from "./topicReply.js";

// Отправка демки пользователю
export async function sendDemo(
  ctx: MyContext,
  demoId: number,
  attachmentId?: number
): Promise<void> {
  const demo = getDemoById(demoId);

  if (!demo) {
    await replyInTopic(ctx, "❌ Демка не найдена.");
    return;
  }


  // Выбираем источник файла.
  //
  // Без attachmentId используем последний файл,
  // как делали раньше.
  //
  // С attachmentId получаем конкретное вложение.
  const file = attachmentId === undefined
    ? demo
    : getDemoAttachmentById(demoId, attachmentId);

  if (!file) {
    await replyInTopic(ctx, 
      "❌ Указанный файл не найден."
    );
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

  const keyboard = demoViewKeyboard(demoId, ctx);

  // Демка по ссылке
  if (file.url) {
    await replyInTopic(ctx, 
      `${caption}\n\n🔗 ${file.url}`,
      {
        reply_markup: keyboard,
      }
    );
    return;
  }

  const fileId = file.telegram_file_id;

  if (!fileId) {
    await replyInTopic(ctx, "У этой демки нет файла.", {
      reply_markup: keyboard,
    });
    return;
  }

  // Демка из Telegram
  switch (file.source_type) {
    case "telegram_voice":
      await replyVoiceInTopic(ctx, fileId, {
        caption,
        reply_markup: keyboard,
      });
      break;

    case "telegram_audio":
      await replyAudioInTopic(ctx, fileId, {
        caption,
        reply_markup: keyboard,
      });
      break;

    case "telegram_video_document":  
    case "telegram_document":
      await replyDocumentInTopic(ctx, fileId, {
        caption,
        reply_markup: keyboard,
      });
      break;

    case "telegram_video_note":
      // У кружков нет обычного caption
      await replyVideoNoteInTopic(ctx, fileId);

      // Отдельно отправляем название и кнопки
      await replyInTopic(ctx, caption, {
        reply_markup: keyboard,
      });

      break;

    case "telegram_video":
      await replyVideoInTopic(ctx, fileId, {
        caption,
        reply_markup: keyboard,
      });
      break;

    default:
      await replyInTopic(ctx, 
        "Неизвестный тип файла.",
        { reply_markup: keyboard }
      );
  }
}