-- Шаг 1: RLS для чтения метаданных модулей/уроков

-- 1) Модули: все авторизованные могут читать активные
CREATE POLICY "Authenticated users can view active modules"
ON public.training_modules
FOR SELECT
TO authenticated
USING (is_active = true);

-- 2) Уроки: все авторизованные могут читать активные
CREATE POLICY "Authenticated users can view active lessons"
ON public.training_lessons
FOR SELECT
TO authenticated
USING (is_active = true);

-- Шаг 2: Исправить RLS на lesson_blocks для проверки через module_access

-- Удалить старую политику
DROP POLICY IF EXISTS "Users can view blocks with valid subscription" ON public.lesson_blocks;

-- Создать новую с поддержкой module_access
CREATE POLICY "Users can view lesson blocks with access"
ON public.lesson_blocks
FOR SELECT
TO authenticated
USING (
  -- Админы
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'superadmin')
  )

  -- content.manage
  OR has_permission(auth.uid(), 'content.manage')

  -- Через product_id (старая логика)
  OR EXISTS (
    SELECT 1
    FROM training_lessons tl
    JOIN training_modules tm ON tm.id = tl.module_id
    JOIN subscriptions_v2 s ON s.product_id = tm.product_id
    WHERE tl.id = lesson_blocks.lesson_id
      AND tl.is_active = true
      AND tm.is_active = true
      AND s.user_id = auth.uid()
      AND s.status IN ('active', 'trial')
      AND (s.access_end_at IS NULL OR s.access_end_at > now())
  )

  -- Через entitlements (старая логика)
  OR EXISTS (
    SELECT 1
    FROM training_lessons tl
    JOIN training_modules tm ON tm.id = tl.module_id
    JOIN products_v2 p ON p.id = tm.product_id
    JOIN entitlements e ON e.product_code = p.code
    WHERE tl.id = lesson_blocks.lesson_id
      AND tl.is_active = true
      AND tm.is_active = true
      AND e.user_id = auth.uid()
      AND e.status = 'active'
      AND (e.expires_at IS NULL OR e.expires_at > now())
  )

  -- Через module_access → tariff_id (НОВАЯ ЛОГИКА)
  OR EXISTS (
    SELECT 1
    FROM training_lessons tl
    JOIN training_modules tm ON tm.id = tl.module_id
    JOIN module_access ma ON ma.module_id = tl.module_id
    JOIN subscriptions_v2 s ON s.tariff_id = ma.tariff_id
    WHERE tl.id = lesson_blocks.lesson_id
      AND tl.is_active = true
      AND tm.is_active = true
      AND s.user_id = auth.uid()
      AND s.status IN ('active', 'trial')
      AND (s.access_end_at IS NULL OR s.access_end_at > now())
  )
);