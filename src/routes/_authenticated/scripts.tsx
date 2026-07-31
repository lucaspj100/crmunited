import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/scripts")({
  beforeLoad: () => {
    throw redirect({ to: "/assistentes-ia", replace: true });
  },
});
