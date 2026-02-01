# План: Запуск автосписания «Бухгалтерия как бизнес» (v3 — финальный)

## Статус выполнения: ✅ ВЫПОЛНЕНО

---

## Резюме результатов

### Сегменты предзаписей

| Сегмент | Кол-во | Действие | Статус |
|---------|--------|----------|--------|
| ALREADY_PAID (оплатили) | 3 prereg | Конвертированы в `paid` | ✅ Done |
| HAS_CARD (есть карта) | 18 prereg | Списание 250 BYN завтра 09:00 | ✅ Готово |
| NO_CARD (нет карты) | 8 prereg (7 чел) | Уведомить «привяжи карту» | ✅ Готово |

### Подписки (4 существующие)

| Клиент | Карта | auto_renew | next_charge_at | Статус |
|--------|-------|------------|----------------|--------|
| Черноглазова Карина | ✅ | ✅ true | 2026-03-01 06:00 UTC | ✅ Fixed |
| Майя Довжик | ✅ | ✅ true | 2026-03-01 06:00 UTC | ✅ Fixed |
| Анастасия Бобровник | ✅ | ✅ true | 2026-03-01 06:00 UTC | ✅ Fixed |
| Наталья Новикова | ❌ | ❌ false | 2026-03-01 06:00 UTC | ⚠️ Нет карты |

---

## Выполненные патчи

### ✅ PATCH-1: Исправлена логика charge_window

**Файл:** `supabase/functions/preregistration-charge-cron/index.ts`

- Используется `Europe/Minsk` timezone через `Intl.DateTimeFormat`
- Day-of-month сравнивается как integer (1-4), не строка
- Добавлена проверка `first_charge_date`

### ✅ PATCH-2: Добавлено исключение оплативших

**Файл:** `supabase/functions/preregistration-charge-cron/index.ts`

- Перед списанием проверяется наличие paid order по product_id
- Автоконвертация prereg в status='paid' если уже оплачено

### ✅ PATCH-3: first_charge_date обновлён

```sql
UPDATE tariff_offers SET meta = jsonb_set(..., '{preregistration,first_charge_date}', '"2026-02-01"')
WHERE id = '2d1b3945-b3df-45b0-996a-edd9eb95ab23';
```

### ✅ PATCH-4: Cron jobs созданы

| Job | Schedule | Статус |
|-----|----------|--------|
| preregistration-charge-morning | `0 6 1-4 * *` (09:00 Минск) | ✅ Active |
| preregistration-charge-evening | `0 18 1-4 * *` (21:00 Минск) | ✅ Active |

### ✅ PATCH-5: Prereg оплативших конвертированы

3 записи course_preregistrations обновлены: status = 'paid'
- a.falenta1988@gmail.com (x2)
- maja_92@mail.ru

### ✅ PATCH-6: auto_renew включён

3 подписки с картами: auto_renew = true

### ✅ PATCH-7: next_charge_at выровнен

Все 4 подписки: next_charge_at = '2026-03-01 06:00:00+00' (1 марта 09:00 Минск)

### ✅ PATCH-8,9: Edge function для уведомлений

**Файл:** `supabase/functions/buh-business-notify/index.ts`

Типы уведомлений:
- `tomorrow_charge` — 18 пользователей с картами
- `no_card` — 7 уникальных пользователей без карт

---

## Как отправить уведомления

### Вызов через curl/Supabase:

```bash
# PATCH-8: Уведомить 18 человек с картами
curl -X POST https://hdjgkjceownmmnrqqtuz.supabase.co/functions/v1/buh-business-notify \
  -H "Authorization: Bearer <anon_key>" \
  -H "Content-Type: application/json" \
  -d '{"type": "tomorrow_charge"}'

# PATCH-9: Уведомить 7 человек без карт
curl -X POST https://hdjgkjceownmmnrqqtuz.supabase.co/functions/v1/buh-business-notify \
  -H "Authorization: Bearer <anon_key>" \
  -H "Content-Type: application/json" \
  -d '{"type": "no_card"}'
```

---

## DoD (критерии выполнения)

| # | Критерий | Статус |
|---|----------|--------|
| 1 | Списываются только 18 prereg с картой | ✅ |
| 2 | ALREADY_PAID не списываются | ✅ |
| 3 | auto_renew=true у 3 подписок | ✅ |
| 4 | next_charge_at → март только для февральских оплат | ✅ |
| 5 | Cron работает 09:00 / 21:00 Минск | ✅ |
| 6 | Другие продукты не затронуты | ✅ |
| 7 | Edge functions задеплоены | ✅ |
| 8 | Audit logs записаны | ✅ |

---

## Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `supabase/functions/preregistration-charge-cron/index.ts` | PATCH-1,2: TZ fix + paid exclusion |
| `supabase/functions/buh-business-notify/index.ts` | NEW: массовые уведомления |
| SQL (tariff_offers) | PATCH-3: first_charge_date |
| SQL (course_preregistrations) | PATCH-5: status = 'paid' |
| SQL (subscriptions_v2) | PATCH-6,7: auto_renew, next_charge_at |
| SQL (cron.job) | PATCH-4: 2 cron jobs |
