// Calcula a "temperatura" do lead com base em sinais simples já presentes
// no banco — sem precisar de coluna nova.
// quente: entrevista hoje/amanhã, contato recente (<=2 dias), entrevista realizada, ou tarefa para hoje
// morno:  tem follow-up futuro, status "interessado", ou contato recente (<=7 dias)
// frio:   sem próxima ação, tarefa atrasada, muitos dias parado na etapa, ou sem resposta

export type Temperature = "quente" | "morno" | "frio";

export type TempInputs = {
  status: string;
  last_contact_at: string | null;
  interview_date?: string | null;
  updated_at?: string | null; // usada como proxy de "tempo na etapa"
  next?: { due_date: string; type?: string | null } | null;
};

const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / 86400000);

export function leadTemperature(input: TempInputs): Temperature {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const lastContactDays = input.last_contact_at ? daysBetween(now, new Date(input.last_contact_at)) : null;
  const stageDays = input.updated_at ? daysBetween(now, new Date(input.updated_at)) : null;

  // QUENTE
  if (input.interview_date && (input.interview_date === todayStr || input.interview_date === tomorrowStr)) return "quente";
  if (input.status === "entrevista_realizada") return "quente";
  if (input.next && input.next.due_date === todayStr) return "quente";
  if (lastContactDays !== null && lastContactDays <= 2) return "quente";

  // FRIO
  if (!input.next) return "frio";
  if (input.next.due_date < todayStr) return "frio";
  if (stageDays !== null && stageDays >= 14) return "frio";
  if (lastContactDays !== null && lastContactDays >= 14) return "frio";

  // MORNO (default)
  return "morno";
}

export const TEMPERATURE_META: Record<Temperature, { label: string; emoji: string; color: string; dot: string }> = {
  quente: { label: "Quente", emoji: "🔥", color: "bg-rose-500/10 text-rose-700 border-rose-500/30",   dot: "bg-rose-500" },
  morno:  { label: "Morno",  emoji: "🌤️", color: "bg-amber-500/10 text-amber-700 border-amber-500/30", dot: "bg-amber-500" },
  frio:   { label: "Frio",   emoji: "❄️", color: "bg-sky-500/10 text-sky-700 border-sky-500/30",       dot: "bg-sky-500" },
};

export function daysAgoLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "hoje";
  if (d === 1) return "ontem";
  return `${d}d`;
}
