-- 1. Добавить колонку product_name_raw в payments_v2
ALTER TABLE public.payments_v2 
ADD COLUMN IF NOT EXISTS product_name_raw TEXT;

-- 2. Индекс для быстрого поиска по названию продукта
CREATE INDEX IF NOT EXISTS idx_payments_v2_product_name_raw 
ON public.payments_v2 (product_name_raw);

-- 3. Индексы для очереди сверки
CREATE INDEX IF NOT EXISTS idx_prq_customer_email 
ON public.payment_reconcile_queue (customer_email);

CREATE INDEX IF NOT EXISTS idx_prq_status 
ON public.payment_reconcile_queue (status);