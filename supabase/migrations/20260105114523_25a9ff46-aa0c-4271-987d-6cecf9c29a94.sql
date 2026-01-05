-- 1) Расширяем products_v2 для доменов и публичных настроек
ALTER TABLE public.products_v2 
ADD COLUMN IF NOT EXISTS slug TEXT,
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS primary_domain TEXT,
ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BYN',
ADD COLUMN IF NOT EXISTS public_title TEXT,
ADD COLUMN IF NOT EXISTS public_subtitle TEXT,
ADD COLUMN IF NOT EXISTS payment_disclaimer_text TEXT;

-- Уникальный индекс на домен
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_v2_primary_domain 
ON public.products_v2(primary_domain) WHERE primary_domain IS NOT NULL;

-- 2) Расширяем тарифы для бейджей и публичного отображения
ALTER TABLE public.tariffs
ADD COLUMN IF NOT EXISTS badge TEXT,
ADD COLUMN IF NOT EXISTS subtitle TEXT,
ADD COLUMN IF NOT EXISTS price_monthly NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS period_label TEXT DEFAULT 'BYN/мес',
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS visible_from TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS visible_to TIMESTAMP WITH TIME ZONE;

-- 3) Создаем таблицу offers (кнопки оплаты)
CREATE TABLE IF NOT EXISTS public.tariff_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tariff_id UUID NOT NULL REFERENCES public.tariffs(id) ON DELETE CASCADE,
  offer_type TEXT NOT NULL CHECK (offer_type IN ('pay_now', 'trial')),
  button_label TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  trial_days INTEGER,
  auto_charge_after_trial BOOLEAN DEFAULT false,
  auto_charge_amount NUMERIC(10,2),
  auto_charge_delay_days INTEGER,
  requires_card_tokenization BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  visible_from TIMESTAMP WITH TIME ZONE,
  visible_to TIMESTAMP WITH TIME ZONE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS для tariff_offers (только для чтения всем, редактирование через service role)
ALTER TABLE public.tariff_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for active offers"
ON public.tariff_offers FOR SELECT
USING (is_active = true);

CREATE POLICY "Super admins can manage offers"
ON public.tariff_offers FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Индексы
CREATE INDEX IF NOT EXISTS idx_tariff_offers_tariff_id ON public.tariff_offers(tariff_id);
CREATE INDEX IF NOT EXISTS idx_tariff_offers_active ON public.tariff_offers(is_active, offer_type);

-- 4) Расширяем subscriptions_v2 для отмены trial
ALTER TABLE public.subscriptions_v2
ADD COLUMN IF NOT EXISTS trial_canceled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS trial_canceled_by TEXT,
ADD COLUMN IF NOT EXISTS keep_access_until_trial_end BOOLEAN DEFAULT true;

-- 5) Добавляем поле snapshot в orders_v2 для фиксации данных на момент покупки
ALTER TABLE public.orders_v2
ADD COLUMN IF NOT EXISTS purchase_snapshot JSONB;

-- 6) Trigger для updated_at на tariff_offers
CREATE TRIGGER update_tariff_offers_updated_at
BEFORE UPDATE ON public.tariff_offers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();