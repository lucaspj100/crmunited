# Segunda rodada visual do ConsultantDashboard

## Objetivo
Transformar somente o painel do consultor em uma experiência de perfil competitivo profissional, adaptando a direção “Pro competitive profile” ao tema claro e à identidade azul da United.

## Alterações visuais
- Reorganizar o topo em proporção aproximada 42/58, com perfil primeiro e missão ao lado.
- Ampliar a foto, mostrar o nome completo, posicionar o cargo como informação secundária e destacar pontuação e ranking.
- Tornar o progresso existente mais legível, com valor, meta, percentual quando já disponível e barra mais espessa.
- Dar aparência de missão competitiva às quatro métricas existentes, usando apenas estados visuais derivados dos próprios valores, sem criar metas ou percentuais.
- Reforçar o horário da próxima entrevista e compactar as demais entrevistas.
- Unificar visualmente desempenho, alertas e funil com fundos suaves, bordas discretas e menor sensação de cartões soltos.
- Aplicar fundo geral cinza-azulado somente ao painel do consultor e microinterações leves com suporte a redução de movimento.
- Preservar a ordem solicitada no celular: perfil, missão, entrevista, desempenho e demais seções.

## Limites
- Alterar somente `src/components/dashboard/ConsultantDashboard.tsx`.
- Não modificar banco, consultas, cálculos, pontuação, carreira, metas, ranking, permissões ou painel administrativo/franqueado.
- Não inventar progresso geral diário quando não há meta confiável.

## Validação
- Conferir visualmente em desktop e celular, incluindo nome, foto, barras e ausência de rolagem lateral.
- Confirmar ausência de erros no navegador e no build automático.
