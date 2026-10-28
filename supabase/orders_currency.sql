ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS total_amount_eur numeric(10, 2),
  ADD COLUMN IF NOT EXISTS eur_exchange_rate numeric(12, 8),
  ADD COLUMN IF NOT EXISTS currency_locked_at timestamptz;

UPDATE public.orders
SET total_amount_eur = ROUND(total_amount * 0.86, 2)
WHERE total_amount_eur IS NULL
  AND total_amount IS NOT NULL;

UPDATE public.orders
SET
  eur_exchange_rate = 0.86,
  currency_locked_at = COALESCE(currency_locked_at, created_at, now())
WHERE eur_exchange_rate IS NULL
  AND total_amount IS NOT NULL;

UPDATE public.orders
SET items = (
  SELECT jsonb_agg(
    item || jsonb_build_object(
      'price_eur',
      ROUND(((item->>'price')::numeric * 0.86)::numeric, 2)
    )
  )
  FROM jsonb_array_elements(items) AS item
)
WHERE jsonb_typeof(items) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(items) AS item
    WHERE item->>'price' IS NOT NULL
      AND item->>'price_eur' IS NULL
  );
