-- Allow admins to mark messages as read (UPDATE)
CREATE POLICY "Admins can update telegram messages"
ON public.telegram_messages
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));