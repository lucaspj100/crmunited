-- 0013 — Premiação de materiais: só material digital a partir da competência 2026-11-01
-- PROPOSTA — NÃO APLICADA. Aguardando autorização.
-- Regra: enrollment_date >= 2026-11-01 AND material_type = 'physical' => inelegível
-- (motivo 'physical_not_eligible'). Anteriores a nov/2026: regras antigas intactas.
-- Cancelado / estornado / isento mantêm seus motivos originais (prioridade maior).
-- Vendas, faturamento, recebimentos e histórico NÃO são alterados.

ALTER TYPE public.material_bonus_reason ADD VALUE IF NOT EXISTS 'physical_not_eligible';

CREATE OR REPLACE FUNCTION public.material_sales_compute()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  min_val numeric(12,2);
  eff_condition public.material_payment_condition;
BEGIN
  SELECT owner_id INTO NEW.seller_id FROM public.leads WHERE id = NEW.lead_id;
  IF NEW.enrollment_date IS NULL THEN
    SELECT enrollment_date INTO NEW.enrollment_date FROM public.leads WHERE id = NEW.lead_id;
  END IF;

  IF NEW.payment_status <> 'paid' THEN
    NEW.payment_confirmed_at := NULL;
    NEW.payment_confirmed_by := NULL;
  END IF;

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

  eff_condition := NEW.payment_condition;

  IF NEW.payment_status = 'cancelled' THEN
    NEW.bonus_eligibility_reason := 'cancelled';
  ELSIF NEW.payment_status = 'refunded' THEN
    NEW.bonus_eligibility_reason := 'refunded';
  ELSIF NEW.payment_status = 'exempt' THEN
    NEW.bonus_eligibility_reason := 'exempt';
  ELSIF NEW.material_type = 'physical' AND NEW.enrollment_date >= DATE '2026-11-01' THEN
    NEW.bonus_eligibility_reason := 'physical_not_eligible';
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
$function$;

-- Recalculo restrito (sem retroativo indiscriminado): somente físicos com matrícula >= 2026-11-01.
-- Impacto medido em 03/11/2026: 0 linhas. Executar apenas com autorização, como UPDATE separado:
-- UPDATE public.material_sales SET updated_at = now()
--  WHERE material_type = 'physical' AND enrollment_date >= DATE '2026-11-01';
