ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS eligible_for_hall_of_fame boolean NOT NULL DEFAULT true;

UPDATE public.profiles p
   SET eligible_for_hall_of_fame = false
 WHERE EXISTS (SELECT 1 FROM public.teams t WHERE t.manager_id = p.id)
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role IN ('admin','franqueado'));

CREATE OR REPLACE FUNCTION public.guard_hof_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.eligible_for_hall_of_fame IS DISTINCT FROM OLD.eligible_for_hall_of_fame THEN
    IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar a elegibilidade ao Hall da Fama';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_hof_eligibility() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_hof_eligibility ON public.profiles;
CREATE TRIGGER trg_guard_hof_eligibility
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_hof_eligibility();