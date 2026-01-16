-- Добавить поле transaction_type в payments_v2
ALTER TABLE public.payments_v2 
ADD COLUMN IF NOT EXISTS transaction_type text DEFAULT 'payment';

-- Добавить комментарий
COMMENT ON COLUMN public.payments_v2.transaction_type IS 'Тип транзакции: payment, refund, chargeback, void, authorization';

-- Заполнить существующие записи на основе status (cast to text) и amount
UPDATE public.payments_v2 
SET transaction_type = CASE 
  WHEN status::text = 'refunded' THEN 'refund'
  WHEN status::text IN ('canceled', 'voided') THEN 'void'
  WHEN amount < 0 THEN 'refund'
  ELSE 'payment'
END
WHERE transaction_type IS NULL OR transaction_type = 'payment';