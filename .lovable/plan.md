
# Исправление интеграции hoster.by: API endpoint + сохранение ключей

## Проблема 1: Неверный маршрут API

Текущий код использует endpoint:
```
POST https://serviceapi.hoster.by/service-account/token/create
```

Согласно официальной документации hoster.by API (https://serviceapi.hoster.by/rest_api_docs.html), правильный endpoint:
```
POST https://serviceapi.hoster.by/service/account/create/token
```

Это и вызывает ошибку `httpCode=520`, которая нормализуется в `HOSTERBY_ROUTE_MISSING` -> "Неверный маршрут hoster.by API (token/create)".

## Проблема 2: Ключи нельзя сохранить при ошибке

Сейчас кнопка "Сохранить и подключить" доступна только после успешной валидации (`validationResult?.success`). Если проверка не прошла (например, из-за бага с endpoint), ключи теряются при закрытии диалога.

---

## Решение

### Файл 1: `supabase/functions/hosterby-api/index.ts`

**Изменение**: строка 113 — исправить URL создания токена:
```
// Было:
const url = `${HOSTERBY_API_BASE}/service-account/token/create`;

// Стало:
const url = `${HOSTERBY_API_BASE}/service/account/create/token`;
```

Также обновить лог-сообщения (строка 118) и текст ошибки (строка 155, 562) для соответствия новому пути.

### Файл 2: `src/components/integrations/hosterby/HosterByConnectionDialog.tsx`

**Изменение 1** — Разделить кнопку "Сохранить" на две функции:
- "Сохранить и подключить" (текущее поведение, при успешной валидации)
- "Сохранить ключи" — новая кнопка, доступная даже при ошибке валидации. Сохраняет ключи в БД со статусом `error` и `error_message`.

**Изменение 2** — Логика `handleSaveWithoutValidation`:
- Вызывает `save_hoster_keys` с дополнительным флагом `skip_validation: true` (или сохраняет напрямую через `createInstance`/`updateInstance`).
- Ставит `status: "error"`, `error_message: validationResult?.error`.

**Изменение 3** — UI footer диалога:
```
<DialogFooter>
  <Button variant="outline" onClick={handleClose}>Отмена</Button>
  
  {/* Показывать "Сохранить ключи" только если валидация не прошла */}
  {validationResult && !validationResult.success && canValidate && (
    <Button variant="secondary" onClick={handleSaveWithoutValidation}>
      Сохранить ключи
    </Button>
  )}
  
  <Button onClick={handleSave} disabled={isSaving || !validationResult?.success}>
    Сохранить и подключить
  </Button>
</DialogFooter>
```

### Файл 3: `supabase/functions/hosterby-api/index.ts` (action `save_hoster_keys`)

**Изменение** — Добавить поддержку `skip_validation` в payload:
- Если `payload.skip_validation === true`: пропустить шаги 1-2 (получение JWT и проверка /cloud/orders), сохранить ключи в БД со `status: "disconnected"`, `error_message` из payload.
- Если `skip_validation` не передан: текущее поведение (валидация обязательна).

### Файл 4: `src/components/integrations/hosterby/HosterBySettingsCard.tsx`

Без изменений — бейджи статуса (Подключено / Ошибка / Не проверено) уже реализованы.

---

## Итог

1. Исправляется корневая причина ошибки: неверный URL `/service-account/token/create` -> `/service/account/create/token`
2. Ключи можно сохранить даже при ошибке проверки, со статусом "error" и бейджем ошибки на карточке
3. При повторном открытии диалога ключи уже сохранены (отображаются last4)
4. Бейдж на карточке отражает реальный статус интеграции
