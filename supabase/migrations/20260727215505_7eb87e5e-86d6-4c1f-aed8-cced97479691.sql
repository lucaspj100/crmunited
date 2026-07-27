CREATE TABLE public.sales_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  category text NOT NULL CHECK (category IN ('whatsapp','linkedin','ligacao','entrevista')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_scripts TO authenticated;
GRANT ALL ON public.sales_scripts TO service_role;

ALTER TABLE public.sales_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_scripts_select_active" ON public.sales_scripts
  FOR SELECT TO authenticated
  USING (is_active OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'franqueado'::app_role));

CREATE POLICY "sales_scripts_insert_admin" ON public.sales_scripts
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'franqueado'::app_role));

CREATE POLICY "sales_scripts_update_admin" ON public.sales_scripts
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'franqueado'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'franqueado'::app_role));

CREATE POLICY "sales_scripts_delete_admin" ON public.sales_scripts
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'franqueado'::app_role));

CREATE TRIGGER sales_scripts_set_updated_at
  BEFORE UPDATE ON public.sales_scripts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_assistant_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  instructions text NOT NULL DEFAULT '',
  course_information text NOT NULL DEFAULT '',
  pricing_rules text NOT NULL DEFAULT '',
  objection_rules text NOT NULL DEFAULT '',
  prohibited_claims text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.ai_assistant_settings TO authenticated;
GRANT ALL ON public.ai_assistant_settings TO service_role;

ALTER TABLE public.ai_assistant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_settings_select" ON public.ai_assistant_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ai_settings_insert_admin" ON public.ai_assistant_settings
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'franqueado'::app_role));

CREATE POLICY "ai_settings_update_admin" ON public.ai_assistant_settings
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'franqueado'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'franqueado'::app_role));

CREATE TRIGGER ai_assistant_settings_set_updated_at
  BEFORE UPDATE ON public.ai_assistant_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.ai_assistant_settings (id, instructions, course_information, pricing_rules, objection_rules, prohibited_claims)
VALUES (
  true,
$i$Você é o assistente comercial da United Idiomas. Ajuda o vendedor a responder o lead pelo WhatsApp.
Estilo: direto, natural, profissional sem ser formal demais, mensagens curtas, linguagem de WhatsApp, uma pergunta por vez.
Antes de responder, identifique o estágio da conversa. Nunca repita perguntas já respondidas e não pule etapas sem necessidade.
Se a entrevista já estiver agendada, não ofereça novos horários — apenas confirme/reforce.
Priorize o agendamento quando houver interesse real. Se o lead disser que está sem tempo, use a flexibilidade de horários.
Se houver desinteresse claro, encerre com educação.

Fluxo padrão: 1) Apresentação 2) Confirmação de interesse 3) Objetivo profissional ou pessoal 4) Apresentação resumida do curso 5) Histórico com inglês 6) Motivo de ter parado 7) Confirmação de intenção real 8) Explicação da entrevista 9) Agendamento 10) Decisão e investimento 11) Confirmação.$i$,
$c$Curso executivo de inglês para adultos. Curso completo em 18 meses, carga horária ilimitada, 100% online e ao vivo, aulas individualizadas/turmas reduzidas, horários flexíveis e programáveis, reforço e reposição gratuitos, ênfase em conversação, foco no mercado de trabalho, certificação ao final e preparação para certificações internacionais como o TOEFL. Entrevista feita por videochamada no Zoom.$c$,
$p$Não informar preço no início da conversa: primeiro entender o objetivo do lead.
No meio/fim, explicar que a entrevista serve para entender a necessidade e apresentar as condições.
Se houver muita insistência, usar a ancoragem: aluno sem indicação/parceria/incentivo investe em média R$ 750 por mês; participantes do processo costumam ficar entre R$ 280 e R$ 350, dependendo do formato e da análise feita na entrevista.
Nunca garantir aprovação nem valor exato.$p$,
$o$VALORES NO INÍCIO: "Os valores vão depender do que você está buscando. Seu interesse no inglês é mais voltado para a questão profissional ou pessoal?"
SEM TEMPO: perguntar disponibilidade fora do horário comercial e oferecer extensão do plantão.
PASSAR TUDO PELO WHATSAPP: no início, seguir entendendo o interesse e explicar o curso por partes; na etapa de agendamento, explicar que a entrevista existe para entender o perfil e apresentar o processo com clareza.
SEM INTERESSE: encerrar educadamente, sem insistir.
ME CHAMA OUTRO DIA: perguntar dia e horário; se a data for muito distante, explicar que as oportunidades estão em finalização e oferecer horários ampliados, sem criar urgência falsa.
DECISÃO: "Perfeito. E caso faça sentido para você, essa decisão depende só de você ou você precisa da opinião ou ajuda de alguém?"$o$,
$x$Nunca inventar preços, descontos, vagas ou horários. Nunca dizer que é a última vaga, que a pessoa foi aprovada ou que o subsídio está garantido. Nunca prometer certificações fora do processo real. Nunca inventar disponibilidade do vendedor. Nunca fazer afirmações jurídicas ou contratuais. Nunca expor dados de outros leads nem usar informações de outra conversa.$x$
);

INSERT INTO public.sales_scripts (title, category, sort_order, content) VALUES
('Primeira mensagem — Incentivo Cultural','whatsapp',10,$s$Olá, #nome!

Espero que esteja bem!

Sou o #vendedor, da United Idiomas. 🇺🇸🚀

Estou entrando em contato através de um Incentivo Cultural para colaboradores da #empresa.

Oferecemos um curso executivo para adultos, com horários flexíveis e preparação para certificações internacionais, como o TOEFL.

Existe o interesse em aprender ou aprimorar o inglês?$s$),
('Objetivo profissional ou pessoal','whatsapp',20,$s$Os valores vão depender do que você está buscando.

Seu interesse no inglês é mais voltado para a questão profissional ou pessoal?$s$),
('Valores — resposta no meio da conversa','whatsapp',30,$s$É exatamente para isso que serve a entrevista.

Nela conseguimos entender melhor o que você busca, apresentar o formato mais adequado e explicar todas as condições com clareza.$s$),
('Valores — quando a pessoa insiste','whatsapp',40,$s$Para você ter uma referência, um aluno que entra sem indicação, parceria ou incentivo cultural investe em média R$ 750 por mês.

No seu caso, por estar participando desse processo, as mensalidades costumam ficar entre R$ 280 e R$ 350, dependendo do formato e da análise feita na entrevista.

É justamente nessa conversa que entendemos melhor a sua necessidade e mostramos como funcionaria no seu caso.$s$),
('Estou sem tempo','whatsapp',50,$s$Fora do horário comercial você consegue fazer a entrevista?

Como estamos na fase final das oportunidades, consigo estender meu plantão. Amanhã você teria algum horário disponível?$s$),
('Pode passar tudo pelo WhatsApp? — início','whatsapp',60,$s$Claro!

Por aqui vou entender melhor o seu interesse e te mostrar um pouco sobre o curso.

Para não te passar algo muito genérico, primeiro preciso entender o que você está buscando com o inglês.$s$),
('Pode passar tudo pelo WhatsApp? — antes do agendamento','whatsapp',70,$s$Claro, por aqui consigo adiantar bastante coisa.

Mas como se trata de um processo de ajuda de custo, fazemos a entrevista para entender melhor o seu perfil, explicar tudo com clareza e verificar se a oportunidade faz sentido para você.$s$),
('Sem interesse','whatsapp',80,$s$Sem problema, agradeço pelo retorno.

Caso isso mude futuramente, ficamos à disposição.$s$),
('Me chama outro dia','whatsapp',90,$s$Claro. Qual dia e horário fica melhor para eu te retornar?$s$),
('Retorno em uma data muito distante','whatsapp',100,$s$Entendi.

Como estamos finalizando as oportunidades, não consigo garantir que elas ainda estarão disponíveis até essa data.

Consigo ampliar meus horários e falar com você fora do horário comercial. Existe algum momento antes disso que fique viável?$s$),
('Decisão e investimento','whatsapp',110,$s$Perfeito. E caso faça sentido para você, essa decisão depende só de você ou você precisa da opinião ou ajuda de alguém?$s$),
('Apresentação resumida do curso','whatsapp',120,$s$Show! Logo abaixo alguns detalhes do curso:

📚 Curso completo em 18 meses
⌛ Carga horária ilimitada
💻 100% online e ao vivo
👨‍🏫 Aulas individualizadas
🕒 Horários flexíveis e programáveis
🔄 Reforço e reposição gratuitos
🎯 Foco no público adulto e no mercado de trabalho
🗣️ Método com ênfase em conversação
🎓 Certificação ao final do curso$s$),
('Histórico com inglês','whatsapp',130,$s$Você já fez algum curso de inglês antes?$s$),
('Motivo de ter parado','whatsapp',140,$s$E o que fez você parar ou não continuar?$s$),
('Intenção de retomar','whatsapp',150,$s$Entendi. E se você encontrar um curso que te atenda em horário, metodologia e valores, está decidido a retomar?$s$),
('Explicação da entrevista','whatsapp',160,$s$Legal!

Para as pessoas interessadas em participar do processo de ajuda de custo, disponibilizo uma entrevista por videochamada no Zoom.

Nessa conversa, explico o cronograma, metodologia, horários e condições, além de entender melhor sua motivação com o inglês.

Caso faça sentido para você, pode ter acesso a um subsídio de até 70% do curso.$s$),
('Confirmação da entrevista','whatsapp',170,$s$Perfeito, combinado então.

Sua entrevista está confirmada para #data, às #horario, pelo Zoom.

Próximo ao horário te envio o link.$s$),
('Primeiro contato pelo LinkedIn','linkedin',10,$s$Olá, #nome! Tudo bem?

Estou entrando em contato porque estamos falando com alguns profissionais da #empresa sobre uma oportunidade voltada ao desenvolvimento do inglês profissional.

Hoje o inglês tem impacto na sua carreira ou nos seus próximos objetivos?$s$),
('Abertura da entrevista','entrevista',10,$s$Olá, #nome. Tudo bem?

Antes de começarmos, quero entender um pouco melhor seu momento, seu objetivo com o inglês e o que você espera encontrar em um curso.

Depois disso, vou te explicar como funciona a United, nossa metodologia, horários e condições.$s$),
('01 — Abertura e apresentação','ligacao',10,$s$Olá, #nome, tudo bem?

Aqui é o #vendedor, da United Idiomas. Tudo certo aí?

Estou te ligando rapidinho por causa de um Incentivo Cultural liberado para colaboradores da #empresa. Você tem um minutinho?$s$),
('02 — Explicação do incentivo','ligacao',20,$s$É o seguinte: liberamos um Incentivo Cultural para colaboradores da #empresa, com uma ajuda de custo para o nosso curso executivo de inglês.

É um curso voltado para adultos, 100% online e ao vivo, com horários flexíveis e preparação para certificações internacionais, como o TOEFL.$s$),
('03 — Identificação do interesse','ligacao',30,$s$Me diz uma coisa: existe interesse da sua parte em aprender ou aprimorar o inglês?$s$),
('04 — Objetivo profissional ou pessoal','ligacao',40,$s$Legal! E o seu interesse no inglês é mais voltado para a questão profissional ou pessoal?$s$),
('05 — Área de atuação','ligacao',50,$s$Entendi. E hoje você atua em qual área na #empresa?$s$),
('06 — Histórico com inglês','ligacao',60,$s$E você já fez algum curso de inglês antes?

Se sim: por quanto tempo estudou e até que nível chegou?$s$),
('07 — Motivo de ainda não ter iniciado ou retomado','ligacao',70,$s$E o que fez você parar (ou ainda não começar) até hoje?$s$),
('08 — Confirmação da decisão de começar','ligacao',80,$s$Entendi. E se você encontrar um curso que te atenda em horário, metodologia e valores, está decidido a começar agora?$s$),
('09 — Apresentação do curso','ligacao',90,$s$Deixa eu te explicar rapidinho como funciona:

• Curso completo em 18 meses
• Carga horária ilimitada
• 100% online e ao vivo, com professor
• Turmas reduzidas e aulas individualizadas
• Método com ênfase em conversação
• Reforço e reposição gratuitos
• Foco no público adulto e no mercado de trabalho
• Certificação ao final e preparação para o TOEFL$s$),
('10 — Explicação dos horários','ligacao',100,$s$Os horários são flexíveis e programáveis: você monta a sua grade de acordo com a sua rotina, e pode ajustar quando precisar.

Como está a sua disponibilidade hoje? Manhã, tarde ou noite?$s$),
('11 — Explicação dos valores','ligacao',110,$s$Sobre valores: um aluno que entra sem indicação, parceria ou incentivo cultural investe em média R$ 750 por mês.

Para quem participa desse processo, as mensalidades costumam ficar entre R$ 280 e R$ 350, dependendo do formato e da análise feita na entrevista.

É justamente na entrevista que entendemos a sua necessidade e mostramos como ficaria no seu caso.$s$),
('12 — Convite para entrevista','ligacao',120,$s$Para as pessoas interessadas em participar do processo de ajuda de custo, eu faço uma entrevista por videochamada no Zoom.

Nela explico o cronograma, a metodologia, os horários e as condições, e entendo melhor a sua motivação com o inglês. Caso faça sentido, você pode ter acesso a um subsídio de até 70% do curso.

Podemos agendar essa conversa?$s$),
('13 — Agendamento','ligacao',130,$s$Tenho horários disponíveis nos próximos dias.

O que fica melhor para você: mais cedo ou no fim do dia?

Consigo também te atender fora do horário comercial, se ajudar.$s$),
('14 — Confirmação do WhatsApp','ligacao',140,$s$Esse número que estou falando com você é o seu WhatsApp?

Vou te enviar a confirmação e o link do Zoom por lá.$s$),
('15 — Nome completo e idade','ligacao',150,$s$Só para registrar aqui no seu cadastro: me confirma seu nome completo e sua idade, por favor?$s$),
('16 — Decisão e investimento','ligacao',160,$s$Perfeito. E caso faça sentido para você, essa decisão depende só de você ou você precisa da opinião ou ajuda de alguém?$s$),
('17 — Confirmação final','ligacao',170,$s$Combinado então, #nome.

Sua entrevista fica confirmada para #data, às #horario, pelo Zoom.

Vou te mandar a confirmação agora pelo WhatsApp e, próximo ao horário, envio o link. Qualquer imprevisto, é só me avisar por lá.$s$);