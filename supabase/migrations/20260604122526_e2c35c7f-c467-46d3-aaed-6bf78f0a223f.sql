
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'franqueado', 'vendedor');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles select all auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles update self" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles insert self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "admins see all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Lead status enum
CREATE TYPE public.lead_status AS ENUM ('interessado','entrevista_marcada','entrevista_realizada','matricula','perdido');
CREATE TYPE public.lost_reason AS ENUM ('sem_resposta','sem_interesse','sem_dinheiro','achou_caro','sem_tempo','vai_deixar_depois','nao_compareceu','sem_perfil','fechou_concorrente','nao_chamar','outro');
CREATE TYPE public.lost_type AS ENUM ('definitivo','com_resgate');

-- Leads
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  linkedin_url TEXT,
  observation TEXT,
  status public.lead_status NOT NULL DEFAULT 'interessado',
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interview_date DATE,
  interview_time TIME,
  interview_notes TEXT,
  lost_reason public.lost_reason,
  lost_type public.lost_type,
  rescue_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads select scope" ON public.leads FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franqueado') OR owner_id = auth.uid()
);
CREATE POLICY "leads insert own" ON public.leads FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "leads update scope" ON public.leads FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franqueado') OR owner_id = auth.uid()
);
CREATE POLICY "leads delete scope" ON public.leads FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR owner_id = auth.uid()
);

-- Tasks
CREATE TYPE public.task_type AS ENUM ('enviar_mensagem','fazer_ligacao','confirmar_entrevista','reagendar_entrevista','followup_pos','cobrar_decisao','encerramento','resgate','outro');
CREATE TYPE public.task_status AS ENUM ('pendente','concluida','remarcada','cancelada');

CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.task_type NOT NULL DEFAULT 'enviar_mensagem',
  due_date DATE NOT NULL,
  due_time TIME,
  observation TEXT,
  status public.task_status NOT NULL DEFAULT 'pendente',
  is_rescue BOOLEAN NOT NULL DEFAULT false,
  rescue_reason public.lost_reason,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks select scope" ON public.tasks FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franqueado') OR owner_id = auth.uid()
);
CREATE POLICY "tasks insert own" ON public.tasks FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "tasks update scope" ON public.tasks FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franqueado') OR owner_id = auth.uid()
);
CREATE POLICY "tasks delete scope" ON public.tasks FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR owner_id = auth.uid()
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_leads_upd BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tasks_upd BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile + default role (vendedor) on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'vendedor');
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE INDEX idx_leads_owner ON public.leads(owner_id);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_tasks_lead ON public.tasks(lead_id);
CREATE INDEX idx_tasks_owner_due ON public.tasks(owner_id, due_date);
