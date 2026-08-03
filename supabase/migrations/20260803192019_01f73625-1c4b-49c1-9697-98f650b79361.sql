DROP POLICY IF EXISTS mbc_select ON public.material_bonus_closings;

CREATE POLICY "mbc_select_staff_or_own" ON public.material_bonus_closings
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'franqueado'::app_role)
  OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(per_seller) = 'array' THEN per_seller ELSE '[]'::jsonb END
    ) AS e
    WHERE COALESCE(e->>'seller_id', e->>'sellerId', e->>'id', e->>'vendedor_id') = auth.uid()::text
  )
);