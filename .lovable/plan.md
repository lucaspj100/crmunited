# Melhorar a aparência do Funil

## O que está estranho hoje
- As 6 etapas ficam em uma grade de 5 colunas, então "Perdido" cai sozinho numa segunda linha, embaixo.
- Cada coluna tem rolagem própria com altura fixa, e os cartões aparecem cortados no meio.
- Os cartões repetem muita informação do mesmo tamanho (selos, "criado/etapa", vendedor, aviso, botões), o que deixa tudo pesado.
- As colunas não têm cor própria. É difícil saber em que etapa se está só de bater o olho.

## Proposta

1. **Todas as etapas lado a lado, numa linha só**
   - As colunas têm largura fixa (cerca de 280px) e ficam em uma faixa que rola para os lados quando não cabem na tela.
   - Assim, Perdido nunca mais cai para a linha de baixo.
   - Cada coluna ocupa a altura da tela, e a página não fica com várias rolagens disputando espaço.

2. **Perdido mais estreito e recolhido**
   - Aparece como uma coluna estreita, com o total (4630) e um botão "Ver perdidos recentes" para abrir os cartões.
   - O link para a tela Perdidos continua lá.

3. **Cabeçalho com a cor da etapa**
   - Cada coluna ganha uma faixa fina colorida no topo, nas cores do sistema. Por exemplo: Novo neutro, Interessado azul, Entrevista marcada âmbar, Realizada roxo, Matrícula verde, Perdido cinza.
   - O cabeçalho fica fixo enquanto a coluna rola.

4. **Cartões mais limpos**
   - Na linha 1 ficam o nome e o ícone de temperatura. Na linha 2, a empresa e o vendedor, em texto menor.
   - Os selos (Processo bolsista, Discador, Alta prioridade) vão para uma única linha compacta.
   - A próxima atividade ou o aviso aparece como uma faixa pequena. O vermelho fica só para vencidas, e "Sem atividade" passa a ser discreto.
   - "Criado 7d · etapa 7d" vira uma linha só, em cinza.
   - Os botões de ação (mensagem, agendar, Mover) aparecem em uma barra menor no rodapé do cartão.
   - O fundo vermelho do cartão inteiro sai. A borda lateral colorida passa a indicar a urgência.

5. **Celular**
   - As colunas continuam rolando para os lados, com uma etapa por vez ocupando quase a tela inteira.

## O que não muda
- Filtros, triagem, arrastar e soltar, o botão "Mover", os detalhes do lead e todas as regras do Funil.
- Nenhum dado é alterado.

## Detalhes técnicos
- Só o arquivo da tela do Funil muda: a grade vira uma faixa com rolagem para os lados, as colunas ganham largura fixa e altura igual à da tela, e o cabeçalho fica fixo no topo.
- As cores de cada etapa viram cores do sistema, para funcionar também no modo escuro.
- Perdido recolhido: um controle de abrir e fechar dentro da própria coluna.
