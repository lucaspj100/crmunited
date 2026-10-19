-- =====================================================================================
-- 0012_f4_0a_campaign_owner.sql  —  F4-0a: responsável por campanha (PROPOSTA — NÃO APLICADA)
--
-- Escopo (especificação F4-A seção 19.6):
--   * whatsapp_campaigns.owner_user_id (nulo = "sem responsável"; NÃO copiado de created_by).
--   * Auditoria somente de inclusão de toda mudança de responsável, por qualquer caminho.
--   * RPC de atribuição só para admin, com motivo, controle de concorrência e respeito a
--     reservas válidas e envios em andamento.
--   * Interruptor campaign_isolation (desligado) com auditoria. NADA o lê nesta fase.
--   * Guardas por trigger (critério de "privilegiado" da 0010) contra mudança direta.
--
-- NÃO altera: whatsapp_campaign_contacts (guarda de colunas da 0010), nenhuma RPC existente,
-- nenhuma migration anterior, nenhum papel, nenhum privilégio de objeto existente.
-- Comportamento de campanhas, reservas, envios e extensão R3: idêntico.
--
-- Número 0012 provisório (as proteções R4/R2 ainda podem ocupar numeração).
-- Rollback: rollback/ (4 camadas, cada uma atômica; nenhuma restaura privilégios).
--
-- ATOMICIDADE (revisão de 18/10/2026):
--   * Este arquivo abre e fecha a própria transação (BEGIN ... COMMIT). Qualquer erro aborta
--     tudo: no psql com ON_ERROR_STOP, sem ON_ERROR_STOP (o COMMIT vira ROLLBACK) e quando o
--     cliente envia o script inteiro numa única mensagem.
--   * Para o SQL Editor do Lovable, cujo comportamento transacional NÃO está documentado, use
--     0012_f4_0a_campaign_owner_bloco_unico.sql: o mesmo conteúdo dentro de um único DO, que é
--     uma instrução só e portanto atômica mesmo que o editor execute instrução por instrução.
--   * lock_timeout de 5 s: se uma reserva/claim estiver segurando whatsapp_campaigns, a
--     migration falha inteira em vez de ficar esperando (e bloqueando a extensão).
--   * Reaplicável: IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS, ON CONFLICT DO NOTHING.
--   * Antes e depois, rodar estado_f4_0a_READ_ONLY.sql: o resultado deve ser AUSENTE antes e
--     COMPLETA depois; qualquer outro valor indica estado parcial.
-- =====================================================================================

-- VARIANTE BLOCO ÚNICO — gerada por ferramentas/gerar_bloco_unico.py; NÃO editar à mão.
-- Fonte: 0012_f4_0a_campaign_owner.sql (SHA-256 addab4f40c63c2ac48b04204394c27f2b64110720bd67890c8c0849078e804e8).
-- Uma única instrução DO: tudo ou nada, independentemente de como o cliente separa instruções.
DO $f4_0a_mig$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('statement_timeout', '60s', true);


-- -------------------------------------------------------------------------------------
-- 1. Coluna de responsável
-- -------------------------------------------------------------------------------------
ALTER TABLE public.whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS owner_user_id uuid NULL
  REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS whatsapp_campaigns_owner_status_idx
  ON public.whatsapp_campaigns (owner_user_id, status);

COMMENT ON COLUMN public.whatsapp_campaigns.owner_user_id IS
  'F4-0a: vendedor/ADM responsável. NULL = sem responsável (legada, só ADM). Muda só pela RPC wa_campaign_assign_owner; toda mudança gera evento em whatsapp_campaign_owner_events.';

-- -------------------------------------------------------------------------------------
-- 2. Tabelas novas
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_owner_events (
  id             bigserial PRIMARY KEY,
  campaign_id    uuid NOT NULL,                -- sem FK: o evento sobrevive à campanha
  previous_owner uuid,
  new_owner      uuid,
  changed_by     uuid,                         -- auth.uid() quando houver
  source         text NOT NULL CHECK (source IN ('rpc_assign','rpc_clear','user_deleted','privileged_other')),
  reason         text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 500),
  changed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wcoe_campaign_idx ON public.whatsapp_campaign_owner_events (campaign_id, changed_at);

CREATE TABLE IF NOT EXISTS public.wa_feature_flags (
  key        text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{2,62}$'),
  enabled    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.wa_feature_flags (key, enabled) VALUES ('campaign_isolation', false)
  ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.wa_feature_flag_events (
  id         bigserial PRIMARY KEY,
  key        text NOT NULL,
  old_value  boolean,
  new_value  boolean NOT NULL,
  changed_by uuid,
  reason     text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 500),
  changed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.whatsapp_campaign_owner_events IS 'F4-0a: auditoria somente de inclusão das mudanças de responsável.';
COMMENT ON TABLE public.wa_feature_flags IS 'F4-0a: interruptores. campaign_isolation=false; nenhuma função o lê nesta fase.';
COMMENT ON TABLE public.wa_feature_flag_events IS 'F4-0a: auditoria somente de inclusão dos interruptores.';

-- @@PONTO_DE_FALHA_MEIO@@ (marcador usado só pelos testes de falha parcial)

-- -------------------------------------------------------------------------------------
-- 3. Guardas (NÃO são SECURITY DEFINER: dependem de current_user, como na 0010)
--    A verificação fica DENTRO de cada guarda (sem função auxiliar): chamar outra função
--    exigiria EXECUTE do papel que escreve; o disparo do trigger em si não exige.
--    Privilegiado = current_user membro do dono da tabela (RPCs DEFINER, triggers DEFINER,
--    ações de FK e manutenção pelo dono). Todo o resto (anon, authenticated, service_role,
--    sandbox_exec com BYPASSRLS) é não privilegiado.
-- -------------------------------------------------------------------------------------
-- whatsapp_campaigns: quem não é privilegiado não define nem altera owner_user_id.
CREATE OR REPLACE FUNCTION public.wa_campaigns_owner_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF pg_catalog.pg_has_role(current_user, (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID), 'MEMBER') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.owner_user_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'wa_owner_guard: responsável só pode ser definido pela RPC wa_campaign_assign_owner';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'wa_owner_guard: responsável só pode ser alterado pela RPC wa_campaign_assign_owner';
  END IF;
  RETURN NEW;
END $$;

-- Tabelas de auditoria: nunca UPDATE/DELETE (nem pelo dono via DML); INSERT só privilegiado.
CREATE OR REPLACE FUNCTION public.wa_f4_append_only_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF pg_catalog.pg_has_role(current_user, (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID), 'MEMBER') THEN RETURN NEW; END IF;
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = format('wa_f4_guard: escrita direta em %s não permitida', TG_TABLE_NAME);
  END IF;
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = format('wa_f4_guard: %s é somente de inclusão (%s recusado)', TG_TABLE_NAME, TG_OP);
END $$;

-- Interruptores: INSERT/UPDATE/DELETE/TRUNCATE só privilegiado (a RPC).
CREATE OR REPLACE FUNCTION public.wa_f4_privileged_only_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF pg_catalog.pg_has_role(current_user, (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID), 'MEMBER') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD WHEN TG_LEVEL = 'STATEMENT' THEN NULL ELSE NEW END;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = format('wa_f4_guard: %s em %s só pelas RPCs', TG_OP, TG_TABLE_NAME);
END $$;

-- TRUNCATE: recusado para quem não é privilegiado (TRUNCATE ignora triggers de linha e RLS).
CREATE OR REPLACE FUNCTION public.wa_f4_truncate_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF pg_catalog.pg_has_role(current_user, (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID), 'MEMBER') THEN RETURN NULL; END IF;
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = format('wa_f4_guard: TRUNCATE de %s não permitido', TG_TABLE_NAME);
END $$;

-- Auditoria de responsável: grava evento em TODA mudança, por qualquer caminho.
CREATE OR REPLACE FUNCTION public.wa_campaigns_owner_audit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  _src    text := nullif(current_setting('united.owner_change_source', true), '');
  _reason text := nullif(current_setting('united.owner_change_reason', true), '');
  _by     uuid := nullif(current_setting('united.owner_change_by', true), '')::uuid;
BEGIN
  IF _src IS NULL THEN
    IF TG_OP = 'UPDATE' AND NEW.owner_user_id IS NULL AND OLD.owner_user_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.owner_user_id) THEN
      _src := 'user_deleted'; _reason := coalesce(_reason, 'usuário responsável excluído (ON DELETE SET NULL)');
    ELSE
      _src := 'privileged_other'; _reason := coalesce(_reason, 'alteração privilegiada fora da RPC (manutenção)');
    END IF;
  END IF;
  INSERT INTO public.whatsapp_campaign_owner_events (campaign_id, previous_owner, new_owner, changed_by, source, reason)
  VALUES (NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.owner_user_id END, NEW.owner_user_id,
          coalesce(_by, auth.uid()), _src, _reason);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS wc_owner_guard ON public.whatsapp_campaigns;
CREATE TRIGGER wc_owner_guard
  BEFORE INSERT OR UPDATE ON public.whatsapp_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.wa_campaigns_owner_guard();

DROP TRIGGER IF EXISTS wc_owner_audit_upd ON public.whatsapp_campaigns;
CREATE TRIGGER wc_owner_audit_upd
  AFTER UPDATE OF owner_user_id ON public.whatsapp_campaigns
  FOR EACH ROW WHEN (OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id)
  EXECUTE FUNCTION public.wa_campaigns_owner_audit();

DROP TRIGGER IF EXISTS wc_owner_audit_ins ON public.whatsapp_campaigns;
CREATE TRIGGER wc_owner_audit_ins
  AFTER INSERT ON public.whatsapp_campaigns
  FOR EACH ROW WHEN (NEW.owner_user_id IS NOT NULL)
  EXECUTE FUNCTION public.wa_campaigns_owner_audit();

DROP TRIGGER IF EXISTS wcoe_append_only ON public.whatsapp_campaign_owner_events;
CREATE TRIGGER wcoe_append_only BEFORE INSERT OR UPDATE OR DELETE ON public.whatsapp_campaign_owner_events
  FOR EACH ROW EXECUTE FUNCTION public.wa_f4_append_only_guard();
DROP TRIGGER IF EXISTS wcoe_truncate ON public.whatsapp_campaign_owner_events;
CREATE TRIGGER wcoe_truncate BEFORE TRUNCATE ON public.whatsapp_campaign_owner_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.wa_f4_append_only_guard();

DROP TRIGGER IF EXISTS wffe_append_only ON public.wa_feature_flag_events;
CREATE TRIGGER wffe_append_only BEFORE INSERT OR UPDATE OR DELETE ON public.wa_feature_flag_events
  FOR EACH ROW EXECUTE FUNCTION public.wa_f4_append_only_guard();
DROP TRIGGER IF EXISTS wffe_truncate ON public.wa_feature_flag_events;
CREATE TRIGGER wffe_truncate BEFORE TRUNCATE ON public.wa_feature_flag_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.wa_f4_append_only_guard();

DROP TRIGGER IF EXISTS wff_privileged_only ON public.wa_feature_flags;
CREATE TRIGGER wff_privileged_only BEFORE INSERT OR UPDATE OR DELETE ON public.wa_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.wa_f4_privileged_only_guard();
DROP TRIGGER IF EXISTS wff_truncate ON public.wa_feature_flags;
CREATE TRIGGER wff_truncate BEFORE TRUNCATE ON public.wa_feature_flags
  FOR EACH STATEMENT EXECUTE FUNCTION public.wa_f4_truncate_guard();

-- -------------------------------------------------------------------------------------
-- 4. RPCs (SECURITY DEFINER; só admin; franqueado fica de fora até a decisão D10)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_campaign_assign_owner(
  _campaign_id uuid, _new_owner uuid, _expected_current_owner uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _uid uuid := auth.uid();
  _cur uuid;
  _found boolean;
  _expired integer;
  _event bigint;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF NOT public.has_role(_uid, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF _reason IS NULL OR char_length(btrim(_reason)) NOT BETWEEN 5 AND 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  -- FOR UPDATE: serializa com wa_campaign_reserve (FOR SHARE) e com outra atribuição.
  SELECT owner_user_id, true INTO _cur, _found
    FROM public.whatsapp_campaigns WHERE id = _campaign_id FOR UPDATE;
  IF _found IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found'); END IF;

  IF _cur IS DISTINCT FROM _expected_current_owner THEN
    RETURN jsonb_build_object('ok', false, 'error', 'owner_changed', 'currentOwner', _cur);
  END IF;

  IF _new_owner IS NOT DISTINCT FROM _cur THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'owner', _cur);
  END IF;

  IF EXISTS (SELECT 1 FROM public.whatsapp_campaign_contacts k
              WHERE k.campaign_id = _campaign_id
                AND (k.status = 'sending'
                     OR (k.status = 'reserved' AND k.reserved_at >= now() - interval '10 minutes'))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'in_flight');
  END IF;

  IF _new_owner IS NOT NULL AND NOT (
       EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _new_owner)
       AND (public.has_role(_new_owner, 'vendedor'::public.app_role) OR public.has_role(_new_owner, 'admin'::public.app_role))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_owner');
  END IF;

  SELECT count(*) INTO _expired FROM public.whatsapp_campaign_contacts k
   WHERE k.campaign_id = _campaign_id AND k.status = 'reserved' AND k.reserved_at < now() - interval '10 minutes';

  PERFORM set_config('united.owner_change_source', CASE WHEN _new_owner IS NULL THEN 'rpc_clear' ELSE 'rpc_assign' END, true);
  PERFORM set_config('united.owner_change_reason', btrim(_reason), true);
  PERFORM set_config('united.owner_change_by', _uid::text, true);

  UPDATE public.whatsapp_campaigns SET owner_user_id = _new_owner WHERE id = _campaign_id;

  PERFORM set_config('united.owner_change_source', '', true);
  PERFORM set_config('united.owner_change_reason', '', true);
  PERFORM set_config('united.owner_change_by', '', true);

  SELECT max(id) INTO _event FROM public.whatsapp_campaign_owner_events WHERE campaign_id = _campaign_id;
  RETURN jsonb_build_object('ok', true, 'already', false, 'owner', _new_owner,
                            'previousOwner', _cur, 'eventId', _event, 'expiredReservations', _expired);
END $$;

CREATE OR REPLACE FUNCTION public.wa_feature_flag_set(_key text, _enabled boolean, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _uid uuid := auth.uid();
  _cur boolean;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF NOT public.has_role(_uid, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF _enabled IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_value'); END IF;
  IF _reason IS NULL OR char_length(btrim(_reason)) NOT BETWEEN 5 AND 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  SELECT enabled INTO _cur FROM public.wa_feature_flags WHERE key = _key FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'flag_not_found'); END IF;
  IF _cur = _enabled THEN RETURN jsonb_build_object('ok', true, 'already', true, 'enabled', _cur); END IF;
  UPDATE public.wa_feature_flags SET enabled = _enabled, updated_at = now(), updated_by = _uid WHERE key = _key;
  INSERT INTO public.wa_feature_flag_events (key, old_value, new_value, changed_by, reason)
  VALUES (_key, _cur, _enabled, _uid, btrim(_reason));
  RETURN jsonb_build_object('ok', true, 'already', false, 'enabled', _enabled);
END $$;

-- -------------------------------------------------------------------------------------
-- 5. Privilégios e RLS (explícitos; não dependem dos privilégios padrão)
--    sandbox_exec: mantém SELECT/INSERT do privilégio padrão (D6, sem mudar o papel);
--    a guarda recusa o INSERT. Leitura de ids/motivos é limite conhecido (P8).
-- -------------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.whatsapp_campaign_owner_events, public.wa_feature_flags, public.wa_feature_flag_events
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.whatsapp_campaign_owner_events_id_seq, public.wa_feature_flag_events_id_seq
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.whatsapp_campaign_owner_events, public.wa_feature_flags, public.wa_feature_flag_events
  TO authenticated;

ALTER TABLE public.whatsapp_campaign_owner_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_feature_flag_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wcoe_select ON public.whatsapp_campaign_owner_events;
CREATE POLICY wcoe_select ON public.whatsapp_campaign_owner_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR EXISTS (SELECT 1 FROM public.whatsapp_campaigns c
                     WHERE c.id = whatsapp_campaign_owner_events.campaign_id AND c.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS wff_select ON public.wa_feature_flags;
CREATE POLICY wff_select ON public.wa_feature_flags FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS wffe_select ON public.wa_feature_flag_events;
CREATE POLICY wffe_select ON public.wa_feature_flag_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE ALL ON FUNCTION public.wa_campaign_assign_owner(uuid, uuid, uuid, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.wa_feature_flag_set(text, boolean, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wa_campaign_assign_owner(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_feature_flag_set(text, boolean, text) TO authenticated;

REVOKE ALL ON FUNCTION public.wa_campaigns_owner_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.wa_f4_append_only_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.wa_f4_privileged_only_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.wa_f4_truncate_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.wa_campaigns_owner_audit() FROM PUBLIC, anon, authenticated, service_role;

-- @@PONTO_DE_FALHA_FIM@@ (marcador usado só pelos testes de falha parcial)

END $f4_0a_mig$;
