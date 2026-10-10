import { supabase } from "../lib/supabase";
import type { Event } from "../types/database";

export async function listEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
export async function getEvent(id: string) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}
export async function getPublicEvent(slug: string) {
  const { data, error } = await supabase
    .from("public_event_view")
    .select("*")
    .eq("slug", slug)
    .single();
  if (error) throw new Error("Мероприятие не найдено или ещё не опубликовано");
  return data;
}
export async function saveEvent(values: Partial<Event>, id?: string) {
  const request = id
    ? supabase.from("events").update(values).eq("id", id)
    : supabase.from("events").insert(values);
  const { data, error } = await request.select().single();
  if (error) throw error;
  return data;
}
export function assetUrl(path: string | null) {
  return path
    ? supabase.storage.from("event-assets").getPublicUrl(path).data.publicUrl
    : undefined;
}
export async function uploadAsset(eventId: string, file: File, kind: string) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Выберите PNG, JPEG или WebP до 5 МБ");
  const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `events/${eventId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("event-assets")
    .upload(path, file);
  if (error) throw error;
  return path;
}
export async function getStaffStats(eventId: string) {
  const { data, error } = await supabase.rpc("get_staff_stats", {
    p_event_id: eventId,
  });
  if (error) throw error;
  return data;
}
