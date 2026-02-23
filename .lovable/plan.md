

# Показ администраторов поименно в статистике клуба

## Проблема

На скриншоте видно, что блок «Администраторы клуба» вообще НЕ отображается внизу панели статистики. Это может означать, что логика определения админов из `last_telegram_check_result` не находит их (например, поле пустое или формат отличается). Нужно: (1) починить детекцию, (2) показать всех 4 админов (3 человека + 1 бот) поименно.

## Решение

### Файл: `src/components/telegram/ClubQuickStats.tsx`

**1) Исправить логику определения админов (строки 271-288)**

Текущая логика парсит `last_telegram_check_result` и ищет `status === "administrator" | "creator"`. Возможно, результаты проверки пустые или формат другой. Нужно:
- Добавить fallback: если `last_telegram_check_result` пустой, но у мембера `role` или иной признак админа -- учитывать
- Расширить парсинг: проверять вложенные структуры (`r?.chat?.status`, `r?.channel?.status`, `r?.status`)
- Вернуть массив `adminsList` вместо просто счетчиков:

```text
interface AdminInfo {
  telegram_name: string | null;
  telegram_username: string | null;
  full_name: string | null;
  role: "creator" | "administrator";
  has_active_access: boolean;
  is_bot?: boolean;
}
```

Имя собирается из: `m.telegram_first_name` + `m.telegram_last_name`, fallback на `m.full_name`, fallback на `@username`.

**2) Заменить нижнюю инфо-строку (строки 415-437)**

Вместо:
```text
Администраторы клуба   Всего: 3   Без доступа: 1
```

Показать поименный список:
```text
Администраторы клуба (4)
[Crown] Катерина Горбова @username -- С доступом
[Shield] Сергей Федорчук @fs_by -- С доступом
[Shield] Имя Админ3 @username3 -- Без доступа
[Bot] BotName @bot_username -- Без доступа
```

- Crown (иконка) = creator
- Shield = administrator
- Bot (иконка) = если `is_bot === true` или имя содержит "bot"
- Зеленый текст "С доступом" / янтарный "Без доступа" по `has_active_access`
- Компоновка: flex-wrap, каждый админ -- inline-pill

**3) Убрать условие скрытия блока**

Строка 415: `{!isLoading && adminsCount > 0 && (` -- оставить как есть, но убедиться, что adminsCount теперь корректно считается (включая бота). Если после исправления детекции adminsCount все равно 0, добавить диагностический лог.

## Затронутые файлы

| Файл | Изменение |
|---|---|
| `src/components/telegram/ClubQuickStats.tsx` | Исправить детекцию админов (включая бота), вернуть adminsList, показать поименный список с ролями и статусом доступа |

## НЕ трогаем

- Логику подсчета totalWithAccess, tariffs, динамику
- RPC `get_club_business_stats`
- Хук `useTelegramIntegration`
- Другие компоненты

## DoD

1. Блок "Администраторы клуба" отображается (сейчас скрыт)
2. Все 4 админа (3 человека + 1 бот) показаны поименно
3. У каждого видна роль (creator/administrator/bot) и статус доступа
4. Нет ошибок сборки/TS

