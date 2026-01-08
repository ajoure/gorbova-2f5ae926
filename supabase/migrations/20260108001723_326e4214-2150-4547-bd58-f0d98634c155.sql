-- Добавляем поля для типа плательщика и отправки счёта в orders_v2
ALTER TABLE public.orders_v2 
ADD COLUMN IF NOT EXISTS payer_type TEXT DEFAULT 'individual',
ADD COLUMN IF NOT EXISTS invoice_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS invoice_email TEXT;

-- Добавляем комментарии
COMMENT ON COLUMN public.orders_v2.payer_type IS 'Тип плательщика: individual, entrepreneur, legal_entity';
COMMENT ON COLUMN public.orders_v2.invoice_sent_at IS 'Дата отправки счёта для ИП/ЮЛ';
COMMENT ON COLUMN public.orders_v2.invoice_email IS 'Email для отправки счёта';

-- Создаём продукт "Платная консультация" (если не существует)
DO $$
DECLARE
  v_product_id uuid;
  v_tariff_standard_id uuid;
  v_tariff_urgent_id uuid;
  v_pricing_stage_id uuid;
BEGIN
  -- Проверяем, существует ли продукт
  SELECT id INTO v_product_id FROM public.products_v2 WHERE code = 'consultation';
  
  IF v_product_id IS NULL THEN
    INSERT INTO public.products_v2 (
      code,
      name,
      description,
      public_title,
      public_subtitle,
      primary_domain,
      currency,
      is_active,
      status
    ) VALUES (
      'consultation',
      'Платная консультация',
      'Индивидуальная консультация Катерины Горбова по вопросам налогообложения и защиты бизнеса',
      'Платная консультация Катерины Горбова',
      'Работайте законно, платите минимально возможные налоги',
      'gorbova.by',
      'BYN',
      true,
      'active'
    ) RETURNING id INTO v_product_id;
  END IF;

  -- Создаём тариф "Несрочная консультация"
  SELECT id INTO v_tariff_standard_id FROM public.tariffs WHERE code = 'CONSULTATION_STANDARD';
  
  IF v_tariff_standard_id IS NULL THEN
    INSERT INTO public.tariffs (
      code,
      name,
      description,
      product_id,
      is_active,
      is_popular,
      display_order,
      badge
    ) VALUES (
      'CONSULTATION_STANDARD',
      'Несрочная консультация',
      'Срок ожидания — до 2 месяцев. Подходит для вопросов, не требующих срочного решения.',
      v_product_id,
      true,
      false,
      1,
      NULL
    ) RETURNING id INTO v_tariff_standard_id;
  END IF;

  -- Создаём тариф "Срочная консультация"
  SELECT id INTO v_tariff_urgent_id FROM public.tariffs WHERE code = 'CONSULTATION_URGENT';
  
  IF v_tariff_urgent_id IS NULL THEN
    INSERT INTO public.tariffs (
      code,
      name,
      description,
      product_id,
      is_active,
      is_popular,
      display_order,
      badge
    ) VALUES (
      'CONSULTATION_URGENT',
      'Срочная консультация',
      'Срок ожидания — 2-3 рабочих дня. Подходит для срочных и чувствительных ситуаций.',
      v_product_id,
      true,
      true,
      2,
      'Популярный'
    ) RETURNING id INTO v_tariff_urgent_id;
  END IF;

  -- Создаём ценовой этап "Базовая цена"
  SELECT id INTO v_pricing_stage_id FROM public.pricing_stages WHERE product_id = v_product_id LIMIT 1;
  
  IF v_pricing_stage_id IS NULL THEN
    INSERT INTO public.pricing_stages (
      name,
      product_id,
      stage_type,
      is_active,
      display_order
    ) VALUES (
      'Базовая цена',
      v_product_id,
      'regular',
      true,
      1
    ) RETURNING id INTO v_pricing_stage_id;
  END IF;

  -- Добавляем цену 500 BYN для стандартного тарифа
  IF NOT EXISTS (SELECT 1 FROM public.tariff_prices WHERE tariff_id = v_tariff_standard_id AND pricing_stage_id = v_pricing_stage_id) THEN
    INSERT INTO public.tariff_prices (tariff_id, pricing_stage_id, price, is_active)
    VALUES (v_tariff_standard_id, v_pricing_stage_id, 50000, true);
  END IF;

  -- Добавляем цену 800 BYN для срочного тарифа
  IF NOT EXISTS (SELECT 1 FROM public.tariff_prices WHERE tariff_id = v_tariff_urgent_id AND pricing_stage_id = v_pricing_stage_id) THEN
    INSERT INTO public.tariff_prices (tariff_id, pricing_stage_id, price, is_active)
    VALUES (v_tariff_urgent_id, v_pricing_stage_id, 80000, true);
  END IF;

  -- Добавляем план оплаты для стандартного тарифа
  IF NOT EXISTS (SELECT 1 FROM public.payment_plans WHERE tariff_id = v_tariff_standard_id) THEN
    INSERT INTO public.payment_plans (tariff_id, name, plan_type, is_active, grants_access_immediately, display_order)
    VALUES (v_tariff_standard_id, 'Полная оплата', 'full', true, true, 1);
  END IF;

  -- Добавляем план оплаты для срочного тарифа
  IF NOT EXISTS (SELECT 1 FROM public.payment_plans WHERE tariff_id = v_tariff_urgent_id) THEN
    INSERT INTO public.payment_plans (tariff_id, name, plan_type, is_active, grants_access_immediately, display_order)
    VALUES (v_tariff_urgent_id, 'Полная оплата', 'full', true, true, 1);
  END IF;
END $$;