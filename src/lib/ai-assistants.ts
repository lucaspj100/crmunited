export type AssistantKind = "prospeccao" | "entrevista" | "negociacao";

export const ASSISTANTS: { kind: AssistantKind; label: string; short: string; description: string }[] = [
  {
    kind: "prospeccao",
    label: "Assistente de Prospecção",
    short: "Prospecção",
    description: "Conduz o lead do WhatsApp até o agendamento da entrevista no Zoom.",
  },
  {
    kind: "entrevista",
    label: "Copiloto de Entrevista",
    short: "Entrevista",
    description: "Prepara, acompanha e analisa a entrevista: perfil, SPIN, transcrição, feedback e treino.",
  },
  {
    kind: "negociacao",
    label: "Assistente de Negociação",
    short: "Negociação",
    description: "Depois da entrevista: objeção real, margem, concessões e caminho até a matrícula.",
  },
];

export const MODES: Record<AssistantKind, string[]> = {
  prospeccao: ["Criar mensagem", "Me orientar", "Analisar minha resposta", "Criar follow-up", "Preparar agendamento"],
  entrevista: [
    "Preparar entrevista",
    "Criar perguntas SPIN",
    "Analisar perfil do lead",
    "Analisar transcrição",
    "Analisar relato da entrevista",
    "Criar follow-up pós-call",
    "Avaliar desempenho",
    "Criar exercício de treinamento",
  ],
  negociacao: [
    "Analisar objeção",
    "Criar mensagem",
    "Criar follow-up",
    "Pedir decisão",
    "Ajustar condição",
    "Usar autorização especial",
    "Solicitar autorização ao gerente",
    "Analisar minha condução",
    "Encerrar com educação",
  ],
};

export const TONES = [
  "Natural",
  "Curta e direta",
  "Mais persuasiva",
  "Mais empática",
  "Menos formal",
  "Sem pressionar",
  "Fazer pergunta antes",
  "Criar urgência com cuidado",
  "Pedir decisão",
  "Trabalhar valor",
  "Não oferecer desconto",
] as const;

export const REFINEMENTS = [
  { key: "curta", label: "Deixar mais curta" },
  { key: "natural", label: "Deixar mais natural" },
  { key: "persuasiva", label: "Deixar mais persuasiva" },
  { key: "empatica", label: "Deixar mais empática" },
  { key: "pergunta", label: "Fazer uma pergunta antes" },
] as const;

export type AttachmentPayload = {
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
};

export type AssistantAnswer = {
  leitura: {
    estagio: string;
    descoberto: string;
    necessidade: string;
    objecao: string;
    falta_descobrir: string;
    proximo_passo: string;
  };
  estrategia: string;
  mensagem: string;
  alerta: string;
  regras_utilizadas: string[];
  base_consultada: string[];
};

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
export const DOC_TYPES = ["application/pdf", "text/plain"];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_DOC_BYTES = 15 * 1024 * 1024;

export function validateFile(file: File): string | null {
  const isImage = IMAGE_TYPES.includes(file.type);
  const isDoc = DOC_TYPES.includes(file.type) || /\.txt$/i.test(file.name);
  if (!isImage && !isDoc) return "Formato não aceito. Envie PNG, JPG, WEBP, PDF ou TXT.";
  if (isImage && file.size > MAX_IMAGE_BYTES) return "Imagem maior que 10 MB.";
  if (!isImage && file.size > MAX_DOC_BYTES) return "Arquivo maior que 15 MB.";
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Reduz imagens grandes mantendo a legibilidade do print. */
export async function fileToDataUrl(file: File): Promise<string> {
  const isImage = IMAGE_TYPES.includes(file.type);
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
  if (!isImage || file.size < 1.5 * 1024 * 1024) return raw;

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("img"));
      el.src = raw;
    });
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return raw;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return raw;
  }
}

export const brl = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
