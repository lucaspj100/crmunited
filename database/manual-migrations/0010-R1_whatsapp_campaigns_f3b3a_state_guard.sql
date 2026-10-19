-- F3-B.3a (R1): guarda de estado dos contatos de campanha.
--
-- Problema (F3-B.2, R1.a/b/c): a policy FOR ALL de admin/franqueado e os
-- privilégios de tabela permitiam, por escrita direta (PostgREST/pg_graphql),
-- recolocar na fila um contato `sending` ou `sent`, criar contatos já em
-- `sending` e, por DELETE + reimportação, recriar como `pending` um telefone
-- já enviado. As invariantes da 0008 só valiam dentro das RPCs.
--
-- Mecanismo: trigger BEFORE (NÃO é SECURITY DEFINER) que lê `current_user`:
-- - Privilegiado = current_user é membro do DONO da tabela. É o caso das RPCs
--   SECURITY DEFINER (current_user = dono das funções), do trigger de
--   encerramento (DEFINER) e das ações de FK (o PostgreSQL as executa como
--   dono da tabela referenciadora). Validado em PG16 no ambiente isolado.
-- - Não privilegiado = todo o resto: anon, authenticated (PostgREST, pg_graphql)
--   e service_role. `session_user` NÃO serve para distinguir: via PostgREST é
--   sempre `authenticator`.
--
-- Regras:
--   Não privilegiado
--     INSERT  só `pending`, attempts = 0 e nenhuma coluna de posse/histórico
--             preenchida. Fail-closed para colunas novas: se o conjunto de
--             colunas da tabela mudar, o INSERT direto é recusado até a guarda
--             ser revisada (wcc_schema_guard, uma checagem por comando).
--     UPDATE  só em linha `pending` e só em name/phone/normalized_phone/company
--             (toda coluna nova fica protegida por padrão).
--     DELETE  só `pending` ou `cancelled`.
--     TRUNCATE recusado (e o privilégio é revogado abaixo).
--   Privilegiado (RPCs, triggers, FKs, manutenção como dono)
--     `sent`/`failed`/`cancelled` são imutáveis, salvo whatsapp_account_id -> NULL
--     (FK wcc_account_fk ON DELETE SET NULL ao excluir a conta).
--     Mudança de status só pelas transições usadas pelas RPCs da 0005/0006/0008.
--     Identidade (id, campaign_id, phone, normalized_phone) imutável fora de `pending`.
--     DELETE só `pending` ou `cancelled` (vale também para o CASCADE).
--   Campanhas: DELETE recusado se houver contato com histórico
--     (reserved/sending/sent/failed), para qualquer caller.
--
-- Não altera nenhuma função, policy ou dado existente. Respostas das RPCs inalteradas.
-- Reversão: 0010_rollback.sql.

CREATE OR REPLACE FUNCTION public.wa_campaign_contacts_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  _cadastro constant text[] := ARRAY['name', 'phone', 'normalized_phone', 'company'];
  _owner oid;
  _priv  boolean;
  _o jsonb;
  _n jsonb;
BEGIN
  SELECT c.relowner INTO _owner FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID;
  _priv := pg_catalog.pg_has_role(current_user, _owner, 'MEMBER');

  IF TG_OP = 'DELETE' THEN
    IF OLD.status NOT IN ('pending', 'cancelled') THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = format('wa_contact_guard: contato com status %s não pode ser excluído', OLD.status);
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF _priv THEN RETURN NEW; END IF;
    -- Comparação tipada (caminho do import). Colunas novas: ver wcc_schema_guard.
    IF NEW.status IS DISTINCT FROM 'pending'
       OR NEW.attempts IS DISTINCT FROM 0
       OR num_nonnulls(NEW.whatsapp_account_id, NEW.reservation_id, NEW.send_attempt_id,
                       NEW.reserved_at, NEW.sending_at, NEW.sent_at, NEW.failed_at,
                       NEW.sent_by_account_id, NEW.last_error, NEW.error) > 0 THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'wa_contact_guard: contato novo deve nascer pending, sem posse nem histórico';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NOT _priv THEN
    _n := to_jsonb(NEW);
    _o := to_jsonb(OLD);
    IF OLD.status <> 'pending'
       OR (_n - _cadastro - 'updated_at') IS DISTINCT FROM (_o - _cadastro - 'updated_at') THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'wa_contact_guard: alteração direta permitida só nos dados cadastrais de contato pending';
    END IF;
    RETURN NEW;
  END IF;

  -- Privilegiado. jsonb só no caminho raro (linha terminal); o caminho quente das RPCs usa comparação tipada.
  IF OLD.status IN ('sent', 'failed', 'cancelled') THEN
    _n := to_jsonb(NEW);
    _o := to_jsonb(OLD);
    IF (_n - 'whatsapp_account_id' - 'updated_at') = (_o - 'whatsapp_account_id' - 'updated_at')
       AND (NEW.whatsapp_account_id IS NULL
            OR NEW.whatsapp_account_id IS NOT DISTINCT FROM OLD.whatsapp_account_id) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = format('wa_contact_guard: contato %s é terminal e não pode ser alterado', OLD.status);
  END IF;

  IF OLD.status <> 'pending'
     AND (NEW.id, NEW.campaign_id, NEW.phone, NEW.normalized_phone)
         IS DISTINCT FROM (OLD.id, OLD.campaign_id, OLD.phone, OLD.normalized_phone) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'wa_contact_guard: identidade do contato só muda enquanto pending';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND (OLD.status, NEW.status) NOT IN (
       ('pending', 'reserved'),   -- reserve
       ('reserved', 'pending'),   -- expiração / release
       ('reserved', 'sending'),   -- claim
       ('sending', 'reserved'),   -- unclaim
       ('sending', 'sent'),       -- mark_sent
       ('sending', 'failed'),     -- mark_failed
       ('pending', 'cancelled'),  -- encerramento
       ('reserved', 'cancelled')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = format('wa_contact_guard: transição %s -> %s não permitida', OLD.status, NEW.status);
  END IF;

  RETURN NEW;
END $$;

-- Fail-closed para colunas novas no INSERT direto: uma vez por comando (não por linha),
-- recusa o INSERT não privilegiado se o conjunto de colunas da tabela mudou desde a 0010.
-- No UPDATE direto e nas linhas terminais, colunas novas já ficam protegidas pela comparação jsonb.
CREATE OR REPLACE FUNCTION public.wa_campaign_contacts_schema_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  _expected constant text[] := ARRAY[
    'attempts', 'campaign_id', 'company', 'created_at', 'error', 'failed_at', 'id', 'last_error',
    'name', 'normalized_phone', 'phone', 'reservation_id', 'reserved_at', 'send_attempt_id',
    'sending_at', 'sent_at', 'sent_by_account_id', 'status', 'updated_at', 'whatsapp_account_id'];
  _actual text[];
BEGIN
  IF pg_catalog.pg_has_role(current_user,
       (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID), 'MEMBER') THEN
    RETURN NULL;
  END IF;
  SELECT array_agg(a.attname::text ORDER BY a.attname::text COLLATE "C") INTO _actual
    FROM pg_catalog.pg_attribute a WHERE a.attrelid = TG_RELID AND a.attnum > 0 AND NOT a.attisdropped;
  IF _actual IS DISTINCT FROM (SELECT array_agg(x ORDER BY x COLLATE "C") FROM unnest(_expected) x) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'wa_contact_guard: colunas de whatsapp_campaign_contacts mudaram; atualize a guarda antes de liberar INSERT direto';
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.wa_campaign_contacts_truncate_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT pg_catalog.pg_has_role(current_user,
       (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID), 'MEMBER') THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = format('wa_contact_guard: TRUNCATE de %s não permitido', TG_TABLE_NAME);
  END IF;
  RETURN NULL;
END $$;

-- SECURITY DEFINER: a checagem precisa enxergar todos os contatos, independente do RLS do caller.
CREATE OR REPLACE FUNCTION public.wa_campaigns_delete_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.whatsapp_campaign_contacts
              WHERE campaign_id = OLD.id AND status NOT IN ('pending', 'cancelled')) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'wa_contact_guard: campanha com histórico de envio não pode ser excluída';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS wcc_state_guard ON public.whatsapp_campaign_contacts;
CREATE TRIGGER wcc_state_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.whatsapp_campaign_contacts
  FOR EACH ROW EXECUTE FUNCTION public.wa_campaign_contacts_guard();

DROP TRIGGER IF EXISTS wcc_schema_guard ON public.whatsapp_campaign_contacts;
CREATE TRIGGER wcc_schema_guard
  BEFORE INSERT ON public.whatsapp_campaign_contacts
  FOR EACH STATEMENT EXECUTE FUNCTION public.wa_campaign_contacts_schema_guard();

DROP TRIGGER IF EXISTS wcc_truncate_guard ON public.whatsapp_campaign_contacts;
CREATE TRIGGER wcc_truncate_guard
  BEFORE TRUNCATE ON public.whatsapp_campaign_contacts
  FOR EACH STATEMENT EXECUTE FUNCTION public.wa_campaign_contacts_truncate_guard();

DROP TRIGGER IF EXISTS wc_truncate_guard ON public.whatsapp_campaigns;
CREATE TRIGGER wc_truncate_guard
  BEFORE TRUNCATE ON public.whatsapp_campaigns
  FOR EACH STATEMENT EXECUTE FUNCTION public.wa_campaign_contacts_truncate_guard();

DROP TRIGGER IF EXISTS wc_delete_guard ON public.whatsapp_campaigns;
CREATE TRIGGER wc_delete_guard
  BEFORE DELETE ON public.whatsapp_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.wa_campaigns_delete_guard();

-- TRUNCATE ignora triggers de linha e RLS; TRIGGER permitiria anexar triggers.
-- Ambos vinham dos privilégios padrão do schema public no Supabase.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.whatsapp_campaign_contacts FROM anon, authenticated, service_role;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.whatsapp_campaigns FROM anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.wa_campaign_contacts_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.wa_campaign_contacts_schema_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.wa_campaign_contacts_truncate_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.wa_campaigns_delete_guard() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.wa_campaign_contacts_guard() IS
  'F3-B.3a: guarda de estado. Escrita direta só cria/edita contatos pending; sent/failed/cancelled imutáveis; transições só as das RPCs.';
