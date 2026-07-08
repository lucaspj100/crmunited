import { createFileRoute, Outlet, useNavigate, useLocation, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useBrand } from "@/lib/brand";
import { LayoutDashboard, Users, Kanban, RotateCw, BarChart3, LogOut, Settings, Upload, TrendingDown, Sparkles, Trophy, Calendar, PhoneCall, Link2, ClipboardCheck, Activity, Tv, User as UserIcon, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ReturnNotificationWatcher } from "@/components/ReturnNotificationWatcher";
import { TaskNotificationWatcher } from "@/components/TaskNotificationWatcher";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedLayout,
});

const BASE_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/hoje", label: "Hoje", icon: Sparkles },
  { to: "/discador", label: "Discador", icon: PhoneCall },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/funil", label: "Funil", icon: Kanban },
  { to: "/agenda", label: "Agenda", icon: Calendar },
  { to: "/perdidos", label: "Perdidos", icon: TrendingDown },
  { to: "/resgates", label: "Resgates", icon: RotateCw },
  { to: "/importar", label: "Importar", icon: Upload },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/checkout-do-dia", label: "Checkout do dia", icon: ClipboardCheck },
  { to: "/placar-diario", label: "Placar (Telão)", icon: Tv },
  { to: "/meu-perfil", label: "Meu perfil", icon: UserIcon },
] as const;

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function useHojePendingCount(userId: string | undefined) {
  return useQuery({
    queryKey: ["tasks-pending-count", userId],
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const today = localToday();
      const { count } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId!)
        .eq("status", "pendente")
        .lte("due_date", today);
      return count ?? 0;
    },
  });
}

function AuthedLayout() {
  const { session, loading, signOut, user, roles, mustChangePassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: brand } = useBrand();
  const isAdmin = roles.includes("admin");
  const { data: pendingCount = 0 } = useHojePendingCount(user?.id);
  const NAV = isAdmin
    ? [
        ...BASE_NAV,
        { to: "/painel-adm", label: "Painel ADM", icon: Trophy } as const,
        { to: "/processos-comerciais", label: "Processos", icon: Activity } as const,
        { to: "/integracao-arena", label: "Integração Arena", icon: Link2 } as const,
        { to: "/usuarios-acessos", label: "Usuários e Acessos", icon: Shield } as const,
        { to: "/configuracoes", label: "Configurações", icon: Settings } as const,
      ]
    : BASE_NAV;

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="text-muted-foreground">Carregando…</div></div>;
  }

  const brandName = brand?.brand_name ?? "Comercial";
  const brandSubtitle = brand?.brand_subtitle ?? "Franquia";

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold overflow-hidden">
            {brand?.logo_url ? (
              <img src={brand.logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              brandName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{brandName}</div>
            {brandSubtitle && <div className="text-xs text-sidebar-foreground/60 truncate">{brandSubtitle}</div>}
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((n) => {
            const active = location.pathname.startsWith(n.to);
            const showBadge = n.to === "/hoje" && pendingCount > 0;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <n.icon className="h-4 w-4" />
                <span className="flex-1">{n.label}</span>
                {showBadge && (
                  <Badge className="h-5 min-w-5 px-1.5 text-[10px] bg-rose-500 text-white hover:bg-rose-500">
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="px-2 pb-2 text-xs text-sidebar-foreground/60 truncate">{user?.email}</div>
          <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={() => signOut()}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-card px-5 py-3 md:hidden">
          <div className="font-semibold">{brandName}</div>
          <Button size="sm" variant="ghost" onClick={() => signOut()}><LogOut className="h-4 w-4" /></Button>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b bg-card px-2 py-2 md:hidden">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs hover:bg-accent relative" activeProps={{ className: "bg-primary text-primary-foreground" }}>
              {n.label}
              {n.to === "/hoje" && pendingCount > 0 && (
                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 max-w-full">
          <Outlet />
        </main>
      </div>
      <ReturnNotificationWatcher />
      <TaskNotificationWatcher />
    </div>
  );
}
