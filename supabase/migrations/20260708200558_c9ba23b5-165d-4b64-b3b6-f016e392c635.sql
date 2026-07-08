
CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  body text NOT NULL,
  category text NOT NULL DEFAULT 'primeira_abordagem' CHECK (category IN ('primeira_abordagem','followup','confirmacao')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos autenticados leem modelos"
  ON public.whatsapp_templates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin/franqueado gerenciam modelos"
  ON public.whatsapp_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'franqueado'::app_role));

CREATE TRIGGER whatsapp_templates_set_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.whatsapp_templates (name, body, category) VALUES
('Abordagem 1 - Padrão',
'Olá, {{primeiro_nome}}! Tudo bem?

Sou o {{vendedor}}, da United Idiomas. 🇺🇸🚀

Estou entrando em contato por conta de um Incentivo Cultural voltado para colaboradores da {{empresa}}.

A United trabalha com inglês executivo para adultos, com horários flexíveis, aulas focadas em conversação e preparação para certificações internacionais, como o TOEFL.

Hoje existe interesse em aprender ou aprimorar o inglês?',
'primeira_abordagem'),

('Abordagem 2 - Direto ao ponto',
'Oi, {{primeiro_nome}}, tudo bem?

Aqui é o {{vendedor}}, da United Idiomas.

Estamos com um Incentivo Cultural aberto para profissionais da {{empresa}} e você entrou na nossa lista de contatos.

Nosso foco é inglês executivo para adultos: conversação, horários flexíveis e preparação para certificações como TOEFL.

Faz sentido a gente conversar rapidinho sobre isso?',
'primeira_abordagem'),

('Abordagem 3 - Curiosidade',
'Olá, {{primeiro_nome}}! Aqui é o {{vendedor}}, da United Idiomas.

Estou falando com colaboradores da {{empresa}} porque abrimos algumas vagas dentro de um Incentivo Cultural para inglês executivo.

Trabalhamos com aulas voltadas para conversação, agenda flexível e preparo para certificações internacionais (TOEFL e outras).

Posso te explicar em 2 minutos como funciona?',
'primeira_abordagem'),

('Abordagem 4 - Foco carreira',
'Oi, {{primeiro_nome}}! Tudo certo?

Sou o {{vendedor}}, da United Idiomas 🇺🇸.

Estou entrando em contato porque a United está com um Incentivo Cultural dedicado a colaboradores da {{empresa}}, com foco em inglês para carreira.

Aulas de conversação, horários flexíveis e preparação para o TOEFL.

Consegue me contar um pouquinho como está seu inglês hoje?',
'primeira_abordagem'),

('Abordagem 5 - Convite conversa',
'Olá, {{primeiro_nome}}! Prazer, aqui é o {{vendedor}}, da United Idiomas.

A gente está com um Incentivo Cultural voltado para profissionais da {{empresa}} para desenvolver o inglês executivo.

O nosso método é focado em conversação, com horários flexíveis para quem trabalha, e prepara também para certificações internacionais como o TOEFL.

Você teria uns minutinhos hoje para conversar sobre isso?',
'primeira_abordagem'),

('Abordagem 6 - Executivo',
'Oi, {{primeiro_nome}}! Boa tarde.

Aqui é o {{vendedor}}, da United Idiomas.

Estamos oferecendo um Incentivo Cultural para colaboradores da {{empresa}} desenvolverem o inglês executivo — conversação, horários flexíveis e preparação para TOEFL.

Faz sentido para o seu momento profissional? Posso te explicar as condições rapidinho.',
'primeira_abordagem'),

('Abordagem 7 - Amigável',
'Olá, {{primeiro_nome}}! Como vai?

Sou o {{vendedor}}, da United Idiomas 🇺🇸🚀.

Estou entrando em contato porque temos um Incentivo Cultural aberto especialmente para pessoas da {{empresa}} que queiram evoluir no inglês.

Trabalhamos com inglês executivo, focado em conversação, e preparamos para certificações internacionais como o TOEFL.

Você tem interesse em melhorar seu inglês agora?',
'primeira_abordagem'),

('Abordagem 8 - Objetiva',
'Oi, {{primeiro_nome}}! Tudo bem?

Meu nome é {{vendedor}} e trabalho na United Idiomas.

A gente está com um Incentivo Cultural para colaboradores da {{empresa}}: inglês executivo, conversação, horários flexíveis e preparação para TOEFL.

Posso te passar as informações principais por aqui mesmo?',
'primeira_abordagem');
