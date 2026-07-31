# Central de Assistentes IA

## O que já existe e será reaproveitado

- Página `/scripts` com biblioteca de scripts (`sales_scripts`) + painel de IA (`AiAssistantPanel`).
- Geração de IA já segura: server function autenticada `generateAssistantReply` → gateway Lovable AI (chave só no servidor). Não há Edge Function de IA; nada de chave no frontend.
- Base de conhecimento inicial em `ai_assistant_settings` (instruções, curso, valores, objeções, proibições) — será mantida e migrada para a nova estrutura sem apagar nada.
- Permissões: `has_role(uid,'admin'|'franqueado'|'vendedor')`, leads com dono (`owner_id`) e RLS já vigente. Vendedor continua vendo apenas os próprios leads.
- `sales_scripts` permanece no banco (sai apenas da interface).

## Interface

- Menu: "Scripts" → "Assistentes IA" (rota `/scripts` mantida para não quebrar links; alias `/assistentes-ia`).
- Página com seletor de assistente: Prospecção, Entrevista, Negociação — cada um com seus modos, campos e alertas próprios.
- Entrada unificada: texto, Ctrl + V de print (prioritário), arrastar/soltar, clique, PNG/JPG/JPEG/WEBP/PDF/TXT, prévia com nome, tamanho, ampliar, remover, substituir, estados de erro/carregando. Compressão de imagens grandes no cliente.
- Campo "O que você precisa fazer agora?", chips de tom, Ctrl + Enter para gerar, Escape para fechar prévia.
- Resposta em blocos: Leitura da situação, Estratégia recomendada, Mensagem pronta (editável, copiar só a mensagem), Alerta comercial. Botões de refinamento (mais curta, mais natural, mais persuasiva, mais empática, perguntar antes, outra versão).
- Seleção de lead do CRM alimentando o contexto (respeitando RLS).
- Feedback do vendedor (funcionou / não funcionou / precisa melhorar + comentário) e histórico próprio.
- "Base consultada" (regras, tabela, campanha, versão) visível só para admin.

## Gestão da IA (somente admin)

Abas: conhecimento comercial, produtos/curso, valores e condições, limites de autonomia, materiais, formas de início, campanhas, estratégias, objeções, respostas aprovadas, respostas inadequadas, Laboratório da IA, histórico de alterações, configuração dos assistentes.

Tudo editável sem mexer em código, com título, categoria, assistentes afetados, status, prioridade, vigência, autor e data. Laboratório permite simular cenário e aprovar/corrigir/transformar em regra, com escopo explícito antes de salvar (nunca regra global automática).

## Tabelas novas (nenhuma tabela existente é apagada)

1. `ai_knowledge_items` — base editável: `kind` (conhecimento, curso, valor, limite, material, inicio, estrategia, objecao, frase_aprovada, frase_proibida, spin, criterio), título, categoria, conteúdo (texto + `jsonb` para estruturas como tabela de preços/limites), assistentes afetados (array), prioridade, vigência, ativo, autor/atualizador.
2. `ai_campaigns` — campanha do mês: nome, mês, motivo, mensagem aprovada, condições, início/fim reais, urgência permitida, frases permitidas/proibidas, ativo.
3. `ai_objections` — objeção, causas, perguntas de diagnóstico, erros a evitar, abordagem, quando trabalhar valor, condição possível, quando pedir decisão/follow-up/encerrar.
4. `ai_examples` — respostas aprovadas e inadequadas: contexto, mensagem do lead, estágio, objetivo, estratégia, resposta, motivo, risco, correção, assistente, categoria, tags, `is_approved`.
5. `ai_assistant_configs` — comportamento por assistente: system prompt adicional, modos habilitados, modelo, temperatura lógica, ativo.
6. `ai_knowledge_versions` — versionamento de tudo acima: tabela alvo, registro, versão anterior/nova (`jsonb`), motivo, autor, data, assistentes afetados; permite comparar e restaurar.
7. `ai_interactions` — histórico: usuário, assistente, lead, modo, entrada, metadados dos arquivos (sem conteúdo sensível), objetivo, resposta, mensagem copiada, versão da base, feedback e comentário.
8. `ai_negotiation_contexts` — condição apresentada, condição atual, o que já foi reduzido, contexto livre e autorização especial (autorizado por, item, condição, forma de pagamento, validade, observação), por lead.

Migração de dados: os valores da tabela comercial, materiais, limites de autonomia, regras de início e objeções descritos no pedido entram como `INSERT` iniciais em `ai_knowledge_items` / `ai_objections`, para o admin editar depois pela tela.

## Permissões e RLS

- Todas as tabelas: `GRANT` só para `authenticated` + `service_role`, RLS ativa.
- Base de conhecimento, campanhas, objeções, exemplos, configs, versões: leitura para `authenticated` (a IA precisa aplicar as regras), escrita **somente** `has_role(auth.uid(),'admin')`. Vendedor não edita nada.
- `ai_interactions` e `ai_negotiation_contexts`: vendedor lê/escreve apenas os próprios registros; admin/franqueado leem conforme padrão atual.
- Contexto de lead montado no servidor a partir do `owner_id` do lead e do usuário autenticado — impossível puxar lead de outro vendedor; nunca mistura dois leads na mesma chamada.
- Auditoria de toda alteração administrativa em `ai_knowledge_versions`.

## Backend / IA

- Mantém o padrão TanStack: server functions em `src/lib/ai-assistants.functions.ts` (+ helpers `.server.ts`), autenticadas por `requireSupabaseAuth`. Nenhuma Edge Function nova.
- O prompt é montado no servidor lendo as tabelas ativas e vigentes (regras, tabela comercial, limites, materiais, campanha ativa, objeções, exemplos aprovados/inadequados, config do assistente) + contexto do lead + entrada do vendedor. Resposta estruturada nos 4 blocos, com lista de regras consultadas para rastreabilidade.
- Guardrails no prompt: não inventar preço/vaga/horário/campanha, não somar material físico + digital, não descer abaixo da autonomia sem autorização, não prometer bolsa, matrícula ≠ início, primeira mensalidade um mês após o início.
- Validação de arquivos no frontend e no servidor (tipo, tamanho, imagens até 10 MB), sem persistir arquivos, sem log de conteúdo sensível, proteção contra chamadas duplicadas/uso excessivo.

## Etapas

1. Banco: 8 tabelas, GRANTs, RLS, seeds da tabela comercial e objeções.
2. Página remodelada: 3 assistentes, entrada com Ctrl + V/upload/prévia, resposta em blocos, refinamentos, atalhos, menu renomeado.
3. Seleção de lead, contexto compartilhado, campos estruturados de negociação e autorização especial, histórico e feedback.
4. Gestão da IA com as 14 abas, versionamento, restauração e rastreabilidade.
5. Laboratório da IA, correção por exemplo/regra com escopo.
6. Revisão de segurança/RLS, responsividade e testes de cenários reais.

## Riscos

- Escopo grande: entrego por etapas, com a página funcional já na etapa 2 sem perder o comportamento atual.
- `sales_scripts` e `ai_assistant_settings` continuam no banco; a remoção definitiva fica para uma decisão sua depois.
- Qualidade das respostas depende da base cadastrada; os seeds iniciais já vêm com sua tabela comercial atual.
