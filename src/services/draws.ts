import { supabase } from "../lib/supabase";
import type { Draw } from "../types/database";
export async function listDraws(eventId: string) {
  const result: Draw[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("draws")
      .select("*")
      .eq("event_id", eventId)
      .order("drawn_at", { ascending: false })
      .range(offset, offset + 999);
    if (error) throw error;
    result.push(...data);
    if (data.length < 1000) break;
  }
  return result;
}
export async function drawWinner(eventId: string, prizeId: string | null) {
  const { data, error } = await supabase.rpc("draw_winner", {
    p_event_id: eventId,
    p_prize_id: prizeId,
  });
  if (error) throw error;
  return data;
}
export async function finishDraw(id: string, confirm: boolean) {
  const { data, error } = await supabase.rpc(
    confirm ? "confirm_draw" : "cancel_draw",
    { p_draw_id: id },
  );
  if (error) throw error;
  return data;
}
export async function setRehearsalMode(eventId: string, enabled: boolean) {
  const { data, error } = await supabase.rpc("set_rehearsal_mode", {
    p_event_id: eventId,
    p_enabled: enabled,
  });
  if (error) throw error;
  return data;
}
export async function getScreen(slug: string) {
  const { data, error } = await supabase.rpc("get_public_screen", {
    p_slug: slug,
  });
  if (error) throw error;
  return data;
}
export async function setScreenMode(
  eventId: string,
  mode: "waiting" | "paused" | "countdown",
  seconds: number | null = null,
) {
  const { data, error } = await supabase.rpc("set_screen_mode", {
    p_event_id: eventId,
    p_mode: mode,
    p_seconds: seconds,
  });
  if (error) throw error;
  return data;
}
