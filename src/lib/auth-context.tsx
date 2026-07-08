import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "franqueado" | "vendedor";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  roles: Role[];
  loading: boolean;
  mustChangePassword: boolean;
  refreshMustChange: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null, session: null, roles: [], loading: true, mustChangePassword: false,
  refreshMustChange: async () => {}, signOut: async () => {},
});

async function logEvent(userId: string | null, event: string, extra: Record<string, unknown> = {}) {
  try {
    await supabase.from("access_logs").insert({
      user_id: userId,
      event_type: event,
      status: "success",
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 400) : null,
      ...extra,
    });
  } catch { /* best-effort */ }
}

async function bumpSignIn(userId: string) {
  try {
    const { data: cur } = await supabase.from("profiles").select("sign_in_count").eq("id", userId).maybeSingle();
    const next = (cur?.sign_in_count ?? 0) + 1;
    await supabase.from("profiles")
      .update({ last_sign_in_at: new Date().toISOString(), sign_in_count: next })
      .eq("id", userId);
  } catch { /* ignore */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChange] = useState(false);
  const lastLoggedUserRef = useRef<string | null>(null);

  const loadProfileData = async (userId: string) => {
    const [{ data: rolesData }, { data: prof }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("must_change_password").eq("id", userId).maybeSingle(),
    ]);
    setRoles(((rolesData ?? []) as { role: Role }[]).map((r) => r.role));
    setMustChange(!!prof?.must_change_password);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(async () => {
          await loadProfileData(s.user.id);
          if (event === "SIGNED_IN" && lastLoggedUserRef.current !== s.user.id) {
            lastLoggedUserRef.current = s.user.id;
            await logEvent(s.user.id, "login", { email: s.user.email });
            await bumpSignIn(s.user.id);
          }
        }, 0);
      } else {
        setRoles([]);
        setMustChange(false);
        lastLoggedUserRef.current = null;
      }
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        await loadProfileData(data.session.user.id);
        lastLoggedUserRef.current = data.session.user.id;
      }
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        roles,
        loading,
        mustChangePassword,
        refreshMustChange: async () => { if (session?.user) await loadProfileData(session.user.id); },
        signOut: async () => {
          if (session?.user) await logEvent(session.user.id, "logout", { email: session.user.email });
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

