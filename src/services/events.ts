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
  if (!id) {
    const { data, error } = await supabase.rpc("create_event", {
      p_name: values.name || "",
      p_slug: values.slug || "",
      p_description: values.description ?? null,
    });
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from("events")
    .update(values)
    .eq("id", id)
    .select()
    .single();
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

export async function listHosts() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name")
    .eq("role", "host")
    .order("display_name", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listEventHostIds(eventId: string) {
  const { data, error } = await supabase
    .from("event_staff")
    .select("user_id")
    .eq("event_id", eventId);
  if (error) throw error;
  return data.map((row) => row.user_id);
}

export async function setEventHost(
  eventId: string,
  userId: string,
  enabled: boolean,
) {
  const request = enabled
    ? supabase.from("event_staff").insert({ event_id: eventId, user_id: userId })
    : supabase
        .from("event_staff")
        .delete()
        .eq("event_id", eventId)
        .eq("user_id", userId);
  const { error } = await request;
  if (error) throw error;
}
