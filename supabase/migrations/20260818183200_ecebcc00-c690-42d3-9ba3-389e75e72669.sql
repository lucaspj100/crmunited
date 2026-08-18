ALTER TABLE public.prospect_attempts ADD COLUMN IF NOT EXISTS atendida boolean;

CREATE OR REPLACE FUNCTION public.prospect_dashboard(_team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  is_admin boolean;
BEGIN
  is_admin := has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'franqueado'::app_role);

  WITH team_members AS (
    SELECT id FROM public.profiles WHERE _team_id IS NULL OR team_id = _team_id
  ),
  base AS (
    SELECT * FROM public.prospect_contacts pc
    WHERE (is_admin OR pc.vendedor_responsavel_id = auth.uid())
      AND (_team_id IS NULL OR pc.vendedor_responsavel_id IN (SELECT id FROM team_members))
  ),
  att AS (
    SELECT a.*,
      COALESCE(a.atendida, a.resultado IN ('Interessado','Pediu WhatsApp','Sem interesse','Ligar depois')) AS atendida_eff
    FROM public.prospect_attempts a
    WHERE (is_admin OR a.vendedor_id = auth.uid()
       OR EXISTS (SELECT 1 FROM public.prospect_contacts c
                   WHERE c.id = a.prospect_contact_id AND c.vendedor_responsavel_id = auth.uid()))
      AND (_team_id IS NULL OR a.vendedor_id IN (SELECT id FROM team_members))
  ),
  totals AS (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE quantidade_tentativas > 0)::int AS trabalhados,
      count(*) FILTER (WHERE status_prospeccao = 'Interessado')::int AS interessados,
      count(*) FILTER (WHERE convertido_em_lead)::int AS convertidos,
      count(*) FILTER (WHERE telefone_invalido)::int AS invalidos,
      count(*) FILTER (WHERE nao_chamar)::int AS nao_chamar,
      count(*) FILTER (
        WHERE NOT convertido_em_lead AND NOT nao_chamar AND NOT telefone_invalido
          AND status_prospeccao NOT IN ('Sem interesse','Convertido em lead','Não chamar')
      )::int AS disponiveis
    FROM base
  ),
  att_totals AS (
    SELECT
      count(*) FILTER (WHERE tipo_acao = 'ligacao')::int AS ligacoes,
      count(*) FILTER (WHERE tipo_acao = 'ligacao' AND atendida_eff)::int AS atendidas,
      count(*) FILTER (WHERE tipo_acao = 'whatsapp')::int AS whats
    FROM att
  ),
  by_seller AS (
    SELECT
      b.vendedor_responsavel_id AS id,
      count(*)::int AS atribuidos,
      count(*) FILTER (WHERE b.quantidade_tentativas > 0)::int AS trabalhados,
      count(*) FILTER (WHERE b.status_prospeccao = 'Interessado')::int AS interessados,
      count(*) FILTER (WHERE b.convertido_em_lead)::int AS convertidos
    FROM base b
    WHERE b.vendedor_responsavel_id IS NOT NULL
    GROUP BY b.vendedor_responsavel_id
  ),
  by_seller_att AS (
    SELECT
      vendedor_id AS id,
      count(*) FILTER (WHERE tipo_acao = 'ligacao')::int AS ligacoes,
      count(*) FILTER (WHERE tipo_acao = 'ligacao' AND atendida_eff)::int AS atendidas,
      count(*) FILTER (WHERE tipo_acao = 'whatsapp')::int AS whats
    FROM att
    WHERE vendedor_id IS NOT NULL
    GROUP BY vendedor_id
  ),
  by_origem AS (
    SELECT
      COALESCE(origem, '—') AS k,
      count(*)::int AS total,
      sum(quantidade_tentativas)::int AS tent,
      count(*) FILTER (WHERE status_prospeccao = 'Interessado')::int AS interessados,
      count(*) FILTER (WHERE convertido_em_lead)::int AS convertidos
    FROM base
    GROUP BY COALESCE(origem, '—')
    ORDER BY total DESC
    LIMIT 30
  ),
  by_ddd AS (
    SELECT
      COALESCE(ddd, '—') AS k,
      count(*)::int AS total,
      sum(quantidade_tentativas)::int AS tent,
      count(*) FILTER (WHERE status_prospeccao = 'Interessado')::int AS interessados,
      count(*) FILTER (WHERE convertido_em_lead)::int AS convertidos
    FROM base
    GROUP BY COALESCE(ddd, '—')
    ORDER BY total DESC
    LIMIT 30
  )
  SELECT jsonb_build_object(
    'totals', (SELECT to_jsonb(totals.*) FROM totals),
    'attempts', (SELECT to_jsonb(att_totals.*) FROM att_totals),
    'by_seller', COALESCE((SELECT jsonb_agg(to_jsonb(s.*)) FROM by_seller s), '[]'::jsonb),
    'by_seller_att', COALESCE((SELECT jsonb_agg(to_jsonb(a.*)) FROM by_seller_att a), '[]'::jsonb),
    'by_origem', COALESCE((SELECT jsonb_agg(to_jsonb(o.*)) FROM by_origem o), '[]'::jsonb),
    'by_ddd', COALESCE((SELECT jsonb_agg(to_jsonb(d.*)) FROM by_ddd d), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END
$function$;

REVOKE ALL ON FUNCTION public.prospect_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prospect_dashboard(uuid) TO authenticated;