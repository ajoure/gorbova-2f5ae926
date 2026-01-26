-- Create bepaid_statement_rows table for storing bePaid statement data
CREATE TABLE public.bepaid_statement_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid TEXT NOT NULL,                           -- bePaid UID (ключ дедупликации)
  order_id_bepaid TEXT,                        -- ID заказа из bePaid
  status TEXT,                                 -- Статус
  description TEXT,                            -- Описание
  amount NUMERIC(12,2),                        -- Сумма
  currency TEXT DEFAULT 'BYN',                 -- Валюта
  commission_percent NUMERIC(5,2),             -- Комиссия,%
  commission_per_op NUMERIC(12,2),             -- Комиссия за операцию
  commission_total NUMERIC(12,2),              -- Сумма комиссий
  payout_amount NUMERIC(12,2),                 -- Перечисленная сумма
  transaction_type TEXT,                       -- Тип транзакции
  tracking_id TEXT,                            -- Трекинг ID
  created_at_bepaid TIMESTAMPTZ,               -- Дата создания
  paid_at TIMESTAMPTZ,                         -- Дата оплаты
  payout_date TIMESTAMPTZ,                     -- Дата перечисления
  expires_at TIMESTAMPTZ,                      -- Действует до
  message TEXT,                                -- Сообщение
  shop_id TEXT,                                -- ID магазина
  shop_name TEXT,                              -- Магазин
  business_category TEXT,                      -- Категория бизнеса
  bank_id TEXT,                                -- ID банка
  first_name TEXT,                             -- Имя
  last_name TEXT,                              -- Фамилия
  address TEXT,                                -- Адрес
  country TEXT,                                -- Страна
  city TEXT,                                   -- Город
  zip TEXT,                                    -- Индекс
  region TEXT,                                 -- Область
  phone TEXT,                                  -- Телефон
  ip TEXT,                                     -- IP
  email TEXT,                                  -- E-mail
  payment_method TEXT,                         -- Способ оплаты
  product_code TEXT,                           -- Код продукта
  card_masked TEXT,                            -- Карта
  card_holder TEXT,                            -- Владелец карты
  card_expires TEXT,                           -- Карта действует
  card_bin TEXT,                               -- BIN карты
  bank_name TEXT,                              -- Банк
  bank_country TEXT,                           -- Страна банка
  secure_3d TEXT,                              -- 3-D Secure
  avs_result TEXT,                             -- Результат AVS
  fraud TEXT,                                  -- Fraud
  auth_code TEXT,                              -- Код авторизации
  rrn TEXT,                                    -- RRN
  reason TEXT,                                 -- Причина
  payment_identifier TEXT,                     -- Идентификатор оплаты
  token_provider TEXT,                         -- Провайдер токена
  merchant_id TEXT,                            -- ID торговца
  merchant_country TEXT,                       -- Страна торговца
  merchant_company TEXT,                       -- Компания торговца
  converted_amount NUMERIC(12,2),              -- Сумма после конвертации
  converted_currency TEXT,                     -- Валюта после конвертации
  gateway_id TEXT,                             -- ID шлюза
  recurring_type TEXT,                         -- Рекуррентный тип
  card_bin_8 TEXT,                             -- Card BIN (8)
  bank_code TEXT,                              -- Код банка
  response_code TEXT,                          -- Код ответа
  conversion_rate NUMERIC(10,6),               -- Курс конвертации
  converted_payout NUMERIC(12,2),              -- Перечисленная сумма после конвертации
  converted_commission NUMERIC(12,2),          -- Сумма комиссий в валюте после конвертации
  raw_data JSONB,                              -- Полные исходные данные строки
  import_batch_id TEXT,                        -- ID батча импорта
  imported_at TIMESTAMPTZ DEFAULT now(),       -- Дата импорта
  updated_at TIMESTAMPTZ DEFAULT now(),        -- Дата обновления
  UNIQUE(uid)                                  -- Идемпотентность по UID
);

-- Индексы для производительности
CREATE INDEX idx_bepaid_statement_rows_paid_at ON public.bepaid_statement_rows(paid_at);
CREATE INDEX idx_bepaid_statement_rows_status ON public.bepaid_statement_rows(status);
CREATE INDEX idx_bepaid_statement_rows_amount ON public.bepaid_statement_rows(amount);
CREATE INDEX idx_bepaid_statement_rows_email ON public.bepaid_statement_rows(email);
CREATE INDEX idx_bepaid_statement_rows_card ON public.bepaid_statement_rows(card_masked);
CREATE INDEX idx_bepaid_statement_rows_tracking_id ON public.bepaid_statement_rows(tracking_id);
CREATE INDEX idx_bepaid_statement_rows_transaction_type ON public.bepaid_statement_rows(transaction_type);

-- RLS
ALTER TABLE public.bepaid_statement_rows ENABLE ROW LEVEL SECURITY;

-- Use has_role function which exists in the project
CREATE POLICY "Admins can read bepaid_statement_rows" ON public.bepaid_statement_rows
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert bepaid_statement_rows" ON public.bepaid_statement_rows
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update bepaid_statement_rows" ON public.bepaid_statement_rows
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete bepaid_statement_rows" ON public.bepaid_statement_rows
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_bepaid_statement_rows_updated_at
  BEFORE UPDATE ON public.bepaid_statement_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();