CREATE OR REPLACE FUNCTION public.productivity_summary(_start date, _end date, _vendedor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_admin boolean;
  caller uuid := auth.uid();
  result jsonb;
  start_ts timestamptz := (_start::timestamp)::timestamptz;
  end_ts timestamptz := ((_end + 1)::timestamp)::timestamptz;
  today_date date := current_date;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  is_admin := has_role(caller, 'admin'::app_role) OR has_role(caller, 'franqueado'::app_role);

  WITH sellers AS (
    SELECT p.id, p.full_name, p.email, p.avatar_url
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'vendedor'
    WHERE
      (is_admin OR _vendedor_id IS NULL OR p.id = caller)
      AND (_vendedor_id IS NULL OR p.id = _vendedor_id)
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
  interessados_evt AS (
    SELECT DISTINCT l.id AS lead_id, l.owner_id AS vid
    FROM public.lead_events e
    JOIN public.leads l ON l.id = e.lead_id
    WHERE e.event_type = 'status_change'
      AND e.metadata->>'to' = 'interessado'
      AND e.created_at >= start_ts AND e.created_at < end_ts
  ),
  interessados_fb AS (
    SELECT id AS lead_id, owner_id AS vid
    FROM public.leads
    WHERE created_at >= start_ts AND created_at < end_ts
      AND status IN ('interessado','entrevista_marcada','entrevista_realizada','matricula')
  ),
  interessados AS (
    SELECT vid, count(DISTINCT lead_id)::int AS n
    FROM (
      SELECT lead_id, vid FROM interessados_evt
      UNION
      SELECT lead_id, vid FROM interessados_fb
    ) u
    WHERE vid IS NOT NULL
    GROUP BY vid
  ),
  entrev AS (
    SELECT owner_id AS vid, count(*)::int AS n FROM public.leads
    WHERE interview_date >= _start AND interview_date <= _end GROUP BY owner_id
  ),
  matr AS (
    SELECT owner_id AS vid, count(*)::int AS n FROM public.leads
    WHERE status = 'matricula'
      AND enrollment_date IS NOT NULL
      AND enrollment_date >= _start
      AND enrollment_date <= _end
    GROUP BY owner_id
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
      'leads_novos_atribuidos', COALESCE(ln.n, 0),
      'leads_trabalhados', COALESCE(lt.n, 0),
      'ligacoes_feitas', COALESCE(a.ligacoes_feitas, 0),
      'ligacoes_atendidas', COALESCE(a.ligacoes_atendidas, 0),
      'interessados_gerados', COALESCE(i.n, 0),
      'entrevistas_marcadas', COALESCE(e.n, 0),
      'matriculas', COALESCE(m.n, 0),
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
  LEFT JOIN matr m ON m.vid = s.id
  LEFT JOIN ck c ON c.vid = s.id
  LEFT JOIN ck_today ct ON ct.vid = s.id;

  RETURN COALESCE(result, '[]'::jsonb);
END
$function$;

REVOKE EXECUTE ON FUNCTION public.productivity_summary(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.productivity_summary(date, date, uuid) TO authenticated;

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_matricula_requires_enrollment_date;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_matricula_requires_enrollment_date
  CHECK (status <> 'matricula' OR enrollment_date IS NOT NULL) NOT VALID;