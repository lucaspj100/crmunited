-- ===== ENUMS =====
CREATE TYPE public.leadership_rule_scope AS ENUM ('individual','role');
CREATE TYPE public.leadership_commission_type AS ENUM ('percentage','fixed');
CREATE TYPE public.leadership_commission_status AS ENUM ('nao_configurada','prevista','confirmada','paga','cancelada','estornada');

-- ===== RULES =====
CREATE TABLE public.leadership_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_scope public.leadership_rule_scope NOT NULL,
  employee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_name public.app_role,
  commission_type public.leadership_commission_type NOT NULL,
  commission_percentage numeric(6,3),
  fixed_amount numeric(12,2),
  valid_from date NOT NULL DEFAULT current_date,
  valid_until date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lcr_scope_target CHECK (
    (rule_scope = 'individual' AND employee_id IS NOT NULL AND role_name IS NULL)
    OR (rule_scope = 'role' AND role_name IS NOT NULL AND employee_id IS NULL)
  ),
  CONSTRAINT lcr_type_value CHECK (
    (commission_type = 'percentage' AND commission_percentage IS NOT NULL AND commission_percentage >= 0 AND fixed_amount IS NULL)
    OR (commission_type = 'fixed' AND fixed_amount IS NOT NULL AND fixed_amount >= 0 AND commission_percentage IS NULL)
  )
);

CREATE UNIQUE INDEX lcr_one_active_per_employee
  ON public.leadership_commission_rules (employee_id)
  WHERE is_active AND rule_scope = 'individual';
CREATE UNIQUE INDEX lcr_one_active_per_role
  ON public.leadership_commission_rules (role_name)
  WHERE is_active AND rule_scope = 'role';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leadership_commission_rules TO authenticated;
GRANT ALL ON public.leadership_commission_rules TO service_role;
ALTER TABLE public.leadership_commission_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lcr_admin_all" ON public.leadership_commission_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER lcr_set_updated_at BEFORE UPDATE ON public.leadership_commission_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== COMMISSIONS =====
CREATE TABLE public.leadership_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL UNIQUE REFERENCES public.leads(id) ON DELETE CASCADE,
  student_name text,
  employee_id uuid,
  employee_name_snapshot text,
  employee_role_snapshot public.app_role,
  enrollment_date date,
  enrollment_amount numeric(12,2),
  material_amount numeric(12,2),
  commission_rule_id uuid REFERENCES public.leadership_commission_rules(id) ON DELETE SET NULL,
  commission_type_snapshot public.leadership_commission_type,
  commission_percentage_snapshot numeric(6,3),
  fixed_amount_snapshot numeric(12,2),
  commission_amount numeric(12,2),
  enrollment_status text NOT NULL DEFAULT 'matricula',
  commission_status public.leadership_commission_status NOT NULL DEFAULT 'prevista',
  payment_date date,
  paid_by uuid,
  paid_at timestamptz,
  needs_compensation boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lc_enrollment_date_idx ON public.leadership_commissions (enrollment_date);
CREATE INDEX lc_employee_idx ON public.leadership_commissions (employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leadership_commissions TO authenticated;
GRANT ALL ON public.leadership_commissions TO service_role;
ALTER TABLE public.leadership_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lc_admin_all" ON public.leadership_commissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER lc_set_updated_at BEFORE UPDATE ON public.leadership_commissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== AUDIT =====
CREATE TABLE public.leadership_commission_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid NOT NULL REFERENCES public.leadership_commissions(id) ON DELETE CASCADE,
  action text NOT NULL,
  previous_data jsonb,
  new_data jsonb,
  reason text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lcal_commission_idx ON public.leadership_commission_audit_logs (commission_id, changed_at DESC);

GRANT SELECT, INSERT ON public.leadership_commission_audit_logs TO authenticated;
GRANT ALL ON public.leadership_commission_audit_logs TO service_role;
ALTER TABLE public.leadership_commission_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lcal_admin_select" ON public.leadership_commission_audit_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "lcal_admin_insert" ON public.leadership_commission_audit_logs
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- ===== RULE RESOLUTION =====
CREATE OR REPLACE FUNCTION public.resolve_leadership_commission_rule(_employee_id uuid, _on_date date)
RETURNS public.leadership_commission_rules
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.leadership_commission_rules;
  emp_role public.app_role;
BEGIN
  SELECT * INTO r FROM public.leadership_commission_rules
   WHERE rule_scope = 'individual' AND employee_id = _employee_id AND is_active
     AND valid_from <= COALESCE(_on_date, current_date)
     AND (valid_until IS NULL OR valid_until >= COALESCE(_on_date, current_date))
   ORDER BY valid_from DESC LIMIT 1;
  IF FOUND THEN RETURN r; END IF;

  SELECT role INTO emp_role FROM public.user_roles WHERE user_id = _employee_id
   ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'franqueado' THEN 2 ELSE 3 END LIMIT 1;
  IF emp_role IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO r FROM public.leadership_commission_rules
   WHERE rule_scope = 'role' AND role_name = emp_role AND is_active
     AND valid_from <= COALESCE(_on_date, current_date)
     AND (valid_until IS NULL OR valid_until >= COALESCE(_on_date, current_date))
   ORDER BY valid_from DESC LIMIT 1;
  IF FOUND THEN RETURN r; END IF;
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.resolve_leadership_commission_rule(uuid, date) FROM PUBLIC, anon, authenticated;

-- ===== UPSERT COMMISSION FOR A LEAD =====
CREATE OR REPLACE FUNCTION public.ensure_leadership_commission(_lead_id uuid, _recalculate boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  l public.leads;
  r public.leadership_commission_rules;
  emp_role public.app_role;
  emp_name text;
  existing public.leadership_commissions;
  amt numeric(12,2);
  st public.leadership_commission_status;
  new_id uuid;
BEGIN
  SELECT * INTO l FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND OR l.status <> 'matricula' THEN RETURN NULL; END IF;

  SELECT * INTO existing FROM public.leadership_commissions WHERE lead_id = _lead_id;
  IF FOUND AND NOT _recalculate THEN RETURN existing.id; END IF;
  IF FOUND AND existing.commission_status IN ('paga','estornada') THEN RETURN existing.id; END IF;

  SELECT full_name INTO emp_name FROM public.profiles WHERE id = l.owner_id;
  SELECT role INTO emp_role FROM public.user_roles WHERE user_id = l.owner_id
   ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'franqueado' THEN 2 ELSE 3 END LIMIT 1;

  r := public.resolve_leadership_commission_rule(l.owner_id, COALESCE(l.enrollment_date, current_date));

  IF r.id IS NULL THEN
    amt := NULL; st := 'nao_configurada';
  ELSIF r.commission_type = 'percentage' THEN
    amt := ROUND(COALESCE(l.enrollment_value,0) * r.commission_percentage / 100.0, 2);
    st := 'prevista';
  ELSE
    amt := r.fixed_amount; st := 'prevista';
  END IF;

  IF existing.id IS NOT NULL THEN
    UPDATE public.leadership_commissions SET
      student_name = l.name,
      employee_id = l.owner_id,
      employee_name_snapshot = emp_name,
      employee_role_snapshot = emp_role,
      enrollment_date = l.enrollment_date,
      enrollment_amount = l.enrollment_value,
      material_amount = l.material_value,
      commission_rule_id = r.id,
      commission_type_snapshot = r.commission_type,
      commission_percentage_snapshot = r.commission_percentage,
      fixed_amount_snapshot = r.fixed_amount,
      commission_amount = amt,
      enrollment_status = l.status::text,
      commission_status = CASE WHEN existing.commission_status = 'confirmada' AND st = 'prevista' THEN 'confirmada'::public.leadership_commission_status ELSE st END
    WHERE id = existing.id;
    RETURN existing.id;
  END IF;

  INSERT INTO public.leadership_commissions (
    lead_id, student_name, employee_id, employee_name_snapshot, employee_role_snapshot,
    enrollment_date, enrollment_amount, material_amount, commission_rule_id,
    commission_type_snapshot, commission_percentage_snapshot, fixed_amount_snapshot,
    commission_amount, enrollment_status, commission_status
  ) VALUES (
    l.id, l.name, l.owner_id, emp_name, emp_role,
    l.enrollment_date, l.enrollment_value, l.material_value, r.id,
    r.commission_type, r.commission_percentage, r.fixed_amount,
    amt, l.status::text, st
  )
  ON CONFLICT (lead_id) DO NOTHING
  RETURNING id INTO new_id;

  RETURN new_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.ensure_leadership_commission(uuid, boolean) FROM PUBLIC, anon;

-- ===== TRIGGER ON LEADS =====
CREATE OR REPLACE FUNCTION public.leads_leadership_commission_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'matricula' THEN
    PERFORM public.ensure_leadership_commission(NEW.id, false);
    UPDATE public.leadership_commissions
       SET enrollment_status = NEW.status::text,
           enrollment_date = COALESCE(NEW.enrollment_date, enrollment_date),
           enrollment_amount = COALESCE(NEW.enrollment_value, enrollment_amount),
           material_amount = COALESCE(NEW.material_value, material_amount),
           student_name = NEW.name
     WHERE lead_id = NEW.id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'matricula' AND NEW.status <> 'matricula' THEN
    UPDATE public.leadership_commissions
       SET enrollment_status = NEW.status::text,
           commission_status = CASE
             WHEN commission_status IN ('prevista','nao_configurada') THEN 'cancelada'::public.leadership_commission_status
             WHEN commission_status IN ('confirmada','paga') THEN 'estornada'::public.leadership_commission_status
             ELSE commission_status END,
           needs_compensation = CASE WHEN commission_status = 'paga' THEN true ELSE needs_compensation END
     WHERE lead_id = NEW.id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;

CREATE TRIGGER leads_leadership_commission_sync_trg
AFTER INSERT OR UPDATE OF status, enrollment_value, material_value, enrollment_date, owner_id, name
ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.leads_leadership_commission_sync();