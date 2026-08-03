-- 1) Backfill imutável: entrada histórica em "interessado"
INSERT INTO public.lead_events (lead_id, user_id, event_type, description, metadata, created_at)
SELECT l.id, l.owner_id, 'status_change',
       'Reconstrução histórica: entrada na etapa Interessado',
       jsonb_build_object('to','interessado','backfill',true,'reason','historical_reconstruction'),
       l.created_at
FROM public.leads l
WHERE NOT EXISTS (
        SELECT 1 FROM public.lead_events e
         WHERE e.lead_id = l.id AND e.metadata->>'to' = 'interessado')
  AND (
        l.status IN ('interessado','entrevista_marcada','entrevista_realizada','matricula')
        OR EXISTS (SELECT 1 FROM public.lead_events e2
                    WHERE e2.lead_id = l.id AND e2.metadata->>'from' = 'interessado')
      );

-- 2) Trigger: registra a PRIMEIRA entrada em interessado (inclui leads criados já como interessado)
CREATE OR REPLACE FUNCTION public.log_first_interested_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'interessado' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'interessado' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.lead_events e
              WHERE e.lead_id = NEW.id AND e.metadata->>'to' = 'interessado') THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.lead_events (lead_id, user_id, event_type, description, metadata)
  VALUES (NEW.id, COALESCE(auth.uid(), NEW.owner_id), 'status_change',
          'Entrada na etapa Interessado',
          jsonb_build_object('to','interessado','from', CASE WHEN TG_OP='UPDATE' THEN OLD.status::text ELSE NULL END,'auto',true));
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.log_first_interested_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_leads_log_first_interested ON public.leads;
CREATE TRIGGER trg_leads_log_first_interested
AFTER INSERT OR UPDATE OF status ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.log_first_interested_event();

-- 3) productivity_summary: interessados 100% baseados em evento histórico
CREATE OR REPLACE FUNCTION public.productivity_summary(_start date, _end date, _vendedor_id uuid DEFAULT NULL::uuid, _team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_admin boolean;
  caller uuid := auth.uid();
  caller_team uuid;
  result jsonb;
  start_ts timestamptz := (_start::timestamp)::timestamptz;
  end_ts timestamptz := ((_end + 1)::timestamp)::timestamptz;
  today_date date := current_date;
  eff_team uuid := _team_id;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  is_admin := has_role(caller, 'admin'::app_role) OR has_role(caller, 'franqueado'::app_role);
  SELECT team_id INTO caller_team FROM public.profiles WHERE id = caller;

  IF NOT is_admin THEN
    IF EXISTS (SELECT 1 FROM public.teams t WHERE t.manager_id = caller) THEN
      SELECT t.id INTO eff_team FROM public.teams t WHERE t.manager_id = caller LIMIT 1;
    END IF;
  END IF;

  WITH sellers AS (
    SELECT p.id, p.full_name, p.email, p.avatar_url, p.team_id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'vendedor'
    WHERE (is_admin OR _vendedor_id IS NULL OR p.id = caller)
      AND (_vendedor_id IS NULL OR p.id = _vendedor_id)
      AND (eff_team IS NULL OR p.team_id = eff_team)
  ),
  leads_novos AS (
    SELECT owner_id AS vid, count(*)::int AS n FROM public.leads
    WHERE created_at >= start_ts AND created_at < end_ts GROUP BY owner_id
  ),
  leads_trab AS (
    SELECT owner_id AS vid, count(*)::int AS n FROM public.leads
    WHERE last_contact_at >= start_ts AND last_contact_at < end_ts GROUP BY owner_id
  ),
  att AS (
    SELECT vendedor_id AS vid,
      count(*) FILTER (WHERE tipo_acao = 'ligacao')::int AS ligacoes_feitas,
      count(*) FILTER (
        WHERE tipo_acao = 'ligacao' AND resultado IS NOT NULL
          AND resultado IN ('Atendeu','Interessado','Pediu WhatsApp','Ligar depois','Sem interesse')
      )::int AS ligacoes_atendidas
    FROM public.prospect_attempts
    WHERE created_at >= start_ts AND created_at < end_ts GROUP BY vendedor_id
  ),
  -- Fonte oficial: primeira entrada na etapa Interessado (evento histórico imutável),
  -- creditada ao autor do evento na época (fallback: dono do lead).
  interessados_ev AS (
    SELECT DISTINCT ON (e.lead_id)
           e.lead_id,
           COALESCE(e.user_id, l.owner_id) AS vid,
           (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d
    FROM public.lead_events e
    JOIN public.leads l ON l.id = e.lead_id
    WHERE e.event_type = 'status_change'
      AND e.metadata->>'to' = 'interessado'
    ORDER BY e.lead_id, e.created_at
  ),
  interessados AS (
    SELECT vid, count(DISTINCT lead_id)::int AS n
    FROM interessados_ev
    WHERE vid IS NOT NULL AND d >= _start AND d <= _end
    GROUP BY vid
  ),
  entrev AS (
    SELECT owner_id AS vid, count(DISTINCT id)::int AS n
    FROM public.leads
    WHERE interview_date IS NOT NULL
      AND interview_date >= _start
      AND interview_date <= _end
      AND owner_id IS NOT NULL
    GROUP BY owner_id
  ),
  entrev_real AS (
    SELECT owner_id AS vid, count(DISTINCT id)::int AS n
    FROM public.leads
    WHERE interview_done_date IS NOT NULL
      AND interview_done_date >= _start
      AND interview_done_date <= _end
    GROUP BY owner_id
  ),
  matr AS (
    SELECT owner_id AS vid, count(DISTINCT id)::int AS n FROM public.leads
    WHERE enrollment_date IS NOT NULL
      AND enrollment_date >= _start
      AND enrollment_date <= _end
    GROUP BY owner_id
  ),
  perd AS (
    SELECT l.owner_id AS vid, count(DISTINCT l.id)::int AS n
    FROM public.lead_events e
    JOIN public.leads l ON l.id = e.lead_id
    WHERE (
      e.event_type = 'lost'
      OR (e.event_type = 'status_change' AND e.metadata->>'to' = 'perdido')
    )
    AND e.created_at >= start_ts AND e.created_at < end_ts
    GROUP BY l.owner_id
  ),
  ck AS (
    SELECT vendedor_id AS vid, sum(whatsapp_msgs)::int AS whats, sum(linkedin_msgs)::int AS links
    FROM public.daily_checkouts WHERE data >= _start AND data <= _end GROUP BY vendedor_id
  ),
  ck_today AS (
    SELECT vendedor_id AS vid, submitted_at FROM public.daily_checkouts WHERE data = today_date
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'vendedor_id', s.id,
      'nome', COALESCE(s.full_name, s.email),
      'email', s.email,
      'avatar_url', s.avatar_url,
      'team_id', s.team_id,
      'leads_novos_atribuidos', COALESCE(ln.n, 0),
      'leads_trabalhados', COALESCE(lt.n, 0),
      'ligacoes_feitas', COALESCE(a.ligacoes_feitas, 0),
      'ligacoes_atendidas', COALESCE(a.ligacoes_atendidas, 0),
      'interessados_gerados', COALESCE(i.n, 0),
      'entrevistas_marcadas', COALESCE(e.n, 0),
      'entrevistas_realizadas', COALESCE(er.n, 0),
      'matriculas', COALESCE(m.n, 0),
      'perdidos', COALESCE(pe.n, 0),
      'whatsapps_checkout', COALESCE(c.whats, 0),
      'linkedins_checkout', COALESCE(c.links, 0),
      'checkout_today_done', (ct.vid IS NOT NULL),
      'checkout_today_at', ct.submitted_at
    ) ORDER BY COALESCE(s.full_name, s.email)
  ) INTO result
  FROM sellers s
  LEFT JOIN leads_novos ln ON ln.vid = s.id
  LEFT JOIN leads_trab lt ON lt.vid = s.id
  LEFT JOIN att a ON a.vid = s.id
  LEFT JOIN interessados i ON i.vid = s.id
  LEFT JOIN entrev e ON e.vid = s.id
  LEFT JOIN entrev_real er ON er.vid = s.id
  LEFT JOIN matr m ON m.vid = s.id
  LEFT JOIN perd pe ON pe.vid = s.id
  LEFT JOIN ck c ON c.vid = s.id
  LEFT JOIN ck_today ct ON ct.vid = s.id;

  RETURN COALESCE(result, '[]'::jsonb);
END
$function$;

-- 4) Diagnóstico de interessados (somente staff)
CREATE OR REPLACE FUNCTION public.interested_audit(_start date, _end date)
RETURNS TABLE(
  lead_id uuid,
  nome text,
  became_interested_at timestamptz,
  event_seller_id uuid,
  event_seller_name text,
  current_seller_id uuid,
  current_seller_name text,
  current_status text,
  origem text,
  backfilled boolean,
  divergence_reason text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH first_ev AS (
    SELECT DISTINCT ON (e.lead_id)
      e.lead_id, e.created_at, e.user_id, (e.metadata->>'backfill')::boolean AS bf
    FROM public.lead_events e
    WHERE e.event_type = 'status_change' AND e.metadata->>'to' = 'interessado'
    ORDER BY e.lead_id, e.created_at
  )
  SELECT l.id, l.name, f.created_at,
         COALESCE(f.user_id, l.owner_id), COALESCE(pe.full_name, pe.email),
         l.owner_id, COALESCE(po.full_name, po.email),
         l.status::text, l.source, COALESCE(f.bf, false),
         CASE
           WHEN COALESCE(f.bf,false) THEN 'evento reconstruído (não havia registro histórico)'
           WHEN COALESCE(f.user_id, l.owner_id) <> l.owner_id THEN 'lead transferido após a conversão'
           WHEN l.status <> 'interessado' THEN 'avançou/saiu da etapa (contava antes pelo status atual)'
           ELSE 'sem divergência'
         END
  FROM first_ev f
  JOIN public.leads l ON l.id = f.lead_id
  LEFT JOIN public.profiles pe ON pe.id = COALESCE(f.user_id, l.owner_id)
  LEFT JOIN public.profiles po ON po.id = l.owner_id
  WHERE (f.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN _start AND _end
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'franqueado'::app_role))
  ORDER BY f.created_at;
$$;

REVOKE ALL ON FUNCTION public.interested_audit(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.interested_audit(date, date) TO authenticated;