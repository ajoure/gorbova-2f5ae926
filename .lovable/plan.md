
# Исправление CORS для get-vapid-key и звука уведомлений

## Корневая причина

Функция `get-vapid-key` возвращает VAPID-ключ корректно (проверено — статус 200). Но клиентский код в `usePushNotifications.ts` отправляет GET-запрос с заголовком `Content-Type: application/json`. Этот заголовок запускает CORS preflight-запрос (OPTIONS). Ответ preflight содержит `Access-Control-Allow-Methods: POST, OPTIONS` — метод GET не указан. Некоторые браузеры могут заблокировать запрос, и `fetchVapidKey()` возвращает `null`.

## Решение

### Файл 1: `src/hooks/usePushNotifications.ts`

Убрать заголовок `Content-Type: application/json` из GET-запроса к `get-vapid-key`. Для GET-запроса без тела он не нужен и только создаёт лишний preflight.

Строки 34-38 — изменить:
```typescript
const res = await fetch(`${supabaseUrl}/functions/v1/get-vapid-key`, {
  headers: {
    'apikey': anonKey,
  },
});
```

### Файл 2: `supabase/functions/_shared/cors.ts`

Добавить `GET` в `Access-Control-Allow-Methods` для надёжности:

```typescript
'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
```

### Файл 3: `supabase/functions/get-vapid-key/index.ts` — без изменений

Функция уже работает корректно.

## Звук уведомлений

Код AudioContext уже исправлен в предыдущем шаге. Необходимо опубликовать сайт для применения всех изменений на club.gorbova.by.

## После внесения изменений

1. Передеплоить все edge-функции, использующие `_shared/cors.ts`
2. Опубликовать сайт
3. На club.gorbova.by нажать колокольчик для переподписки на push

## Изменяемые файлы
- `src/hooks/usePushNotifications.ts` — убрать Content-Type из GET-запроса
- `supabase/functions/_shared/cors.ts` — добавить GET в разрешённые методы
