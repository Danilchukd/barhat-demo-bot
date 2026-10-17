import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const root = process.cwd();
const sourcePath = path.join(root, "data", "barhat.sqlite");

function getBackupDirectory(): string {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return path.join(root, "data", "backups");
  }

  if (args.length !== 2 || args[0] !== "--dir" || !args[1]?.trim()) {
    throw new Error(
      'Использование: npx tsx src/maintenance/backupDatabase.ts [--dir "D:\\BARHAT-backups"]'
    );
  }

  return path.resolve(args[1]);
}

type CountRow = { total: number };
type IntegrityRow = { integrity_check: string };

async function main(): Promise<void> {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(
      `База данных не найдена: ${sourcePath}\n` +
      "Запусти команду из корневой папки barhat-demo-bot."
    );
  }

  const backupDir = getBackupDirectory();

  if (path.resolve(backupDir) === path.resolve(path.dirname(sourcePath))) {
    // Не ошибка, но отдельно от исходного файла хранить удобнее.
    console.warn(
      "Предупреждение: рекомендуется отдельная папка для резервных копий."
    );
  }

  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = randomBytes(4).toString("hex");
  const name = `barhat-${timestamp}-${suffix}.sqlite`;

  const finalPath = path.join(backupDir, name);
  const temporaryPath = path.join(backupDir, `.${name}.partial`);

  let backupCompleted = false;

  try {
    // НЕ импортируем ../db/database.js, чтобы не запускать миграции.
    // Открываем оригинальную базу только для чтения.
    const source = new Database(sourcePath, {
      readonly: true,
      fileMustExist: true,
    });

    try {
      console.log("Создаём согласованную копию SQLite...");
      // Online Backup API учитывает состояние WAL.
      await source.backup(temporaryPath);
    } finally {
      source.close();
    }

    // Проверяем именно созданную копию, а не исходную базу.
    const copy = new Database(temporaryPath, {
      readonly: true,
      fileMustExist: true,
    });

    let activeDemos: number;
    let activeFiles: number;

    try {
      const integrity = copy.pragma("integrity_check") as IntegrityRow[];
      const integrityErrors = integrity
        .map((row) => row.integrity_check)
        .filter((result) => result !== "ok");

      if (integrityErrors.length > 0) {
        throw new Error(
          "Проверка целостности копии не пройдена: " +
          integrityErrors.slice(0, 5).join("; ")
        );
      }

      const foreignKeyErrors = copy.pragma("foreign_key_check") as unknown[];

      if (foreignKeyErrors.length > 0) {
        throw new Error(
          `В резервной копии нарушены внешние ключи: ${foreignKeyErrors.length}`
        );
      }

      activeDemos = (copy.prepare(`
        SELECT COUNT(*) AS total
        FROM demos
        WHERE deleted_at IS NULL
      `).get() as CountRow).total;

      activeFiles = (copy.prepare(`
        SELECT COUNT(*) AS total
        FROM demo_files f
        JOIN demos d ON d.id = f.demo_id
        WHERE f.deleted_at IS NULL
          AND d.deleted_at IS NULL
      `).get() as CountRow).total;
    } finally {
      copy.close();
    }

    // Только проверенную копию переименовываем в итоговый файл.
    fs.renameSync(temporaryPath, finalPath);
    backupCompleted = true;

    const sizeMb = (
      fs.statSync(finalPath).size / (1024 * 1024)
    ).toFixed(2);

    console.log("\n✅ Резервная копия успешно создана и проверена!");
    console.log(`Путь: ${finalPath}`);
    console.log(`Размер: ${sizeMb} МБ`);
    console.log(`Активных демок: ${activeDemos}`);
    console.log(`Активных вложений: ${activeFiles}`);
    console.log("SQLite integrity_check: OK");
    console.log("SQLite foreign_key_check: OK");
    console.log("\nОригинальная база не изменялась.");
  } finally {
    if (!backupCompleted && fs.existsSync(temporaryPath)) {
      try {
        fs.unlinkSync(temporaryPath);
      } catch {
        console.error(
          `Не удалось удалить временный файл: ${temporaryPath}`
        );
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(
    "\n❌ Ошибка резервного копирования:",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
