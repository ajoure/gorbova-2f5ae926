# План реализации системы закрывающих документов (Счёт-Акт)

## Обзор
Создание полноценной системы генерации и хранения закрывающих документов (счёт-актов) для физических лиц, ИП и юридических лиц с автоматической отправкой на email после успешной оплаты и хранением в личном кабинете.

## Анализ загруженного шаблона

Шаблон использует плейсхолдеры формата `{{ld-...}}` для автозаполнения:

### Данные Исполнителя:
- `{{ld-i_naimenovanie_(polnoe)-707201}}` - полное наименование
- `{{ld-i_naimenovanie_(kratko)-707199}}` - краткое наименование  
- `{{ld-i_unp-707203}}` - УНП
- `{{ld-i_adres-707207}}` - адрес
- `{{ld-i_raschetnyy_schet-707215}}` - расчётный счёт
- `{{ld-i_bank-707209}}` - банк
- `{{ld-i_kod_banka-707213}}` - код банка (БИК)
- `{{ld-i_telefon-707217}}` - телефон
- `{{ld-i_elektronnaya_pochta-707219}}` - email
- `{{ld-i_deystvuet_na_osnovanii-707205}}` - действует на основании
- `{{ld-i_rukovoditel_(dolzhnost)-707221}}` - должность руководителя
- `{{ld-i_rukovoditel_(fio_kratko)-707241}}` - ФИО руководителя (кратко)

### Данные Заказчика:
- `{{ld-d_opf-706429}}` - ОПФ (ООО, ИП, физлицо)
- `{{ld-d_yul/ip_nazvanie-706431}}` - название организации/ИП
- `{{ld-d_yul/ip_unp-706433}}` - УНП
- `{{ld-d_rukovoditel_(dolzhnost)-707697}}` - должность руководителя
- `{{ld-d_fio_rukovoditelya-707699}}` - ФИО руководителя
- `{{ld-d_r._deystvuet_na_osnovanii-707701}}` - действует на основании
- `{{cn-phone-...}}` - телефон
- `{{cn-email-...}}` - email

### Данные Документа:
- `{{ld-nomer_dogovora-587429}}` - номер документа
- `{{ld-data_dogovora-588111}}` - дата
- `{{ld-valyuta_sdelki-610803}}` - валюта
- `{{ld-dogsch_naimenovanie_uslugi-673121}}` - наименование услуги
- `{{ld-dogsch_edinica_izmereniya-673123}}` - единица измерения
- `{{ld-dogsch_kolichestvo-6731}}` - количество
- `{{ld-dogsch_cena_za_edinicu-67}}` - цена за единицу
- `{{ld-dogsch_summa_scheta_(akta)-673129}}` - сумма
- `{{ld-dogsch_srok_oplaty-707703}}` - срок оплаты
- `{{ld-dogsch_srok_ispolneniya_(r/dni)-687007}}` - срок исполнения

### Формат паспортных данных (Физлицо - Беларусь):
```
ФИО полностью, дата рождения,
паспорт [СЕРИЯ][НОМЕР] выдан [КЕМ ВЫДАН] [ДАТА ВЫДАЧИ]
(срок действия паспорта до [ДАТА]),
личный номер [ИДЕНТИФИКАЦИОННЫЙ НОМЕР],
зарегистрирован по адресу: [ИНДЕКС], [ОБЛАСТЬ], [РАЙОН], [НАСЕЛЁННЫЙ ПУНКТ], [УЛИЦА], [ДОМ],
тел. [ТЕЛЕФОН], электронная почта [EMAIL].
Банковские реквизиты: расчетный счёт [IBAN] в [БАНК], код [БИК]
```

---

## Этап 1: База данных

### 1.1 Таблица реквизитов Исполнителей (executors)
```sql
CREATE TABLE public.executors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_full TEXT NOT NULL,           -- Полное наименование
  name_short TEXT NOT NULL,          -- Краткое наименование
  legal_form TEXT DEFAULT 'ЗАО',     -- ОПФ (ЗАО, ООО, ИП)
  unp TEXT NOT NULL,                 -- УНП
  address TEXT NOT NULL,             -- Юридический адрес
  bank_account TEXT NOT NULL,        -- Расчётный счёт (IBAN)
  bank_name TEXT NOT NULL,           -- Наименование банка
  bank_code TEXT NOT NULL,           -- БИК (код банка)
  phone TEXT,                        -- Телефон
  email TEXT,                        -- Email
  acts_on_basis TEXT DEFAULT 'Устава', -- Действует на основании
  director_position TEXT DEFAULT 'Директор',
  director_name TEXT NOT NULL,       -- ФИО директора
  director_name_short TEXT,          -- ФИО кратко (Федорчук С.В.)
  signature_image_url TEXT,          -- URL подписи (опционально)
  stamp_image_url TEXT,              -- URL печати (опционально)
  is_default BOOLEAN DEFAULT false,  -- Исполнитель по умолчанию
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Вставка данных АЖУР инкам
INSERT INTO public.executors (
  name_full, name_short, legal_form, unp, address,
  bank_account, bank_name, bank_code,
  phone, email, director_name, director_name_short,
  acts_on_basis, director_position, is_default
) VALUES (
  'Закрытое акционерное общество "АЖУР инкам"',
  'ЗАО "АЖУР инкам"',
  'ЗАО',
  '193405000',
  '220035, г. Минск, ул. Панфилова, 2, офис 49Л',
  'BY47ALFA30122C35190010270000',
  'ЗАО "Альфа-Банк"',
  'ALFABY2X',
  '+375 29 123 45 67',
  'info@ajoure.by',
  'Федорчук Сергей Валерьевич',
  'Федорчук С.В.',
  'Устава',
  'Директор',
  true
);
```

### 1.2 Таблица реквизитов клиентов (client_legal_details)
```sql
CREATE TABLE public.client_legal_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  payer_type TEXT NOT NULL DEFAULT 'individual', -- individual, entrepreneur, legal_entity
  
  -- Для физлиц (individual)
  passport_full_name TEXT,          -- ФИО полностью
  passport_birth_date DATE,         -- Дата рождения
  passport_series TEXT,             -- Серия паспорта (MP, AB и т.д.)
  passport_number TEXT,             -- Номер паспорта
  passport_issued_by TEXT,          -- Кем выдан
  passport_issued_date DATE,        -- Дата выдачи
  passport_valid_until DATE,        -- Срок действия
  personal_number TEXT,             -- Личный номер (идентификационный)
  registration_address TEXT,        -- Адрес регистрации полный
  bank_account_iban TEXT,           -- IBAN счёта
  bank_name TEXT,                   -- Название банка
  bank_code TEXT,                   -- БИК
  
  -- Для ИП (entrepreneur)
  ip_name TEXT,                     -- Название ИП (ИП Федорчук С.В.)
  ip_unp TEXT,                      -- УНП
  ip_address TEXT,                  -- Адрес регистрации
  ip_acts_on_basis TEXT DEFAULT 'Свидетельства о государственной регистрации',
  
  -- Для юрлиц (legal_entity)
  company_name TEXT,                -- Название организации
  company_legal_form TEXT,          -- ОПФ (ООО, ЗАО, ОДО, УП)
  company_unp TEXT,                 -- УНП
  company_address TEXT,             -- Юридический адрес
  company_director_position TEXT,   -- Должность руководителя
  company_director_name TEXT,       -- ФИО руководителя
  company_acts_on_basis TEXT DEFAULT 'Устава',
  
  -- Общие поля
  contact_phone TEXT,
  contact_email TEXT,
  
  -- AI валидация
  validation_status TEXT DEFAULT 'pending', -- pending, valid, invalid
  validation_errors JSONB,
  
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(profile_id, payer_type, is_default)
);

-- RLS политики
ALTER TABLE public.client_legal_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own legal details"
  ON public.client_legal_details FOR SELECT
  TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own legal details"
  ON public.client_legal_details FOR INSERT
  TO authenticated
  WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own legal details"
  ON public.client_legal_details FOR UPDATE
  TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage all legal details"
  ON public.client_legal_details FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'contacts.manage'));
```

### 1.3 Таблица сгенерированных документов (generated_documents)
```sql
CREATE TABLE public.generated_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders_v2(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  executor_id UUID REFERENCES public.executors(id),
  
  document_type TEXT NOT NULL DEFAULT 'invoice_act', -- invoice_act, act, invoice
  document_number TEXT NOT NULL,
  document_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Снимок данных на момент генерации
  executor_snapshot JSONB NOT NULL,
  client_snapshot JSONB NOT NULL,
  order_snapshot JSONB NOT NULL,
  
  -- Файлы
  pdf_storage_path TEXT,            -- Путь в storage
  pdf_url TEXT,                     -- Публичный URL
  
  -- Статусы
  status TEXT DEFAULT 'generated', -- generated, sent, downloaded, error
  sent_at TIMESTAMPTZ,
  sent_to_email TEXT,
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ,
  
  -- Метаданные
  meta JSONB,
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents"
  ON public.generated_documents FOR SELECT
  TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage all documents"
  ON public.generated_documents FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'orders.manage'));

-- Индексы
CREATE INDEX idx_generated_documents_order ON public.generated_documents(order_id);
CREATE INDEX idx_generated_documents_profile ON public.generated_documents(profile_id);

-- Executors RLS
ALTER TABLE public.executors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage executors"
  ON public.executors FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'settings.manage'));

CREATE POLICY "Everyone can view active executors"
  ON public.executors FOR SELECT
  TO authenticated
  USING (is_active = true);
```

### 1.4 Создание Storage Bucket
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  10485760, -- 10MB
  ARRAY['application/pdf']::text[]
);

-- Политики доступа к storage
CREATE POLICY "Users can view own documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "System can upload documents"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'documents');
```

---

## Этап 2: Edge Functions

### 2.1 generate-invoice-act (генерация документа)
Файл: `supabase/functions/generate-invoice-act/index.ts`

Функционал:
1. Получает order_id и опциональный client_legal_details_id
2. Загружает данные заказа, исполнителя (по умолчанию), реквизиты клиента
3. Генерирует PDF с помощью jsPDF (сохраняя стиль вашего шаблона)
4. Загружает в storage bucket
5. Сохраняет запись в generated_documents
6. Возвращает URL документа

```typescript
// Структура запроса
interface GenerateInvoiceActRequest {
  order_id: string;
  executor_id?: string;  // Опционально, иначе default
  client_details_id?: string;  // Опционально, иначе ищем по profile
  regenerate?: boolean;  // Перегенерировать существующий
}
```

### 2.2 send-invoice-act-email (отправка на email)
Файл: `supabase/functions/send-invoice-act-email/index.ts`

Функционал:
1. Получает document_id или генерирует новый по order_id
2. Формирует красивое HTML письмо с вложенным PDF
3. Отправляет через Resend
4. Обновляет статус в generated_documents

### 2.3 validate-legal-details (AI валидация)
Файл: `supabase/functions/validate-legal-details/index.ts`

Использует Lovable AI (google/gemini-2.5-flash) для:
1. Проверки корректности паспортных данных (формат, даты)
2. Валидации УНП (контрольная сумма)
3. Проверки IBAN (формат BY + контрольные цифры)
4. Автокоррекции опечаток в названиях банков
5. Возврата структурированных ошибок

### 2.4 Автоматический триггер после оплаты
Модификация `supabase/functions/bepaid-webhook/index.ts`:
- После успешной оплаты вызывать generate-invoice-act
- Если у клиента заполнены реквизиты - отправлять на email
- Если не заполнены - сохранять в ЛК с уведомлением

---

## Этап 3: Frontend - Личный кабинет

### 3.1 Страница реквизитов: `src/pages/settings/LegalDetails.tsx`

Дизайн:
- Минималистичный современный интерфейс
- Tabs для переключения между типами: Физлицо | ИП | Юрлицо
- Формы с валидацией в реальном времени
- AI-подсказки и автокоррекция

Компоненты:
- IndividualDetailsForm - форма для физлиц (паспорт + банк)
- EntrepreneurDetailsForm - форма для ИП
- LegalEntityDetailsForm - форма для юрлиц

UI элементы:
- Маска ввода для паспорта, телефона, IBAN
- Datepicker для дат
- Автоподстановка банка по БИК
- Индикатор AI-валидации (зелёная галочка / красный крестик)

### 3.2 Интеграция в настройки оплаты
Модификация `src/pages/settings/PaymentMethods.tsx`:
- Добавить секцию "Реквизиты для документов" после карт
- Ссылка на полную страницу реквизитов
- Индикатор заполненности

### 3.3 Документы в разделе Покупки
Модификация `src/pages/Purchases.tsx` и `OrderListItem.tsx`:
- Добавить кнопку "Скачать счёт-акт" рядом с чеком
- Sheet с деталями документа
- Возможность перегенерации если реквизиты обновились

---

## Этап 4: Frontend - Админ-панель

### 4.1 Управление исполнителями: `src/pages/admin/AdminExecutors.tsx`

Функционал:
- Список исполнителей (компаний от имени которых выставляются документы)
- CRUD операции
- Установка исполнителя по умолчанию
- Загрузка подписи/печати (опционально)

### 4.2 Просмотр документов клиентов
Добавить в ContactDetailSheet:
- Tab "Документы"
- Список сгенерированных документов
- Возможность скачать/переотправить

---

## Этап 5: Генерация PDF

### 5.1 Утилита генерации: `src/utils/invoiceActGenerator.ts`

Сохраняем стиль вашего шаблона:
- Заголовок "СЧЁТ-АКТ" по центру
- Две колонки в шапке (Исполнитель | Заказчик)
- Таблица с услугами (без НДС согласно ст. 326 НК РБ)
- Сумма прописью
- Блок подписей

Технологии:
- jsPDF для генерации
- Cyrillic шрифт (Roboto/Times New Roman)
- Таблицы через autoTable плагин

---

## Этап 6: Интеграция с оплатой

### 6.1 Автоматическая генерация
После успешного платежа (bepaid-webhook):
1. Проверить есть ли заполненные реквизиты у клиента
2. Если есть - сгенерировать документ и отправить
3. Если нет - сохранить флаг "ожидает реквизиты"
4. Отправить push/email напоминание заполнить реквизиты

### 6.2 Напоминания
- При входе в ЛК показывать banner если есть заказы без документов
- Через 24 часа после оплаты - email напоминание

---

## Структура файлов

```
src/
  components/
    legal-details/
      IndividualDetailsForm.tsx      # Форма физлица
      EntrepreneurDetailsForm.tsx    # Форма ИП
      LegalEntityDetailsForm.tsx     # Форма юрлица
      LegalDetailsValidation.tsx     # AI валидация
      PayerTypeSelector.tsx          # Выбор типа плательщика
  pages/
    settings/
      LegalDetails.tsx               # Страница реквизитов
    admin/
      AdminExecutors.tsx             # Управление исполнителями
  hooks/
    useLegalDetails.tsx              # Хук для реквизитов
    useGeneratedDocuments.tsx        # Хук для документов
  utils/
    invoiceActGenerator.ts           # Генерация PDF
    legalValidation.ts               # Валидация данных

supabase/functions/
  generate-invoice-act/index.ts      # Генерация документа
  send-invoice-act-email/index.ts    # Отправка на email
  validate-legal-details/index.ts    # AI валидация
```

---

## Порядок реализации

1. **База данных** - создать таблицы executors, client_legal_details, generated_documents, storage bucket
2. **Edge Functions** - generate-invoice-act, validate-legal-details
3. **Frontend формы** - страница LegalDetails с формами для всех типов
4. **Интеграция в ЛК** - добавить в PaymentMethods и Purchases
5. **Админ-панель** - AdminExecutors для управления исполнителями
6. **Автоматизация** - триггер после оплаты, отправка email
7. **Тестирование** - проверка всего флоу

---

## Критические файлы для реализации

- `src/pages/settings/PaymentMethods.tsx` - интеграция реквизитов
- `src/pages/Purchases.tsx` - отображение документов
- `src/components/purchases/OrderListItem.tsx` - кнопка скачивания
- `src/utils/receiptGenerator.ts` - паттерн для PDF генерации
- `supabase/functions/bepaid-webhook/index.ts` - триггер после оплаты
