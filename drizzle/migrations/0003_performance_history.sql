
UPDATE public.leads l SET interview_done_date = COALESCE(
  (SELECT (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date FROM public.lead_events e
    WHERE e.lead_id = l.id AND e.event_type = 'interview_done' ORDER BY e.created_at DESC LIMIT 1),
  make_date(2026, extract(month from l.interview_done_date)::int, extract(day from l.interview_done_date)::int))
WHERE l.interview_done_date < '2026-01-01';

CREATE OR REPLACE FUNCTION public.performance_daily(_start date, _end date)
RETURNS TABLE(user_id uuid, day date, ligacoes int, atendidas int, interessados int,
  marcadas int, realizadas int, matriculas int, linkedin int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH sellers AS (
    SELECT p.id FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'vendedor'
  ),
  ev AS (
    SELECT a.vendedor_id AS uid, (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d,
      1 AS lig,
      CASE WHEN COALESCE(a.atendida, a.resultado IN ('Atendeu','Interessado','Pediu WhatsApp','Ligar depois','Sem interesse')) THEN 1 ELSE 0 END AS ate,
      0 AS inte, 0 AS mar, 0 AS rea, 0 AS mat, 0 AS li
    FROM public.prospect_attempts a WHERE a.tipo_acao = 'ligacao'
      AND a.created_at >= _start::timestamp AT TIME ZONE 'America/Sao_Paulo'
      AND a.created_at < (_end + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
    UNION ALL
    SELECT x.uid, x.d, 0,0,1,0,0,0,0 FROM (
      SELECT DISTINCT ON (e.lead_id) COALESCE(e.user_id, l.owner_id) AS uid,
        (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d
      FROM public.lead_events e JOIN public.leads l ON l.id = e.lead_id
      WHERE e.event_type = 'status_change' AND e.metadata->>'to' = 'interessado'
      ORDER BY e.lead_id, e.created_at) x
    UNION ALL
    SELECT x.uid, x.d, 0,0,0,1,0,0,0 FROM (
      SELECT DISTINCT ON (e.lead_id, (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date)
        COALESCE(e.user_id, l.owner_id) AS uid, (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d
      FROM public.lead_events e JOIN public.leads l ON l.id = e.lead_id
      WHERE e.event_type = 'interview_scheduled') x
    UNION ALL
    SELECT COALESCE((SELECT e.user_id FROM public.lead_events e WHERE e.lead_id = l.id AND e.event_type = 'interview_done'
        AND e.user_id IS NOT NULL ORDER BY e.created_at DESC LIMIT 1), l.owner_id),
      l.interview_done_date, 0,0,0,0,1,0,0
    FROM public.leads l WHERE l.interview_done_date IS NOT NULL
    UNION ALL
    SELECT COALESCE((SELECT e.user_id FROM public.lead_events e WHERE e.lead_id = l.id AND e.event_type = 'enrolled'
        AND e.user_id IS NOT NULL ORDER BY e.created_at DESC LIMIT 1), l.owner_id),
      l.enrollment_date, 0,0,0,0,0,1,0
    FROM public.leads l WHERE l.enrollment_date IS NOT NULL AND l.status = 'matricula'
    UNION ALL
    SELECT m.vendedor_id, (m.sent_at AT TIME ZONE 'America/Sao_Paulo')::date, 0,0,0,0,0,0,1
    FROM public.linkedin_message_events m
    WHERE m.sent_at >= _start::timestamp AT TIME ZONE 'America/Sao_Paulo'
      AND m.sent_at < (_end + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
  )
  SELECT ev.uid, ev.d, sum(lig)::int, sum(ate)::int, sum(inte)::int, sum(mar)::int, sum(rea)::int, sum(mat)::int, sum(li)::int
  FROM ev JOIN sellers s ON s.id = ev.uid
  WHERE ev.d BETWEEN _start AND _end
  GROUP BY ev.uid, ev.d;
$$;
REVOKE ALL ON FUNCTION public.performance_daily(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.performance_daily(date, date) TO authenticated;

CREATE TABLE public.seller_monthly_performance (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year int NOT NULL, month int NOT NULL,
  ligacoes int NOT NULL DEFAULT 0, atendidas int NOT NULL DEFAULT 0, interessados int NOT NULL DEFAULT 0,
  marcadas int NOT NULL DEFAULT 0, realizadas int NOT NULL DEFAULT 0, matriculas int NOT NULL DEFAULT 0,
  linkedin int NOT NULL DEFAULT 0,
  best_day_matriculas int NOT NULL DEFAULT 0, best_week_matriculas int NOT NULL DEFAULT 0,
  best_day_realizadas int NOT NULL DEFAULT 0,
  closed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, year, month)
);
GRANT SELECT ON public.seller_monthly_performance TO authenticated;
GRANT ALL ON public.seller_monthly_performance TO service_role;
ALTER TABLE public.seller_monthly_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monthly perf read" ON public.seller_monthly_performance FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.close_performance_month(_year int, _month int)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s date := make_date(_year, _month, 1);
  e date := (make_date(_year, _month, 1) + interval '1 month - 1 day')::date; n int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'franqueado')) THEN
    RAISE EXCEPTION 'Sem permissão'; END IF;
  WITH d AS (SELECT * FROM public.performance_daily(s, e)),
  w AS (SELECT d.user_id, date_trunc('week', d.day + 1) AS wk, sum(d.matriculas) m FROM d GROUP BY 1,2)
  INSERT INTO public.seller_monthly_performance (user_id, year, month, ligacoes, atendidas, interessados, marcadas, realizadas, matriculas, linkedin, best_day_matriculas, best_week_matriculas, best_day_realizadas, closed_at)
  SELECT d.user_id, _year, _month, sum(d.ligacoes), sum(d.atendidas), sum(d.interessados), sum(d.marcadas), sum(d.realizadas), sum(d.matriculas), sum(d.linkedin),
    max(d.matriculas), COALESCE((SELECT max(w.m) FROM w WHERE w.user_id = d.user_id), 0), max(d.realizadas), now()
  FROM d GROUP BY d.user_id
  ON CONFLICT (user_id, year, month) DO UPDATE SET ligacoes=EXCLUDED.ligacoes, atendidas=EXCLUDED.atendidas,
    interessados=EXCLUDED.interessados, marcadas=EXCLUDED.marcadas, realizadas=EXCLUDED.realizadas,
    matriculas=EXCLUDED.matriculas, linkedin=EXCLUDED.linkedin, best_day_matriculas=EXCLUDED.best_day_matriculas,
    best_week_matriculas=EXCLUDED.best_week_matriculas, best_day_realizadas=EXCLUDED.best_day_realizadas, closed_at=now();
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.close_performance_month(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_performance_month(int, int) TO authenticated;

SELECT public.close_performance_month(2026, 6);
SELECT public.close_performance_month(2026, 7);
SELECT public.close_performance_month(2026, 8);

CREATE OR REPLACE FUNCTION public.admin_set_avatar(_user_id uuid, _avatar_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'franqueado')) THEN
    RAISE EXCEPTION 'Sem permissão'; END IF;
  UPDATE public.profiles SET avatar_url = _avatar_url WHERE id = _user_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_avatar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_avatar(uuid, text) TO authenticated;
