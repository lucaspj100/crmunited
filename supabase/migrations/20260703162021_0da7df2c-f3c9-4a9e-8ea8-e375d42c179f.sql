
CREATE OR REPLACE FUNCTION public.cancel_previous_lead_tasks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'pendente' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.is_rescue, false) = true THEN
    RETURN NEW;
  END IF;

  UPDATE public.tasks
     SET status = 'cancelada',
         updated_at = now()
   WHERE lead_id = NEW.lead_id
     AND id <> NEW.id
     AND status = 'pendente'
     AND COALESCE(is_rescue, false) = false;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_previous_lead_tasks ON public.tasks;

CREATE TRIGGER trg_cancel_previous_lead_tasks
AFTER INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.cancel_previous_lead_tasks();
