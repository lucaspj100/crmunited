CREATE INDEX IF NOT EXISTS prospect_attempts_vendedor_created_idx ON public.prospect_attempts (vendedor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks (status);

CREATE OR REPLACE FUNCTION public.dialer_history_summary(_vendedor_id uuid)
RETURNS TABLE(prospect_contact_id uuid, whatsapp_attempts integer, calls integer, last_call_at timestamptz, results text[], answered boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT a.prospect_contact_id,
    count(*) FILTER (WHERE a.tipo_acao = 'whatsapp')::int,
    count(*) FILTER (WHERE a.tipo_acao = 'ligacao')::int,
    max(a.created_at) FILTER (WHERE a.tipo_acao = 'ligacao'),
    coalesce(array_agg(DISTINCT a.resultado) FILTER (WHERE a.tipo_acao = 'ligacao' AND a.resultado IS NOT NULL), '{}'),
    coalesce(bool_or(a.atendida = true OR a.resultado = 'Atendeu') FILTER (WHERE a.tipo_acao = 'ligacao'), false)
  FROM public.prospect_attempts a
  WHERE a.vendedor_id = _vendedor_id AND a.prospect_contact_id IS NOT NULL
  GROUP BY a.prospect_contact_id
$$;
GRANT EXECUTE ON FUNCTION public.dialer_history_summary(uuid) TO authenticated;