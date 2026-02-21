
-- Storage RLS policies for student-uploads/ prefix in training-assets bucket

-- INSERT: ученик может загружать только в свою папку student-uploads/{auth.uid()}/...
CREATE POLICY "student_uploads_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'training-assets'
    AND (storage.foldername(name))[1] = 'student-uploads'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

-- SELECT: только admin/superadmin (ученик качает через Edge Function)
CREATE POLICY "student_uploads_admin_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'training-assets'
    AND (storage.foldername(name))[1] = 'student-uploads'
    AND public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superadmin'::app_role])
  );
