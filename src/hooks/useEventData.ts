import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { getEvent } from "../services/events";
import { listPrizes } from "../services/prizes";
import { listParticipants } from "../services/participants";
import { getScreen, listDraws } from "../services/draws";

export function useRealtime(eventId?: string) {
  const client = useQueryClient();
  const [connection, setConnection] = useState<
    "online" | "reconnecting" | "offline"
  >("reconnecting");
  useEffect(() => {
    if (!eventId) return;
    let alive = true;
    const invalidate = () => {
      void client.invalidateQueries({ queryKey: ["event", eventId] });
      void client.invalidateQueries({ queryKey: ["screen"] });
    };
    const channel = supabase
      .channel(`event-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_screen_state",
          filter: `event_id=eq.${eventId}`,
        },
        invalidate,
      )
      .subscribe((status) => {
        if (!alive) return;
        setConnection(
          status === "SUBSCRIBED" && navigator.onLine
            ? "online"
            : status === "CLOSED"
              ? "offline"
              : "reconnecting",
        );
        if (status === "SUBSCRIBED") invalidate();
      });
    const offline = () => setConnection("offline");
    const online = () => {
      setConnection(channel.state === "joined" ? "online" : "reconnecting");
      invalidate();
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      alive = false;
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      void supabase.removeChannel(channel);
    };
  }, [eventId, client]);
  return connection;
}

export function useEventData(eventId: string, includeParticipants = false) {
  const event = useQuery({
    queryKey: ["event", eventId, "details"],
    queryFn: () => getEvent(eventId),
    enabled: Boolean(eventId),
  });
  const prizes = useQuery({
    queryKey: ["event", eventId, "prizes"],
    queryFn: () => listPrizes(eventId),
    enabled: Boolean(eventId),
  });
  const draws = useQuery({
    queryKey: ["event", eventId, "draws"],
    queryFn: () => listDraws(eventId),
    enabled: Boolean(eventId),
  });
  const participants = useQuery({
    queryKey: ["event", eventId, "participants"],
    queryFn: () => listParticipants(eventId),
    enabled: Boolean(eventId) && includeParticipants,
  });
  const connection = useRealtime(eventId);
  return { event, prizes, draws, participants, connection };
}

export function useScreen(slug: string, live = true) {
  // Polling heals missed events; Realtime is a notification, never the source of truth.
  const query = useQuery({
    queryKey: ["screen", slug],
    queryFn: () => getScreen(slug),
    enabled: Boolean(slug),
    refetchInterval: 15_000,
  });
  const connection = useRealtime(live ? query.data?.event.id : undefined);
  return { ...query, connection };
}
