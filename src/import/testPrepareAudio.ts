
import "dotenv/config";

import { prepareAudioForTelegram }
  from "./audio/prepareAudio.js";

// Можно передать путь аргументом,
// по умолчанию — скачанный WAV с Яндекс Диска
const inputPath =
  process.argv[2] ??
  "data/imports/downloads/yandex-test-12.wav";

async function main() {
  console.log("🎵 BARHAT Audio Preparation\n");

  console.log("Исходный файл:", inputPath);

  const result = await prepareAudioForTelegram(
    inputPath
  );

  console.log("\n✅ Подготовка завершена!\n");

  console.log("Исходный размер:",
    (result.originalSize / 1024 / 1024).toFixed(2),
    "МиБ"
  );

  console.log("Готовый размер:",
    (result.uploadSize / 1024 / 1024).toFixed(2),
    "МиБ"
  );

  console.log(
    "Конвертация:",
    result.converted ? "Да" : "Не требуется"
  );

  console.log(
    "\n📁 Файл для Telegram:",
    result.uploadPath
  );
}

main().catch((error: unknown) => {
  console.error(
    "❌ Ошибка:",
    error instanceof Error
      ? error.message
      : String(error)
  );

  process.exitCode = 1;
});
