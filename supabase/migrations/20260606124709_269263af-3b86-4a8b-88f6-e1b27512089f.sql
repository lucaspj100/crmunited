ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS enrollment_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS monthly_fee numeric(12,2),
  ADD COLUMN IF NOT EXISTS material_value numeric(12,2);