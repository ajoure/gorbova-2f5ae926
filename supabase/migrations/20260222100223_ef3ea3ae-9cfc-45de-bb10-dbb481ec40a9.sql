
-- =============================================
-- PATCH P1: ticket_training_context (add-only)
-- =============================================

CREATE TABLE public.ticket_training_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL UNIQUE REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL,
  block_id uuid,
  module_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ttc_lesson_block ON public.ticket_training_context(lesson_id, block_id);
CREATE INDEX idx_ttc_lesson ON public.ticket_training_context(lesson_id);

ALTER TABLE public.ticket_training_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Support can manage training context"
ON public.ticket_training_context FOR ALL
USING (has_permission(auth.uid(), 'support.manage') OR has_permission(auth.uid(), 'admins.manage'))
WITH CHECK (has_permission(auth.uid(), 'support.manage') OR has_permission(auth.uid(), 'admins.manage'));

CREATE POLICY "Users can view own training context"
ON public.ticket_training_context FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.support_tickets t
  WHERE t.id = ticket_training_context.ticket_id AND t.user_id = auth.uid()
));

-- =============================================
-- PATCH P2: admin INSERT на support_tickets (add-only)
-- =============================================

CREATE POLICY "Support can create tickets"
ON public.support_tickets FOR INSERT
WITH CHECK (
  has_permission(auth.uid(), 'support.manage')
  OR has_permission(auth.uid(), 'admins.manage')
);

-- =============================================
-- PATCH P3: RPC create_feedback_ticket (SECURITY DEFINER)
-- с advisory lock (P3.1) и category filter
-- =============================================

CREATE OR REPLACE FUNCTION public.create_feedback_ticket(
  p_student_user_id uuid,
  p_lesson_id uuid,
  p_block_id uuid DEFAULT NULL,
  p_module_id uuid DEFAULT NULL,
  p_subject text DEFAULT 'Обратная связь по уроку',
  p_description text DEFAULT 'Обратная связь преподавателя'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid;
  v_profile_id uuid;
  v_ticket_id uuid;
  v_ticket_number text;
  v_existing_ticket_id uuid;
BEGIN
  v_admin_id := auth.uid();

  -- Проверка: только admin/support
  IF NOT (has_permission(v_admin_id, 'support.manage') OR has_permission(v_admin_id, 'admins.manage')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied', 'error_code', 'forbidden');
  END IF;

  -- P3.1: Advisory lock для предотвращения race condition
  PERFORM pg_advisory_xact_lock(
    hashtext(
      'training_feedback:' ||
      p_student_user_id::text || ':' ||
      p_lesson_id::text || ':' ||
      COALESCE(p_block_id::text, 'NULL')
    )
  );

  -- Поиск дубликата с category check
  SELECT c.ticket_id INTO v_existing_ticket_id
  FROM ticket_training_context c
  JOIN support_tickets t ON t.id = c.ticket_id
  WHERE t.user_id = p_student_user_id
    AND t.category = 'training_feedback'
    AND c.lesson_id = p_lesson_id
    AND ((p_block_id IS NULL AND c.block_id IS NULL) OR c.block_id = p_block_id)
  LIMIT 1;

  IF v_existing_ticket_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'ticket_id', v_existing_ticket_id, 'existing', true);
  END IF;

  -- Получить profile_id студента
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = p_student_user_id;
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Student profile not found', 'error_code', 'profile_not_found');
  END IF;

  v_ticket_number := generate_ticket_number_atomic();

  INSERT INTO support_tickets (
    user_id, profile_id, subject, description, category,
    ticket_number, status, priority,
    has_unread_admin, has_unread_user, updated_at
  ) VALUES (
    p_student_user_id, v_profile_id, p_subject, p_description, 'training_feedback',
    v_ticket_number, 'open', 'normal',
    false, true, now()
  ) RETURNING id INTO v_ticket_id;

  INSERT INTO ticket_training_context (ticket_id, lesson_id, block_id, module_id)
  VALUES (v_ticket_id, p_lesson_id, p_block_id, p_module_id);

  RETURN jsonb_build_object('success', true, 'ticket_id', v_ticket_id, 'ticket_number', v_ticket_number, 'existing', false);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Internal error', 'error_code', 'database_error');
END;
$$;
