

# Улучшения редакции: фильтры, календарь, очередь

## 1. Убрать кнопку «Новости БиР»

Удалить кнопку «Новости БиР» из фильтров вкладки «Входящие». Останутся только «Беларусь» и «Россия» — если ни одна не выбрана, показываются все новости. Также убрать логику `filterCountry === "by_ru"` из фильтрации.

## 2. Заменить `type="date"` на визуальный календарь из платежей

Компонент `PeriodSelector` и `GlassCalendarPicker` уже существуют в `src/components/ui/period-selector.tsx`. Нужно:

**a) Извлечь `GlassCalendarPicker` в отдельный переиспользуемый компонент**

Сейчас `GlassCalendarPicker` — приватная функция внутри `period-selector.tsx`. Нужно экспортировать её как самостоятельный компонент `DatePicker` в новый файл `src/components/ui/date-picker.tsx`, чтобы использовать везде, где нужен одиночный выбор даты.

**b) Заменить все `type="date"` на новый `DatePicker` — в 10 файлах:**

| Файл | Где используется |
|------|-----------------|
| `AdminEditorial.tsx` | Фильтр «С» / «По» во Входящих, дата вступления в силу, дата в диалоге очереди |
| `AdminIlex.tsx` | Дата от / до в расширенном поиске |
| `AdminProductDetailV2.tsx` | Дата старта, окончания, первого платежа |
| `SyncWithStatementDialog.tsx` | Диапазон дат синхронизации |
| `SyncRunDialog.tsx` | Диапазон дат |
| `BepaidReconcileDialog.tsx` | Диапазон дат сверки |
| `TelegramLogsTab.tsx` | Фильтр по дате логов |
| `AdvancedFilters.tsx` | Поле даты в фильтрах |
| `IndividualDetailsForm.tsx` | Дата рождения, выдачи, действия паспорта |

Новый компонент будет принимать `value: string` (формат `yyyy-MM-dd`) и `onChange: (value: string) => void`, чтобы обеспечить прямую замену `<Input type="date">` без изменения логики состояния.

## 3. Массовые действия в очереди

Добавить на вкладку «В очереди» такую же систему чекбоксов и плавающую панель, как во «Входящих»:

- Новый state: `selectedQueueIds: Set<string>`
- Чекбокс на каждой карточке + «Выбрать все»
- Плавающая панель при выделении с кнопками:
  - «Опубликовать сейчас» — массовая публикация выбранных (последовательно, с задержкой 500ms)
  - «Время публикации» — открывает существующий `queueScheduleDialog`, но применяет ко всем выбранным
  - «Убрать из очереди» — массовый сброс `telegram_status` на `draft`

## 4. Глобальное время публикации очереди

Сейчас можно задать время для каждой отдельной новости, но нет общего расписания для всей очереди. Добавить на вкладку «В очереди» (рядом с информационным баннером) карточку «Автоматическая публикация очереди»:

- Switch вкл/выкл
- Поле ввода времени (`type="time"`)
- `TimezoneSelector` (из платежей)
- Текст: «Все новости в очереди будут публиковаться ежедневно в XX:XX (Минск)»

Настройки хранить в `app_settings` под ключом `news_queue_auto_publish`.

---

## Техническая реализация

### Новый файл: `src/components/ui/date-picker.tsx`

Экспортирует компонент `DatePicker` на основе `GlassCalendarPicker` из `period-selector.tsx`:
- Props: `value?: string`, `onChange: (value: string) => void`, `label?: string`, `placeholder?: string`, `minDate?: string`, `maxDate?: string`, `className?: string`
- Внутри: преобразование `string <-> Date`, popover с `Calendar`, кнопки «Очистить» и «Сегодня»
- Стиль: glassmorphism как в платежах (backdrop-blur, скруглённые углы, тени)

### Изменения в `AdminEditorial.tsx`

1. Удалить кнопку «Новости БиР» и логику `by_ru`
2. Заменить 4 инпута `type="date"` на `DatePicker`
3. Добавить `selectedQueueIds` state и чекбоксы в очередь
4. Добавить плавающую панель для массовых действий в очереди
5. Добавить карточку «Расписание публикации очереди» с сохранением в `app_settings`

### Изменения в остальных 9 файлах

Точечная замена `<Input type="date" ...>` на `<DatePicker ...>` — без изменения логики, только визуальный компонент.

---

## Затрагиваемые файлы

| Файл | Изменение |
|------|-----------|
| `src/components/ui/date-picker.tsx` | **Новый** — универсальный компонент |
| `src/pages/admin/AdminEditorial.tsx` | Убрать «БиР», заменить date-инпуты, массовые действия в очереди |
| `src/pages/admin/AdminIlex.tsx` | Заменить date-инпуты |
| `src/pages/admin/AdminProductDetailV2.tsx` | Заменить date-инпуты |
| `src/components/admin/payments/SyncWithStatementDialog.tsx` | Заменить date-инпуты |
| `src/components/admin/payments/SyncRunDialog.tsx` | Заменить date-инпуты |
| `src/components/admin/payments/BepaidReconcileDialog.tsx` | Заменить date-инпуты |
| `src/components/telegram/TelegramLogsTab.tsx` | Заменить date-инпуты |
| `src/components/admin/AdvancedFilters.tsx` | Заменить date-инпут |
| `src/components/legal-details/IndividualDetailsForm.tsx` | Заменить date-инпуты |

