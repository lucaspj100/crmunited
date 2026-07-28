
-- ENUMS
CREATE TYPE public.material_type AS ENUM ('digital','physical');
CREATE TYPE public.material_payment_status AS ENUM ('pending','paid','exempt','cancelled','refunded');
CREATE TYPE public.material_payment_condition AS ENUM ('cash','installment');
CREATE TYPE public.material_payment_method AS ENUM ('pix','dinheiro','debito','credito','boleto','transferencia','outro');
CREATE TYPE public.material_bonus_reason AS ENUM (
  'eligible','pending_payment','paid_outside_enrollment_month','below_minimum_price',
  'invalid_payment_condition','cancelled','refunded','exempt','missing_information','duplicate_record'
);
CREATE TYPE public.material_goal_type AS ENUM ('individual','team');

-- REGRAS
CREATE TABLE public.material_bonus_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_type public.material_type NOT NULL,
  regular_minimum_value numeric(12,2) NOT NULL,
  cash_minimum_value numeric(12,2) NOT NULL,
  cash_discount_reference numeric(5,2) NOT NULL DEFAULT 10,
  credit_single_installment_is_cash boolean NOT NULL DEFAULT false,
  effective_from date NOT NULL DEFAULT '2000-01-01',
  effective_until date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.material_bonus_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.material_bonus_rules TO authenticated;
GRANT ALL ON public.material_bonus_rules TO service_role;
ALTER TABLE public.material_bonus_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rules_select_auth" ON public.material_bonus_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "rules_manage_admin" ON public.material_bonus_rules FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'franqueado'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'franqueado'));
CREATE TRIGGER trg_rules_updated BEFORE UPDATE ON public.material_bonus_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.material_bonus_rules (material_type, regular_minimum_value, cash_minimum_value)
VALUES ('digital', 1428.00, 1280.00), ('physical', 1668.00, 1500.00);

-- VENDAS DE MATERIAL
CREATE TABLE public.material_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL,
  enrollment_date date,
  material_type public.material_type,
  sale_value numeric(12,2),
  payment_status public.material_payment_status NOT NULL DEFAULT 'pending',
  payment_date date,
  payment_condition public.material_payment_condition,
  payment_method public.material_payment_method,
  installment_count integer,
  notes text,
  table_value_snapshot numeric(12,2),
  minimum_allowed_value_snapshot numeric(12,2),
  cash_discount_percentage_snapshot numeric(5,2),
  rule_id_snapshot uuid,
  price_rule_valid boolean NOT NULL DEFAULT false,
  eligible_for_bonus boolean NOT NULL DEFAULT false,
  bonus_eligibility_reason public.material_bonus_reason NOT NULL DEFAULT 'missing_information',
  retroactive_adjustment boolean NOT NULL DEFAULT false,
  payment_confirmed_by uuid,
  payment_confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  refunded_at timestamptz,
  refunded_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX material_sales_one_active_per_lead
  ON public.material_sales (lead_id)
  WHERE payment_status NOT IN ('cancelled','refunded');
CREATE INDEX material_sales_seller_idx ON public.material_sales (seller_id, enrollment_date);

GRANT SELECT, INSERT, UPDATE ON public.material_sales TO authenticated;
GRANT ALL ON public.material_sales TO service_role;
ALTER TABLE public.material_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ms_select_own_or_admin" ON public.material_sales FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'franqueado'));
CREATE POLICY "ms_insert_own_or_admin" ON public.material_sales FOR INSERT TO authenticated
  WITH CHECK (seller_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'franqueado'));
CREATE POLICY "ms_update_own_or_admin" ON public.material_sales FOR UPDATE TO authenticated
  USING (seller_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'franqueado'))
  WITH CHECK (seller_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'franqueado'));

-- HISTORICO
CREATE TABLE public.material_sales_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_sale_id uuid NOT NULL REFERENCES public.material_sales(id) ON DELETE CASCADE,
  lead_id uuid,
  event_type text NOT NULL,
  changed_by uuid,
  change_reason text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.material_sales_history TO authenticated;
GRANT ALL ON public.material_sales_history TO service_role;
ALTER TABLE public.material_sales_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msh_select" ON public.material_sales_history FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'franqueado')
    OR EXISTS (SELECT 1 FROM public.material_sales m WHERE m.id = material_sale_id AND m.seller_id = auth.uid()));

-- METAS
CREATE TABLE public.material_bonus_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_type public.material_goal_type NOT NULL,
  seller_id uuid,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  minimum_amount numeric(12,2) NOT NULL,
  bonus_amount numeric(12,2),
  effective_from date NOT NULL DEFAULT current_date,
  effective_until date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_bonus_goals TO authenticated;
GRANT ALL ON public.material_bonus_goals TO service_role;
ALTER TABLE public.material_bonus_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mbg_select" ON public.material_bonus_goals FOR SELECT TO authenticated USING (true);
CREATE POLICY "mbg_manage_admin" ON public.material_bonus_goals FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'franqueado'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'franqueado'));
CREATE TRIGGER trg_mbg_updated BEFORE UPDATE ON public.material_bonus_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- FECHAMENTO
CREATE TABLE public.material_bonus_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_month integer NOT NULL,
  reference_year integer NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  team_valid_total numeric(12,2) NOT NULL DEFAULT 0,
  team_goal numeric(12,2),
  team_bonus_status text NOT NULL DEFAULT 'open',
  per_seller jsonb NOT NULL DEFAULT '[]'::jsonb,
  considered_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_bonus_closings TO authenticated;
GRANT ALL ON public.material_bonus_closings TO service_role;
ALTER TABLE public.material_bonus_closings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mbc_select" ON public.material_bonus_closings FOR SELECT TO authenticated USING (true);
CREATE POLICY "mbc_manage_admin" ON public.material_bonus_closings FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'franqueado'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'franqueado'));
CREATE TRIGGER trg_mbc_updated BEFORE UPDATE ON public.material_bonus_closings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CALCULO DE ELEGIBILIDADE (fonte da verdade no banco)
CREATE OR REPLACE FUNCTION public.material_sales_compute()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
  min_val numeric(12,2);
  eff_condition public.material_payment_condition;
BEGIN
  -- vendedor sempre derivado do lead
  SELECT owner_id INTO NEW.seller_id FROM public.leads WHERE id = NEW.lead_id;
  IF NEW.enrollment_date IS NULL THEN
    SELECT enrollment_date INTO NEW.enrollment_date FROM public.leads WHERE id = NEW.lead_id;
  END IF;

  IF NEW.payment_status <> 'paid' THEN
    NEW.payment_confirmed_at := NULL;
    NEW.payment_confirmed_by := NULL;
  END IF;

  -- regra vigente na data da matricula (snapshot imutavel)
  IF NEW.rule_id_snapshot IS NULL AND NEW.material_type IS NOT NULL THEN
    SELECT * INTO r FROM public.material_bonus_rules
     WHERE material_type = NEW.material_type
       AND is_active
       AND effective_from <= COALESCE(NEW.enrollment_date, current_date)
       AND (effective_until IS NULL OR effective_until >= COALESCE(NEW.enrollment_date, current_date))
     ORDER BY effective_from DESC LIMIT 1;
    IF FOUND THEN
      NEW.rule_id_snapshot := r.id;
      NEW.table_value_snapshot := r.regular_minimum_value;
      NEW.cash_discount_percentage_snapshot := r.cash_discount_reference;
      NEW.minimum_allowed_value_snapshot := CASE WHEN NEW.payment_condition = 'cash'
        THEN r.cash_minimum_value ELSE r.regular_minimum_value END;
    END IF;
  ELSIF NEW.rule_id_snapshot IS NOT NULL THEN
    SELECT * INTO r FROM public.material_bonus_rules WHERE id = NEW.rule_id_snapshot;
    IF FOUND THEN
      NEW.minimum_allowed_value_snapshot := CASE WHEN NEW.payment_condition = 'cash'
        THEN r.cash_minimum_value ELSE r.regular_minimum_value END;
      NEW.table_value_snapshot := r.regular_minimum_value;
    END IF;
  END IF;

  min_val := NEW.minimum_allowed_value_snapshot;
  NEW.price_rule_valid := (NEW.sale_value IS NOT NULL AND min_val IS NOT NULL AND NEW.sale_value >= min_val);

  -- credito em 1x so e "a vista" quando a regra permitir
  eff_condition := NEW.payment_condition;

  -- prioridade dos motivos
  IF NEW.payment_status = 'cancelled' THEN
    NEW.bonus_eligibility_reason := 'cancelled';
  ELSIF NEW.payment_status = 'refunded' THEN
    NEW.bonus_eligibility_reason := 'refunded';
  ELSIF NEW.payment_status = 'exempt' THEN
    NEW.bonus_eligibility_reason := 'exempt';
  ELSIF NEW.material_type IS NULL OR NEW.sale_value IS NULL OR NEW.enrollment_date IS NULL
        OR min_val IS NULL
        OR (NEW.payment_status = 'paid' AND (NEW.payment_date IS NULL OR NEW.payment_condition IS NULL OR NEW.payment_method IS NULL)) THEN
    NEW.bonus_eligibility_reason := 'missing_information';
  ELSIF NEW.payment_status = 'pending' OR NEW.payment_date IS NULL THEN
    NEW.bonus_eligibility_reason := 'pending_payment';
  ELSIF date_trunc('month', NEW.payment_date::timestamp) <> date_trunc('month', NEW.enrollment_date::timestamp) THEN
    NEW.bonus_eligibility_reason := 'paid_outside_enrollment_month';
  ELSIF eff_condition IS NULL
        OR (eff_condition = 'installment' AND COALESCE(NEW.installment_count,0) < 1) THEN
    NEW.bonus_eligibility_reason := 'invalid_payment_condition';
  ELSIF NOT NEW.price_rule_valid THEN
    NEW.bonus_eligibility_reason := 'below_minimum_price';
  ELSE
    NEW.bonus_eligibility_reason := 'eligible';
  END IF;

  NEW.eligible_for_bonus := (NEW.bonus_eligibility_reason = 'eligible');

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    IF NEW.payment_status = 'cancelled' AND OLD.payment_status <> 'cancelled' THEN
      NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
    END IF;
    IF NEW.payment_status = 'refunded' AND OLD.payment_status <> 'refunded' THEN
      NEW.refunded_at := COALESCE(NEW.refunded_at, now());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_material_sales_compute
BEFORE INSERT OR UPDATE ON public.material_sales
FOR EACH ROW EXECUTE FUNCTION public.material_sales_compute();

-- AUDITORIA
CREATE OR REPLACE FUNCTION public.material_sales_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ev text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.material_sales_history (material_sale_id, lead_id, event_type, changed_by, new_values)
    VALUES (NEW.id, NEW.lead_id, 'material_created', auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF OLD.payment_status <> NEW.payment_status THEN
    ev := CASE NEW.payment_status
      WHEN 'paid' THEN 'payment_confirmed'
      WHEN 'cancelled' THEN 'material_cancelled'
      WHEN 'refunded' THEN 'material_refunded'
      ELSE 'material_updated' END;
  ELSIF OLD.payment_date IS DISTINCT FROM NEW.payment_date THEN
    ev := 'payment_changed';
  ELSIF OLD.seller_id IS DISTINCT FROM NEW.seller_id THEN
    ev := 'seller_changed';
  ELSE
    ev := 'material_updated';
  END IF;

  INSERT INTO public.material_sales_history (material_sale_id, lead_id, event_type, changed_by, old_values, new_values)
  VALUES (NEW.id, NEW.lead_id, ev, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));

  IF OLD.eligible_for_bonus IS DISTINCT FROM NEW.eligible_for_bonus THEN
    INSERT INTO public.material_sales_history (material_sale_id, lead_id, event_type, changed_by, old_values, new_values)
    VALUES (NEW.id, NEW.lead_id,
      CASE WHEN NEW.eligible_for_bonus THEN 'bonus_became_eligible' ELSE 'bonus_became_ineligible' END,
      auth.uid(), jsonb_build_object('eligible', OLD.eligible_for_bonus),
      jsonb_build_object('eligible', NEW.eligible_for_bonus, 'reason', NEW.bonus_eligibility_reason));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_material_sales_audit
AFTER INSERT OR UPDATE ON public.material_sales
FOR EACH ROW EXECUTE FUNCTION public.material_sales_audit();

-- MIGRACAO DOS REGISTROS ANTIGOS (sem presumir pagamento)
INSERT INTO public.material_sales (lead_id, seller_id, enrollment_date, sale_value, payment_status, notes)
SELECT l.id, l.owner_id, l.enrollment_date, l.material_value, 'pending',
       'Migrado do campo antigo material_value'
FROM public.leads l
WHERE l.material_value IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.material_sales m WHERE m.lead_id = l.id);
