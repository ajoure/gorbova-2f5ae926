-- Fix ilex_settings RLS policy using has_permission function
DROP POLICY IF EXISTS "Admins can manage ilex settings" ON public.ilex_settings;

CREATE POLICY "Staff can read ilex settings"
  ON public.ilex_settings FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'news.view'));

CREATE POLICY "Staff can update ilex settings"
  ON public.ilex_settings FOR UPDATE
  TO authenticated
  USING (public.has_permission(auth.uid(), 'news.view'))
  WITH CHECK (public.has_permission(auth.uid(), 'news.view'));