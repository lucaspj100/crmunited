import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useMyFeedbackNotifications } from "@/lib/my-feedbacks";

/** Avisa o colaborador quando a liderança compartilha um feedback novo. */
export function FeedbackNotificationWatcher() {
  const { session, roles } = useAuth();
  const navigate = useNavigate();
  const enabled = !!session && !roles.includes("admin");

  const onOpen = useCallback(
    (id: string) => {
      navigate({ to: "/meus-feedbacks", search: { id } });
    },
    [navigate],
  );

  useMyFeedbackNotifications(enabled, onOpen);
  return null;
}
