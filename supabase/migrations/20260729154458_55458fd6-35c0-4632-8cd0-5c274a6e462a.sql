-- Frases institucionais
CREATE TABLE public.share_phrases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_phrases TO authenticated;
GRANT ALL ON public.share_phrases TO service_role;
ALTER TABLE public.share_phrases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "share_phrases_read" ON public.share_phrases FOR SELECT TO authenticated USING (true);
CREATE POLICY "share_phrases_admin_write" ON public.share_phrases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'franqueado'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'franqueado'));

INSERT INTO public.share_phrases (text, sort_order) VALUES
  ('Fanáticos por resultado. Obcecados por evolução.', 1),
  ('Onde performance vira legado.', 2),
  ('Entre metas, desafios e resultados, um nome chegou ao topo.', 3),
  ('Resultado não acontece por acaso.', 4),
  ('Consistência, atitude e performance.', 5),
  ('Quem entrega resultado merece reconhecimento.', 6);

-- Preferências de compartilhamento por usuário
CREATE TABLE public.share_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_title text NOT NULL DEFAULT 'sales_champion',
  preferred_template text NOT NULL DEFAULT 'royalty',
  preferred_format text NOT NULL DEFAULT 'story',
  preferred_phrase text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_preferences TO authenticated;
GRANT ALL ON public.share_preferences TO service_role;
ALTER TABLE public.share_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "share_prefs_own" ON public.share_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Registro analítico de compartilhamentos
CREATE TABLE public.achievement_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_user_id uuid,
  reference_month integer NOT NULL,
  reference_year integer NOT NULL,
  achievement text NOT NULL,
  position integer,
  format text NOT NULL,
  template text NOT NULL,
  action text NOT NULL,
  is_official boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.achievement_shares TO authenticated;
GRANT ALL ON public.achievement_shares TO service_role;
ALTER TABLE public.achievement_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shares_insert_own" ON public.achievement_shares FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "shares_select_own_or_admin" ON public.achievement_shares FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'franqueado'));

CREATE TRIGGER share_phrases_updated BEFORE UPDATE ON public.share_phrases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER share_prefs_updated BEFORE UPDATE ON public.share_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();