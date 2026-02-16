
# Исправление: данные подписки при редактировании сделки не сохраняются

## Причина бага

В `EditDealDialog.tsx` (строка 216) логика сохранения:
```
if (subscription) {
  // обновить подписку...
}
```

Если переменная `subscription` равна `null` (подписка не загрузилась, была создана после открытия диалога, или вернулся пустой ответ), весь блок пропускается. При этом заказ (`orders_v2`) обновляется успешно и показывается тост "Сделка обновлена", создавая иллюзию успеха.

Подтверждено сетевым запросом: `GET subscriptions_v2?order_id=eq.5bd38d12...` вернул `[]`, хотя подписка в БД уже существует (id: 372c8dca).

## Решение

### 1. Re-fetch подписки внутри мутации

Не полагаться на закешированную переменную `subscription` из useQuery. Вместо этого в `mutationFn` заново запросить подписку по `order_id` прямо перед обновлением. Это решает проблему стейла кеша и гонки.

### 2. Создание подписки, если её нет

Если подписка не найдена, но пользователь заполнил даты (`access_start_at` или `access_end_at`), нужно **создать** новую `subscriptions_v2` запись (INSERT) вместо молчаливого пропуска.

Минимальный набор полей для создания:
- `user_id` (из заказа)
- `product_id` (из формы)
- `order_id` (deal.id)
- `tariff_id` (из формы, если есть)
- `status: 'active'`
- `access_start_at`, `access_end_at`, `auto_renew`, `next_charge_at`
- `profile_id` (из формы)

### 3. Предотвращение сохранения до загрузки данных

Добавить индикатор загрузки подписки. Если subscription query ещё в состоянии `isLoading`, отключить кнопку "Сохранить изменения" и показать спиннер рядом с секцией "Период доступа".

## Технические детали

**Файл**: `src/components/admin/EditDealDialog.tsx`

### Изменение 1: Получить `isLoading` из useQuery подписки (строка 122)
```typescript
const { data: subscription, isLoading: subscriptionLoading } = useQuery({...});
```

### Изменение 2: Re-fetch + upsert в mutationFn (строка 215-279)
Заменить `if (subscription)` на:
```typescript
// Re-fetch subscription inside mutation to avoid stale data
const { data: freshSubscription } = await supabase
  .from("subscriptions_v2")
  .select("*")
  .eq("order_id", deal.id)
  .maybeSingle();

if (freshSubscription) {
  // UPDATE existing subscription (текущая логика)
} else if (formData.access_start_at || formData.access_end_at || formData.auto_renew) {
  // INSERT new subscription
  const { error: insertError } = await supabase
    .from("subscriptions_v2")
    .insert({
      user_id: formData.user_id || deal.user_id,
      product_id: formData.product_id,
      order_id: deal.id,
      tariff_id: formData.tariff_id || null,
      profile_id: formData.profile_id || deal.profile_id,
      status: 'active',
      access_start_at: formData.access_start_at?.toISOString() || new Date().toISOString(),
      access_end_at: formData.access_end_at?.toISOString() || null,
      next_charge_at: formData.next_charge_at?.toISOString() || null,
      auto_renew: formData.auto_renew,
      payment_method_id: formData.auto_renew && userPaymentMethod?.id ? userPaymentMethod.id : null,
    });
  if (insertError) throw new Error(`Ошибка создания подписки: ${insertError.message}`);
}
```

### Изменение 3: Блокировка кнопки при загрузке (DialogFooter)
```typescript
<Button 
  onClick={() => updateMutation.mutate()} 
  disabled={updateMutation.isPending || subscriptionLoading}
>
```

### Изменение 4: Спиннер загрузки в секции "Период доступа"
Показывать индикатор загрузки пока subscription query не завершился.

## Что НЕ меняется
- Логика обновления orders_v2 остаётся прежней
- Логика entitlements остаётся прежней
- Логика отзыва доступа при отмене остаётся прежней
- Никакие другие файлы не затрагиваются

## Файлы
| Файл | Изменение |
|---|---|
| `src/components/admin/EditDealDialog.tsx` | Re-fetch подписки в мутации, upsert логика, индикатор загрузки |

## DoD
- Заполненные даты и автопродление сохраняются при нажатии "Сохранить"
- Если подписки нет — она создаётся автоматически
- При повторном открытии диалога данные на месте
- Кнопка "Сохранить" недоступна пока подписка загружается
