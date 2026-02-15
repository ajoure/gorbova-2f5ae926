
# Исправление Push-уведомлений: VAPID ключ и Safari

## Корневые причины

### 1. VAPID ключ отсутствует в production-сборке (КРИТИЧНО)
На скриншоте production-сайта (club.gorbova.by) видно: **"Push-уведомления не настроены: отсутствует VAPID ключ"**.

Причина: `import.meta.env.VITE_VAPID_PUBLIC_KEY` внедряется в код только во время сборки (build-time). Секрет добавлен, но Vite не подставляет его в production-бандл. Это главная причина, почему push-подписки не создаются и таблица `push_subscriptions` пуста.

**Решение**: Создать edge-функцию `get-vapid-key`, которая отдаёт публичный VAPID-ключ по HTTP-запросу. Фронтенд будет получать ключ динамически при подписке, а не полагаться на build-time переменную.

### 2. Safari на iOS не поддерживает Push в браузере
На скриншоте с iPhone: **"Push-уведомления не поддерживаются в этом браузере"**.

Это ожидаемое поведение: Safari на iOS поддерживает Web Push **только** если сайт добавлен на главный экран как PWA (с iOS 16.4+). В обычном браузере Safari Push API недоступен.

**Решение**: Вместо сообщения "не поддерживается" показать пользователю инструкцию: "Добавьте сайт на главный экран для получения уведомлений". Manifest.json уже есть, сайт готов к установке как PWA.

---

## План изменений

### Шаг 1: Новая edge-функция `get-vapid-key`

**Файл:** `supabase/functions/get-vapid-key/index.ts`

Минимальная функция, которая:
- Читает `VAPID_PUBLIC_KEY` из серверных секретов
- Возвращает его в JSON: `{ key: "..." }`
- Доступна без авторизации (ключ публичный по определению)

### Шаг 2: Обновить `usePushNotifications.ts`

**Файл:** `src/hooks/usePushNotifications.ts`

- Убрать зависимость от `import.meta.env.VITE_VAPID_PUBLIC_KEY`
- При подписке: вызвать `fetch` к edge-функции `get-vapid-key` для получения ключа
- Кэшировать ключ в памяти после первого получения
- Определять iOS Safari и устанавливать специальный state `"ios-safari"` вместо `"unsupported"`

### Шаг 3: Обновить `PushNotificationToggle.tsx`

**Файл:** `src/components/admin/PushNotificationToggle.tsx`

- Добавить обработку нового состояния `"ios-safari"`: показывать tooltip с инструкцией "Добавьте сайт на главный экран (Поделиться -> На экран Домой)"
- Иконка: показать `Smartphone` вместо `BellOff` для iOS Safari

---

## Технические детали

### Изменяемые файлы
1. `supabase/functions/get-vapid-key/index.ts` — **новый** (edge-функция)
2. `src/hooks/usePushNotifications.ts` — fetch VAPID ключа динамически + iOS-детекция
3. `src/components/admin/PushNotificationToggle.tsx` — обработка iOS Safari

### Без изменений
- `public/sw.js` — Service Worker не меняется
- `public/manifest.json` — уже корректен для PWA
- `send-push-notification/index.ts` — серверная отправка работает
- `AdminLayout.tsx` — не затрагивается
- RLS-политики — не затрагиваются
