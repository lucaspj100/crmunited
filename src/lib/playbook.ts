export type PlaybookAssistant = {
  id: string;
  title: string;
  description: string;
  category: string;
  cta: string;
  url: string;
  status: "active" | "soon";
  icon: "graduation-cap" | "message-circle";
  complement?: string;
};

/** Links externos dos GPTs. Para trocar, altere apenas a `url` aqui. */
export const PLAYBOOK_ASSISTANTS: PlaybookAssistant[] = [
  {
    id: "avaliador-calls",
    title: "Avaliador de Calls Fanáticos",
    description:
      "Envie a transcrição da sua call e receba uma avaliação completa baseada no Playbook Comercial: Rapport, D.I., Pré-Speech, Apresentação, Gatilho de Fechamento e Fechamento.",
    category: "Avaliação de call",
    cta: "Avaliar minha call",
    url: "https://chatgpt.com/g/g-6a7f6d3e662c8191a7d7753468eb8b58-avaliador-de-calls-fanaticos",
    status: "active",
    icon: "graduation-cap",
  },
  {
    id: "copiloto-whatsapp",
    title: "Copiloto WhatsApp Fanáticos",
    description:
      "Cole a conversa ou envie um print e receba a melhor resposta para avançar o lead no WhatsApp.",
    complement:
      "Ajuda com primeiro contato, qualificação, follow-up, objeções, agendamento, negociação, matrícula e resgate.",
    category: "WhatsApp Comercial",
    cta: "Criar resposta",
    url: "COLOCAR_LINK_DO_COPILOTO_WHATSAPP_AQUI",
    status: "active",
    icon: "message-circle",
  },
];

export type PlaybookBlock = {
  id: string;
  step: number;
  title: string;
  description: string;
  points?: string[];
  groups?: { label: string; text: string }[];
  highlights?: string[];
  flow?: string[];
};

export const PLAYBOOK_BLOCKS: PlaybookBlock[] = [
  {
    id: "rapport",
    step: 1,
    title: "Quebra-gelo — Rapport",
    description: "Crie conexão real com o lead antes de iniciar a condução comercial.",
    points: [
      "Utilizar contexto real do lead",
      "Empresa, profissão, cidade ou rotina",
      "Evitar rapport excessivamente longo",
      "Perguntar o que o lead entendeu sobre a oportunidade",
    ],
  },
  {
    id: "regra-do-jogo",
    step: 2,
    title: "Regra do Jogo — D.I.",
    description: "Estabeleça desde o início que haverá um posicionamento ao final.",
    points: [
      "D.I. significa Decisão Imediata",
      "Explicar o objetivo da conversa",
      "Fazendo sentido, avançamos para matrícula",
      "Não fazendo sentido, a oportunidade é repassada",
      "Receber concordância do candidato",
    ],
  },
  {
    id: "spin",
    step: 3,
    title: "Pré-Speech — SPIN",
    description: "Descubra por que essa pessoa precisa resolver o inglês.",
    groups: [
      { label: "Situação", text: "Contexto profissional, rotina, histórico e nível." },
      { label: "Problema", text: "Onde o inglês limita o candidato." },
      {
        label: "Implicação",
        text: "Impacto real do problema: oportunidades, dinheiro, carreira, frustração, adiamento.",
      },
      { label: "Necessidade", text: "Onde quer chegar e por que precisa resolver agora." },
      { label: "Critério de compra", text: "O que um curso precisa oferecer para fazer sentido." },
    ],
  },
  {
    id: "apresentacao",
    step: 4,
    title: "Apresentação",
    description: "Racionalize os impeditivos e apresente a United conectada ao Pré-Speech.",
    groups: [
      { label: "Interesse", text: "É o único fator que a escola não consegue resolver pelo aluno." },
      { label: "Tempo", text: "A rotina e horários fixos podem impedir o início." },
      { label: "Metodologia", text: "O método precisa gerar resultado dentro de um prazo que faça sentido." },
      { label: "Financeiro", text: "É um impeditivo legítimo e precisa caber no orçamento." },
    ],
    highlights: [
      "“Desses quatro fatores, qual hoje poderia impedir você de começar?”",
      "LEAD DISSE X → UNITED ENTREGA Y → CONSULTOR EXPLICA A CONEXÃO",
    ],
  },
  {
    id: "gatilho",
    step: 5,
    title: "Gatilho de Fechamento",
    description: "Valide o valor percebido antes de entrar definitivamente no financeiro.",
    points: [
      "Abrir para dúvidas",
      "Perguntar o que o candidato achou",
      "Perguntar do que mais gostou",
      "Fazer o candidato verbalizar por que a solução faz sentido",
      "Isolar a questão financeira",
    ],
    highlights: [
      "“Tirando a questão financeira, existe algum outro ponto que impediria você de começar?”",
    ],
  },
  {
    id: "fechamento",
    step: 6,
    title: "Fechamento",
    description: "Transforme valor percebido em decisão e decisão em matrícula.",
    points: [
      "Ancoragem",
      "Apresentação da condição",
      "Pedido de decisão",
      "Investigação de objeções",
      "Negociação",
      "Matrícula",
    ],
    highlights: ["Depois do SIM, pare de vender e comece a executar."],
    flow: ["SIM", "Cadastro", "Contrato", "Aceite", "Pagamento", "Próximos passos"],
  },
];
