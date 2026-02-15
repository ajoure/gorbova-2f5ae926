

# PATCH: Исправление ошибок и добавление push-уведомлений

## Выявленные проблемы

### 1. Ошибка "Edge Function returned a non-2xx status code"
На скриншоте видно красное сообщение об ошибке при работе с подпиской контакта. По логам Edge-функций ошибок нет - скорее всего это был транзиентный (временный) сбой сети или таймаут. Однако сообщение об ошибке не информативно для администратора. Нужно улучшить обработку ошибок edge-функций в компонентах подписок, чтобы показывать нормализованные сообщения вместо технических.

### 2. Исчезли бейджи непрочитанных сообщений в сайдбаре
Код бейджей работает корректно: хук `useUnreadMessagesCount` запрашивает `telegram_messages` (сейчас 8 непрочитанных), а пункт меню "Контакт-центр" настроен с `badge: "unread"`. Проверка показала, что рендеринг бейджа зависит от `totalUnread = unreadMessagesCount + unreadEmailCount`. Если один из хуков возвращает ошибку молча (возврат 0), бейдж может не показываться. Нужно проверить и исправить отказоустойчивость.

**Возможная причина**: хук `useUnreadEmailCount` запрашивает таблицу `email_inbox` - если таблица не существует или RLS блокирует доступ, запрос возвращает 0 без ошибки, но может вызвать сбой реактивности. Кроме того, нужно убедиться, что realtime-подписки активны.

### 3. Push-уведомления (новый функционал)
Сейчас нет ни Service Worker, ни push-уведомлений. `manifest.json` есть, но без service worker push невозможен.

---

## План реализации

### Шаг 1: Улучшить обработку ошибок Edge-функций в подписках

**Файлы:** `src/components/admin/SubscriptionActionsSheet.tsx`, `src/components/admin/EditSubscriptionDialog.tsx`, `src/components/admin/GrantAccessFromDealDialog.tsx`

- Перехватывать ошибку "Edge Function returned a non-2xx status code" и показывать понятное сообщение:
  - "Функция временно недоступна, попробуйте через 10 секунд"
  - Добавить кнопку "Повторить" в тост-уведомление
- Не менять логику вызовов - только обработку ответов

### Шаг 2: Исправить бейджи непрочитанных сообщений

**Файл:** `src/hooks/useUnreadMessagesCount.tsx`

- Добавить error-handling: если запрос к `telegram_messages` возвращает ошибку, не глушить её, а логировать в консоль
- Обеспечить, что realtime-подписка всегда переподключается при потере соединения

**Файл:** `src/hooks/useUnreadEmailCount.tsx`

- Аналогичные улучшения error-handling
- Добавить `enabled: true` явно и `retry: 3` для устойчивости

**Файл:** `src/components/layout/AdminSidebar.tsx`

- Проверить, что `totalUnread` корректно вычисляется даже если один из хуков возвращает undefined/null
- Добавить fallback: `(unreadMessagesCount || 0) + (unreadEmailCount || 0)`

### Шаг 3: Реализовать браузерные push-уведомления

Push-уведомления будут работать в браузере на ПК и мобильных устройствах без необходимости устанавливать приложение из магазина. Это стандартные Web Push уведомления.

#### 3.1 Создать Service Worker

**Файл (новый):** `public/sw.js`

- Обработка push-событий: показ уведомления с текстом, иконкой и кликабельной ссылкой
- Обработка клика: открытие/фокус на нужной вкладке (контакт-центр)
- `navigateFallbackDenylist` для `/~oauth`

#### 3.2 Регистрация Service Worker и запрос разрешения

**Файл (новый):** `src/hooks/usePushNotifications.ts`

- Регистрация SW при загрузке приложения
- Запрос разрешения на уведомления (`Notification.requestPermission`)
- Подписка на push через VAPID ключ
- Сохранение `push_subscription` в таблицу БД

#### 3.3 Таблица для push-подписок

**Миграция БД:** создать таблицу `push_subscriptions`

```
id, user_id, endpoint, p256dh, auth, created_at, updated_at
```

- RLS: пользователь может CRUD только свои записи
- Уникальность по `endpoint`

#### 3.4 Edge-функция для отправки push

**Файл (новый):** `supabase/functions/send-push-notification/index.ts`

- Принимает `user_id`, `title`, `body`, `url`
- Получает все `push_subscriptions` пользователя
- Отправляет Web Push через `web-push` библиотеку
- Обрабатывает expired subscriptions (удаление при 410 Gone)

#### 3.5 Вызов push из Telegram-вебхука

**Файл:** `supabase/functions/telegram-webhook/index.ts` (точечное дополнение)

- При получении нового входящего сообщения в Telegram, вызвать `send-push-notification` для всех администраторов с ролью `super_admin` или `support.view` правом
- Минимальное изменение: добавить вызов после сохранения сообщения

#### 3.6 UI для включения/выключения push

**Файл (новый):** `src/components/admin/PushNotificationToggle.tsx`

- Кнопка-переключатель в шапке админки или в настройках
- Показывает статус: "Уведомления включены" / "Включить уведомления"
- При нажатии запрашивает разрешение и подписывает на push

#### 3.7 Секреты

- Потребуется VAPID ключ (публичный и приватный). Будет создан и сохранён через secrets tool:
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT` (email администратора)

---

## Технические детали

### Безопасность
- Push-подписки защищены RLS: только владелец может управлять
- Edge-функция отправки доступна только с `service_role` или `X-Cron-Secret`
- VAPID ключи хранятся в секретах, не в коде

### Без изменений
- Визуальный дизайн сайдбара и контакт-центра
- Логика автопродлений и подписок
- Существующая палитра и стили

### Измененные файлы (итого)
1. `src/hooks/useUnreadMessagesCount.tsx` - улучшение error-handling
2. `src/hooks/useUnreadEmailCount.tsx` - улучшение error-handling
3. `src/components/layout/AdminSidebar.tsx` - fallback для бейджа
4. `src/components/admin/SubscriptionActionsSheet.tsx` - нормализация ошибок EF
5. `src/components/admin/EditSubscriptionDialog.tsx` - нормализация ошибок EF
6. `src/components/admin/GrantAccessFromDealDialog.tsx` - нормализация ошибок EF
7. `public/sw.js` - **новый** Service Worker
8. `src/hooks/usePushNotifications.ts` - **новый** хук
9. `src/components/admin/PushNotificationToggle.tsx` - **новый** UI-компонент
10. `supabase/functions/send-push-notification/index.ts` - **новая** edge-функция
11. Миграция БД: таблица `push_subscriptions`

