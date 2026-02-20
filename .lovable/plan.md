

# Установка fetch-service на VPS и настройка BY-egress

## Ограничение

Lovable не имеет SSH-доступа к внешним серверам. API hoster.by поддерживает только управление VM (start/stop/reboot), но не выполнение команд. Поэтому установка fetch-service -- действие пользователя (одна команда копипаста).

## Этап 1: Установка fetch-service на VPS (действие пользователя)

Пользователь подключается к VPS по SSH и вставляет один скрипт. Скрипт:
- Устанавливает Node.js (если нет)
- Создает `/opt/fetch-service/` с `server.js`
- Генерирует случайный Bearer-токен
- Создает systemd-сервис `fetch-service`
- Запускает и включает автозапуск
- Выводит URL и токен для копирования

Fetch-service -- это минимальный HTTP-прокси (~50 строк):
- Слушает порт `8080`
- Принимает `GET /fetch` с заголовком `X-Target-URL`
- Проверяет `Authorization: Bearer <token>`
- Проксирует запрос и возвращает результат
- Имеет endpoint `GET /health` для проверки

## Этап 2: Настройка BY-egress в приложении (автоматически)

После получения URL и токена от пользователя:

**Файл: `supabase/functions/hosterby-api/index.ts`**
- Добавить action `save_egress_config` -- сохраняет `egress_base_url`, `egress_token`, `egress_allowlist`, `egress_enabled` в `config` интеграции hosterby
- Добавить action `test_egress` -- делает GET к `<base_url>/health` и возвращает статус

**Файл: `src/components/integrations/hosterby/HosterByCloudPanel.tsx`**
- Добавить секцию "BY-egress" с полями:
  - Base URL (например `http://178.172.173.1:8080`)
  - Token (Bearer-токен)
  - Allowlist доменов (предзаполнен BY-доменами)
  - Кнопка "Тест /health"
  - Переключатель "Включено"

## Этап 3: Проверка работы парсинга

После настройки egress:
- Запустить `monitor-news` для одного BY-источника
- Убедиться в логах: `fetch_via=by_egress` вместо прямого запроса
- Проверить, что контент получен через VPS

## Предзаполненный allowlist доменов

```
nbrb.by,nalog.gov.by,pravo.by,government.by,president.gov.by,
minfin.gov.by,economy.gov.by,mintrud.gov.by,belstat.gov.by,
ilex.by,etalonline.by
```

## Скрипт установки (для копирования в SSH)

Будет создан файл-инструкция. Скрипт bash ~40 строк:
- `apt update && apt install -y nodejs npm` (если нет)
- Создание `/opt/fetch-service/server.js`
- `TOKEN=$(openssl rand -hex 32)`
- Создание systemd unit
- `systemctl enable --now fetch-service`
- Вывод: `echo "URL: http://178.172.173.1:8080"` и `echo "TOKEN: $TOKEN"`

## Итого изменения в коде

| Файл | Изменение |
|------|-----------|
| `supabase/functions/hosterby-api/index.ts` | Добавить actions: `save_egress_config`, `test_egress` |
| `src/components/integrations/hosterby/HosterByCloudPanel.tsx` | Добавить UI-секцию BY-egress: URL, token, allowlist, тест, переключатель |

Никакие другие файлы не затрагиваются. Существующая логика `monitor-news` уже поддерживает BY-egress -- нужно только заполнить конфиг.

