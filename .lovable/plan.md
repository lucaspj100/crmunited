# Dashboard de performance do consultor

## Objetivo
Transformar o dashboard inicial do vendedor em um painel de performance premium e competitivo, mantendo o dashboard operacional atual para admin e franqueado e sem alterar regras de negócio.

## Implementação

### 1. Separar experiências por perfil
- Manter a visão atual de equipe e operação para `admin` e `franqueado`, preservando todos os indicadores existentes.
- Criar uma composição individual para `vendedor`, na ordem: perfil, missão, próxima entrevista, desempenho, alertas e funil.
- Usar a role já carregada pelo contexto de autenticação; nenhuma nova permissão será criada.

### 2. Perfil e carreira no topo
- Consultar o perfil existente (`full_name`, `email`, `avatar_url`) e exibir foto ou iniciais.
- Reutilizar `useCareerOverview`, `CareerBadge`, cargos e regras de estrelas existentes.
- Exibir os pontos semanais vindos do Plano de Carreira e o progresso aplicável ao cargo, sem recalcular estrelas ou promoções.
- Derivar a posição no ranking diário usando a mesma produtividade e a mesma configuração de pontuação do Placar Diário; mostrar somente a posição do usuário.

### 3. Missão e desempenho
- Reutilizar `productivity_summary` filtrado pelo usuário para entrevistas marcadas, realizadas e matrículas de hoje.
- Reutilizar as tarefas já consultadas pelo dashboard para tarefas concluídas e pendências.
- Reutilizar a meta mensal de matrícula existente. Quando houver meta, mostrar progresso real; quando não houver, mostrar apenas resultados atuais sem inventar objetivo.

### 4. Entrevistas e operação
- Destacar a próxima entrevista ainda não realizada e manter as demais entrevistas do dia em formato compacto.
- Manter entrevistas concluídas identificadas visualmente.
- Compactar alertas e apresentar o funil atual como seção secundária, sem mudar cálculos.

### 5. Visual e responsividade
- Aplicar visual premium baseado nos tokens atuais: azul principal, destaques discretos, sombras suaves e microinterações leves.
- Usar grade ampla no desktop e empilhamento na ordem solicitada no mobile.
- Reutilizar os componentes existentes de card, progresso, badge, botão e ícones.

### 6. Foto de perfil
- Reutilizar a implementação atual de `Meu perfil`, que já aceita upload, gera fallback por iniciais e grava em `profiles.avatar_url`.
- Não criar bucket, coluna ou migration nesta etapa, pois a estrutura já existe e já é usada no Placar e Hall da Fama.

## Arquivos previstos
- `src/routes/_authenticated/dashboard.tsx`: separação por perfil, consultas reutilizadas e composição das duas visões.
- `src/components/dashboard/ConsultantDashboard.tsx`: novo painel individual e responsivo.
- Pequenos componentes auxiliares na mesma pasta, somente se ajudarem a manter o dashboard legível.

## Validação
- Conferir vendedor e admin/franqueado separadamente no navegador.
- Validar desktop e mobile, incluindo avatar ausente, carreira sem estrelas, ausência de meta e ausência de entrevistas.
- Executar testes relevantes e confirmar o build automático sem erros.

## Fora desta fase
- Novas metas diárias, novas fórmulas de ranking, animações grandes, alterações de carreira, mudanças de RLS e migrações de dados.
