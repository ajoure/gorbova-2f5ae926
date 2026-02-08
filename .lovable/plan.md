План: Мультитерминальный поиск (P0-guard) + Новый столбец «Описание bePaid»

Обзор задачи

Пользователь запрашивает:
	1.	Мультитерминальный поиск (AND-логика) — поиск по нескольким словам одновременно
Пример: Шидловская 250.00
	2.	Поиск по всем колонкам таблицы — включая суммы, продукты, описания
	3.	Новый столбец «Описание bePaid» — отображение поля description из bePaid
	4.	Универсальность — одинаковая логика для Платежей, Контактов и Сделок
	5.	P0-guard по производительности — поиск не должен тормозить на больших таблицах (1k+ строк)

⸻

Ключевое архитектурное требование (P0-GUARD)

❗ Запрещено выполнять сбор строк поиска внутри .filter() или при каждом render.

Правильный подход:
	•	Для каждой строки ОДИН РАЗ формируется search_index
	•	search_index — это нормализованная строка со всеми полями
	•	Поиск = проверка terms.every(term => search_index.includes(term))
	•	Вся логика — внутри useMemo

⸻

Текущее состояние

Платежи (PaymentsTabContent.tsx)

Поиск работает только по:
	•	UID
	•	Email
	•	Телефон
	•	Карт-холдер
	•	Last4
	•	Номер заказа
	•	Имя контакта

❌ Не ищет по: сумме, продукту, description

⸻

Контакты (AdminContacts.tsx)

Поиск по:
	•	Email
	•	ФИО
	•	Телефон
	•	Telegram username

⸻

Сделки (AdminDeals.tsx)

Поиск по:
	•	Номер заказа
	•	Email
	•	Телефон
	•	Имя контакта
	•	Название продукта

❌ Не ищет по: сумме (final_price)

⸻

Данные bePaid description

"Оплата по сделке 31152817 (Gorbova Club)"
"Gorbova Club - BUSINESS"
"Gorbova Club - BUSINESS (Trial)"
"ЗАКРОЙ ГОД 2025-2026"
"Платная консультация - Срочная консультация"

Поле bepaid_product уже содержит q.description || q.product_name, но:
	1.	Не отображается отдельным столбцом
	2.	Не участвует в поиске

⸻

Решение

⸻

Часть 1: Универсальный P0-guard helper (НОВЫЙ ФАЙЛ)

src/lib/multiTermSearch.ts

/**
 * Нормализация значений для поиска
 */
export function normalizeSearchValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value.toString();
  return String(value)
    .toLowerCase()
    .replace(',', '.')
    .trim();
}

/**
 * Сбор поискового индекса (ВЫЗЫВАЕТСЯ 1 РАЗ)
 */
export function buildSearchIndex(
  fields: Array<string | number | null | undefined>
): string {
  return fields
    .map(normalizeSearchValue)
    .filter(Boolean)
    .join(' ');
}

/**
 * AND-поиск по готовому search_index
 */
export function matchSearchIndex(
  searchInput: string,
  searchIndex: string
): boolean {
  if (!searchInput.trim()) return true;

  const terms = searchInput
    .toLowerCase()
    .replace(',', '.')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) return true;

  return terms.every(term => searchIndex.includes(term));
}


⸻

Часть 2: Платежи — расширенный поиск + P0-guard

2.1 Обновление UnifiedPayment

export interface UnifiedPayment {
  // ...
  bepaid_description: string | null;
  search_index: string; // P0-guard
}


⸻

2.2 Заполнение search_index при трансформации

Queue items

bepaid_description: q.description || null,

search_index: buildSearchIndex([
  q.uid,
  q.customer_email,
  q.customer_phone,
  q.card_holder,
  q.card_last4,
  q.order_number,
  q.profile_name,
  q.profile_email,
  q.profile_phone,
  q.amount,
  q.product_name,
  q.tariff_name,
  q.description,
]),

payments_v2

const desc =
  providerResponse?.transaction?.additional_data?.description || null;

bepaid_description: desc,

search_index: buildSearchIndex([
  p.uid,
  p.customer_email,
  p.customer_phone,
  p.card_holder,
  p.card_last4,
  p.order_number,
  p.profile_name,
  p.profile_email,
  p.profile_phone,
  p.amount,
  p.product_name,
  p.tariff_name,
  p.bepaid_product,
  desc,
]),


⸻

2.3 Новый столбец «Описание bePaid»

{ 
  key: "bepaid_description",
  label: "Описание bePaid",
  visible: false,
  width: 220,
  order: 10,
}

Рендеринг:

case 'bepaid_description':
  if (!payment.bepaid_description) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-xs truncate max-w-[200px] cursor-default">
          {payment.bepaid_description}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-md">
        {payment.bepaid_description}
      </TooltipContent>
    </Tooltip>
  );


⸻

2.4 PaymentsTabContent — фильтрация с P0-guard

const filteredPayments = useMemo(() => {
  if (!filters.search) return payments;
  return payments.filter(p =>
    matchSearchIndex(filters.search, p.search_index)
  );
}, [payments, filters.search]);


⸻

Часть 3: Контакты — P0-guard поиск

const contactsWithIndex = useMemo(() =>
  contacts.map(c => ({
    ...c,
    search_index: buildSearchIndex([
      c.email,
      c.full_name,
      c.first_name,
      c.last_name,
      c.phone,
      c.telegram_username,
    ]),
  })),
[contacts]);

const filteredContacts = useMemo(() => {
  if (!search) return contactsWithIndex;
  return contactsWithIndex.filter(c =>
    matchSearchIndex(search, c.search_index)
  );
}, [contactsWithIndex, search]);


⸻

Часть 4: Сделки — P0-guard + поиск по сумме

const dealsWithIndex = useMemo(() =>
  deals.map(d => {
    const profile = profilesMap?.get(d.user_id);
    return {
      ...d,
      search_index: buildSearchIndex([
        d.order_number,
        d.customer_email,
        d.customer_phone,
        profile?.email,
        profile?.full_name,
        (d.products_v2 as any)?.name,
        (d.tariffs as any)?.name,
        d.final_price,
      ]),
    };
  }),
[deals, profilesMap]);

const filteredDeals = useMemo(() => {
  if (!search) return dealsWithIndex;
  return dealsWithIndex.filter(d =>
    matchSearchIndex(search, d.search_index)
  );
}, [dealsWithIndex, search]);


⸻

Файлы для создания / изменения

Новые файлы

Файл	Назначение
src/lib/multiTermSearch.ts	P0-guard логика поиска

Изменяемые файлы

Файл	Изменения
useUnifiedPayments.tsx	bepaid_description + search_index
PaymentsTable.tsx	столбец «Описание bePaid»
PaymentsTabContent.tsx	matchSearchIndex
AdminContacts.tsx	P0-guard поиск
AdminDeals.tsx	P0-guard + сумма


⸻

DoD (Definition of Done)
	1.	Поиск "шидловская 250" — мгновенный, без лагов
	2.	"gorbova chat 250" — работает
	3.	"закрой год" — ищет по description
	4.	Столбец Описание bePaid включается через настройки
	5.	Нет пересборки строк при вводе (проверка через DevTools Performance)

⸻

Жёсткие P0-правила
	•	❌ Никакого join() внутри filter
	•	❌ Никакого пересоздания search-строк при каждом render
	•	✅ Только useMemo
	•	✅ Один search_index = одна строка
	•	✅ Поиск = includes по готовому индексу

