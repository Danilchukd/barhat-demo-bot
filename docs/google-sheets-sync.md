# BARHAT Demo Archive — синхронизация с Google Sheets

## Принцип работы

- Новые демки автоматически попадают в таблицу `sheet_sync_jobs` через триггер SQLite. **Старые записи не экспортируются**.
- После создания демки, раз в минуту, фоновый обработчик пробует записать новую строку в Google Sheets.
- Таблица: **A — название**, **I — исходная ссылка Drive/Яндекс или ссылка Telegram**, **J — описание**. Этапы **C–F** и старые строки не меняются.
- Редактирование названия / описания уже синхронизированной демки обновляет только A / J, и только когда удаётся найти соответствующую строку по ранее записанным названию и ссылке.
- В архиве запрещены новые дубликаты названий (нормализация регистра, пробелов и е/ё).
- При временной недоступности Google данные сохраняются в SQLite и запрос повторяется. Конфликт названия/изменения строки фиксируется как `conflict` (автоматически не перезаписываем чужие строки).

## Параметры среды

```dotenv
GOOGLE_SYNC_MODE=off
# test — работа только с GOOGLE_TEST_SHEET_ID (таблица BARHAT SYNC TEST)
# production — работа с GOOGLE_SHEET_ID (требует GOOGLE_SYNC_CONFIRM=BARHAT_MX)
GOOGLE_SYNC_CONFIRM=
BARHAT_DB_PATH=./data/barhat.sqlite
GOOGLE_SHEET_ID=...
GOOGLE_TEST_SHEET_ID=...
GOOGLE_SHEET_TAB="Песни "
GOOGLE_CREDENTIALS_PATH=./credentials/google-service-account.json
```

Не включай `production` до проверки отдельной SQLite и копии Google-таблицы. На VPS путь `BARHAT_DB_PATH` лучше не указывать, чтобы использовать существующую `./data/barhat.sqlite`. JSON-ключ сервисного аккаунта не должен попадать в GitHub; он уже игнорируется через `.gitignore`.

## Прогон без Telegram (Windows PowerShell)

Сначала:
```powershell
cd D:\barhat-demo-bot
git pull --ff-only
npx tsc --noEmit
npx tsx --test src/sheets/*.test.ts
```

Для тестирования без второго Telegram-бота временно установи:
```powershell
$env:BARHAT_DB_PATH = ".\data\barhat-sync-test.sqlite"
$env:GOOGLE_SYNC_MODE = "test"
npx tsx src/sheets/smokeSync.ts --title "BARHAT AUTO TEST 1" --url "https://drive.google.com/file/d/TEST"
Remove-Item Env:\BARHAT_DB_PATH,Env:\GOOGLE_SYNC_MODE
```

В локальном `.env` должны быть заполнены `GOOGLE_SHEET_ID`, `GOOGLE_TEST_SHEET_ID`, `GOOGLE_SHEET_TAB` (пробел в конце имени) и `GOOGLE_CREDENTIALS_PATH`. Сервисный аккаунт — редактор тестовой копии. Новая запись должна появиться в `BARHAT SYNC TEST`, а не в BARHAT MX.

При повторе **того же названия** скрипт должен завершиться ошибкой дубликата, не записав ничего повторно.

## Релиз VPS (после проверок)

1. Сделать резервную копию актуальной SQLite.
2. Убедиться, что отдельные изменения и тесты прошли проверку TypeScript.
3. Слить `feature/sheets-sync` в `main` и обновить VPS из `main`.
4. Без `GOOGLE_SYNC_MODE` синхронизация останется **отключённой**.
5. Перед включением передать JSON-ключ на VPS под `/home/barhat/barhat-demo-bot/credentials/google-service-account.json`, добавить сервисный аккаунт редактором основной BARHAT MX, затем указать `GOOGLE_SYNC_MODE=production` и `GOOGLE_SYNC_CONFIRM=BARHAT_MX`.
6. Перезапустить `sudo systemctl restart barhat-demo-bot` и проверить `sudo journalctl -u barhat-demo-bot -n 60 --no-pager`. Не печатай содержимое `.env` или ключа в логах/чате.
