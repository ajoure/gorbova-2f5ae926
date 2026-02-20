
# Исправление авторизации hoster.by API: заголовок Access-Token

## Проблема

Логи edge-функции показывают:
```
Step1: OK, userId=201461, expires=1771584811    <-- токен получен успешно
Step2: GET /cloud/orders → http=401              <-- отказ в доступе
```

Шаг 1 (получение JWT) работает корректно после предыдущего исправления endpoint. Но Шаг 2 (запрос к `/cloud/orders`) возвращает 401 (Unauthorized).

**Корневая причина**: Текущий код отправляет заголовок `Authorization: Bearer {jwt}`, но согласно OpenAPI-спецификации hoster.by (`serviceapi.hoster.by/docs/swagger/json`), Cloud-эндпоинты используют схему авторизации `Access-Token` — то есть заголовок должен быть `Access-Token: {jwt}`.

## Доказательство из документации

1. Swagger JSON: security scheme для `/cloud/orders` — `"Access-Token": ["cloud_orders_list"]`
2. Документация hoster.by упоминает пользовательские заголовки (`refresh-Token`, `X-User-Id`), а не стандартный `Authorization: Bearer`

## Решение

### Файл: `supabase/functions/hosterby-api/index.ts`

**Изменение 1** — строка 254, функция `hosterRequest`:

Заменить:
```typescript
"Authorization": `Bearer ${accessToken}`,
```
На:
```typescript
"Access-Token": accessToken,
```

**Изменение 2** — строка 242, обновить комментарий:

Заменить:
```
// Шаг 2: Выполнить запрос к hoster.by API с JWT Bearer token
```
На:
```
// Шаг 2: Выполнить запрос к hoster.by API с Access-Token header
```

Больше ничего менять не нужно. UI, диалог сохранения ключей, бейджи статуса — всё работает корректно. Проблема только в формате заголовка авторизации.

## Что НЕ трогаем

- `HosterByConnectionDialog.tsx` — без изменений
- `HosterBySettingsCard.tsx` — без изменений
- `getAccessToken()` — Шаг 1 использует `Access-Key` / `Secret-Key` и работает корректно
- Логика `save_hoster_keys`, `skip_validation` — уже работает

## Ожидаемый результат

После деплоя:
1. Нажатие "Проверить подключение" → Step1 получает JWT → Step2 с правильным заголовком `Access-Token` → 200 OK
2. Карточка hoster.by показывает бейдж "Подключено" вместо "Ошибка"
3. Количество облаков отображается корректно
