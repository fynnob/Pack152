-- Run this in the Supabase SQL Editor.
-- Parent orders become immutable once payment_verified is true.
-- Leaders and Cub Masters can still advance order status and verify payment.

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_parent_mutation_lock" ON public.orders;
DROP POLICY IF EXISTS "orders_leader_mutation_access" ON public.orders;
DROP POLICY IF EXISTS "orders_parent_update_unpaid" ON public.orders;
DROP POLICY IF EXISTS "orders_leader_update" ON public.orders;
DROP POLICY IF EXISTS "orders_parent_delete_unpaid" ON public.orders;
DROP POLICY IF EXISTS "orders_leader_delete" ON public.orders;

CREATE POLICY "orders_parent_update_unpaid"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND COALESCE(payment_verified, false) = false
)
WITH CHECK (
  user_id = auth.uid()
  AND COALESCE(payment_verified, false) = false
);

CREATE POLICY "orders_leader_update"
ON public.orders
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

CREATE POLICY "orders_parent_delete_unpaid"
ON public.orders
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND COALESCE(payment_verified, false) = false
);

CREATE POLICY "orders_leader_delete"
ON public.orders
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

CREATE POLICY "orders_parent_mutation_lock"
ON public.orders
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND COALESCE(payment_verified, false) = false
  OR EXISTS (
    SELECT 1
    FROM public.profile
    WHERE profile.id = auth.uid()
      AND profile.role IN ('leader', 'cub_master')
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND COALESCE(payment_verified, false) = false
  OR EXISTS (
    SELECT 1
    FROM public.profile
    WHERE profile.id = auth.uid()
      AND profile.role IN ('leader', 'cub_master')
  )
);

CREATE POLICY "orders_parent_delete_before_payment"
ON public.orders
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND COALESCE(payment_verified, false) = false
  OR EXISTS (
    SELECT 1
    FROM public.profile
    WHERE profile.id = auth.uid()
      AND profile.role IN ('leader', 'cub_master')
  )
);
