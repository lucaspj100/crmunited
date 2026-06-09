import { createFileRoute, Outlet, useNavigate, useLocation, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useBrand } from "@/lib/brand";
import { LayoutDashboard, Users, Kanban, ListChecks, RotateCw, BarChart3, LogOut, Settings, Upload, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedLayout,
});

const BASE_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/funil", label: "Funil", icon: Kanban },
  { to: "/tarefas", label: "Tarefas do Dia", icon: ListChecks },
  { to: "/perdidos", label: "Perdidos", icon: TrendingDown },
  { to: "/resgates", label: "Resgates", icon: RotateCw },
  { to: "/importar", label: "Importar", icon: Upload },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
] as const;

function AuthedLayout() {
  const { session, loading, signOut, user, roles } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: brand } = useBrand();
  const isAdmin = roles.includes("admin");
  const NAV = isAdmin
    ? [...BASE_NAV, { to: "/configuracoes", label: "Configurações", icon: Settings } as const]
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
                {n.label}
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
            <Link key={n.to} to={n.to} className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs hover:bg-accent" activeProps={{ className: "bg-primary text-primary-foreground" }}>
              {n.label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
