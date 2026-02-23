
# Экспорт сделок и контактов в Excel / CSV

## Анализ существующего кода

В проекте **нет** централизованной утилиты экспорта. Каждая страница реализует CSV-выгрузку inline:
- `AdminConsents.tsx` -- ручная сборка CSV с BOM
- `TelegramClubMembers.tsx` -- аналогично
- `AdminMarketingInsights.tsx` -- аналогично
- `BepaidRawDataTab.tsx` -- аналогично

Пакет `xlsx` установлен, но используется **только для импорта** (чтение). Пакет `file-saver` установлен. Пакет `papaparse` установлен.

Централизованной функции `exportToExcel` / `exportToCSV` не существует -- нужно создать.

## Что будет сделано

### 1. Новый файл: `src/utils/exportTableData.ts`

Создать **единый** утилитарный модуль для экспорта табличных данных. Переиспользуемый для любых страниц.

Интерфейс:
```text
interface ExportColumn<T> {
  header: string;           // Заголовок колонки ("Дата", "Контакт")
  getValue: (row: T) => string | number;  // Как извлечь значение
}

function exportToExcel<T>(data: T[], columns: ExportColumn<T>[], filename: string): void
function exportToCSV<T>(data: T[], columns: ExportColumn<T>[], filename: string): void
```

Реализация:
- `exportToExcel`: динамический `import("xlsx")` (как в остальном коде), `XLSX.utils.json_to_sheet` -> `XLSX.utils.book_new` -> `XLSX.writeFile`. Ширина колонок автоматически по содержимому.
- `exportToCSV`: `papaparse.unparse()` с UTF-8 BOM (`\uFEFF`) для корректного открытия в Excel. Скачивание через `file-saver` (`saveAs`).

### 2. Кнопка экспорта в `AdminDeals.tsx`

Добавить в actions row (строка ~633, рядом с RefreshCw) кнопку с `DropdownMenu`:
- Иконка `Download` + текст "Экспорт" (текст скрыт на мобильных)
- Два пункта: "Excel (.xlsx)" с иконкой `FileSpreadsheet`, "CSV (.csv)" с иконкой `FileText`
- Disabled если `sortedDeals.length === 0`

Колонки экспорта (из `sortedDeals` -- уже отфильтрованные + отсортированные):

| Заголовок | Источник |
|---|---|
| Дата | `deal.created_at` -> `dd.MM.yyyy HH:mm` |
| Номер | `deal.order_number` |
| Контакт | `profilesMap.get(deal.user_id)?.full_name` |
| Email | `deal.customer_email` или `profile.email` |
| Телефон | `profile.phone` |
| Продукт | `deal.products_v2?.name` |
| Тариф | `deal.tariffs?.name` |
| Сумма | `deal.final_price` (число) |
| Валюта | `deal.currency` |
| Статус | `STATUS_CONFIG[deal.status]?.label` |
| Доступ до | `deal.trial_end_at` -> `dd.MM.yyyy` |

Имя файла: `sdelki_2026-02-23.xlsx` / `.csv`

Toast после скачивания: "Экспортировано N записей".

### 3. Кнопка экспорта в `AdminContacts.tsx`

Добавить в actions row (строка ~1165, рядом с RefreshCw) аналогичную кнопку с `DropdownMenu`.

Колонки экспорта (из `sortedContacts`):

| Заголовок | Источник |
|---|---|
| Имя | `contact.full_name` |
| Email | `contact.email` |
| Телефон | `contact.phone` |
| Telegram | `contact.telegram_username` |
| Сделок | `contact.deals_count` (число) |
| Последняя сделка | `contact.last_deal_at` -> `dd.MM.yyyy` |
| Статус | `contact.status_account` |
| Дата регистрации | `contact.created_at` -> `dd.MM.yyyy HH:mm` |

Имя файла: `kontakty_2026-02-23.xlsx` / `.csv`

## Затронутые файлы

| Файл | Изменение |
|---|---|
| `src/utils/exportTableData.ts` | **Новый** -- единый утилитарный модуль exportToExcel / exportToCSV |
| `src/pages/admin/AdminDeals.tsx` | Кнопка "Экспорт" в toolbar (DropdownMenu с Excel/CSV) |
| `src/pages/admin/AdminContacts.tsx` | Кнопка "Экспорт" в toolbar (DropdownMenu с Excel/CSV) |

## DoD

1. На странице Сделки есть кнопка "Экспорт" с dropdown (Excel / CSV)
2. На странице Контакты есть кнопка "Экспорт" с dropdown (Excel / CSV)
3. Экспорт выгружает только отфильтрованные и отсортированные данные
4. Excel открывается корректно (кириллица, ширина колонок)
5. CSV открывается в Excel корректно (UTF-8 BOM, разделитель)
6. Кнопка disabled при пустом списке
7. Нет ошибок сборки/TS
