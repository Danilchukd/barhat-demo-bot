
import "dotenv/config";

import {
    readFile,
    mkdir,
    open,
    rm,
} from "node:fs/promises";

import { join } from "node:path";

type ImportCandidate = {
    sourceRow: number;
    title: string;
    sourceType: "google_drive" | "yandex_disk" | "external";
    url: string;
};

type ImportManifest = {
    entries: ImportCandidate[];
};

type YandexMetadata = {
    name?: string;
    type?: string;
    size?: number;
    mime_type?: string;
};

type YandexDownloadLink = {
    href?: string;
};

// По умолчанию тестируем строку 12 — Дефтонскор II
// Можно указать другую строку при запуске
const TEST_ROW = Number(process.argv[2] ?? "12");

const MAX_TEST_SIZE = 100 * 1024 * 1024;

const manifestPath = join(
    process.cwd(),
    "data",
    "imports",
    "sheet-links.json"
);

const downloadDir = join(
    process.cwd(),
    "data",
    "imports",
    "downloads"
);

// Выполняем запрос к API Яндекс Диска
async function yandexRequest<T>(
    endpoint: string,
    publicUrl: string
): Promise<T> {
    const url = new URL(
        `https://cloud-api.yandex.net/v1/disk/${endpoint}`
    );

    url.searchParams.set("public_key", publicUrl);

    const response = await fetch(url, {
        headers: {
            Accept: "application/json",
        },
        signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
        throw new Error(
            `Яндекс API: HTTP ${response.status} ${response.statusText}`
        );
    }

    return await response.json() as T;
}

async function main() {
    console.log("🔍 Проверяем Яндекс Диск...\n");

    if (!Number.isSafeInteger(TEST_ROW) || TEST_ROW <= 0) {
        throw new Error("Некорректный номер строки");
    }

    // Читаем результаты импорта Google Sheets
    const content = await readFile(
        manifestPath,
        "utf8"
    );

    const manifest = JSON.parse(content) as ImportManifest;

    // Ищем тестовый файл Яндекс Диска
    const candidate = manifest.entries.find(
        (entry) =>
            entry.sourceRow === TEST_ROW &&
            entry.sourceType === "yandex_disk"
    );

    if (!candidate) {
        throw new Error(
            `Ссылка Яндекс Диска в строке ${TEST_ROW} не найдена`
        );
    }

    console.log("Демка:", candidate.title);
    console.log("Строка:", candidate.sourceRow);

    // 1. Получаем метаданные файла
    console.log("\n📁 Получаем метаданные...");

    const metadata = await yandexRequest<YandexMetadata>(
        "public/resources",
        candidate.url
    );

    console.log("Название:", metadata.name);
    console.log("Тип:", metadata.type);
    console.log("MIME:", metadata.mime_type);
    console.log("Размер:", metadata.size);

    if (metadata.type !== "file") {
        throw new Error(
            "Ссылка ведёт не на отдельный файл. " +
            "Возможно, это общая папка."
        );
    }


    const fileName = metadata.name?.toLowerCase() ?? "";

    const extension = fileName.endsWith(".wav")
        ? "wav"
        : fileName.endsWith(".mp3")
            ? "mp3"
            : null;

    if (
        !extension ||
        !metadata.mime_type?.startsWith("audio/")
    ) {
        throw new Error(
            "Поддерживаются аудиофайлы MP3 и WAV"
        );
    }

    console.log("Формат файла:", extension.toUpperCase());


    const expectedSize = metadata.size;

    if (
        typeof expectedSize !== "number" ||
        !Number.isSafeInteger(expectedSize) ||
        expectedSize <= 0
    ) {
        throw new Error("Не удалось определить размер файла");
    }

    if (expectedSize > MAX_TEST_SIZE) {
        throw new Error("Файл больше 100 МиБ");
    }

    // 2. Получаем временный URL для скачивания
    console.log("\n🔗 Получаем ссылку скачивания...");

    const downloadInfo =
        await yandexRequest<YandexDownloadLink>(
            "public/resources/download",
            candidate.url
        );

    if (!downloadInfo.href) {
        throw new Error(
            "Яндекс Диск не вернул ссылку скачивания"
        );
    }

    const downloadUrl = new URL(downloadInfo.href);

    if (downloadUrl.protocol !== "https:") {
        throw new Error("Неожиданный протокол скачивания");
    }

    // 3. Скачиваем содержимое файла
    console.log("\n⬇️ Скачиваем MP3...");

    const response = await fetch(downloadUrl, {
        signal: AbortSignal.timeout(120000),
    });

    if (!response.ok || !response.body) {
        throw new Error(
            `Ошибка загрузки: HTTP ${response.status}`
        );
    }

    const contentType =
        response.headers.get("content-type") ?? "";

    if (
        contentType.includes("text/html") ||
        contentType.includes("application/json")
    ) {
        throw new Error(
            "Вместо MP3 сервер вернул HTML или JSON"
        );
    }

    await mkdir(downloadDir, {
        recursive: true,
    });

    const outputPath = join(
        downloadDir,
        `yandex-test-${TEST_ROW}.${extension}`
    );

    // Потоковая запись с контролем размера
    const file = await open(outputPath, "w");
    let bytesWritten = 0;
    let success = false;

    try {
        const reader = response.body.getReader();

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                bytesWritten += value.byteLength;

                if (bytesWritten > MAX_TEST_SIZE) {
                    throw new Error(
                        "Превышен лимит скачивания 100 МиБ"
                    );
                }

                await file.writeFile(value);
            }
        } finally {
            reader.releaseLock();
        }

        if (bytesWritten !== expectedSize) {
            throw new Error(
                "Размер скачанного файла не совпадает с оригиналом"
            );
        }

        success = true;
    } finally {
        await file.close();

        if (!success) {
            await rm(outputPath, { force: true });
        }
    }

    console.log("\n✅ Файл скачан успешно!");
    console.log("Путь:", outputPath);
    console.log("Размер:", bytesWritten);
}

main().catch((error: unknown) => {
    const message = error instanceof Error
        ? error.message
        : String(error);

    console.error("\n❌ Ошибка:", message);
    process.exitCode = 1;
});
