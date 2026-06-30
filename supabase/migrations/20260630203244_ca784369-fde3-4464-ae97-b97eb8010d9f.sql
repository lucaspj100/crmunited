
-- 1) Tabela de checkouts diários
CREATE TABLE public.daily_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data date NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  ligacoes_feitas int NOT NULL DEFAULT 0,
  ligacoes_atendidas int NOT NULL DEFAULT 0,
  interessados_gerados int NOT NULL DEFAULT 0,
  entrevistas_marcadas int NOT NULL DEFAULT 0,
  matriculas int NOT NULL DEFAULT 0,
  leads_trabalhados int NOT NULL DEFAULT 0,
  leads_novos_atribuidos int NOT NULL DEFAULT 0,
  linkedin_msgs int NOT NULL DEFAULT 0,
  whatsapp_msgs int NOT NULL DEFAULT 0,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendedor_id, data)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_checkouts TO authenticated;
GRANT ALL ON public.daily_checkouts TO service_role;

ALTER TABLE public.daily_checkouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_checkouts_select_own_or_admin"
  ON public.daily_checkouts FOR SELECT TO authenticated
  USING (
    vendedor_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'franqueado'::app_role)
  );

CREATE POLICY "daily_checkouts_insert_own"
  ON public.daily_checkouts FOR INSERT TO authenticated
  WITH CHECK (vendedor_id = auth.uid());

CREATE POLICY "daily_checkouts_update_own"
  ON public.daily_checkouts FOR UPDATE TO authenticated
  USING (vendedor_id = auth.uid())
  WITH CHECK (vendedor_id = auth.uid());

CREATE POLICY "daily_checkouts_admin_all"
  ON public.daily_checkouts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'franqueado'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'franqueado'::app_role));

CREATE TRIGGER trg_daily_checkouts_updated_at
  BEFORE UPDATE ON public.daily_checkouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) RPC productivity_summary
CREATE OR REPLACE FUNCTION public.productivity_summary(
  _start date,
  _end date,
  _vendedor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
  caller uuid := auth.uid();
  result jsonb;
  start_ts timestamptz := (_start::timestamp)::timestamptz;
  end_ts timestamptz := ((_end + 1)::timestamp)::timestamptz;
  today_date date := current_date;
BEGIN
  is_admin := has_role(caller, 'admin'::app_role) OR has_role(caller, 'franqueado'::app_role);

  WITH sellers AS (
    SELECT p.id, p.full_name, p.email
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'vendedor'
    WHERE (is_admin OR p.id = caller)
      AND (_vendedor_id IS NULL OR p.id = _vendedor_id)
  ),
  leads_novos AS (
    SELECT owner_id AS vid, count(*)::int AS n
    FROM public.leads
    WHERE created_at >= start_ts AND created_at < end_ts
    GROUP BY owner_id
  ),
  leads_trab AS (
    SELECT owner_id AS vid, count(*)::int AS n
    FROM public.leads
    WHERE last_contact_at >= start_ts AND last_contact_at < end_ts
    GROUP BY owner_id
  ),
  att AS (
    SELECT vendedor_id AS vid,
      count(*) FILTER (WHERE tipo_acao = 'ligacao')::int AS ligacoes_feitas,
      count(*) FILTER (
        WHERE tipo_acao = 'ligacao'
          AND resultado IS NOT NULL
          AND resultado IN ('Atendeu','Interessado','Pediu WhatsApp','Ligar depois','Sem interesse')
      )::int AS ligacoes_atendidas
    FROM public.prospect_attempts
    WHERE created_at >= start_ts AND created_at < end_ts
    GROUP BY vendedor_id
  ),
  interessados AS (
    SELECT vendedor_responsavel_id AS vid, count(*)::int AS n
    FROM public.prospect_contacts
    WHERE status_prospeccao = 'Interessado'
      AND updated_at >= start_ts AND updated_at < end_ts
    GROUP BY vendedor_responsavel_id
  ),
  entrev AS (
    SELECT owner_id AS vid, count(*)::int AS n
    FROM public.leads
    WHERE interview_date >= _start AND interview_date <= _end
    GROUP BY owner_id
  ),
  matr AS (
    SELECT owner_id AS vid, count(*)::int AS n
    FROM public.leads
    WHERE status = 'matricula'
      AND updated_at >= start_ts AND updated_at < end_ts
    GROUP BY owner_id
  ),
  ck AS (
    SELECT vendedor_id AS vid,
      sum(whatsapp_msgs)::int AS whats,
      sum(linkedin_msgs)::int AS links
    FROM public.daily_checkouts
    WHERE data >= _start AND data <= _end
    GROUP BY vendedor_id
  ),
  ck_today AS (
    SELECT vendedor_id AS vid, submitted_at
    FROM public.daily_checkouts
    WHERE data = today_date
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'vendedor_id', s.id,
      'nome', COALESCE(s.full_name, s.email),
      'email', s.email,
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
    )
    ORDER BY COALESCE(s.full_name, s.email)
  )
  INTO result
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
$$;

REVOKE EXECUTE ON FUNCTION public.productivity_summary(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.productivity_summary(date, date, uuid) TO authenticated;
