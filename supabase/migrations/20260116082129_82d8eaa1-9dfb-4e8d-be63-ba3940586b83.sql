-- Fix FK so profiles can be deleted without breaking existing orders
-- When a profile is deleted, keep orders and just null out profile_id
ALTER TABLE public.orders_v2
  DROP CONSTRAINT IF EXISTS orders_v2_profile_id_fkey;

ALTER TABLE public.orders_v2
  ADD CONSTRAINT orders_v2_profile_id_fkey
  FOREIGN KEY (profile_id)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;