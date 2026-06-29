import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/fila")({
  beforeLoad: () => { throw redirect({ to: "/hoje" }); },
});
