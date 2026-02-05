ЖЁСТКИЕ ПРАВИЛА ИСПОЛНЕНИЯ ДЛЯ LOVABLE.DEV
- Ничего не ломать и не трогать лишнее. Только изменения из этого PATCH.
- Add-only где возможно; удаления — только подтверждённые дубли/мертвый код.
- Dry-run → execute: сначала аудит зависимостей/использований, потом удаления/редиректы.
- STOP-guards: если найдено неизвестное использование / ссылка / import / меню-пункт — СТОП и отчёт.
- RBAC: admin видит ВСЁ всегда; user — только разрешённое.
- Финальный отчёт обязателен: список файлов + diff-summary + DoD с UI-скринами из 7500084@gmail.com.

================================================================================
# План: Регистрация Edge-функции BePaid, удаление дублирующих страниц, канонизация Контакт-центра (V2, ДОРАБОТАНО)

## Обзор изменений
Патч устраняет ошибку Edge Function BePaid и удаляет/канонизирует дубли страниц коммуникаций, чтобы исключить ситуацию, когда разработчик чинит “не ту” страницу.

КАНОН:
- Коммуникации: `/admin/communication` (Контакт-центр) — единственный каноничный экран.
- BePaid подписки: `/admin/payments/bepaid-subscriptions` — каноничный экран.
Все старые страницы-дубли должны быть либо удалены, либо превращены в ТОНКИЙ редирект на канон.

---

## PATCH-0 (ОБЯЗАТЕЛЬНО): DRY-RUN аудит перед удалением
Цель: доказать, что удаляемые страницы не используются как канон.

Сделать:
1) Поиск по коду:
   - `AdminInbox`, `AdminBroadcasts`, `AdminBepaidSubscriptions`
   - пути: `/admin/inbox`, `/admin/broadcasts`, `/admin/bepaid-subscriptions`
2) Проверить:
   - ссылки из меню/кнопок/хедера
   - прямые `navigate(...)`/`Link to=...`
   - импорт/использование компонентов внутри других страниц
3) Результат dry-run отчёта (обязателен):
   - “Где найдено” + “Почему безопасно” + “Что будет после редиректа”.

STOP: если есть хоть одно неочевидное использование (кроме прямого URL) — стоп и согласование.

DoD:
- Отчёт dry-run приложен в итоговом сообщении.

---

## PATCH-1: Регистрация Edge Function `bepaid-list-subscriptions`
**Проблема**: функция есть в FS, но не зарегистрирована в `supabase/config.toml`, из-за чего Supabase не деплоит её.

Файл: `supabase/config.toml`

Добавить:
```toml
[functions.bepaid-list-subscriptions]
verify_jwt = false

DoD:
	•	/admin/payments → вкладка “Подписки BePaid” → “Обновить” → данные загружаются без “Failed to send a request to the Edge Function”.

⸻

PATCH-2: Канонизация /admin/bepaid-subscriptions

Проблема: старая страница дублирует вкладку в Платежах.

Изменения:

Файл	Действие
src/App.tsx	Удалить импорт AdminBepaidSubscriptions
src/App.tsx	Заменить роут на редирект
src/pages/admin/AdminBepaidSubscriptions.tsx	Удалить файл

Новый роут:

<Route
  path="/admin/bepaid-subscriptions"
  element={<Navigate to="/admin/payments/bepaid-subscriptions" replace />}
/>

DoD:
	•	/admin/bepaid-subscriptions всегда редиректит на канон.
	•	В коде больше нет импорта/страницы AdminBepaidSubscriptions.

⸻

PATCH-3: Канонизация /admin/inbox → /admin/communication

Контекст: сейчас существуют 2 экрана, и это приводит к “чинят не то”.

ВАЖНО (корректировка):
	•	Мы НЕ “ломаем” старые ссылки — делаем редирект.
	•	Канон — /admin/communication.

Изменения:

Файл	Действие
src/App.tsx	Удалить импорт AdminInbox
src/App.tsx	Заменить роут на редирект
src/pages/admin/AdminInbox.tsx	Удалить файл

Новый роут:

<Route path="/admin/inbox" element={<Navigate to="/admin/communication" replace />} />

DoD:
	•	Открытие /admin/inbox ведёт на /admin/communication.
	•	Никакой отдельной логики/страницы Inbox больше нет.

⸻

PATCH-4: Канонизация /admin/broadcasts → /admin/communication?tab=broadcasts

Изменения:

Файл	Действие
src/App.tsx	Удалить импорт AdminBroadcasts
src/App.tsx	Заменить роут на редирект
src/pages/admin/AdminBroadcasts.tsx	Удалить файл

Новый роут:

<Route
  path="/admin/broadcasts"
  element={<Navigate to="/admin/communication?tab=broadcasts" replace />}
/>

DoD:
	•	/admin/broadcasts всегда открывает вкладку рассылок внутри Контакт-центра.

⸻

PATCH-5: Breadcrumbs / названия (и защита от “двух правд”)

Файл: src/components/layout/DashboardBreadcrumbs.tsx

Изменение:
	•	Удалить устаревшие записи, чтобы UI не “подсказывал” пользователю, что есть отдельные страницы:

"/admin/inbox": "Входящие",
"/admin/broadcasts": "Рассылки",

Доп. требование (корректировка):
	•	Убедиться, что breadcrumbs для /admin/communication корректно отражают вкладки (Telegram/Email/Рассылки) внутри одной страницы, а не отдельные маршруты.

DoD:
	•	В хлебных крошках и заголовках больше нет “Входящие” и “Рассылки” как самостоятельных страниц.

⸻

PATCH-6 (РЕКОМЕНДУЕМО, но очень желательно): Guard-баннер для deprecated routes

Цель: если кто-то всё же попадёт на старую ссылку — он увидит, что это редирект на канон (чтобы не было “мне чинили другое”).

Сделать:
	•	при заходе на deprecated routes (/admin/inbox, /admin/broadcasts, /admin/bepaid-subscriptions) перед редиректом можно логировать console.warn (dev only) и/или показывать короткий toast “Страница устарела, перенаправляем…”.

STOP: не добавлять лишних зависимостей, только минимальный UI.

DoD:
	•	В dev-консоли видно, что это редирект на канон (опционально), либо toast отрабатывает.

⸻

Итоговая таблица роутов

Роут	Статус	Действие	Доступ в меню
/admin/communication	CANON	Оставить	Да (“Контакт-центр”)
/admin/inbox	DUPLICATE	Redirect → /admin/communication	Нет
/admin/broadcasts	DUPLICATE	Redirect → /admin/communication?tab=broadcasts	Нет
/admin/payments/bepaid-subscriptions	CANON	Оставить	Да (вкладка в “Платежи”)
/admin/bepaid-subscriptions	DUPLICATE	Redirect → /admin/payments/bepaid-subscriptions	Нет


⸻

Удаляемые файлы (после DRY-RUN)
	1.	src/pages/admin/AdminInbox.tsx
	2.	src/pages/admin/AdminBroadcasts.tsx
	3.	src/pages/admin/AdminBepaidSubscriptions.tsx

⸻

Техническая сводка изменений

Файл	Изменение
supabase/config.toml	Добавить регистрацию функции
src/App.tsx	Удалить 3 импорта, заменить 3 роута на редиректы
src/components/layout/DashboardBreadcrumbs.tsx	Удалить 2 устаревшие записи
src/pages/admin/AdminInbox.tsx	Удалить
src/pages/admin/AdminBroadcasts.tsx	Удалить
src/pages/admin/AdminBepaidSubscriptions.tsx	Удалить


⸻

Проверка (DoD)
	1.	/admin/payments → “Подписки BePaid” → “Обновить” → данные грузятся без ошибки
	2.	/admin/bepaid-subscriptions → редирект на /admin/payments/bepaid-subscriptions
	3.	/admin/inbox → редирект на /admin/communication
	4.	/admin/broadcasts → редирект на /admin/communication?tab=broadcasts
	5.	/admin/communication → вкладки Telegram/Email/Рассылки работают корректно
	6.	Меню содержит только “Контакт-центр”, без отдельных “Inbox/Рассылки”
	7.	Финальный отчёт: dry-run результаты + список изменённых файлов + UI-скрины (аккаунт 7500084@gmail.com)

