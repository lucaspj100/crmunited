import { supabase } from "@/integrations/supabase/client";

export type DialerSession = {
  user_id: string;
  current_contact_id: string | null;
  updated_at: string;
};

/** Lê a sessão sincronizada do vendedor (contato atual compartilhado entre dispositivos). */
export async function fetchDialerSession(userId: string): Promise<DialerSession | null> {
  const { data, error } = await supabase
    .from("prospect_dialer_sessions")
    .select("user_id, current_contact_id, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return (data as DialerSession | null) ?? null;
}

/** Grava o contato atual da sessão (last write wins). Nunca lança — retorna true quando o banco aceitou. */
export async function saveDialerSession(userId: string, contactId: string | null): Promise<boolean> {
  const { error } = await supabase
    .from("prospect_dialer_sessions")
    .upsert(
      { user_id: userId, current_contact_id: contactId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) {
    console.warn("[dialer-session] falha ao sincronizar contato atual:", error.message);
    return false;
  }
  return true;
}
