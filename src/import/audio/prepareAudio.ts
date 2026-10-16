
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm, stat } from "node:fs/promises";
import {
  basename,
  extname,
  join,
  resolve,
} from "node:path";

const MAX_UPLOAD_SIZE = 48_000_000;

export type PreparedAudio = {
  originalPath: string;
  uploadPath: string;
  originalSize: number;
  uploadSize: number;
  converted: boolean;
};

// Запускаем FFmpeg и дожидаемся завершения

function runFFmpeg(
  inputPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const args = [
      "-hide_banner",
      "-loglevel", "error",
      "-nostdin",
      "-i", inputPath,
      "-map", "0:a:0",
      "-vn",
      "-c:a", "libmp3lame",
      "-b:a", "256k",
      "-n",
      outputPath,
    ];

    // Получаем путь к FFmpeg
    const ffmpegPath: string =
      process.env.FFMPEG_PATH || "ffmpeg";

    // Запускаем FFmpeg
    const ffmpegProcess = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });

    let errorOutput = "";

    ffmpegProcess.stderr.on("data", (chunk: Buffer) => {
      errorOutput += chunk.toString();
      errorOutput = errorOutput.slice(-8000);
    });

    ffmpegProcess.once("error", (error) => {
      reject(
        new Error(
          `Не удалось запустить FFmpeg: ${error.message}`
        )
      );
    });

    ffmpegProcess.once("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(
          new Error(
            `FFmpeg завершился с кодом ${code}.\n` +
            errorOutput
          )
        );
      }
    });
  });
}


// Готовим аудио для Telegram
export async function prepareAudioForTelegram(
  inputPath: string
): Promise<PreparedAudio> {
  const originalPath = resolve(inputPath);

  const original = await stat(originalPath);

  if (!original.isFile() || original.size === 0) {
    throw new Error("Исходный файл пустой или некорректный");
  }

  const extension = extname(originalPath).toLowerCase();

  if (![".mp3", ".wav"].includes(extension)) {
    throw new Error(
      `Формат ${extension} пока не поддерживается`
    );
  }

  // Небольшой MP3 не требует конвертации
  if (
    extension === ".mp3" &&
    original.size <= MAX_UPLOAD_SIZE
  ) {
    console.log("✅ MP3 уже подходит для Telegram");

    return {
      originalPath,
      uploadPath: originalPath,
      originalSize: original.size,
      uploadSize: original.size,
      converted: false,
    };
  }

  // WAV или большой MP3 конвертируем
  const outputDir = join(
    process.cwd(),
    "data",
    "imports",
    "prepared"
  );

  await mkdir(outputDir, {
    recursive: true,
  });

  const originalName = basename(
    originalPath,
    extension
  );

  // Уникальное имя, чтобы не перезаписать
  // файлы из предыдущих тестов
  const outputPath = join(
    outputDir,
    `${originalName}-${randomUUID().slice(0, 8)}.mp3`
  );

  console.log("🎧 Конвертируем в MP3 (256 кбит/с)...");

  try {
    await runFFmpeg(originalPath, outputPath);

    const converted = await stat(outputPath);

    if (
      !converted.isFile() ||
      converted.size === 0
    ) {
      throw new Error(
        "После конвертации получен пустой файл"
      );
    }

    if (converted.size > MAX_UPLOAD_SIZE) {
      throw new Error(
        "MP3 превышает 49 МиБ. " +
        "Нужен меньший битрейт."
      );
    }

    return {
      originalPath,
      uploadPath: outputPath,
      originalSize: original.size,
      uploadSize: converted.size,
      converted: true,
    };
  } catch (error) {
    // При ошибке удаляем только
    // частично созданный MP3
    await rm(outputPath, { force: true });
    throw error;
  }
}
