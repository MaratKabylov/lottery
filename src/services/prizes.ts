import { supabase } from "../lib/supabase";
import type { Prize } from "../types/database";
export async function listPrizes(eventId: string) {
  const { data, error } = await supabase
    .from("prizes")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order");
  if (error) throw error;
  return data;
}
export async function savePrize(values: Partial<Prize>, id?: string) {
  const query = id
    ? supabase.from("prizes").update(values).eq("id", id)
    : supabase.from("prizes").insert(values);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}
export async function deletePrize(id: string) {
  // Preserve historical foreign keys by archiving prizes rather than deleting them.
  return savePrize({ is_active: false }, id);
}
