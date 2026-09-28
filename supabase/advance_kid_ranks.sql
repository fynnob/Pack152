-- Advance each child's rank by one year.
-- Scouts BSA and any unrecognized rank are left unchanged.
-- Run this in the Supabase SQL Editor.

BEGIN;

-- Preview the changes before applying them, if desired:
-- SELECT
--   id,
--   kids AS old_kids,
--   (
--     SELECT jsonb_agg(
--       CASE lower(trim(kid->>'rank'))
--         WHEN 'lion' THEN jsonb_set(kid, '{rank}', '"Tiger"'::jsonb)
--         WHEN 'tiger' THEN jsonb_set(kid, '{rank}', '"Wolf"'::jsonb)
--         WHEN 'wolf' THEN jsonb_set(kid, '{rank}', '"Bear"'::jsonb)
--         WHEN 'bear' THEN jsonb_set(kid, '{rank}', '"Webelos"'::jsonb)
--         WHEN 'webelos' THEN jsonb_set(kid, '{rank}', '"AOL"'::jsonb)
--         WHEN 'aol' THEN jsonb_set(kid, '{rank}', '"Scouts"'::jsonb)
--         ELSE kid
--       END
--       ORDER BY child_order
--     )
--     FROM jsonb_array_elements(kids) WITH ORDINALITY AS child(kid, child_order)
--   ) AS new_kids
-- FROM public.profile
-- WHERE jsonb_typeof(kids) = 'array';

UPDATE public.profile AS profile_row
SET kids = updated.new_kids
FROM (
  SELECT
    profile_row_inner.id,
    jsonb_agg(
      CASE lower(trim(child.kid->>'rank'))
        WHEN 'lion' THEN jsonb_set(child.kid, '{rank}', '"Tiger"'::jsonb)
        WHEN 'tiger' THEN jsonb_set(child.kid, '{rank}', '"Wolf"'::jsonb)
        WHEN 'wolf' THEN jsonb_set(child.kid, '{rank}', '"Bear"'::jsonb)
        WHEN 'bear' THEN jsonb_set(child.kid, '{rank}', '"Webelos"'::jsonb)
        WHEN 'webelos' THEN jsonb_set(child.kid, '{rank}', '"AOL"'::jsonb)
        WHEN 'aol' THEN jsonb_set(child.kid, '{rank}', '"Scouts"'::jsonb)
        ELSE child.kid
      END
      ORDER BY child.child_order
    ) AS new_kids
  FROM public.profile AS profile_row_inner
  CROSS JOIN LATERAL jsonb_array_elements(profile_row_inner.kids) WITH ORDINALITY AS child(kid, child_order)
  WHERE jsonb_typeof(profile_row_inner.kids) = 'array'
  GROUP BY profile_row_inner.id
) AS updated
WHERE profile_row.id = updated.id
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(profile_row.kids) AS child(kid)
    WHERE lower(trim(child.kid->>'rank')) IN ('lion', 'tiger', 'wolf', 'bear', 'webelos', 'aol')
  );

COMMIT;
