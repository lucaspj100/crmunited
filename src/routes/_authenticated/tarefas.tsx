import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/tarefas")({
  beforeLoad: () => { throw redirect({ to: "/hoje" }); },
});
