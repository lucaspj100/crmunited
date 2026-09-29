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
        WHERE tipo_acao = 'ligacao'
          AND COALESCE(atendida, resultado IN ('Atendeu','Interessado','Pediu WhatsApp','Ligar depois','Sem interesse'))
      )::int AS ligacoes_atendidas
    FROM public.prospect_attempts
    WHERE created_at >= start_ts AND created_at < end_ts GROUP BY vendedor_id
  ),
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
      AND status = 'matricula'
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
  li AS (
    SELECT vendedor_id AS vid, count(*)::int AS links
    FROM public.linkedin_message_events
    WHERE (sent_at AT TIME ZONE 'America/Sao_Paulo')::date >= _start
      AND (sent_at AT TIME ZONE 'America/Sao_Paulo')::date <= _end
    GROUP BY vendedor_id
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
      'linkedins_checkout', COALESCE(li.links, 0),
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
  LEFT JOIN li ON li.vid = s.id
  LEFT JOIN ck_today ct ON ct.vid = s.id;

  RETURN COALESCE(result, '[]'::jsonb);
END
$function$;

CREATE OR REPLACE FUNCTION public.hall_of_fame_active_days(_start date, _end date, _team_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(vendedor_id uuid, active_days integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH allowed AS (
    SELECT p.id FROM public.profiles p
    WHERE (_team_id IS NULL OR p.team_id = _team_id)
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'franqueado'::app_role)
        OR p.id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.manager_id = auth.uid() AND t.id = p.team_id)
        OR true
      )
  ),
  ev AS (
    SELECT a.vendedor_id AS vid, (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d
    FROM public.prospect_attempts a
    WHERE a.vendedor_id IS NOT NULL AND a.resultado IS NOT NULL
      AND (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN _start AND _end
    UNION
    SELECT l.owner_id, l.interview_date FROM public.leads l
    WHERE l.interview_date BETWEEN _start AND _end AND l.owner_id IS NOT NULL
    UNION
    SELECT l.owner_id, l.interview_done_date FROM public.leads l
    WHERE l.interview_done_date BETWEEN _start AND _end AND l.owner_id IS NOT NULL
    UNION
    SELECT l.owner_id, l.enrollment_date FROM public.leads l
    WHERE l.enrollment_date BETWEEN _start AND _end AND l.status = 'matricula' AND l.owner_id IS NOT NULL
  )
  SELECT ev.vid, count(DISTINCT ev.d)::int
  FROM ev
  JOIN allowed ON allowed.id = ev.vid
  WHERE auth.uid() IS NOT NULL
  GROUP BY ev.vid;
$function$;

CREATE OR REPLACE FUNCTION public.guard_career_fields()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.career_internal', true) = '1' THEN RETURN NEW; END IF;
  IF (NEW.career_role IS DISTINCT FROM OLD.career_role
      OR NEW.career_stars IS DISTINCT FROM OLD.career_stars
      OR NEW.career_quotas_adjust IS DISTINCT FROM OLD.career_quotas_adjust
      OR NEW.leader_id IS DISTINCT FROM OLD.leader_id)
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar cargo, estrelas, cotas ou líder direto';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.leads_enrollment_undo_sync()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  w date; pts int; new_stars int; old_stars int; synced date;
BEGIN
  IF NOT (OLD.status = 'matricula' AND NEW.status <> 'matricula') THEN RETURN NEW; END IF;

  UPDATE public.material_sales
     SET payment_status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
   WHERE lead_id = NEW.id AND payment_status NOT IN ('cancelled','refunded');

  IF OLD.enrollment_date IS NOT NULL AND OLD.owner_id IS NOT NULL THEN
    w := OLD.enrollment_date - EXTRACT(DOW FROM OLD.enrollment_date)::int;
    SELECT career_stars_synced_through INTO synced FROM public.profiles WHERE id = OLD.owner_id;
    SELECT stars_awarded INTO old_stars FROM public.career_week_results
     WHERE user_id = OLD.owner_id AND week_start = w;
    IF synced IS NOT NULL AND w + 6 <= synced AND old_stars IS NOT NULL THEN
      pts := public.career_points_between(OLD.owner_id, w, w + 6);
      new_stars := pts / 3;
      UPDATE public.career_week_results SET points = pts, stars_awarded = new_stars
       WHERE user_id = OLD.owner_id AND week_start = w;
      IF new_stars <> old_stars THEN
        PERFORM set_config('app.career_internal', '1', true);
        UPDATE public.profiles
           SET career_stars = GREATEST(0, career_stars + (new_stars - old_stars))
         WHERE id = OLD.owner_id;
        PERFORM set_config('app.career_internal', '', true);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS leads_enrollment_undo_sync_trg ON public.leads;
CREATE TRIGGER leads_enrollment_undo_sync_trg AFTER UPDATE OF status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_enrollment_undo_sync();

UPDATE public.material_sales m SET payment_status = 'cancelled', cancelled_at = now()
  FROM public.leads l
 WHERE l.id = m.lead_id AND l.status <> 'matricula' AND l.enrollment_date IS NOT NULL
   AND m.payment_status NOT IN ('cancelled','refunded');

DO $$
DECLARE r record; pts int; ns int;
BEGIN
  PERFORM set_config('app.career_internal', '1', true);
  FOR r IN SELECT w.* FROM public.career_week_results w
    WHERE EXISTS (SELECT 1 FROM public.leads l WHERE l.owner_id = w.user_id AND l.status <> 'matricula'
                  AND l.enrollment_date BETWEEN w.week_start AND w.week_end) LOOP
    pts := public.career_points_between(r.user_id, r.week_start, r.week_end);
    ns := pts / 3;
    UPDATE public.career_week_results SET points = pts, stars_awarded = ns WHERE user_id = r.user_id AND week_start = r.week_start;
    IF ns <> r.stars_awarded THEN
      UPDATE public.profiles SET career_stars = GREATEST(0, career_stars + (ns - r.stars_awarded)) WHERE id = r.user_id;
    END IF;
  END LOOP;
  PERFORM set_config('app.career_internal', '', true);
END $$;