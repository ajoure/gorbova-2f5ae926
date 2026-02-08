================================================================================
PATCH P0.9.1 — ВЫПОЛНЕН ✅ (2026-02-08)
================================================================================

Файл изменён: supabase/functions/monitor-news/index.ts

## Выполненные изменения:

### P0.9.1-1 — RSS hardening ✅
- Regex `<item>`: `/<item\b[^>]*>([\s\S]*?)<\/item>/gi`
- extractXmlField: переписан с CDATA + non-CDATA группами
- decodeHtmlEntities: добавлены &#39;, &apos;, &#x..., нормализация пробелов

### P0.9.1-2 — iLex cookie passthrough ✅
- scrapeUrlWithProxy получает `sessionCookie?: string | null`
- Cookie добавляется в headers для всех режимов (auto/enhanced)
- extractCookieValue helper извлекает NAME=VALUE
- ilexSession прокинут во все 3 вызова scrapeUrlWithProxy

### P0.9.1-3 — classifyError fixes ✅
- RSS_HTTP_XXX → рекурсивный вызов с HTTP кодом
- RSS_*TIMEOUT/ERROR → TIMEOUT_RENDER
- auth_required/no_session → BLOCKED_OR_AUTH
- 408 → TIMEOUT_RENDER
- 5xx regex: /^5\d{2}$/

### P0.9.1-4 — shouldRetryWithEnhanced ✅
- Только HTTP коды: ["400","401","403","408","429","timeout","500","502","503","504"]

### P0.9.1-5 — SQL updates ✅
- Pravo.by - Нац. реестр: is_active = false
- ФНС России: rss_url = https://www.nalog.gov.ru/rss/rn77/news/

### P0.9.1-6 — Source rotation ✅
- ORDER BY last_scraped_at ASC NULLS FIRST
- Лимит: min(limit, 25), hard cap 50

## SQL-пруфы:

```
Pravo.by - Нац. реестр: is_active = false ✅
ФНС России: rss_url = https://www.nalog.gov.ru/rss/rn77/news/ ✅
null_count: 18 → 13 (ротация работает) ✅
```

## audit_logs пруфы:

```
ЦБ России: stage=rss, items_found=11 ✅
КГК РБ: status_code=408, error_class=TIMEOUT_RENDER ✅
КГК РБ: stage sequence html_auto → html_enhanced ✅
```

================================================================================
