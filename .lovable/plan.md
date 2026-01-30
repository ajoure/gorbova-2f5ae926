План: Исправление доступа к обучающему контенту

Подтверждённая диагностика

Корневая причина #1: RLS блокирует метаданные

Таблица	Текущие политики	Результат для обычных пользователей
training_modules	Только Admins can manage modules	SELECT возвращает []
training_lessons	Только Admins can manage lessons	SELECT возвращает []
module_access	Есть политика Authenticated users can read	Работает

УТОЧНЕНИЕ:
Это полностью объясняет симптом «Раздел пока пуст» — код отрабатывает корректно, но получает пустые массивы из-за RLS.

⸻

Корневая причина #2: RLS на lesson_blocks не учитывает module_access

Текущая RLS проверяет:

subscriptions_v2.product_id = training_modules.product_id

Но модуль “Уроки без модулей” имеет product_id = NULL → условие всегда FALSE.

Связь через module_access → tariff_id → subscriptions_v2.tariff_id не проверяется.

УТОЧНЕНИЕ:
Это приводит к ситуации:
	•	метаданные (после шага 1) будут видны,
	•	но при открытии урока контент всё равно не загрузится.

⸻

Данные (проверено):

Сущность	Значение
Модуль “Уроки без модулей”	product_id = NULL, is_container = true
module_access	2 записи: BUSINESS, FULL
Юлия Рабчевская	Подписка BUSINESS (активная), tariff_id совпадает
lesson_blocks	100 блоков для 100 уроков


⸻

План исправлений (порядок важен)

Шаг 1: Добавить RLS для чтения метаданных модулей/уроков

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

DoD-1 (УТОЧНЁН):
	•	Под аккаунтом BUSINESS:
	•	SELECT id FROM training_modules WHERE is_container = true AND is_active = true → не пусто
	•	SELECT id FROM training_lessons WHERE is_active = true → не пусто

⸻

Шаг 2: Исправить RLS на lesson_blocks для проверки через module_access

ПРЕДВАРИТЕЛЬНЫЙ STOP (ДОБАВЛЕНО):
	•	Подтвердить точное имя таблицы блоков (lesson_blocks / training_lesson_blocks и т.п.).
	•	Подтвердить, что в subscriptions_v2 реально используется поле access_end_at.

⸻

Текущая политика “Users can view blocks with valid subscription” проверяет только product_id.
Нужно добавить альтернативную ветку через module_access → tariff_id.

-- Старую политику удалять ТОЛЬКО после smoke-проверки
DROP POLICY IF EXISTS "Users can view blocks with valid subscription" ON public.lesson_blocks;

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
      AND tm.is_active = true           -- ДОБАВЛЕНО
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
      AND tm.is_active = true           -- ДОБАВЛЕНО
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
      AND tm.is_active = true           -- ДОБАВЛЕНО
      AND s.user_id = auth.uid()
      AND s.status IN ('active', 'trial')
      AND (s.access_end_at IS NULL OR s.access_end_at > now())
  )
);

DoD-2 (УТОЧНЁН):
	•	BUSINESS/FULL → lesson_blocks читаются
	•	CHAT → lesson_blocks не читаются
	•	admin → читает всё

⸻

Шаг 3: Код не требует изменений

Логика в useContainerLessons.ts корректна после RLS:
	•	module_access читается
	•	тарифы сопоставляются
	•	has_access вычисляется верно

ПРОВЕРКА (ДОБАВЛЕНО):
	•	У пользователя есть RLS-доступ к subscriptions_v2 только к своим строкам
	•	иначе userTariffIds будет пустым.

⸻

Проверка безопасности

Что открывается:
	•	training_modules — метаданные
	•	training_lessons — метаданные

Что остаётся защищённым:
	•	lesson_blocks — только при наличии:
	•	подписки по product_id
	•	подписки по tariff_id (через module_access)
	•	entitlement
	•	admin / superadmin

⸻

Ожидаемый результат
	•	BUSINESS/FULL:
	•	видят 100 уроков
	•	могут смотреть видео
	•	CHAT:
	•	видят карточки
	•	не получают доступ к контенту
	•	Плашка:
	•	«Доступно по тарифам: BUSINESS, FULL»
	•	Админы:
	•	без изменений
