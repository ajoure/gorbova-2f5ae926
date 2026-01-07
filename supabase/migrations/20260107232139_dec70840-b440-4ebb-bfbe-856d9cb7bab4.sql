-- Add DELETE policy for profiles table (admins with users.delete permission)
CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE
USING (has_permission(auth.uid(), 'users.delete'::text));