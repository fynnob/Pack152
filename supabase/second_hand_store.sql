-- Run this in the Supabase SQL Editor after creating the private
-- storage bucket named SecondHandStore with a 10 MB image-only limit.

CREATE TABLE IF NOT EXISTS public."SecondHandStore" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  price numeric(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  photo_path text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public."SecondHandStore"
ADD COLUMN IF NOT EXISTS price numeric(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE public."SecondHandStore"
DROP CONSTRAINT IF EXISTS "SecondHandStore_price_check";

ALTER TABLE public."SecondHandStore"
ADD CONSTRAINT "SecondHandStore_price_check" CHECK (price >= 0);

ALTER TABLE public."SecondHandStore" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "second_hand_store_read_authenticated" ON public."SecondHandStore";
DROP POLICY IF EXISTS "second_hand_store_insert_owner" ON public."SecondHandStore";
DROP POLICY IF EXISTS "second_hand_store_update_owner" ON public."SecondHandStore";
DROP POLICY IF EXISTS "second_hand_store_delete_owner" ON public."SecondHandStore";
DROP POLICY IF EXISTS "second_hand_store_update_leader" ON public."SecondHandStore";
DROP POLICY IF EXISTS "second_hand_store_delete_leader" ON public."SecondHandStore";

CREATE POLICY "second_hand_store_read_authenticated"
ON public."SecondHandStore"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "second_hand_store_insert_owner"
ON public."SecondHandStore"
FOR INSERT
TO authenticated
WITH CHECK (seller_id = auth.uid());

CREATE POLICY "second_hand_store_update_owner"
ON public."SecondHandStore"
FOR UPDATE
TO authenticated
USING (seller_id = auth.uid())
WITH CHECK (seller_id = auth.uid());

CREATE POLICY "second_hand_store_delete_owner"
ON public."SecondHandStore"
FOR DELETE
TO authenticated
USING (seller_id = auth.uid());

CREATE POLICY "second_hand_store_update_leader"
ON public."SecondHandStore"
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profile
    WHERE profile.id = auth.uid()
      AND profile.role IN ('leader', 'cub_master')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profile
    WHERE profile.id = auth.uid()
      AND profile.role IN ('leader', 'cub_master')
  )
);

CREATE POLICY "second_hand_store_delete_leader"
ON public."SecondHandStore"
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profile
    WHERE profile.id = auth.uid()
      AND profile.role IN ('leader', 'cub_master')
  )
);

-- Private bucket reads are served through signed URLs from the page.
DROP POLICY IF EXISTS "second_hand_store_images_read_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "second_hand_store_images_insert_owner" ON storage.objects;
DROP POLICY IF EXISTS "second_hand_store_images_delete_owner" ON storage.objects;
DROP POLICY IF EXISTS "second_hand_store_images_delete_leader" ON storage.objects;

CREATE POLICY "second_hand_store_images_read_authenticated"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'SecondHandStore');

CREATE POLICY "second_hand_store_images_insert_owner"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'SecondHandStore'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "second_hand_store_images_delete_owner"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'SecondHandStore'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "second_hand_store_images_delete_leader"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'SecondHandStore'
  AND EXISTS (
    SELECT 1
    FROM public.profile
    WHERE profile.id = auth.uid()
      AND profile.role IN ('leader', 'cub_master')
  )
);
