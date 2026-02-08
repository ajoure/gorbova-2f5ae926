ЖЁСТКИЕ ПРАВИЛА ИСПОЛНЕНИЯ ДЛЯ LOVABLE.DEV (ОБЯЗАТЕЛЬНО):
1) Ничего не ломать и не трогать лишнее. Только изменения из этого плана.
2) Add-only где возможно. Если замена неизбежна — минимальный diff, точечно.
3) Dry-run → execute: сначала режим тестового прогона (без записи), затем боевой.
4) STOP-guards обязательны: лимиты, таймауты, max попыток, max items.
5) Никаких хардкод-UUID, никаких “магических” значений без конфигов.
6) Без PII в логах. В meta только source_id/name, стадия, коды, elapsed, items_count.
7) Финальный отчёт обязателен: список изменённых файлов + diff-summary + SQL-пруфы + audit_logs пруфы + UI-скрины из админки Сергея (7500084@gmail.com).

================================================================================
PATCH P0.9: Исправление парсинга BY/RU источников в «Редакции»
Цель: убрать 400/404 по источникам, добавить RSS, fallback-цепочку, классификацию ошибок,
и в UI показывать “метод/ошибка/результат” так, чтобы было видно что реально произошло.
================================================================================

P0.9.0 — FIX: URL + конфиги источников (SQL)
1) Обновить URL проблемных источников и scrape_config (rss_url/proxy_mode/fallback_url)
2) Деактивировать Pravo.by - Нац. реестр (без сложного поиска он не живёт)
3) Очистить last_error поля у исправленных источников

SQL (выполнить и приложить SELECT-пруф):
- ЦБ России:
  url = https://cbr.ru/press/event/
  scrape_config.rss_url = https://cbr.ru/rss/RssPress
  scrape_config.proxy_mode = "auto"
  scrape_config.country = "RU"

- Pravo.gov.ru:
  url = http://publication.pravo.gov.ru/documents/block/daily
  scrape_config.proxy_mode = "enhanced"
  scrape_config.country = "RU"

- Pravo.by - Нац. реестр:
  is_active = false

- Нацбанк РБ:
  url = https://nbrb.by/press/
  scrape_config.proxy_mode = "enhanced"
  scrape_config.country = "BY"
  scrape_config.fallback_url = https://nbrb.by/press/pressrel/

ПРУФ:
SELECT name, url, is_active, scrape_config
FROM news_sources
WHERE name IN ('ЦБ России','Pravo.gov.ru','Pravo.by - Нац. реестр','Нацбанк РБ');

STOP-guard:
- Если name не совпадает (другая локализация/название) — не “угадывать”, найти по id/slug и зафиксировать в отчёте.

--------------------------------------------------------------------------------

P0.9.1 — ADD: Стандартизировать ScrapeConfig (типизация + дефолты)
Файл: supabase/functions/monitor-news/index.ts
Добавить интерфейс:
- rss_url?: string
- fallback_url?: string
- proxy_mode?: "auto" | "enhanced"
- country?: "BY" | "RU" | "AUTO"
Дефолты:
- proxy_mode = "auto"
- country = "AUTO"

STOP-guard:
- Если scrape_config null/пустой — код не падает, использует дефолты.

--------------------------------------------------------------------------------

P0.9.2 — ADD: RSS-парсер (первый этап цепочки)
Файл: supabase/functions/monitor-news/index.ts
Добавить parseRssFeed(rss_url) (лёгкий парсинг XML без тяжёлых зависимостей):
- лимит items: 30
- лимит content на item: 5000
- timeout fetch RSS: 15000ms
- нормализация: title/url/content/date(ISO)

Поведение:
- если RSS вернул items > 0 → это SUCCESS, Firecrawl не вызываем
- если RSS упал/пустой → логируем попытку и идём дальше в HTML

--------------------------------------------------------------------------------

P0.9.3 — ADD: Классификация ошибок + audit_logs на каждую попытку
Файл: supabase/functions/monitor-news/index.ts
Добавить classifyError(statusCode/message):
- 404/410 → URL_INVALID
- 400 → BAD_REQUEST
- 401/403 → BLOCKED_OR_AUTH
- 429 → RATE_LIMIT
- timeout/network → TIMEOUT_RENDER
- 5xx → SERVER_ERROR
- parse/json/xml → PARSER_ERROR
- иначе → UNKNOWN

Логирование (после каждой стадии: rss/html_auto/html_enhanced/fallback):
audit_logs.action = "news_scrape_attempt"
meta:
- source_id, source_name
- stage
- url_used
- proxy_mode ("auto"/"enhanced"/"rss")
- status_code/error_code
- error_class
- elapsed_ms
- items_found

STOP-guard:
- Никаких токенов/секретов/HTML в meta. Только короткие поля.
- errorDetails.body обрезать до 200 символов (и то только если нет PII).

--------------------------------------------------------------------------------

P0.9.4 — REWORK: Единая fallback-цепочка (RSS → HTML(auto) → HTML(enhanced) → fallback_url)
Файл: supabase/functions/monitor-news/index.ts
Встроить стратегию:

STAGE 1: RSS
- если config.rss_url → parseRssFeed()
- если items>0 → return SUCCESS

STAGE 2: HTML auto
- scrapeUrlWithProxy(url, proxy_mode="auto", location.country из config.country)
- если items>0 → SUCCESS
- если ошибка (400/403/429/timeout) → stage 3

STAGE 3: HTML enhanced
- scrapeUrlWithProxy(url, proxy_mode="enhanced", waitFor=5000)
- если items>0 → SUCCESS

STAGE 4: fallback_url (если задан)
- повторить STAGE 1-3 для fallback_url, но максимум 1 проход

Ограничения (STOP-guards):
- max HTML попыток на URL: 2 (auto+enhanced)
- max общий runtime на источник: 90 секунд
- max items: 30
- Если firecrawlKey отсутствует → работаем только через RSS (если есть), иначе корректный error_class.

Важно про Firecrawl:
- НЕ использовать premium:true (вызывает 400 по текущим тестам).
- Использовать параметр proxy_mode как логический режим:
  - auto: базовый
  - enhanced: “дорогой” (residential/premium) согласно текущей реализации scrapeUrlWithProxy
(если в вашей библиотеке Firecrawl это называется иначе — привести к рабочему синтаксису и приложить пруф request/response в отчёте)

--------------------------------------------------------------------------------

P1.9.5 — UI (Редакция): показать “Метод”, “ошибка по-человечески”, “результаты”
Файл: src/pages/admin/AdminEditorial.tsx (или текущий файл Редакции)
1) В таблице источников добавить колонку “Метод”:
- если scrape_config.rss_url → badge "RSS"
- иначе если proxy_mode="enhanced" → badge "Enhanced"
- иначе → badge "Auto"

2) Ошибки показывать не голым кодом, а меткой:
- 404 → “URL не найден”
- 400 → “Неверный запрос/URL”
- 403 → “Блок/гео/доступ”
- timeout → “Таймаут/рендер”
- 5xx → “Ошибка сервера”
- иначе → “Ошибка: <code>”

3) В scrape_logs (или статус-строке) показать:
- найдено / сохранено (X/Y)
- успешных источников / всего
- completed_at

STOP-guard:
- Никаких новых вкладок/разделов “Уведомления”. Всё внутри существующего UI Редакции/логов.

--------------------------------------------------------------------------------

DoD (ПРУФЫ ОБЯЗАТЕЛЬНЫ):
A) SQL-пруф:
- SELECT по 4 источникам показывает новые url + scrape_config + is_active=false для Pravo.by.

B) Логи:
- В audit_logs есть записи "news_scrape_attempt" по каждому источнику минимум по 1 запуску.
- В meta видно stage и error_class (а не “просто упало”).

C) UI-пруфы (скрины):
- Редакция: таблица источников показывает “Метод” и понятную ошибку/OK.
- Запуск парсинга: по исправленным источникам нет 400/404 из-за старых URL.

D) Функционально:
- ЦБ России парсится через RSS (items > 0).
- Pravo.gov.ru и Нацбанк РБ проходят через enhanced (или через RSS/auto если сработало), но с пруфами stage.

================================================================================
Конец PATCH P0.9
================================================================================