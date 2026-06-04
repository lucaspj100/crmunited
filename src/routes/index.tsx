import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="text-muted-foreground">Carregando…</div></div>;
  return <Navigate to={session ? "/dashboard" : "/auth"} replace />;
}
