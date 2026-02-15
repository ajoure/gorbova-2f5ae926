
# Исправление push-уведомлений, звука и обновления в реальном времени

## Выявленные корневые причины

### 1. Push-уведомления не работают
**Причина**: Таблица `push_subscriptions` пуста — ни одна подписка не сохранена. На скриншоте видно "Уведомления заблокированы в настройках браузера" — это значит, что на сайте lovable.dev пользователь заблокировал уведомления. Однако проблема глубже:
- Хук `usePushNotifications.ts` использует `supabase.from("push_subscriptions" as any)` — каст `as any` обходит проверку типов, но при этом если тип не совпадает с реальной схемой, Supabase может молча отклонить запись
- Отсутствует подробное логирование — ошибки проглатываются
- На published-версии (gorbova.lovable.app) нужно заново разрешить уведомления в браузере

### 2. Нет значка уведомлений на мобильной версии
**Причина**: На скриншоте с iPhone виден экран "Сделки" — это пользовательский интерфейс (`AppSidebar`), а не админский. Кнопка `PushNotificationToggle` добавлена только в `AdminLayout.tsx`. На мобильном экране она видима, но маленькая (32x32px), что меньше рекомендуемого touch-target (44x44px).

### 3. Нет обновления в реальном времени
**Причина**: Realtime-подписки на `telegram_messages` в `InboxTabContent.tsx` уже настроены и работают — INSERT и UPDATE прослушиваются. Однако:
- Таблица `email_inbox` **не добавлена** в `supabase_realtime` publication — поэтому email-бейджи не обновляются в реальном времени
- Если пользователь находится НЕ на странице контакт-центра, обновление происходит только через polling (60 сек)

### 4. Звук не работает
**Причина**: Звук через Web Audio API (`playNotificationSound`) работает только когда страница контакт-центра открыта И включена кнопка звука. Если пользователь на другой странице — звука нет.

---

## План изменений

### Шаг 1: Миграция БД — добавить email_inbox в realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_inbox;
```

Это позволит бейджам email обновляться в реальном времени без polling.

### Шаг 2: Исправить сохранение push-подписки

**Файл:** `src/hooks/usePushNotifications.ts`

- Добавить подробное логирование на каждом этапе (проверка VAPID, запрос разрешения, подписка, сохранение)
- Показывать toast с причиной ошибки если что-то не так
- Убрать `as any` и использовать правильную типизацию или explicit type assertion
- Добавить проверку: если `VITE_VAPID_PUBLIC_KEY` пуст — показать toast с предупреждением
- При ошибке сохранения в БД показать конкретную причину

### Шаг 3: Увеличить кнопку push на мобильном

**Файл:** `src/components/admin/PushNotificationToggle.tsx`

- Увеличить touch target до 44x44px на мобильных экранах
- Добавить пульсирующую точку если уведомления ещё не включены (state="prompt")
- Убрать `return null` для state="unsupported" на мобильном — вместо этого показать кнопку с пояснением

### Шаг 4: Глобальный звук уведомлений

**Файл:** `src/components/admin/PushNotificationToggle.tsx` или новый `src/hooks/useIncomingMessageAlert.ts`

- Добавить глобальный realtime-listener на `telegram_messages` INSERT
- При получении нового входящего сообщения (direction='incoming') воспроизводить звук уведомления
- Этот хук подключить в `AdminLayout.tsx` — так он будет работать на любой странице админки, не только на контакт-центре

### Шаг 5: Улучшить Service Worker

**Файл:** `public/sw.js`

- Добавить звук в options уведомления (`vibrate` для мобильных)
- Убедиться что `tag` + `renotify: true` позволяют множественные уведомления

---

## Технические детали

### Изменяемые файлы
1. Миграция БД: `ALTER PUBLICATION supabase_realtime ADD TABLE public.email_inbox`
2. `src/hooks/usePushNotifications.ts` — логирование + диагностика + toast ошибок
3. `src/components/admin/PushNotificationToggle.tsx` — мобильный touch target + пульс
4. `src/hooks/useIncomingMessageAlert.ts` — **новый** глобальный звук уведомлений
5. `src/components/layout/AdminLayout.tsx` — подключение `useIncomingMessageAlert`
6. `public/sw.js` — вибрация для мобильных

### Без изменений
- Edge-функция `send-push-notification` — работает корректно
- Edge-функция `telegram-webhook` — push-интеграция уже есть
- Realtime-подписки в `InboxTabContent.tsx` — уже работают
- RLS на `push_subscriptions` — политики корректны
