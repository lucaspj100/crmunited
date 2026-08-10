-- ============ ENUM ============
CREATE TYPE public.seller_commission_status AS ENUM ('nao_configurada','prevista','cancelada');

-- ============ RULES ============
CREATE TABLE public.seller_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  commission_percentage numeric(5,2) NOT NULL CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
  valid_from date NOT NULL DEFAULT current_date,
  valid_until date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_scr_seller ON public.seller_commission_rules (seller_id, valid_from DESC);
CREATE UNIQUE INDEX idx_scr_one_active ON public.seller_commission_rules (seller_id) WHERE is_active;

GRANT SELECT ON public.seller_commission_rules TO authenticated;
GRANT ALL ON public.seller_commission_rules TO service_role;
ALTER TABLE public.seller_commission_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scr_admin_read" ON public.seller_commission_rules
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "scr_own_read" ON public.seller_commission_rules
  FOR SELECT TO authenticated USING (seller_id = auth.uid());

CREATE TRIGGER trg_scr_updated_at BEFORE UPDATE ON public.seller_commission_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ COMMISSIONS ============
CREATE TABLE public.seller_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  seller_id uuid,
  seller_name_snapshot text,
  student_name_snapshot text,
  enrollment_date date,
  enrollment_value_snapshot numeric(12,2),
  commission_rule_id uuid REFERENCES public.seller_commission_rules(id) ON DELETE SET NULL,
  commission_percentage_snapshot numeric(5,2),
  commission_amount numeric(12,2),
  status public.seller_commission_status NOT NULL DEFAULT 'prevista',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_commissions_lead_unique UNIQUE (lead_id)
);
CREATE INDEX idx_sc_seller_date ON public.seller_commissions (seller_id, enrollment_date DESC);

GRANT SELECT ON public.seller_commissions TO authenticated;
GRANT ALL ON public.seller_commissions TO service_role;
ALTER TABLE public.seller_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sc_admin_read" ON public.seller_commissions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "sc_own_read" ON public.seller_commissions
  FOR SELECT TO authenticated USING (seller_id = auth.uid());

CREATE TRIGGER trg_sc_updated_at BEFORE UPDATE ON public.seller_commissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ RULE RESOLVER ============
CREATE OR REPLACE FUNCTION public.resolve_seller_commission_rule(_seller_id uuid, _on_date date)
RETURNS public.seller_commission_rules
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r public.seller_commission_rules;
BEGIN
  SELECT * INTO r FROM public.seller_commission_rules
   WHERE seller_id = _seller_id
     AND valid_from <= COALESCE(_on_date, current_date)
     AND (valid_until IS NULL OR valid_until >= COALESCE(_on_date, current_date))
   ORDER BY is_active DESC, valid_from DESC
   LIMIT 1;
  IF FOUND THEN RETURN r; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.resolve_seller_commission_rule(uuid, date) FROM PUBLIC, anon, authenticated;

-- ============ ENSURE / SYNC ============
CREATE OR REPLACE FUNCTION public.ensure_seller_commission(_lead_id uuid, _reprice boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  l public.leads;
  r public.seller_commission_rules;
  existing public.seller_commissions;
  sname text;
  eff_date date;
  pctv numeric(5,2);
  amt numeric(12,2);
  st public.seller_commission_status;
  new_id uuid;
BEGIN
  SELECT * INTO l FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND OR l.status <> 'matricula' THEN RETURN NULL; END IF;

  eff_date := COALESCE(l.enrollment_date, current_date);
  SELECT full_name INTO sname FROM public.profiles WHERE id = l.owner_id;
  SELECT * INTO existing FROM public.seller_commissions WHERE lead_id = _lead_id;

  IF existing.id IS NOT NULL THEN
    -- Percentual snapshot é preservado; só é buscado quando ainda não existe
    -- (comissão não configurada) ou quando o ADM pede recálculo explícito.
    pctv := existing.commission_percentage_snapshot;
    IF pctv IS NULL OR _reprice THEN
      r := public.resolve_seller_commission_rule(l.owner_id, eff_date);
      IF r.id IS NOT NULL THEN pctv := r.commission_percentage; END IF;
    END IF;

    IF pctv IS NULL THEN
      amt := NULL; st := 'nao_configurada';
    ELSE
      amt := ROUND(COALESCE(l.enrollment_value, 0) * pctv / 100.0, 2);
      st := 'prevista';
    END IF;

    UPDATE public.seller_commissions SET
      seller_id = l.owner_id,
      seller_name_snapshot = COALESCE(sname, seller_name_snapshot),
      student_name_snapshot = l.name,
      enrollment_date = l.enrollment_date,
      enrollment_value_snapshot = l.enrollment_value,
      commission_rule_id = COALESCE(r.id, commission_rule_id),
      commission_percentage_snapshot = pctv,
      commission_amount = amt,
      status = st
    WHERE id = existing.id;
    RETURN existing.id;
  END IF;

  r := public.resolve_seller_commission_rule(l.owner_id, eff_date);
  IF r.id IS NULL THEN
    pctv := NULL; amt := NULL; st := 'nao_configurada';
  ELSE
    pctv := r.commission_percentage;
    amt := ROUND(COALESCE(l.enrollment_value, 0) * pctv / 100.0, 2);
    st := 'prevista';
  END IF;

  INSERT INTO public.seller_commissions (
    lead_id, seller_id, seller_name_snapshot, student_name_snapshot, enrollment_date,
    enrollment_value_snapshot, commission_rule_id, commission_percentage_snapshot,
    commission_amount, status
  ) VALUES (
    l.id, l.owner_id, sname, l.name, l.enrollment_date,
    l.enrollment_value, r.id, pctv, amt, st
  )
  ON CONFLICT (lead_id) DO NOTHING
  RETURNING id INTO new_id;

  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.ensure_seller_commission(uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.leads_seller_commission_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'matricula' THEN
    PERFORM public.ensure_seller_commission(NEW.id, false);
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'matricula' AND NEW.status <> 'matricula' THEN
    UPDATE public.seller_commissions
       SET status = 'cancelada'
     WHERE lead_id = NEW.id AND status <> 'cancelada';
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.leads_seller_commission_sync() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER leads_seller_commission_sync_trg
AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.leads_seller_commission_sync();