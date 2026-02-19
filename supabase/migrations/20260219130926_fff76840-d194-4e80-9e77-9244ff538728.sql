-- PATCH 1: Добавить parent_module_id в training_modules
ALTER TABLE public.training_modules
  ADD COLUMN IF NOT EXISTS parent_module_id uuid
  REFERENCES public.training_modules(id)
  ON DELETE SET NULL;

-- Индекс для эффективного обхода дерева по секции + родителю + порядку
CREATE INDEX IF NOT EXISTS training_modules_section_parent_sort_idx
  ON public.training_modules(menu_section_key, parent_module_id, sort_order);

-- Обновить кэш PostgREST
NOTIFY pgrst, 'reload schema';