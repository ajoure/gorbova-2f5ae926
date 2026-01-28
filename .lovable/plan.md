
# План: Корректное отслеживание доступа к клубу и исправление UI карточки

## Проблема

На скриншоте видно, что карточка "Клуб «Буква Закона»" отображает:
1. **Плашку "Куплено"** — показывается всем, хотя должна только для активных подписчиков
2. **Кнопку "Открыть курс"** — клуб это не курс, открывать нечего
3. **"24 уроков"** — некорректная метрика для подписки

## Решение

### 1. Добавить проверку реального доступа к клубу

Проверять `subscriptions_v2` на наличие активной подписки со статусом `active` или `trial` для продукта `club` (id: `11c9f1b8-0355-4753-bd74-40b42aa53616`).

### 2. Изменить карточку клуба в Products.tsx

| Элемент | Сейчас | После |
|---------|--------|-------|
| Плашка "Куплено" | Всегда показывается | Только если есть активная подписка |
| Кнопка "Открыть курс" | Показывается | Убрать полностью для клуба |
| "24 уроков" | Показывается | Убрать для клуба |
| Кнопка "На сайт" | Есть | Оставить как единственную кнопку |

### 3. Изменить карточку клуба в Learning.tsx

Аналогичные изменения:
- Проверка доступа через `subscriptions_v2`
- Убрать `courseSlug` и `lessonCount` для клуба
- Оставить только кнопку "На сайт"

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/pages/Products.tsx` | Добавить хук проверки доступа к клубу; убрать "уроки" и кнопку курса для клуба |
| `src/pages/Learning.tsx` | Изменить данные продукта клуба: убрать `courseSlug`, `lessonCount`; использовать реальный доступ |

## Детали реализации

### Products.tsx

```typescript
// Добавить импорты
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Добавить проверку доступа к клубу
const { data: hasClubAccess } = useQuery({
  queryKey: ["club-access", user?.id],
  queryFn: async () => {
    if (!user?.id) return false;
    
    const { data } = await supabase
      .from("subscriptions_v2")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("product_id", "11c9f1b8-0355-4753-bd74-40b42aa53616") // club product
      .in("status", ["active", "trial"])
      .maybeSingle();
    
    return !!data;
  },
  enabled: !!user?.id,
});

// В карточке клуба:
// - Показывать "Куплено" только если hasClubAccess === true
// - НЕ показывать "уроки"
// - НЕ показывать кнопку "Открыть курс"
```

### Learning.tsx

```typescript
// Обновить данные продукта клуба:
{
  id: "1",
  title: "Клуб «Буква Закона»",
  description: "База знаний, экспертная поддержка и закрытое сообщество профессионалов",
  badge: "Хит",
  badgeVariant: "default",
  price: "от 100 BYN/мес",
  image: productClubImage,
  isPurchased: false, // Будет определяться динамически
  purchaseLink: "https://club.gorbova.by",
  // УБРАТЬ: courseSlug: "knowledge", 
  // УБРАТЬ: lessonCount: 24,
  // УБРАТЬ: completedCount: 18,
  duration: "Подписка",
  isClub: true, // Маркер для особой обработки
}

// Добавить проверку доступа к клубу (аналогично buh-business)
const { data: clubAccess } = useQuery({...});

// В enrichedProducts:
if (product.isClub) {
  return {
    ...product,
    isPurchased: clubAccess || false,
  };
}

// В ProductCard: если product.isClub — не показывать кнопку "Открыть курс"
```

## Результат

1. **Плашка "Куплено"** отображается только у тех, кто реально оплатил подписку
2. **Нет кнопки "Открыть курс"** — только "На сайт" → https://club.gorbova.by
3. **Нет "24 уроков"** — показывается только "Подписка"
4. Данные берутся из реальной таблицы `subscriptions_v2`
