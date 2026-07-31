-- ============ ENUMS ============
CREATE TYPE public.ai_assistant_kind AS ENUM ('prospeccao','entrevista','negociacao');

CREATE TYPE public.ai_knowledge_kind AS ENUM (
  'conhecimento','curso','valores','limites','materiais','inicio',
  'estrategia','frase_aprovada','frase_proibida','spin','criterio','comportamento'
);

-- ============ 1. ai_knowledge_items ============
CREATE TABLE public.ai_knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.ai_knowledge_kind NOT NULL DEFAULT 'conhecimento',
  title text NOT NULL,
  category text NOT NULL DEFAULT 'geral',
  description text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  structured jsonb NOT NULL DEFAULT '{}'::jsonb,
  assistants public.ai_assistant_kind[] NOT NULL DEFAULT ARRAY['prospeccao','entrevista','negociacao']::public.ai_assistant_kind[],
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  valid_from date NOT NULL DEFAULT current_date,
  valid_until date,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_knowledge_items_active_idx ON public.ai_knowledge_items (is_active, kind, priority);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_knowledge_items TO authenticated;
GRANT ALL ON public.ai_knowledge_items TO service_role;
ALTER TABLE public.ai_knowledge_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_knowledge_read" ON public.ai_knowledge_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_knowledge_admin_write" ON public.ai_knowledge_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER ai_knowledge_items_updated_at BEFORE UPDATE ON public.ai_knowledge_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 2. ai_campaigns ============
CREATE TABLE public.ai_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  reference_month text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  approved_message text NOT NULL DEFAULT '',
  conditions text NOT NULL DEFAULT '',
  starts_on date,
  ends_on date,
  allowed_urgency text NOT NULL DEFAULT '',
  allowed_phrases text NOT NULL DEFAULT '',
  forbidden_phrases text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_campaigns TO authenticated;
GRANT ALL ON public.ai_campaigns TO service_role;
ALTER TABLE public.ai_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_campaigns_read" ON public.ai_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_campaigns_admin_write" ON public.ai_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER ai_campaigns_updated_at BEFORE UPDATE ON public.ai_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 3. ai_objections ============
CREATE TABLE public.ai_objections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objection text NOT NULL,
  category text NOT NULL DEFAULT 'geral',
  possible_causes text NOT NULL DEFAULT '',
  diagnostic_questions text NOT NULL DEFAULT '',
  mistakes_to_avoid text NOT NULL DEFAULT '',
  recommended_approach text NOT NULL DEFAULT '',
  when_to_work_value text NOT NULL DEFAULT '',
  possible_condition text NOT NULL DEFAULT '',
  when_to_ask_decision text NOT NULL DEFAULT '',
  when_to_followup text NOT NULL DEFAULT '',
  when_to_close text NOT NULL DEFAULT '',
  assistants public.ai_assistant_kind[] NOT NULL DEFAULT ARRAY['prospeccao','entrevista','negociacao']::public.ai_assistant_kind[],
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_objections TO authenticated;
GRANT ALL ON public.ai_objections TO service_role;
ALTER TABLE public.ai_objections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_objections_read" ON public.ai_objections FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_objections_admin_write" ON public.ai_objections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER ai_objections_updated_at BEFORE UPDATE ON public.ai_objections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 4. ai_examples ============
CREATE TABLE public.ai_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_approved boolean NOT NULL DEFAULT true,
  assistant public.ai_assistant_kind NOT NULL DEFAULT 'prospeccao',
  category text NOT NULL DEFAULT 'geral',
  context text NOT NULL DEFAULT '',
  lead_message text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT '',
  objective text NOT NULL DEFAULT '',
  strategy text NOT NULL DEFAULT '',
  response text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  commercial_risk text NOT NULL DEFAULT '',
  recommended_fix text NOT NULL DEFAULT '',
  related_rule text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_examples TO authenticated;
GRANT ALL ON public.ai_examples TO service_role;
ALTER TABLE public.ai_examples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_examples_read" ON public.ai_examples FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_examples_admin_write" ON public.ai_examples FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER ai_examples_updated_at BEFORE UPDATE ON public.ai_examples
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 5. ai_assistant_configs ============
CREATE TABLE public.ai_assistant_configs (
  assistant public.ai_assistant_kind PRIMARY KEY,
  extra_instructions text NOT NULL DEFAULT '',
  enabled_modes text[] NOT NULL DEFAULT '{}',
  model text NOT NULL DEFAULT 'openai/gpt-5.5',
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_assistant_configs TO authenticated;
GRANT ALL ON public.ai_assistant_configs TO service_role;
ALTER TABLE public.ai_assistant_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_configs_read" ON public.ai_assistant_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_configs_admin_write" ON public.ai_assistant_configs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER ai_configs_updated_at BEFORE UPDATE ON public.ai_assistant_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 6. ai_knowledge_versions ============
CREATE TABLE public.ai_knowledge_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table text NOT NULL,
  target_id uuid,
  action text NOT NULL DEFAULT 'update',
  previous_data jsonb,
  new_data jsonb,
  reason text NOT NULL DEFAULT '',
  assistants public.ai_assistant_kind[] NOT NULL DEFAULT '{}',
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_knowledge_versions_target_idx ON public.ai_knowledge_versions (target_table, target_id, changed_at DESC);
GRANT SELECT, INSERT ON public.ai_knowledge_versions TO authenticated;
GRANT ALL ON public.ai_knowledge_versions TO service_role;
ALTER TABLE public.ai_knowledge_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_versions_admin_read" ON public.ai_knowledge_versions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "ai_versions_admin_insert" ON public.ai_knowledge_versions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) AND changed_by = auth.uid());

-- ============ 7. ai_interactions ============
CREATE TABLE public.ai_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  assistant public.ai_assistant_kind NOT NULL,
  mode text NOT NULL DEFAULT '',
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  instruction text NOT NULL DEFAULT '',
  input_text text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  tones text[] NOT NULL DEFAULT '{}',
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  copied_message text,
  sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  knowledge_version text NOT NULL DEFAULT '',
  feedback text,
  feedback_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_interactions_user_idx ON public.ai_interactions (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_interactions TO authenticated;
GRANT ALL ON public.ai_interactions TO service_role;
ALTER TABLE public.ai_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_interactions_own_all" ON public.ai_interactions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "ai_interactions_staff_read" ON public.ai_interactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'franqueado'::public.app_role));
CREATE TRIGGER ai_interactions_updated_at BEFORE UPDATE ON public.ai_interactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 8. ai_negotiation_contexts ============
CREATE TABLE public.ai_negotiation_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  presented jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_condition jsonb NOT NULL DEFAULT '{}'::jsonb,
  already_reduced text NOT NULL DEFAULT '',
  not_changed_yet text NOT NULL DEFAULT '',
  narrative text NOT NULL DEFAULT '',
  authorization_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_negotiation_contexts TO authenticated;
GRANT ALL ON public.ai_negotiation_contexts TO service_role;
ALTER TABLE public.ai_negotiation_contexts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_negotiation_owner_all" ON public.ai_negotiation_contexts FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'franqueado'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.owner_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'franqueado'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.owner_id = auth.uid())
  );
CREATE TRIGGER ai_negotiation_updated_at BEFORE UPDATE ON public.ai_negotiation_contexts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SEEDS ============
INSERT INTO public.ai_assistant_configs (assistant, enabled_modes) VALUES
 ('prospeccao', ARRAY['Criar mensagem','Me orientar','Analisar minha resposta','Criar follow-up','Preparar agendamento']),
 ('entrevista', ARRAY['Preparar entrevista','Criar perguntas SPIN','Analisar perfil do lead','Analisar transcrição','Analisar relato da entrevista','Criar follow-up pós-call','Avaliar desempenho','Criar exercício de treinamento']),
 ('negociacao', ARRAY['Analisar objeção','Criar mensagem','Criar follow-up','Pedir decisão','Ajustar condição','Usar autorização especial','Solicitar autorização ao gerente','Analisar minha condução','Encerrar com educação']);

INSERT INTO public.ai_knowledge_items (kind, title, category, description, content, priority) VALUES
('curso','Informações oficiais do curso','curso','Características oficiais do curso executivo de inglês.',
'Curso executivo de inglês para adultos.
- Curso completo em 18 meses
- Carga horária ilimitada
- 100% online e ao vivo
- Aulas individualizadas ou em turmas reduzidas
- Horários flexíveis e programáveis
- Reforço gratuito
- Reposição gratuita
- Ênfase em conversação
- Foco no mercado de trabalho
- Certificação ao final
- Preparação para certificações internacionais, como TOEFL
- Entrevista realizada por videochamada no Zoom
Nunca prometer algo que não esteja cadastrado nesta base.',10),

('valores','Tabela comercial atual','valores','Valores oficiais por faixa de bolsa.',
'ALUNO REGULAR (sem participação no processo de entrevista ou condição especial)
- Matrícula: R$ 754
- Mensalidade: R$ 754
- Material didático: 12x de R$ 300

BOLSA A
- Matrícula: R$ 550 (crédito em até 3x ou Pix)
- Mensalidade: R$ 298 no boleto
- Material físico com digital incluso: 12x de R$ 177
- Somente material digital: 12x de R$ 119

BOLSA B
- Matrícula: R$ 468
- Mensalidade: R$ 328
- Material físico com digital incluso: 12x de R$ 177
- Somente material digital: 12x de R$ 119

BOLSA C
- Matrícula: R$ 389
- Mensalidade: R$ 348
- Material físico com digital incluso: 12x de R$ 177
- Somente material digital: 12x de R$ 119',20),

('limites','Limites de autonomia do consultor','limites','Piso de negociação sem autorização da liderança.',
'Sem autorização do gerente, o consultor pode chegar no máximo até:
- Matrícula: R$ 299
- Mensalidade: R$ 198
- Material físico com digital incluso: 12x de R$ 139
- Somente material digital: 12x de R$ 119

Abaixo desses valores é necessária autorização da liderança.
Esses são limites de negociação, e não preços iniciais.
Nunca recomendar que o vendedor comece pela menor condição.',25),

('materiais','Regras dos materiais','materiais','Modalidades de material e efeito no cartão.',
'O aluno escolhe somente uma modalidade:
1. Material físico com acesso digital incluso
2. Somente material digital

Nunca somar os dois valores. Nunca dizer que o aluno precisa comprar físico e digital separadamente.
Os materiais são pagos no crédito, podem ser parcelados em até 12x e comprometem o limite total do cartão (não apenas o valor da parcela mensal).

Se a objeção for limite do cartão:
- verificar se o aluno precisa do material físico
- considerar o digital
- não reduzir automaticamente
- pedir autorização se for necessário ficar abaixo do limite permitido',30),

('inicio','Matrícula, início e primeira mensalidade','inicio','Regras de início do curso e vencimentos.',
'A United não trabalha com turma fixa para início. O aluno escolhe início imediato ou qualquer mês futuro permitido pelo processo da escola.
Para garantir a condição comercial, o aluno precisa efetuar a matrícula. Matrícula e início são etapas diferentes.
O material pode ser comprado no momento da matrícula ou mais próximo do início.
A primeira mensalidade vence sempre um mês depois do início efetivo.
A intenção comercial é incentivar o início o quanto antes, mas sem pressão.

Nunca: inventar turma ou vaga, pressionar início imediato, dizer que o material é obrigatório na matrícula, dizer que a mensalidade começa antes das aulas, garantir condição sem matrícula ou criar urgência falsa.',35),

('estrategia','Estratégia de concessão','estrategia','Ordem obrigatória antes de reduzir qualquer valor.',
'1. Identificar a objeção real.
2. Confirmar se o problema está na matrícula, mensalidade, material, limite do cartão, momento de início ou percepção de valor.
3. Trabalhar valor antes de preço.
4. Alterar somente o componente necessário.
5. Fazer uma concessão por vez.
6. Pedir uma contrapartida ou decisão.
7. Não reduzir tudo ao mesmo tempo.
8. Não sugerir valor abaixo da autonomia sem autorização.
9. Não repetir condição já recusada sem mudar a estratégia.
10. Não transformar os valores em um cardápio.

Se o histórico estiver incompleto, perguntar ao vendedor: qual foi a primeira condição, qual é a condição atual, o que já foi reduzido e qual foi a resposta do lead.',40),

('estrategia','Fluxo comercial da prospecção','estrategia','Referência para levar o lead até o agendamento no Zoom.',
'1. Apresentação
2. Confirmação de interesse
3. Objetivo profissional ou pessoal
4. Apresentação resumida do curso
5. Histórico com inglês
6. Principal impeditivo
7. Confirmação de intenção real
8. Explicação e valorização da entrevista
9. Agendamento
10. Confirmação do agendamento
11. Reforço de presença

O fluxo não é questionário obrigatório: usar somente as etapas necessárias.
Objetivo do assistente de prospecção é o agendamento da entrevista, não a matrícula pelo WhatsApp.
Se o lead pedir preço no início: "Os valores vão depender do que você está buscando. Seu interesse no inglês é mais voltado para a questão profissional ou pessoal?"
Em caso de muita insistência em preço, usar a ancoragem do aluno regular e explicar que participantes do processo costumam receber condições diferenciadas após análise na entrevista, sem garantir aprovação ou valor exato.
Nunca usar follow-up genérico como "viu minha mensagem?": retomar o ponto mais relevante dito pelo lead.',45),

('spin','Metodologia SPIN','spin','Uso natural do SPIN na entrevista.',
'SITUAÇÃO: entender o contexto atual sem perguntas desnecessárias.
PROBLEMA: descobrir dificuldades reais relacionadas ao inglês.
IMPLICAÇÃO: aprofundar o impacto do problema (perda de oportunidades, dependência de terceiros, insegurança em reuniões, dificuldade de crescimento, menor exposição profissional, dificuldade com clientes internacionais, perda de promoções, adiamento de projetos, dificuldade em viagens, limitação acadêmica).
NECESSIDADE DE SOLUÇÃO: ajudar o lead a visualizar o que mudaria ao resolver o problema.

Evitar transformar a entrevista em interrogatório. Fazer perguntas conectadas ao que o lead acabou de dizer.',50),

('criterio','Critérios de avaliação da entrevista','criterio','O que avaliar em transcrição e relato.',
'Avaliar: rapport, abertura, perguntas de situação, problema, implicação e necessidade de solução, profundidade do diagnóstico, escuta ativa, excesso de fala do vendedor, interrupções, perguntas repetidas, conexão entre dor e solução, apresentação do curso, apresentação de valor, objeções, fechamento, próximo passo e controle da call.
Mostrar o que foi bem, o que pode melhorar, perguntas que poderiam ter sido feitas, momentos perdidos, melhor condução depois, follow-up recomendado, exercício prático de treino e habilidade prioritária.
Não dar apenas uma nota: ensinar como melhorar.',55),

('estrategia','Regras de decisão','estrategia','Como identificar o decisor.',
'Mensagem aprovada: "Perfeito. E caso faça sentido para você, essa decisão depende só de você ou você precisa da opinião ou ajuda de alguém?"
Identificar: se existe outro decisor, responsável financeiro, se a pessoa está apenas adiando, se falta segurança, informação ou condição.
Não tratar "preciso falar com alguém" automaticamente como desculpa.',60),

('comportamento','Padrão de linguagem','comportamento','Tom de voz obrigatório.',
'Direto, natural, profissional sem ser formal demais, português brasileiro, linguagem de WhatsApp, mensagens curtas, uma pergunta principal por vez.
Sem parecer robótico, sem textos longos, sem exagero de emojis, sem listas dentro da mensagem ao lead (salvo quando necessário), sem pressão excessiva, sem manipulação e sem falsa urgência.
Antes de responder: identificar o estágio, analisar tudo que já foi respondido, não repetir perguntas, não pular etapas sem necessidade, não seguir o fluxo como questionário rígido e continuar do ponto em que a conversa parou.',65),

('frase_proibida','O que a IA nunca pode afirmar','proibicoes','Lista de proibições absolutas.',
'Nunca: inventar preços, descontos, vagas ou horários; dizer que é a última vaga ou última oportunidade sem regra real; garantir bolsa ou aprovação; prometer valor exato sem análise; prometer certificação fora do processo; inventar prazo ou campanha; criar urgência falsa; inventar disponibilidade; fazer afirmação jurídica ou contratual não cadastrada; expor dados de outro lead; oferecer valor abaixo da autonomia sem autorização; dizer que material físico e digital são cobrados separadamente; dizer que o material compromete apenas a parcela mensal; dizer que o aluno precisa começar imediatamente; dizer que a primeira mensalidade vence antes do início; dizer que o material precisa ser comprado junto com a matrícula.',5);

INSERT INTO public.ai_objections (objection, category) VALUES
('Está caro','preco'),
('Preciso pensar','decisao'),
('Preciso falar com outra pessoa','decisao'),
('Não tenho tempo','tempo'),
('Quero começar depois','inicio'),
('Não tenho limite no cartão','pagamento'),
('Quero pesquisar','decisao'),
('Já tentei outro curso','confianca'),
('Não confio no online','confianca'),
('Quero aula particular','produto'),
('Não quero contrato','produto'),
('Não quero pagar matrícula','preco'),
('Não quero comprar material','preco'),
('Não quero decidir hoje','decisao'),
('Estou sem dinheiro','preco'),
('Me chama outro dia','tempo'),
('Não tenho interesse','interesse'),
('Quero tudo pelo WhatsApp','processo');