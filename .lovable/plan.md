# План: Интеграция hoster.by — BY-egress прокси для парсинга BY/RU сайтов

**Статус:** Утверждено, ожидает реализации  
**Приоритет:** P0 (Security) → P1 (UI) → P2 (Edge Function) → P3 (VPS Service) → P4 (monitor-news)  
**Контекст задачи:** 8F42B1C3-5D9E-4A7B-B2E1-9C3F4D5A6E7B

---

## Цель

Подключить hoster.by Cloud API как BY-egress для серверного парсинга.  
Запросы к *.by и выбранным BY/RU доменам должны выполняться через наш VPS в Беларуси (Минск), чтобы государственные сайты видели BY-IP и не блокировали запросы.

**Текущее состояние:**
- В аккаунте hoster.by "Облако 30015" — VPS ещё нет (кнопка "Создать сервер")
- В проекте уже есть `BY_PROXY_URL` в secrets и поддержка прокси в `monitor-news`
- Публичная документация hoster.by Cloud API не опубликована в открытом доступе
- На скриншотах видны: Cloud Access-Key, Cloud Secret-Key, DNS Access-Key, DNS Secret-Key

---

## Жёсткие правила безопасности (P0 — обязательно)

1. **Нельзя поднимать "open proxy"** — Squid с `http_access allow all` запрещён
2. **Секреты не хранятся в `integration_instances.config` в открытом виде** — только server-side secrets
3. **BY-egress endpoint защищён:** bearer token + SSRF-guards + allowlist доменов + rate limit + response size limit
4. **Никаких хардкод UUID** — все ID через запросы к БД
5. **Ключи hoster.by API хранятся в Supabase secrets**, UI хранит только `instance_id` и публичный статус
6. **BY_PROXY_URL/BY_EGRESS обновляется только server-side** (edge function) + запись в `audit_logs`
7. **Реализовать signing строго по документации** — не хардкодить предположения о формате

---

## Важная техническая оговорка: hoster.by API

**Проблема:** Документация hoster.by Cloud API (cp.hoster.by/hosterapigateway) не опубликована публично.  
cp.hoster.by без авторизации возвращает страницу логина.

**Требования к реализации:**
- Signing реализуется **только после** получения официальной документации из ЛК hoster.by
- Unit-тест на signing обязателен
- До получения документации: healthcheck возвращает `{ success: false, error: "API_DOCS_REQUIRED" }`

---

## P1 — Admin UI: Integrations → Разное → hoster.by

### 1.1 Провайдер в `src/hooks/useIntegrations.tsx`

Добавить в массив `PROVIDERS`:

```typescript
{
  id: "hosterby",
  name: "hoster.by Cloud",
  icon: "Server",
  category: "other",
  description: "Белорусский VPS-хостинг. BY-egress для парсинга BY/RU сайтов.",
  fields: [
    { key: "cloud_access_key", label: "Cloud Access-Key", type: "password", required: true },
    { key: "cloud_secret_key", label: "Cloud Secret-Key", type: "password", required: true },
  ],
  advancedFields: [
    // DNS ключи — для будущего использования (DNS management)
    { key: "dns_access_key", label: "DNS Access-Key (future)", type: "password" },
    { key: "dns_secret_key", label: "DNS Secret-Key (future)", type: "password" },
  ],
}
```

**Важно:** Ключи хранятся временно в config при создании. После первого healthcheck — переносятся в Supabase secrets (`HOSTERBY_CLOUD_ACCESS_KEY`, `HOSTERBY_CLOUD_SECRET_KEY`). В `config` остаётся: `{ cloud_id, vm_id, vm_ip, egress_status, egress_token_hash }`.

### 1.2 Компонент: `src/components/integrations/hosterby/HosterBySettingsCard.tsx`

По образцу `KinescopeSettingsCard.tsx`:
- Иконка: `Server` (lucide-react)
- Badge: Подключено / Ошибка / Не проверено
- Статус: Cloud ID, VM + IP, статус egress (Активен / Не настроен / Ошибка)
- Кнопки: Проверить / Настройки / Выбрать VM / Настроить BY-egress / Удалить

### 1.3 Диалог: `src/components/integrations/hosterby/HosterByConnectionDialog.tsx`

- Cloud Access-Key (masked), Cloud Secret-Key (masked)
- Свёрнутый блок: DNS Access-Key, DNS Secret-Key (future)
- Кнопка: **Сохранить и проверить**

### 1.4 Диалог VM: `src/components/integrations/hosterby/HosterByVmDialog.tsx`

- **Таб 1 (DEFAULT): "Подключить существующий VPS"** — список VM + выбор
- **Таб 2: "Создать новый VPS"** — имя, конфиг, OS Ubuntu 22.04, STOP-guard

### 1.5 Wizard: `src/components/integrations/hosterby/HosterByEgressDialog.tsx`

3 шага: Обзор → Установка fetch-service (server-side SSH) → Проверка + активация

### 1.6 `OtherIntegrationsTab.tsx`

```tsx
const hosterByInstance = instances?.find((i) => i.provider === "hosterby") || null;
<HosterBySettingsCard instance={hosterByInstance} />
```

---

## P2 — Edge Function: `hosterby-api`

**Файл:** `supabase/functions/hosterby-api/index.ts`

Ключи — только из `Deno.env.get("HOSTERBY_CLOUD_ACCESS_KEY")`, никогда из request body.

| Action | Описание | dry_run |
|--------|----------|---------|
| `test_connection` | Ping API | нет |
| `list_clouds` | Список clouds | нет |
| `list_vms` | Список VM в cloud_id | нет |
| `get_vm` | Детали VM | нет |
| `create_vm` | Создать VM | **да** |
| `attach_public_ip` | Привязать IP | **да** |
| `setup_by_egress` | SSH → fetch-service | **да** |
| `save_by_egress_config` | URL+TOKEN → secrets + audit_log | **да** |
| `check_egress_health` | GET /health | нет |
| `test_egress_url` | Тест URL через egress | нет |

**Signing:** реализовать строго по официальной документации из ЛК hoster.by. До получения — заглушка с понятным сообщением. Unit-тест обязателен.

---

## P3 — Fetch-service на VPS (НЕ open proxy)

- `/health` — публичный, без авторизации
- `/fetch` — GET/HEAD only, bearer token, allowlist доменов, SSRF-guards, timeout 15s, max 5MB
- ufw: закрыть metadata 169.254.x.x, все внутренние диапазоны
- systemd сервис, запускается от `nobody`

**Стартовый allowlist:** nbrb.by, nalog.gov.by, ssf.gov.by, kgk.gov.by, gtk.gov.by, minfin.gov.by, economy.gov.by, pravo.by, mintrud.gov.by, customs.gov.by

**Feature flag:** `ALLOW_ALL_BY_DOMAINS=false` (wildcard *.by)

---

## P4 — monitor-news (минимальные изменения)

Добавить в начало функции чтение конфига:
```
BY_EGRESS_ENABLED=true
BY_EGRESS_BASE_URL=http://ip:8080
BY_EGRESS_TOKEN=<token>
BY_EGRESS_ALLOWLIST=nbrb.by,nalog.gov.by,...
```

Логи: `fetch_via=by_egress|default`, `http_status`, `duration_ms` — без PII.

**Rollback:** `BY_EGRESS_ENABLED=false` → всё возвращается к прямому fetch.

---

## Порядок реализации

### Фаза 1 (без hoster.by API — пока нет документации)
1. `useIntegrations.tsx` — добавить провайдер `hosterby`
2. `HosterBySettingsCard.tsx` — карточка с UI
3. `HosterByConnectionDialog.tsx` — ввод и сохранение ключей
4. `OtherIntegrationsTab.tsx` — добавить карточку
5. `hosterby-api/index.ts` — skeleton edge function
6. `integration-healthcheck/index.ts` — case "hosterby"

### Фаза 2 (после получения документации hoster.by Cloud API)
7. Реализовать signing + unit-тест `signing_test.ts`
8. Реализовать list_clouds, list_vms, get_vm
9. `HosterByVmDialog.tsx` — реальный список VM
10. Реализовать setup_by_egress (SSH + fetch-service install)
11. `HosterByEgressDialog.tsx` — wizard с реальными вызовами

### Фаза 3 (после успешной настройки VPS)
12. Добавить BY_EGRESS_* secrets
13. Минимальные изменения в monitor-news

---

## DoD

| # | Критерий | Доказательство |
|---|----------|----------------|
| A | Карточка hoster.by видна в "Разное" рядом с Kinescope | Скрин |
| B | Test connection возвращает список VM с IP | Скрин + лог |
| C | VM выбрана, IP сохранён в конфиге | SQL SELECT config FROM integration_instances |
| D | /health на VPS → 200 OK | curl скрин |
| E | /fetch для nbrb.by → 200, nalog.gov.by → 200/301 | curl скрин |
| F | monitor-news: fetch_via=by_egress в логах | Лог вывод |
| G | Rollback BY_EGRESS_ENABLED=false работает | Тест |
| H | audit_logs: запись о сохранении egress конфига | SQL SELECT |

---

## Открытые вопросы (перед Фазой 2)

1. **Документация hoster.by Cloud API** — получить из ЛК (Облако 30015 → API)
2. **SSH-ключ для VPS** — загрузить в аккаунт hoster.by до создания VM
3. **Порт fetch-service** — 8080 открыт в firewall? Или другой порт?
4. **Публичный IP VPS** — нужен после создания для DoD E/F

---

## Что НЕ трогаем

- Внутренняя логика `monitor-news` (только добавление fetchViaByEgress)
- RLS политики `integration_instances`
- Таблица `integration_instances` — миграция не нужна
- Другие провайдеры в `integration-healthcheck`
- Существующий `BY_PROXY_URL` — не удалять

---

*Последнее обновление: 2026-02-18*
